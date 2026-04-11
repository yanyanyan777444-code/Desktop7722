/**
 * 平台 API 串接
 *
 * 端點：GET /api/v1/member-bets
 * 認證：Header `x-api-key: <SITE_API_KEY>`
 * 必填參數：username, date_start (YYYY-MM-DD), date_end (YYYY-MM-DD)
 *
 * 回傳格式：
 * {
 *   "records": [
 *     {
 *       "platform": "YD",
 *       "username": "qwe123521",
 *       "lottery": "奇趣腾讯分分彩",
 *       "play_type": "四星直选复式",
 *       "bet_amount": "1968.3000",
 *       "bet_time": "2026-04-11T19:52:48.000Z",
 *       ...
 *     }
 *   ],
 *   "total": 6
 * }
 */

/**
 * 取得會員指定日期區間的下注紀錄
 */
async function fetchBets(username, dateStart, dateEnd) {
  const baseUrl = process.env.SITE_API_BASE;
  const apiKey = process.env.SITE_API_KEY;

  if (!baseUrl) throw new Error("SITE_API_BASE 未設定");
  if (!apiKey) throw new Error("SITE_API_KEY 未設定");

  const params = new URLSearchParams({
    username,
    date_start: dateStart,
    date_end: dateEnd,
  });

  const url = `${baseUrl}/api/v1/member-bets?${params.toString()}`;

  const res = await fetch(url, {
    headers: {
      "x-api-key": apiKey,
      Accept: "application/json",
    },
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`API 錯誤 ${res.status}: ${text.substring(0, 200)}`);
  }

  const data = await res.json();
  return data.records || [];
}

/**
 * 取得會員的最近活動（cron 會呼叫這個函式）
 *
 * @param {string} memberId  - 會員帳號（username）
 * @param {string} since     - ISO timestamp，只回傳此時間之後的下注
 * @returns {object}         - { member: {...}, bets: [...] }
 */
export async function getMemberActivity(memberId, since) {
  // API 只接受 YYYY-MM-DD 日期，所以用「今天」查詢
  const today = new Date().toISOString().slice(0, 10);

  const records = await fetchBets(memberId, today, today);

  // 過濾出 since 之後的下注，並依時間排序（早 → 晚）
  const sinceTs = new Date(since).getTime();
  const newBets = records
    .filter((r) => new Date(r.bet_time).getTime() > sinceTs)
    .sort((a, b) => new Date(a.bet_time) - new Date(b.bet_time))
    .map((r) => ({
      time: r.bet_time,
      amount: parseFloat(r.bet_amount) || 0,
      game: formatGame(r.lottery, r.play_type),
    }));

  return {
    member: {
      id: memberId,
      // 平台從 API 第一筆 record 自動帶入
      platform: records[0]?.platform || "",
    },
    bets: newBets,
  };
}

/**
 * 玩法格式化：
 *   lottery: "奇趣腾讯分分彩"
 *   play_type: "四星直选复式"
 *   → "奇趣腾讯分分彩-四星直选复式"
 */
function formatGame(lottery, playType) {
  if (!lottery && !playType) return "未知";
  if (!playType) return lottery;
  if (!lottery) return playType;
  return `${lottery}-${playType}`;
}
