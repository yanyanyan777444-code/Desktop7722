import {
  getMonitors,
  getSettings,
  addHistory,
  getSession,
  setSession,
} from "../../lib/store.js";
import { getMemberBetsToday } from "../../lib/siteApi.js";
import { sendTelegram, tplBetStart } from "../../lib/telegram.js";

/**
 * Cron 端點：由 cron-job.org 每分鐘呼叫一次
 *
 * 邏輯：
 *   對每個監控對象：
 *   1. 抓「今天」（北京時間）所有下注
 *   2. 沒下注 → 不做事
 *   3. 找出符合該會員「投注門檻」的「合格下注」
 *      - 門檻 = 0 → 任何下注都合格
 *      - 門檻 > 0 → 只有單筆 ≥ 門檻的才合格
 *   4. 沒 session → 推「首次合格下注」+ 建立 session
 *   5. 有 session：
 *      - 看新的合格下注是否跟 session 上次推送相差 ≥ 閒置門檻
 *      - 是 → 視為新一輪，推通知 + 更新 session
 *      - 否 → 持續下注中，更新 lastBetTime 但不推
 */
export default async function handler(req, res) {
  const auth = req.headers.authorization || "";
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  const stats = { checked: 0, betStarts: 0, errors: [] };

  try {
    const settings = await getSettings();

    if (!settings.enabled) {
      return res.status(200).json({ ok: true, message: "監控已暫停", stats });
    }

    const monitors = await getMonitors();
    if (monitors.length === 0) {
      return res.status(200).json({ ok: true, message: "沒有監控對象", stats });
    }

    for (const monitor of monitors) {
      try {
        stats.checked++;
        await processMember(monitor, settings, stats);
      } catch (err) {
        stats.errors.push(`${monitor.id}: ${err.message}`);
      }
    }

    return res.status(200).json({ ok: true, stats });
  } catch (err) {
    return res.status(500).json({ error: err.message, stats });
  }
}

/**
 * 處理單一監控對象
 */
async function processMember(monitor, settings, stats) {
  const data = await getMemberBetsToday(monitor.id);
  if (!data) return;

  // 平台優先用 Dashboard 設定的，沒設才用 API 回傳的
  const platform = monitor.platform || data.member?.platform || "";
  let allBets = data.bets || [];
  if (allBets.length === 0) return;

  // 過濾掉「加入監控之前」的下注
  // monitor.addedAt 是真 UTC，要轉成「假 UTC」（+8 小時）才能跟 bet_time 字串比較
  if (monitor.addedAt) {
    const addedAtFakeUtc = toFakeUtcString(monitor.addedAt);
    allBets = allBets.filter((b) => b.time >= addedAtFakeUtc);
  }
  if (allBets.length === 0) return;

  // 套用該會員的投注門檻過濾
  const threshold = monitor.betThreshold || 0;
  const qualifiedBets = threshold > 0
    ? allBets.filter((b) => b.amount >= threshold)
    : allBets;

  if (qualifiedBets.length === 0) return; // 沒有合格下注

  const idleMinutes = settings.idleMinutes || 30;
  const idleThresholdMs = idleMinutes * 60 * 1000;

  // 所有下注的「最新時間」（用來追蹤閒置）
  const latestAllBet = allBets[allBets.length - 1];
  const firstQualified = qualifiedBets[0];

  let session = await getSession(monitor.id);

  // ===== Case 1：第一次監控到此會員（無 session）=====
  if (!session) {
    // 取「合格下注」的最新 10 筆
    const last10 = qualifiedBets.slice(-10);
    await pushBetNotification(platform, monitor.id, firstQualified, last10, stats);
    await setSession(monitor.id, {
      startTime: firstQualified.time,
      lastBetTime: latestAllBet.time,
      lastNotifiedBetTime: firstQualified.time,
    });
    return;
  }

  // ===== Case 2：已有 session =====
  // 找出「比 session.lastNotifiedBetTime 還新的合格下注」
  const newQualifiedBets = qualifiedBets.filter(
    (b) => b.time > session.lastNotifiedBetTime
  );

  if (newQualifiedBets.length === 0) {
    // 沒有新合格下注 → 但可能有新「不合格」下注，更新 lastBetTime
    if (latestAllBet.time > session.lastBetTime) {
      session.lastBetTime = latestAllBet.time;
      await setSession(monitor.id, session);
    }
    return;
  }

  // 有新合格下注 → 計算跟「上次任何下注」的時間差（判斷閒置）
  const newFirstQualified = newQualifiedBets[0];
  const lastBetMs = new Date(session.lastBetTime).getTime();
  const newBetMs = new Date(newFirstQualified.time).getTime();
  const gapMs = newBetMs - lastBetMs;

  if (gapMs >= idleThresholdMs) {
    // 中間有閒置 ≥ 30 分鐘 → 視為新一輪 → 推通知
    // 區間用「新合格下注」的最新 10 筆
    const last10 = newQualifiedBets.slice(-10);
    await pushBetNotification(platform, monitor.id, newFirstQualified, last10, stats);
    session.lastNotifiedBetTime = newFirstQualified.time;
  }

  // 不論是否推通知，都更新 lastBetTime
  session.lastBetTime = latestAllBet.time;
  await setSession(monitor.id, session);
}

/**
 * 發送 Telegram 通知 + 紀錄歷史
 *
 * @param {string} platform
 * @param {string} memberId
 * @param {object} firstBet  - 用來顯示「玩法」和「開始時間」
 * @param {array}  recentBets - 最近 10 筆合格下注，用來計算金額區間
 * @param {object} stats
 */
async function pushBetNotification(platform, memberId, firstBet, recentBets, stats) {
  // 計算金額區間
  const amounts = recentBets.map((b) => b.amount);
  const minAmount = Math.min(...amounts);
  const maxAmount = Math.max(...amounts);

  await sendTelegram(
    tplBetStart({
      platform,
      memberId,
      game: firstBet.game,
      minAmount,
      maxAmount,
      startTime: firstBet.displayTime,
    })
  );

  await addHistory({
    type: "bet_start",
    memberId,
    detail: `${firstBet.game} ${minAmount === maxAmount ? minAmount : `${minAmount}~${maxAmount}`}`,
  });

  stats.betStarts++;
}

/**
 * 把真 UTC ISO 字串轉成「假 UTC」字串（+8 小時），用來跟 API 的 bet_time 字串比較
 *   2026-04-11T12:00:00.000Z (真 UTC) → 2026-04-11T20:00:00.000Z (假 UTC，代表北京 20:00)
 */
function toFakeUtcString(realUtcIso) {
  const d = new Date(realUtcIso);
  d.setUTCHours(d.getUTCHours() + 8);
  return d.toISOString();
}
