import { getAuthFromRequest } from "../../lib/auth.js";
import { getSettings } from "../../lib/store.js";
import { sendTelegram, tplBetStart } from "../../lib/telegram.js";

/**
 * 測試端點：發送一則「下注了！！！！」範例到 Telegram
 *
 * 注意：這裡的資料是假的，僅供預覽格式使用。
 * 實際運作時，所有資料都會由 cron.js 從平台 API 動態帶入。
 */
export default async function handler(req, res) {
  const auth = await getAuthFromRequest(req);
  if (!auth) return res.status(401).json({ error: "Unauthorized" });

  try {
    const settings = await getSettings();

    await sendTelegram(
      tplBetStart({
        platform: settings.platform || "示範平台",
        memberId: "TEST001",
        game: "示範玩法",
        amount: 100,
        startTime: new Date().toLocaleString("zh-TW", { timeZone: "Asia/Taipei" }),
      })
    );

    return res.status(200).json({ ok: true });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
