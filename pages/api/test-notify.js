import { getAuthFromRequest } from "../../lib/auth.js";
import { sendTelegram, tplLogin } from "../../lib/telegram.js";

export default async function handler(req, res) {
  const auth = await getAuthFromRequest(req);
  if (!auth) return res.status(401).json({ error: "Unauthorized" });

  try {
    const mock = {
      id: "TEST001",
      name: "測試會員",
      ip: "127.0.0.1",
      region: "台灣",
    };
    await sendTelegram(
      "✅ <b>Sentinel 測試訊息</b>\n━━━━━━━━━━━━━━━\n如果你看到這則訊息，代表 Bot 設定正確！\n" +
        tplLogin(mock)
    );
    return res.status(200).json({ ok: true });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
