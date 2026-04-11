import {
  getMonitors,
  getSettings,
  addHistory,
  getSession,
  setSession,
  clearSession,
} from "../../lib/store.js";
import { getMemberBetsToday } from "../../lib/siteApi.js";
import { sendTelegram, tplBetStart } from "../../lib/telegram.js";

/**
 * Cron 端點：由 cron-job.org 每分鐘呼叫一次
 *
 * 邏輯：
 *   對每個監控對象：
 *   1. 抓「今天」（北京時間）所有下注
 *   2. 沒有 session：
 *      - 如果今天有下注 → 推「下注了！！！！」+ 建立 session
 *      - 沒下注 → 不做事
 *   3. 有 session：
 *      - 比較最新下注時間，如果有比 session 還新的下注 → 更新 session
 *      - 如果閒置超過 N 分鐘（沒新下注）→ 清除 session
 */
export default async function handler(req, res) {
  const auth = req.headers.authorization || "";
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  const stats = { checked: 0, betStarts: 0, idleResets: 0, errors: [] };

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
  let session = await getSession(monitor.id);

  // ===== Case 1：沒有 session =====
  if (!session) {
    if (bets.length === 0) return; // 沒下注 → 不做事

    // 有下注 → 推首筆通知並建立 session
    const firstBet = bets[0];

    await sendTelegram(
      tplBetStart({
        platform,
        memberId: monitor.id,
        game: firstBet.game,
        amount: firstBet.amount,
        startTime: firstBet.displayTime,
      })
    );

    await addHistory({
      type: "bet_start",
      memberId: monitor.id,
      detail: `${firstBet.game} ${firstBet.amount}`,
    });

    await setSession(monitor.id, {
      startTime: firstBet.time,
      lastBetTime: bets[bets.length - 1].time,
    });

    stats.betStarts++;
    return;
  }

  // ===== Case 2：有 session =====
  const latestBetTime = bets.length > 0 ? bets[bets.length - 1].time : null;

  // 如果有比 session 更新的下注 → 更新 session
  if (latestBetTime && latestBetTime > session.lastBetTime) {
    session.lastBetTime = latestBetTime;
    await setSession(monitor.id, session);
    return;
  }

  // 沒有新下注 → 檢查是否該閒置重置
  // 用最後下注時間 + 閒置時間 vs 現在
  const idleMinutes = settings.idleMinutes || 30;
  const lastBetMs = parseApiTime(session.lastBetTime);
  const nowMs = Date.now();
  // API 時間是「假 UTC」（北京時間貼 Z 後綴），所以實際 UTC = 字串時間 - 8 小時
  const realLastBetMs = lastBetMs - 8 * 60 * 60 * 1000;
  const idleMs = nowMs - realLastBetMs;
  const thresholdMs = idleMinutes * 60 * 1000;

  if (idleMs >= thresholdMs) {
    await clearSession(monitor.id);
    stats.idleResets++;
  }
}

/**
 * 把 API 的 bet_time 字串解析成 milliseconds
 * 注意：API 字串是「假 UTC」，但這裡我們先當真 UTC 處理，
 * 之後在比較時再把它當北京時間調整。
 */
function parseApiTime(s) {
  if (!s) return 0;
  return new Date(s).getTime();
}
