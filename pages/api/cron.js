import {
  getMonitors,
  getSettings,
  getLastCheck,
  setLastCheck,
  addHistory,
  getSession,
  setSession,
  clearSession,
} from "../../lib/store.js";
import { getMemberActivity } from "../../lib/siteApi.js";
import { sendTelegram, tplBetStart } from "../../lib/telegram.js";

/**
 * Cron 端點：由 cron-job.org 每分鐘呼叫一次
 *
 * 邏輯：
 *   1. 對每個監控對象呼叫平台 API 取得投注紀錄
 *   2. 若會員無 session（首次下注或閒置已重置）→ 推一則「下注了！！！！」
 *   3. session 存在 → 不推（持續下注中）
 *   4. 閒置 N 分鐘以上 → 清除 session（下次再下注會被視為首次）
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

    const lastCheck =
      (await getLastCheck()) ||
      new Date(Date.now() - 2 * 60 * 1000).toISOString();
    const now = new Date().toISOString();
    const platform = settings.platform || "";

    for (const monitor of monitors) {
      try {
        stats.checked++;
        await processMember(monitor, settings, platform, lastCheck, stats);
      } catch (err) {
        stats.errors.push(`${monitor.id}: ${err.message}`);
      }
    }

    await setLastCheck(now);
    return res.status(200).json({ ok: true, stats });
  } catch (err) {
    return res.status(500).json({ error: err.message, stats });
  }
}

/**
 * 處理單一監控對象
 */
async function processMember(monitor, settings, platform, lastCheck, stats) {
  const data = await getMemberActivity(monitor.id, lastCheck);
  if (!data) return;

  const bets = (data.bets || [])
    .slice()
    .sort((a, b) => new Date(a.time) - new Date(b.time));

  let session = await getSession(monitor.id);

  // ===== 1. 閒置重置 =====
  if (session) {
    const idleMs = Date.now() - new Date(session.lastBetTime).getTime();
    const thresholdMs = (settings.idleMinutes || 30) * 60 * 1000;

    if (idleMs >= thresholdMs && bets.length === 0) {
      // 閒置且這次沒新下注 → 清除 session
      await clearSession(monitor.id);
      session = null;
      stats.idleResets++;
    }
  }

  if (bets.length === 0) return;

  // ===== 2. 處理下注 =====
  if (!session) {
    // 首次下注 → 推「下注了！！！！」
    const firstBet = bets[0];

    await sendTelegram(
      tplBetStart({
        platform,
        memberId: monitor.id,
        game: firstBet.game,
        amount: firstBet.amount,
        startTime: formatTime(firstBet.time),
      })
    );

    await addHistory({
      type: "bet_start",
      memberId: monitor.id,
      detail: `${firstBet.game || "未知"} ${firstBet.amount}`,
    });

    // 建立 session
    session = {
      startTime: firstBet.time,
      firstAmount: firstBet.amount,
      firstGame: firstBet.game,
      lastBetTime: bets[bets.length - 1].time,
    };
    stats.betStarts++;
  } else {
    // 已有 session → 只更新最後下注時間
    session.lastBetTime = bets[bets.length - 1].time;
  }

  await setSession(monitor.id, session);
}

function formatTime(iso) {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("zh-TW", { timeZone: "Asia/Taipei" });
}
