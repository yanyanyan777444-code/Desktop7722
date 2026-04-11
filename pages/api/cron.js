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
 *   3. 沒 session → 推「首次下注」+ 建立 session
 *   4. 有 session：
 *      - 取最新下注時間
 *      - 如果跟 session 最後下注時間「相差 ≥ 閒置門檻」→ 視為新一輪，推通知並更新 session
 *      - 否則更新 session.lastBetTime，不推通知（持續下注中）
 *
 *   ⚠️ Session 不自動清除，避免重複推送
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

  const platform = data.member?.platform || "";
  const bets = data.bets || [];
  if (bets.length === 0) return; // 今天沒下注 → 不做事

  const idleMinutes = settings.idleMinutes || 30;
  const idleThresholdMs = idleMinutes * 60 * 1000;

  // 取今天的第一筆下注（最早）和最後一筆（最新）
  const firstBet = bets[0];
  const lastBet = bets[bets.length - 1];

  let session = await getSession(monitor.id);

  // ===== Case 1：第一次監控到此會員 =====
  if (!session) {
    await pushBetNotification(platform, monitor.id, firstBet, stats);
    await setSession(monitor.id, {
      startTime: firstBet.time,
      lastBetTime: lastBet.time,
      lastNotifiedBetTime: firstBet.time,
    });
    return;
  }

  // ===== Case 2：已有 session =====
  // 找出「比 session.lastBetTime 還新的下注」
  const newBets = bets.filter((b) => b.time > session.lastBetTime);

  if (newBets.length === 0) {
    // 沒有新下注 → 不動 session（保持原樣）
    return;
  }

  // 有新下注 → 檢查跟上次下注的時間差
  const newFirstBet = newBets[0];
  const newLastBet = newBets[newBets.length - 1];

  // 計算「上次下注」到「新下注」的時間差
  const lastBetMs = new Date(session.lastBetTime).getTime();
  const newBetMs = new Date(newFirstBet.time).getTime();
  const gapMs = newBetMs - lastBetMs;

  if (gapMs >= idleThresholdMs) {
    // 中間有閒置 ≥ N 分鐘 → 視為新一輪 → 推通知
    await pushBetNotification(platform, monitor.id, newFirstBet, stats);
    session.lastNotifiedBetTime = newFirstBet.time;
  }

  // 不論是否推通知，都更新 lastBetTime
  session.lastBetTime = newLastBet.time;
  await setSession(monitor.id, session);
}

/**
 * 發送 Telegram 通知 + 紀錄歷史
 */
async function pushBetNotification(platform, memberId, bet, stats) {
  await sendTelegram(
    tplBetStart({
      platform,
      memberId,
      game: bet.game,
      amount: bet.amount,
      startTime: bet.displayTime,
    })
  );

  await addHistory({
    type: "bet_start",
    memberId,
    detail: `${bet.game} ${bet.amount}`,
  });

  stats.betStarts++;
}
