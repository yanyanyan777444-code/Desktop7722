import { createToken, setAuthCookie } from "../../lib/auth.js";

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const { password } = req.body || {};
  const expected = process.env.SITE_PASSWORD;

  if (!expected) {
    return res.status(500).json({ error: "伺服器未設定密碼" });
  }

  if (password !== expected) {
    return res.status(401).json({ error: "密碼錯誤" });
  }

  const token = await createToken();
  setAuthCookie(res, token);
  return res.status(200).json({ ok: true });
}
