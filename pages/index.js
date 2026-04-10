import { useState } from "react";
import { useRouter } from "next/router";
import Head from "next/head";

export default function LoginPage() {
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  async function handleSubmit(e) {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      const res = await fetch("/api/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
      });

      if (res.ok) {
        router.push("/dashboard");
      } else {
        const data = await res.json();
        setError(data.error || "登入失敗");
      }
    } catch (err) {
      setError("網路錯誤，請重試");
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      <Head>
        <title>Sentinel · 監控系統</title>
      </Head>
      <div className="login-wrap">
        <form className="login-card" onSubmit={handleSubmit}>
          <div className="login-title">🦉 Sentinel</div>
          <div className="login-subtitle">會員監控系統</div>
          <input
            className="login-input"
            type="password"
            placeholder="請輸入密碼"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoFocus
            required
          />
          <button className="login-btn" type="submit" disabled={loading}>
            {loading ? "驗證中..." : "登入"}
          </button>
          {error && <div className="login-error">{error}</div>}
        </form>
      </div>
    </>
  );
}
