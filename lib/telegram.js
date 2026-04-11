/**
 * 發送 Telegram 訊息到固定群組
 */
export async function sendTelegram(text) {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_CHAT_ID;

  if (!token || !chatId) {
    throw new Error("TELEGRAM_BOT_TOKEN 或 TELEGRAM_CHAT_ID 未設定");
  }

  const url = `https://api.telegram.org/bot${token}/sendMessage`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      chat_id: chatId,
      text,
      parse_mode: "HTML",
      disable_web_page_preview: true,
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Telegram 發送失敗: ${err}`);
  }
  return res.json();
}

// ===== 訊息模板 =====

/**
 * 投注通知（會員第一次下注時推一次）
 *
 * @param {object} params
 * @param {string} params.platform   - 平台名稱（例如 MT）
 * @param {string} params.memberId   - 會員 ID（例如 ywx6886）
 * @param {string} params.game       - 玩法名稱
 * @param {number} params.minAmount  - 最近 10 筆中最小金額
 * @param {number} params.maxAmount  - 最近 10 筆中最大金額
 * @param {string} params.startTime  - 開始下注時間（格式化字串）
 */
export function tplBetStart({ platform, memberId, game, minAmount, maxAmount, startTime }) {
  // 單筆顯示一個值，多筆顯示區間
  const amountText = minAmount === maxAmount
    ? num(minAmount)
    : `${num(minAmount)}~${num(maxAmount)}`;

  return [
    `<b>下注了！！！！</b>`,
    `平台：${esc(platform || "—")}`,
    `會員：<code>${esc(memberId)}</code>`,
    `玩法：${esc(game || "未知")}`,
    `下注金額區間：${amountText}`,
    `開始下注時間：${esc(startTime)}（持續下注中）`,
  ].join("\n");
}

// ===== 工具函式 =====

function num(v) {
  return (Number(v) || 0).toLocaleString();
}

function esc(s) {
  return String(s || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}
