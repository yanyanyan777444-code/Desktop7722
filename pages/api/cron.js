import {
  getMonitors,
  getSettings,
  getLastCheck,
  setLastCheck,
  isNotified,
  markNotified,
  addHistory,
} from "../../lib/store.js";
import { getMemberActivity } from "../../lib/siteApi.js";
import {
  sendTelegram,
  tplLogin,
  tplDeposit,
  tplBet,
  tplIdle,
} from "../../lib/telegram.js";

/**
 * Cron 端點：由外部排程服務（cron-job.org）每分鐘呼叫一次
 *
 * 呼叫方式：
 *   curl -H "Authorization: Bearer YOUR_CRON_SECRET" https://your-app.vercel.app/api/cron
 */
export default async function handler(req, res) {
  // 驗證來源
  const auth = req.headers.authorization || "";
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  const stats = {
    checked: 0,
    logins: 0,
    deposits: 0,
    bets: 0,
    idles: 0,
    errors: [],
  };

  try {
    const settings = await getSettings();

    // 系統暫停則不執行
    if (!settings.enabled) {
      return res.status(200).json({ ok: true, message: "監控已暫停", stats });
    }

    const monitors = await getMonitors();
    if (monitors.length === 0) {
      return res.status(200).json({ ok: true, message: "沒有監控對象", stats });
    }

    // 取得上次檢查時間（預設 2 分鐘前）
    const lastCheck =
      (await getLastCheck()) ||
      new Date(Date.now() - 2 * 60 * 1000).toISOString();
    const now = new Date().toISOString();

    // 對每個監控對象抓取活動
    for (const monitor of monitors) {
      try {
        stats.checked++;
        const data = await getMemberActivity(monitor.id, lastCheck);
        if (!data) continue;

        const member = {
          ...data.member,
          name: data.member?.name || monitor.name,
        };

        // === 1. 登入通知（任何登入都通知）===
        for (const login of data.logins || []) {
          const key = `login:${monitor.id}:${login.time}`;
          if (await isNotified(key)) continue;

          await sendTelegram(tplLogin({ ...member, ip: login.ip, region: login.region }));
          await markNotified(key, 86400);
          await addHistory({
            type: "login",
            memberId: monitor.id,
            detail: `登入 IP ${login.ip || "未知"}`,
          });
          stats.logins++;
        }

        // === 2. 存款通知（達門檻）===
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

        // === 3. 投注通知（達門檻）===
        for (const bet of data.bets || []) {
          if (bet.amount < settings.bet) continue;
          const key = `bet:${monitor.id}:${bet.time}`;
          if (await isNotified(key)) continue;

          await sendTelegram(tplBet(member, bet.amount, bet.game));
          await markNotified(key, 86400);
          await addHistory({
            type: "bet",
            memberId: monitor.id,
            detail: `投注 ${bet.amount.toLocaleString()} (${bet.game || "未知"})`,
          });
          stats.bets++;
        }

        // === 4. 閒置偵測 ===
        if (data.lastBetTime) {
          const idleMs = Date.now() - new Date(data.lastBetTime).getTime();
          const idleMins = Math.floor(idleMs / 60000);

          if (idleMins >= settings.idleMinutes) {
            const key = `idle:${monitor.id}:${data.lastBetTime}`;
            if (!(await isNotified(key))) {
              await sendTelegram(tplIdle(member, idleMins));
              await markNotified(key, 86400);
              await addHistory({
                type: "idle",
                memberId: monitor.id,
                detail: `閒置 ${idleMins} 分鐘`,
              });
              stats.idles++;
            }
          }
        }
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
