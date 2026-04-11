import {
  getMonitors,
  getSettings,
  addHistory,
  getSession,
  setSession,
  clearSession,
} from "../../lib/store.js";
import { getMemberBetsToday } from "../../lib/siteApi.js";
import { sendTelegram, tplBetStart, tplBetStop } from "../../lib/telegram.js";

/**
 * Cron 端點：由 cron-job.org 每分鐘呼叫一次
 *
 * 邏輯：
 *   對每個監控對象：
 *   1. 抓「今天」（北京時間）所有下注
 *   2. 過濾掉「加入監控之前」的下注
 *   3. 套用「投注門檻」過濾出合格下注
 *
 *   3 種狀態：
 *   A. 沒 session 且有合格下注 → 推「下注了！！！！」+ 建立 session
 *   B. 有 session 且有新合格下注 → 更新 session 的統計
 *   C. 有 session 且閒置超過 N 分鐘 → 推「停止投注」+ 清除 session
 */
export default async function handler(req, res) {
  const auth = req.headers.authorization || "";
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  const stats = { checked: 0, betStarts: 0, betStops: 0, errors: [] };

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

  const platform = monitor.platform || data.member?.platform || "";
  const idleMinutes = settings.idleMinutes || 30;
  const idleThresholdMs = idleMinutes * 60 * 1000;

  let allBets = data.bets || [];

  // 過濾掉「加入監控之前」的下注
  if (monitor.addedAt) {
    const addedAtFakeUtc = toFakeUtcString(monitor.addedAt);
    allBets = allBets.filter((b) => b.time >= addedAtFakeUtc);
  }

  // 套用該會員的投注門檻過濾
  const threshold = monitor.betThreshold || 0;
  const qualifiedBets = threshold > 0
    ? allBets.filter((b) => b.amount >= threshold)
    : allBets;

  let session = await getSession(monitor.id);

  // ===== 先檢查現有 session 是否該觸發「停止投注」=====
  if (session) {
    const lastBetMs = parseFakeUtcMs(session.lastBetTime);
    const nowMs = Date.now();
    const idleMs = nowMs - lastBetMs;

    // 查 session 之後有沒有新合格下注
    const hasNewBets = qualifiedBets.some(
      (b) => b.time > session.lastBetTime
    );

    if (idleMs >= idleThresholdMs && !hasNewBets) {
      // 閒置超過門檻 + 沒有新下注 → 推「停止投注」
      await pushBetStopNotification(platform, monitor.id, session, stats);
      await clearSession(monitor.id);
      session = null;
    }
  }

  // ===== 接著處理新下注 =====
  if (qualifiedBets.length === 0) return;

  if (!session) {
    // Case A：沒 session → 推「下注了」+ 建立 session
    const firstQualified = qualifiedBets[0];
    const last10 = qualifiedBets.slice(-10);
    await pushBetStartNotification(platform, monitor.id, firstQualified, last10, stats);

    // session 統計：本輪所有合格下注
    const allAmounts = qualifiedBets.map((b) => b.amount);
    await setSession(monitor.id, {
      startTime: firstQualified.time,
      lastBetTime: qualifiedBets[qualifiedBets.length - 1].time,
      totalBets: qualifiedBets.length,
      minAmount: Math.min(...allAmounts),
      maxAmount: Math.max(...allAmounts),
      lastGame: qualifiedBets[qualifiedBets.length - 1].game,
    });
    return;
  }

  // Case B：已有 session → 更新統計
  const newBets = qualifiedBets.filter((b) => b.time > session.lastBetTime);
  if (newBets.length === 0) return;

  // 累加統計
  const newAmounts = newBets.map((b) => b.amount);
  session.totalBets += newBets.length;
  session.minAmount = Math.min(session.minAmount, ...newAmounts);
  session.maxAmount = Math.max(session.maxAmount, ...newAmounts);
  session.lastBetTime = newBets[newBets.length - 1].time;
  session.lastGame = newBets[newBets.length - 1].game;

  await setSession(monitor.id, session);
}

/**
 * 發送「下注了」通知
 */
async function pushBetStartNotification(platform, memberId, firstBet, recentBets, stats) {
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
 * 發送「停止投注」通知
 */
async function pushBetStopNotification(platform, memberId, session, stats) {
  await sendTelegram(
    tplBetStop({
      platform,
      memberId,
      game: session.lastGame,
      totalBets: session.totalBets,
      minAmount: session.minAmount,
      maxAmount: session.maxAmount,
      lastBetTime: formatBetTime(session.lastBetTime),
    })
  );

  await addHistory({
    type: "bet_stop",
    memberId,
    detail: `共 ${session.totalBets} 筆 ${session.minAmount}~${session.maxAmount}`,
  });

  stats.betStops++;
}

/**
 * 把真 UTC ISO 字串轉成「假 UTC」字串（+8 小時）
 */
function toFakeUtcString(realUtcIso) {
  const d = new Date(realUtcIso);
  d.setUTCHours(d.getUTCHours() + 8);
  return d.toISOString();
}

/**
 * 把「假 UTC」字串解析成 ms（要扣回 8 小時才是真實時間）
 *   2026-04-12T19:00:00.000Z (假 UTC) → 北京 19:00 → 真 UTC 11:00
 */
function parseFakeUtcMs(fakeUtcStr) {
  if (!fakeUtcStr) return 0;
  const ms = new Date(fakeUtcStr).getTime();
  return ms - 8 * 60 * 60 * 1000;
}

/**
 * 把 bet_time 字串格式化成顯示用
 *   2026-04-12T19:00:00.000Z → 2026-04-12 19:00:00
 */
function formatBetTime(s) {
  if (!s) return "—";
  return s.replace("T", " ").replace(/\.\d+Z?$/, "").replace(/Z$/, "");
}
