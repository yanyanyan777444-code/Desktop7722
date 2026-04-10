import {
  getMonitors,
  getSettings,
  getLastCheck,
  setLastCheck,
  isNotified,
  markNotified,
  addHistory,
  getSession,
  setSession,
  clearSession,
} from "../../lib/store.js";
import { getMemberActivity } from "../../lib/siteApi.js";
import {
  sendTelegram,
  tplLogin,
  tplDeposit,
  tplBet,
  tplGameSwitch,
  tplSessionEnd,
} from "../../lib/telegram.js";

/**
 * Cron 端點：由 cron-job.org 每分鐘呼叫一次
 *
 * 監控邏輯（依 Q1～Q6 需求）：
 *   1. 上線通知       - 會員登入瞬間
 *   2. 存款通知       - 達到門檻
 *   3. 投注通知       - 達到門檻
 *   4. 切換遊戲通知    - A 遊戲切到 B 遊戲
 *   5. 活動結束總結    - 第一次投注後閒置 N 分鐘（預設 30 分）
 */
export default async function handler(req, res) {
  const auth = req.headers.authorization || "";
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  const stats = {
    checked: 0,
    logins: 0,
    deposits: 0,
    bets: 0,
    switches: 0,
    sessionEnds: 0,
    errors: [],
  };

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

    for (const monitor of monitors) {
      try {
        stats.checked++;
        await processMember(monitor, settings, lastCheck, stats);
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
async function processMember(monitor, settings, lastCheck, stats) {
  const data = await getMemberActivity(monitor.id, lastCheck);
  if (!data) return;

  const member = {
    ...data.member,
    name: data.member?.name || monitor.name,
  };

  // ===== 1. 上線通知 =====
  for (const login of data.logins || []) {
    const key = `login:${monitor.id}:${login.time}`;
    if (await isNotified(key)) continue;

    await sendTelegram(
      tplLogin({ ...member, ip: login.ip, region: login.region })
    );
    await markNotified(key, 86400);
    await addHistory({
      type: "login",
      memberId: monitor.id,
      detail: `登入 IP ${login.ip || "未知"}`,
    });
    stats.logins++;
  }

  // ===== 2. 存款通知（達門檻）=====
  for (const dep of data.deposits || []) {
    if (dep.amount < settings.deposit) continue;
    const key = `deposit:${monitor.id}:${dep.time}`;
    if (await isNotified(key)) continue;

    await sendTelegram(tplDeposit(member, dep.amount));
    await markNotified(key, 86400);
    await addHistory({
      type: "deposit",
      memberId: monitor.id,
      detail: `存款 ${dep.amount.toLocaleString()}`,
    });
    stats.deposits++;
  }

  // ===== 3. 投注通知 + 4. 切換遊戲 + 5. Session 追蹤 =====
  let session = await getSession(monitor.id);

  // 依時間排序投注
  const sortedBets = (data.bets || [])
    .slice()
    .sort((a, b) => new Date(a.time) - new Date(b.time));

  for (const bet of sortedBets) {
    // 3a. 投注達門檻通知
    if (bet.amount >= settings.bet) {
      const key = `bet:${monitor.id}:${bet.time}`;
      if (!(await isNotified(key))) {
        await sendTelegram(tplBet(member, bet));
        await markNotified(key, 86400);
        await addHistory({
          type: "bet",
          memberId: monitor.id,
          detail: `投注 ${bet.amount.toLocaleString()} (${bet.game || "未知"})`,
        });
        stats.bets++;
      }
    }

    // 3b. 切換遊戲偵測
    if (session && session.lastGame && session.lastGame !== bet.game) {
      await sendTelegram(tplGameSwitch(member, session.lastGame, bet.game));
      await addHistory({
        type: "switch",
        memberId: monitor.id,
        detail: `${session.lastGame} → ${bet.game}`,
      });
      stats.switches++;
    }

    // 3c. Session 狀態維護
    if (!session) {
      // 第一次投注 → 開啟新 session
      session = {
        startTime: bet.time,
        lastBetTime: bet.time,
        lastGame: bet.game,
        mainGame: bet.game,
        betCount: 1,
        totalAmount: bet.amount,
      };
    } else {
      session.lastBetTime = bet.time;
      session.lastGame = bet.game;
      session.betCount = (session.betCount || 0) + 1;
      session.totalAmount = (session.totalAmount || 0) + bet.amount;
    }
  }

  // ===== 4. Session 結束偵測（閒置 N 分鐘）=====
  if (session) {
    const idleMs = Date.now() - new Date(session.lastBetTime).getTime();
    const idleThresholdMs = settings.idleMinutes * 60 * 1000;

    if (idleMs >= idleThresholdMs) {
      // Session 結束 → 推送總結
      await sendTelegram(
        tplSessionEnd(member, {
          mainGame: session.mainGame,
          betCount: session.betCount,
          // 以下欄位由平台 API 提供（對接時填入）
          todayProfit: data.todayProfit,
          todayPromo: data.todayPromo,
          todayActual: data.todayActual,
          monthProfit: data.monthProfit,
          monthPromo: data.monthPromo,
          monthActual: data.monthActual,
          totalProfit: data.totalProfit,
          totalPromo: data.totalPromo,
          totalActual: data.totalActual,
          totalBet: data.totalBet,
          totalDeposit: data.totalDeposit,
          createdAt: data.createdAt,
          lastLoginTime: data.lastLoginTime,
          firstBetTime: session.startTime,
          lastBetTime: session.lastBetTime,
        })
      );
      await addHistory({
        type: "session_end",
        memberId: monitor.id,
        detail: `活動結束 共 ${session.betCount} 注`,
      });
      await clearSession(monitor.id);
      stats.sessionEnds++;
    } else {
      // Session 進行中 → 儲存狀態
      await setSession(monitor.id, session);
    }
  }
}
