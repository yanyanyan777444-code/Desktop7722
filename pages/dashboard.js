import { useEffect, useState } from "react";
import { useRouter } from "next/router";
import Head from "next/head";

export default function Dashboard() {
  const router = useRouter();
  const [monitors, setMonitors] = useState([]);
  const [settings, setSettings] = useState(null);
  const [history, setHistory] = useState([]);
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState(null);

  // 新增監控對象表單
  const [newId, setNewId] = useState("");
  const [newName, setNewName] = useState("");
  const [newNote, setNewNote] = useState("");

  function showToast(message, type = "success") {
    setToast({ message, type });
    setTimeout(() => setToast(null), 3000);
  }

  async function loadAll() {
    try {
      const [m, s, h] = await Promise.all([
        fetch("/api/monitors").then((r) => r.json()),
        fetch("/api/settings").then((r) => r.json()),
        fetch("/api/history").then((r) => r.json()),
      ]);

      if (m.error === "Unauthorized") {
        router.push("/");
        return;
      }

      setMonitors(m.monitors || []);
      setSettings(s.settings || {});
      setHistory(h.history || []);
    } catch (err) {
      showToast("載入失敗", "error");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadAll();
  }, []);

  async function handleAddMonitor(e) {
    e.preventDefault();
    if (!newId.trim()) return;

    const res = await fetch("/api/monitors", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: newId.trim(), name: newName.trim(), note: newNote.trim() }),
    });

    const data = await res.json();
    if (res.ok) {
      setMonitors(data.monitors);
      setNewId("");
      setNewName("");
      setNewNote("");
      showToast("已加入監控清單");
    } else {
      showToast(data.error || "新增失敗", "error");
    }
  }

  async function handleRemoveMonitor(id) {
    if (!confirm(`確定要移除 ${id} 嗎？`)) return;

    const res = await fetch(`/api/monitors?id=${encodeURIComponent(id)}`, {
      method: "DELETE",
    });

    const data = await res.json();
    if (res.ok) {
      setMonitors(data.monitors);
      showToast("已移除");
    } else {
      showToast(data.error || "移除失敗", "error");
    }
  }

  async function handleSaveSettings(updates) {
    const res = await fetch("/api/settings", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(updates),
    });

    const data = await res.json();
    if (res.ok) {
      setSettings(data.settings);
      showToast("設定已儲存");
    } else {
      showToast("儲存失敗", "error");
    }
  }

  async function handleLogout() {
    await fetch("/api/logout", { method: "POST" });
    router.push("/");
  }

  async function handleTestNotify() {
    const res = await fetch("/api/test-notify", { method: "POST" });
    if (res.ok) showToast("測試訊息已發送到 Telegram");
    else showToast("發送失敗，請檢查 Bot 設定", "error");
  }

  if (loading) {
    return (
      <div className="login-wrap">
        <div style={{ color: "#8a92a6" }}>載入中...</div>
      </div>
    );
  }

  return (
    <>
      <Head>
        <title>Dashboard · Sentinel</title>
      </Head>

      <div className="header">
        <div className="header-inner">
          <div>
            <span className="brand">🦉 Sentinel</span>
            <span className="brand-sub">會員監控系統</span>
          </div>
          <div style={{ display: "flex", gap: "8px" }}>
            <button className="logout" onClick={handleTestNotify}>
              發送測試
            </button>
            <button className="logout" onClick={handleLogout}>
              登出
            </button>
          </div>
        </div>
      </div>

      <div className="container">
        {/* 系統狀態 */}
        <div className="card">
          <div className="card-title">
            <div className="card-title-text">
              <span className={`status-dot ${settings?.enabled ? "" : "off"}`}></span>
              系統狀態
            </div>
            <span className="badge">{settings?.enabled ? "運行中" : "已暫停"}</span>
          </div>
          <div style={{ display: "flex", gap: "32px", color: "#8a92a6", fontSize: "13px" }}>
            <div>監控對象：<b style={{ color: "#fff" }}>{monitors.length}</b> 位</div>
            <div>歷史警報：<b style={{ color: "#fff" }}>{history.length}</b> 筆</div>
            <div>
              <label style={{ display: "inline-flex", alignItems: "center", gap: "8px", cursor: "pointer" }}>
                <input
                  type="checkbox"
                  checked={settings?.enabled || false}
                  onChange={(e) => handleSaveSettings({ enabled: e.target.checked })}
                />
                啟用監控
              </label>
            </div>
          </div>
        </div>

        {/* 門檻設定 */}
        <div className="card">
          <div className="card-title">
            <div className="card-title-text">⚙️ 門檻設定</div>
          </div>
          <div className="settings-grid">
            <div className="setting-item">
              <label>存款門檻</label>
              <input
                className="input"
                type="number"
                value={settings?.deposit || 0}
                onChange={(e) => setSettings({ ...settings, deposit: Number(e.target.value) })}
                onBlur={() => handleSaveSettings({ deposit: settings.deposit })}
                style={{ width: "100%" }}
              />
            </div>
            <div className="setting-item">
              <label>投注門檻</label>
              <input
                className="input"
                type="number"
                value={settings?.bet || 0}
                onChange={(e) => setSettings({ ...settings, bet: Number(e.target.value) })}
                onBlur={() => handleSaveSettings({ bet: settings.bet })}
                style={{ width: "100%" }}
              />
            </div>
            <div className="setting-item">
              <label>閒置分鐘數</label>
              <input
                className="input"
                type="number"
                value={settings?.idleMinutes || 0}
                onChange={(e) => setSettings({ ...settings, idleMinutes: Number(e.target.value) })}
                onBlur={() => handleSaveSettings({ idleMinutes: settings.idleMinutes })}
                style={{ width: "100%" }}
              />
            </div>
          </div>
          <div style={{ marginTop: "12px", fontSize: "12px", color: "#8a92a6" }}>
            💡 修改數值後點擊其他位置會自動儲存。投注/存款達到門檻會立即推播 Telegram。
          </div>
        </div>

        {/* 監控對象 */}
        <div className="card">
          <div className="card-title">
            <div className="card-title-text">👁️ 監控對象清單</div>
            <span className="badge">{monitors.length}</span>
          </div>

          <form className="add-form" onSubmit={handleAddMonitor}>
            <input
              className="input"
              placeholder="會員 ID（必填）"
              value={newId}
              onChange={(e) => setNewId(e.target.value)}
              required
            />
            <input
              className="input"
              placeholder="顯示名稱"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
            />
            <input
              className="input"
              placeholder="備註"
              value={newNote}
              onChange={(e) => setNewNote(e.target.value)}
            />
            <button className="btn-primary" type="submit">
              ➕ 加入
            </button>
          </form>

          {monitors.length === 0 ? (
            <div className="empty">尚未加入任何監控對象</div>
          ) : (
            <table className="table">
              <thead>
                <tr>
                  <th>會員 ID</th>
                  <th>名稱</th>
                  <th>備註</th>
                  <th>加入時間</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {monitors.map((m) => (
                  <tr key={m.id}>
                    <td><code>{m.id}</code></td>
                    <td>{m.name || "—"}</td>
                    <td>{m.note || "—"}</td>
                    <td style={{ color: "#8a92a6", fontSize: "12px" }}>
                      {new Date(m.addedAt).toLocaleString("zh-TW")}
                    </td>
                    <td>
                      <button className="btn-danger" onClick={() => handleRemoveMonitor(m.id)}>
                        移除
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        {/* 歷史警報 */}
        <div className="card">
          <div className="card-title">
            <div className="card-title-text">📜 最近警報紀錄</div>
            <span className="badge">{history.length}</span>
          </div>
          {history.length === 0 ? (
            <div className="empty">尚無警報紀錄</div>
          ) : (
            <table className="table">
              <thead>
                <tr>
                  <th>時間</th>
                  <th>類型</th>
                  <th>會員</th>
                  <th>內容</th>
                </tr>
              </thead>
              <tbody>
                {history.slice(0, 50).map((h, i) => (
                  <tr key={i}>
                    <td style={{ color: "#8a92a6", fontSize: "12px" }}>
                      {new Date(h.timestamp).toLocaleString("zh-TW")}
                    </td>
                    <td>{typeLabel(h.type)}</td>
                    <td><code>{h.memberId}</code></td>
                    <td>{h.detail}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {toast && (
        <div className={`toast ${toast.type === "error" ? "error" : ""}`}>
          {toast.message}
        </div>
      )}
    </>
  );
}

function typeLabel(type) {
  return {
    login: "🔑 登入",
    deposit: "💰 存款",
    bet: "🎰 投注",
    idle: "⏸️ 閒置",
  }[type] || type;
}
