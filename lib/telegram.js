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

const LINE = "━━━━━━━━━━━━━━━";

export function tplLogin(member) {
  return [
    `🔑 <b>【監控對象登入】</b>`,
    LINE,
    `👤 會員：${escape(member.name)} (<code>${escape(member.id)}</code>)`,
    `🌐 IP：${escape(member.ip || "未知")}`,
    `📍 地區：${escape(member.region || "未知")}`,
    `🕐 時間：${now()}`,
    LINE,
  ].join("\n");
}

export function tplDeposit(member, amount) {
  return [
    `💰 <b>【監控對象大額存款】</b>`,
    LINE,
    `👤 會員：${escape(member.name)} (<code>${escape(member.id)}</code>)`,
    `💵 存款金額：<b>${num(amount)}</b>`,
    `🏦 目前餘額：${num(member.balance)}`,
    `📊 累計存款：${num(member.totalDeposit)}`,
    `🕐 時間：${now()}`,
    LINE,
  ].join("\n");
}

export function tplBet(member, amount, game) {
  return [
    `🎰 <b>【監控對象大額投注】</b>`,
    LINE,
    `👤 會員：${escape(member.name)} (<code>${escape(member.id)}</code>)`,
    `🎮 遊戲：${escape(game || "未知")}`,
    `💵 投注金額：<b>${num(amount)}</b>`,
    `🏦 目前餘額：${num(member.balance)}`,
    `📊 本日投注：${num(member.todayBet)}`,
    `🕐 時間：${now()}`,
    LINE,
  ].join("\n");
}

export function tplIdle(member, idleMinutes) {
  return [
    `⏸️ <b>【監控對象閒置警告】</b>`,
    LINE,
    `👤 會員：${escape(member.name)} (<code>${escape(member.id)}</code>)`,
    `⏱️ 已閒置：<b>${idleMinutes} 分鐘</b>`,
    `🎮 最後遊戲：${escape(member.lastGame || "未知")}`,
    `💵 最後投注：${num(member.lastBetAmount)}`,
    `🏦 目前餘額：${num(member.balance)}`,
    `🕐 時間：${now()}`,
    LINE,
  ].join("\n");
}

function now() {
  return new Date().toLocaleString("zh-TW", { timeZone: "Asia/Taipei" });
}

function num(v) {
  return (Number(v) || 0).toLocaleString();
}

function escape(s) {
  return String(s || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}
