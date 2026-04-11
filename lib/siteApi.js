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
  // ⚠️ API 的 bet_time 雖然有 Z 後綴，但實際上是平台本地時區（北京時間 GMT+8），
  //    不是真正的 UTC。所以直接用字串比較和顯示，不做時區轉換。
  const sinceStr = toApiTimeString(since);
  const newBets = records
    .filter((r) => r.bet_time > sinceStr)
    .sort((a, b) => (a.bet_time < b.bet_time ? -1 : 1))
    .map((r) => ({
      time: r.bet_time,
      displayTime: formatBetTime(r.bet_time),
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

/**
 * 把 bet_time 字串格式化成顯示用的「YYYY-MM-DD HH:mm:ss」
 *   API 給的：2026-04-11T19:44:29.000Z
 *   顯示成：  2026-04-11 19:44:29
 */
function formatBetTime(s) {
  if (!s) return "—";
  // 直接從字串切出日期和時間，不做時區轉換
  // 格式：2026-04-11T19:44:29.000Z → 2026-04-11 19:44:29
  return s.replace("T", " ").replace(/\.\d+Z?$/, "").replace(/Z$/, "");
}

/**
 * 把 cron 傳入的 since（ISO 真實 UTC）轉成跟 API bet_time 同樣格式的字串，
 * 用來做字串比較。因為 API 的 bet_time 是「假 UTC（實際是 GMT+8）」，
 * 所以 since 也要先 +8 小時再格式化。
 */
function toApiTimeString(sinceIso) {
  if (!sinceIso) return "";
  const d = new Date(sinceIso);
  // 加 8 小時，模擬「假 UTC」
  d.setUTCHours(d.getUTCHours() + 8);
  return d.toISOString().replace(/\.\d+Z?$/, "").replace("T", "T");
}
