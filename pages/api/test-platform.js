import { getAuthFromRequest } from "../../lib/auth.js";

/**
 * 測試平台 API：自動嘗試多種認證方式 + 多種 endpoint，
 * 把每種嘗試的結果回傳，幫助找出能用的呼叫方式。
 *
 * 用法：登入網頁後，瀏覽器訪問
 *   https://desktop7722.vercel.app/api/test-platform
 */
export default async function handler(req, res) {
  // 必須登入才能訪問（避免別人探測）
  const auth = await getAuthFromRequest(req);
  if (!auth) return res.status(401).json({ error: "Unauthorized" });

  const baseUrl = process.env.SITE_API_BASE;
  const apiKey = process.env.SITE_API_KEY;

  if (!baseUrl) {
    return res.status(500).json({ error: "SITE_API_BASE 未設定" });
  }
  if (!apiKey) {
    return res.status(500).json({ error: "SITE_API_KEY 未設定" });
  }

  // 要測試的 endpoint 路徑
  const endpoints = [
    "/api/v1/member-bets",
    "/api/v1/member-bets?limit=1",
    "/api/v1/member-bets?member_id=test",
    "/api/v1/member-bets?username=test",
    "/api/v1/member-bets?account=test",
  ];

  // 要測試的認證方式
  const authMethods = [
    {
      name: "Authorization: Bearer",
      headers: { Authorization: `Bearer ${apiKey}` },
    },
    {
      name: "Authorization (raw)",
      headers: { Authorization: apiKey },
    },
    {
      name: "x-api-key",
      headers: { "x-api-key": apiKey },
    },
    {
      name: "X-API-KEY",
      headers: { "X-API-KEY": apiKey },
    },
    {
      name: "api-key",
      headers: { "api-key": apiKey },
    },
    {
      name: "apikey",
      headers: { apikey: apiKey },
    },
    {
      name: "URL ?api_key=",
      isUrlParam: true,
      paramName: "api_key",
    },
    {
      name: "URL ?apikey=",
      isUrlParam: true,
      paramName: "apikey",
    },
    {
      name: "URL ?key=",
      isUrlParam: true,
      paramName: "key",
    },
    {
      name: "URL ?token=",
      isUrlParam: true,
      paramName: "token",
    },
  ];

  const results = [];

  // 對每個 endpoint 嘗試所有認證方式
  for (const endpoint of endpoints) {
    for (const method of authMethods) {
      let url = `${baseUrl}${endpoint}`;
      let headers = { Accept: "application/json" };

      if (method.isUrlParam) {
        const separator = url.includes("?") ? "&" : "?";
        url = `${url}${separator}${method.paramName}=${encodeURIComponent(apiKey)}`;
      } else {
        headers = { ...headers, ...method.headers };
      }

      try {
        const response = await fetch(url, { method: "GET", headers });
        const status = response.status;
        const text = await response.text();

        // 只記錄非 401 的回應，否則太多
        if (status !== 401) {
          results.push({
            endpoint,
            authMethod: method.name,
            status,
            // 只取前 500 字元避免太長
            body: text.substring(0, 500),
            success: status >= 200 && status < 300,
          });
        }
      } catch (err) {
        results.push({
          endpoint,
          authMethod: method.name,
          status: "ERROR",
          body: err.message,
          success: false,
        });
      }
    }
  }

  // 整理結果
  const successful = results.filter((r) => r.success);
  const interesting = results.filter((r) => !r.success && r.status !== "ERROR");

  return res.status(200).json({
    summary: {
      total_attempts: endpoints.length * authMethods.length,
      successful: successful.length,
      non_401_responses: results.length,
    },
    successful_combinations: successful,
    other_responses: interesting,
    note: "如果 successful_combinations 是空的，代表沒有找到正確的呼叫方式。請看 other_responses 的錯誤訊息。所有 401 結果都被過濾掉了。",
  });
}
