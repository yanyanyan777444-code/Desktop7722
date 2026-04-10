import { getAuthFromRequest } from "../../lib/auth.js";
import {
  sendTelegram,
  tplLogin,
  tplDeposit,
  tplBet,
  tplGameSwitch,
  tplSessionEnd,
} from "../../lib/telegram.js";

/**
 * 測試端點：發送 5 種通知範例到 Telegram，讓你預覽所有格式
 */
export default async function handler(req, res) {
  const auth = await getAuthFromRequest(req);
  if (!auth) return res.status(401).json({ error: "Unauthorized" });

  try {
    const mock = {
      id: "DEMO001",
      name: "測試會員",
      platform: "BBIN",
      ip: "1.2.3.4",
      region: "台灣",
      balance: 100000,
      totalDeposit: 1000000,
    };

    // 發送 5 種範例
    await sendTelegram(
      `✅ <b>Sentinel 測試通知 - 預覽 5 種格式</b>\n\n以下會發送 5 則範例訊息：`
    );

    // 1. 上線通知
    await sendTelegram(tplLogin(mock));

    // 2. 存款通知
    await sendTelegram(tplDeposit(mock, 50000));

    // 3. 投注通知
    await sendTelegram(
      tplBet(mock, { amount: 100000, game: "百家樂", time: new Date().toISOString() })
    );

    // 4. 切換遊戲
    await sendTelegram(tplGameSwitch(mock, "百家樂", "21 點"));

    // 5. 活動結束總結
    await sendTelegram(
      tplSessionEnd(mock, {
        mainGame: "百家樂",
        betCount: 120,
        todayProfit: -30000,
        todayPromo: 5000,
        todayActual: -25000,
        monthProfit: -100000,
        monthPromo: 15000,
        monthActual: -85000,
        totalProfit: -500000,
        totalPromo: 50000,
        totalActual: -450000,
        totalBet: 5000000,
        totalDeposit: 1000000,
        createdAt: "2025-01-01",
        lastLoginTime: "2026-04-10 19:30:00",
        firstBetTime: "2026-04-10 19:35:00",
        lastBetTime: "2026-04-10 21:50:00",
      })
    );

    return res.status(200).json({ ok: true, sent: 6 });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
