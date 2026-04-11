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
 *
 * ⚠️ 注意：API 的 bet_time 雖然有 Z 後綴，但實際上是「平台本地時區（北京時間 GMT+8）」，
 *    不是真正的 UTC。所以全部用字串比較，不做時區轉換。
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
    throw new Error(`API ${res.status}: ${text.substring(0, 200)}`);
  }

  const data = await res.json();
  return data.records || [];
}

/**
 * 取得會員「今天」（北京時間）所有下注紀錄
 *
 * @param {string} memberId  - 會員帳號（username）
 * @returns {object}         - { member: {...}, bets: [...] }
 */
export async function getMemberBetsToday(memberId) {
  // 北京時間（GMT+8）的「今天」
  const beijingToday = getBeijingDateString();

  const records = await fetchBets(memberId, beijingToday, beijingToday);

  // 依時間排序（早 → 晚）
  const bets = records
    .slice()
    .sort((a, b) => (a.bet_time < b.bet_time ? -1 : 1))
    .map((r) => ({
      time: r.bet_time, // 原始 API 時間（例：2026-04-11T19:44:29.000Z）
      displayTime: formatBetTime(r.bet_time), // 顯示用（例：2026-04-11 19:44:29）
      amount: parseFloat(r.bet_amount) || 0,
      game: formatGame(r.lottery, r.play_type),
    }));

  return {
    member: {
      id: memberId,
      platform: records[0]?.platform || "",
    },
    bets,
  };
}

/**
 * 取得「北京時間今天」的日期字串（YYYY-MM-DD）
 */
function getBeijingDateString() {
  // 直接取現在 UTC 時間 + 8 小時，再用 ISO 字串切前 10 字
  const now = new Date();
  now.setUTCHours(now.getUTCHours() + 8);
  return now.toISOString().slice(0, 10);
}

/**
 * 玩法格式化
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

/**
 * 把 bet_time 字串格式化成「YYYY-MM-DD HH:mm:ss」
 *   2026-04-11T19:44:29.000Z → 2026-04-11 19:44:29
 */
function formatBetTime(s) {
  if (!s) return "—";
  return s.replace("T", " ").replace(/\.\d+Z?$/, "").replace(/Z$/, "");
}
