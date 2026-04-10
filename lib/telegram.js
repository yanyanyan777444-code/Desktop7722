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

/**
 * 1. 上線通知（會員登入瞬間）
 */
export function tplLogin(member) {
  return [
    `🟢 <b>【會員上線通知】</b>`,
    LINE,
    `平台：${esc(member.platform || "—")}`,
    `會員：<code>${esc(member.id)}</code>`,
    `🌐 IP：${esc(member.ip || "未知")}`,
    `📍 地區：${esc(member.region || "未知")}`,
    `🏦 餘額：${num(member.balance)}`,
    `🕐 時間：${now()}`,
    LINE,
  ].join("\n");
}

/**
 * 2. 存款通知（達到門檻）
 */
export function tplDeposit(member, amount) {
  return [
    `💰 <b>【會員存款通知】</b>`,
    LINE,
    `平台：${esc(member.platform || "—")}`,
    `會員：<code>${esc(member.id)}</code>`,
    `💵 存款金額：<b>${num(amount)}</b>`,
    `🏦 目前餘額：${num(member.balance)}`,
    `📊 累計充值：${num(member.totalDeposit)}`,
    `🕐 時間：${now()}`,
    LINE,
  ].join("\n");
}

/**
 * 3. 投注通知（達到門檻）
 */
export function tplBet(member, bet) {
  return [
    `🎰 <b>【會員投注通知】</b>`,
    LINE,
    `平台：${esc(member.platform || "—")}`,
    `會員：<code>${esc(member.id)}</code>`,
    `玩法：${esc(bet.game || "未知")}`,
    `💵 投注金額：<b>${num(bet.amount)}</b>`,
    `🏦 目前餘額：${num(member.balance)}`,
    `🕐 時間：${now()}`,
    LINE,
  ].join("\n");
}

/**
 * 4. 切換遊戲通知（從 A 切換到 B）
 */
export function tplGameSwitch(member, fromGame, toGame) {
  return [
    `🔄 <b>【會員切換遊戲】</b>`,
    LINE,
    `平台：${esc(member.platform || "—")}`,
    `會員：<code>${esc(member.id)}</code>`,
    `🎮 從：${esc(fromGame || "未知")}`,
    `🎮 到：<b>${esc(toGame || "未知")}</b>`,
    `🏦 目前餘額：${num(member.balance)}`,
    `🕐 時間：${now()}`,
    LINE,
  ].join("\n");
}

/**
 * 5. 活動結束總結（第一次投注後閒置 30 分鐘）
 *
 * summary 應該包含以下欄位（從平台 API 取得）：
 *   mainGame, betCount,
 *   todayProfit, todayPromo, todayActual,
 *   monthProfit, monthPromo, monthActual,
 *   totalProfit, totalPromo, totalActual,
 *   totalBet, totalDeposit,
 *   createdAt, lastLoginTime, firstBetTime, lastBetTime
 */
export function tplSessionEnd(member, summary) {
  return [
    `🔴 <b>【會員活動結束總結】</b>`,
    LINE,
    `平台：${esc(member.platform || "—")}`,
    `會員：<code>${esc(member.id)}</code>`,
    `玩法：${esc(summary.mainGame || "未知")}`,
    `注數：${num(summary.betCount)}`,
    ``,
    `💰 <b>今日盈虧</b>`,
    `今日盈虧：${signed(summary.todayProfit)}`,
    `個人促銷：${signed(summary.todayPromo)}`,
    `實際盈虧：${signed(summary.todayActual)}`,
    ``,
    `📅 <b>本月盈虧</b>`,
    `本月盈虧：${signed(summary.monthProfit)}`,
    `個人促銷：${signed(summary.monthPromo)}`,
    `實際本月盈虧：${signed(summary.monthActual)}`,
    ``,
    `📈 <b>創號以來</b>`,
    `創號以來盈虧：${signed(summary.totalProfit)}`,
    `個人促銷：${signed(summary.totalPromo)}`,
    `實際創號以來盈虧：${signed(summary.totalActual)}`,
    `創號以來銷量：${num(summary.totalBet)}`,
    `創號以來充值：${num(summary.totalDeposit)}`,
    ``,
    `🕐 <b>時間紀錄</b>`,
    `創建時間：${esc(summary.createdAt || "—")}`,
    `最後登入時間：${esc(summary.lastLoginTime || "—")}`,
    `開始下注時間：${esc(summary.firstBetTime || "—")}`,
    `最後下注時間：${esc(summary.lastBetTime || "—")}`,
    LINE,
  ].join("\n");
}

// ===== 工具函式 =====

function now() {
  return new Date().toLocaleString("zh-TW", { timeZone: "Asia/Taipei" });
}

function num(v) {
  return (Number(v) || 0).toLocaleString();
}

function signed(v) {
  const n = Number(v) || 0;
  const formatted = Math.abs(n).toLocaleString();
  if (n > 0) return `+${formatted}`;
  if (n < 0) return `-${formatted}`;
  return "0";
}

function esc(s) {
  return String(s || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}
