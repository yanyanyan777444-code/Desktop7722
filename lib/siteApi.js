/**
 * 平台 API 串接層
 *
 * ⚠️ 重要：以下所有 endpoint 路徑與回傳欄位都是「示意」用的範本。
 *    請依照你的平台 API 文件實際情況修改。
 *    需要修改的地方都標註了「TODO」。
 */

let cachedToken = null;
let tokenExpireAt = 0;

/**
 * 登入平台取得 token
 * TODO: 依平台 API 文件調整路徑與欄位
 */
async function login() {
  const res = await fetch(`${process.env.SITE_API_BASE}/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      username: process.env.SITE_USERNAME,
      password: process.env.SITE_PASSWORD_PLATFORM,
    }),
  });

  if (!res.ok) throw new Error(`平台登入失敗: HTTP ${res.status}`);

  const data = await res.json();
  cachedToken = data.token; // TODO: 依實際欄位調整 (data.access_token / data.data.token...)
  tokenExpireAt = Date.now() + 50 * 60 * 1000; // 假設 50 分鐘後失效
  return cachedToken;
}

async function getToken() {
  if (!cachedToken || Date.now() > tokenExpireAt) {
    await login();
  }
  return cachedToken;
}

async function apiGet(endpoint) {
  const token = await getToken();

  const res = await fetch(`${process.env.SITE_API_BASE}${endpoint}`, {
    headers: {
      Authorization: `Bearer ${token}`,
      // 如果是用 API Key 改成：
      // "X-API-Key": process.env.SITE_API_KEY,
      "Content-Type": "application/json",
    },
  });

  if (res.status === 401) {
    cachedToken = null;
    return apiGet(endpoint); // 重試一次
  }

  if (!res.ok) throw new Error(`API 錯誤 ${endpoint}: HTTP ${res.status}`);
  return res.json();
}

// ===== 對外的資料擷取函式 =====
// TODO: 以下 endpoint 路徑與欄位對應請依你的平台調整

/**
 * 取得「特定會員」的最近活動
 * @param {string} memberId
 * @param {string} since ISO timestamp
 */
export async function getMemberActivity(memberId, since) {
  // 範例：呼叫平台的「會員活動查詢」API
  const data = await apiGet(
    `/agent/member/${memberId}/activity?since=${encodeURIComponent(since)}`
  );

  // 假設回傳格式：
  // {
  //   member: { id, name, balance, ip, region, ... },
  //   logins: [{ time, ip, region }],
  //   deposits: [{ time, amount }],
  //   bets: [{ time, amount, game }],
  //   lastBetTime: "2026-04-10T10:30:00Z",
  // }
  return data;
}

/**
 * 取得會員當前狀態（餘額、最後活動時間等）
 */
export async function getMemberStatus(memberId) {
  return apiGet(`/agent/member/${memberId}`);
}
