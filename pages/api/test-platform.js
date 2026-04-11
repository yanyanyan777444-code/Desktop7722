import { getAuthFromRequest } from "../../lib/auth.js";

/**
 * 測試平台 API：用正確的認證方式 + 完整參數呼叫，看真實回傳結構
 *
 * 用法：
 *   1. 登入網頁
 *   2. 訪問 https://desktop7722.vercel.app/api/test-platform?username=<會員帳號>
 *   3. 會自動帶今天日期查詢
 *
 * 也可以指定日期：
 *   /api/test-platform?username=<會員帳號>&date_start=2026-04-01&date_end=2026-04-11
 */
export default async function handler(req, res) {
  const auth = await getAuthFromRequest(req);
  if (!auth) return res.status(401).json({ error: "Unauthorized" });

  const baseUrl = process.env.SITE_API_BASE;
  const apiKey = process.env.SITE_API_KEY;

  if (!baseUrl || !apiKey) {
    return res.status(500).json({ error: "SITE_API_BASE 或 SITE_API_KEY 未設定" });
  }

  // 從 query string 取參數
  const username = req.query.username || "test";
  const today = new Date().toISOString().slice(0, 10);
  const date_start = req.query.date_start || today;
  const date_end = req.query.date_end || today;

  // 組 URL
  const params = new URLSearchParams({ username, date_start, date_end });
  const url = `${baseUrl}/api/v1/member-bets?${params.toString()}`;

  try {
    const response = await fetch(url, {
      headers: {
        "x-api-key": apiKey,
        Accept: "application/json",
      },
    });

    const status = response.status;
    const text = await response.text();

    let parsed = null;
    try {
      parsed = JSON.parse(text);
    } catch {
      // 不是 JSON 就保持原文字
    }

    return res.status(200).json({
      request: {
        url: url.replace(apiKey, "<API_KEY_HIDDEN>"),
        method: "GET",
        headers: { "x-api-key": "<API_KEY_HIDDEN>" },
        params: { username, date_start, date_end },
      },
      response: {
        status,
        body: parsed || text.substring(0, 2000),
      },
    });
  } catch (err) {
    return res.status(500).json({
      error: "請求失敗",
      message: err.message,
    });
  }
}
