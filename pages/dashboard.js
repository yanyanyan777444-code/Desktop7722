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
  const [newThreshold, setNewThreshold] = useState("");

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
      body: JSON.stringify({
        id: newId.trim(),
        name: newName.trim(),
        note: newNote.trim(),
        betThreshold: Number(newThreshold) || 0,
      }),
    });

    const data = await res.json();
    if (res.ok) {
      setMonitors(data.monitors);
      setNewId("");
      setNewName("");
      setNewNote("");
      setNewThreshold("");
      showToast("已加入監控清單");
    } else {
      showToast(data.error || "新增失敗", "error");
    }
  }

  async function handleUpdateThreshold(id, value) {
    const res = await fetch("/api/monitors", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, betThreshold: Number(value) || 0 }),
    });

    const data = await res.json();
    if (res.ok) {
      setMonitors(data.monitors);
      showToast("門檻已更新");
    } else {
      showToast(data.error || "更新失敗", "error");
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

        {/* 設定 */}
        <div className="card">
          <div className="card-title">
            <div className="card-title-text">⚙️ 設定</div>
          </div>
          <div className="setting-item" style={{ maxWidth: "300px" }}>
            <label>閒置分鐘數（超過視為停止下注）</label>
            <input
              className="input"
              type="number"
              value={settings?.idleMinutes || 0}
              onChange={(e) => setSettings({ ...settings, idleMinutes: Number(e.target.value) })}
              onBlur={() => handleSaveSettings({ idleMinutes: settings.idleMinutes })}
              style={{ width: "100%" }}
            />
          </div>
          <div style={{ marginTop: "12px", fontSize: "12px", color: "#8a92a6" }}>
            💡 會員第一次下注時推送通知。閒置超過設定分鐘數後，下次下注會視為新一輪通知。
          </div>
        </div>

        {/* 監控對象 */}
        <div className="card">
          <div className="card-title">
            <div className="card-title-text">👁️ 監控對象清單</div>
            <span className="badge">{monitors.length}</span>
          </div>

          {/* 全域平台選擇 */}
          <div style={{ marginBottom: "16px", padding: "12px 16px", background: "#0a0e1a", border: "1px solid #2a3447", borderRadius: "8px", display: "flex", alignItems: "center", gap: "12px" }}>
            <label style={{ color: "#8a92a6", fontSize: "13px", whiteSpace: "nowrap" }}>
              🎯 監控平台：
            </label>
            <input
              className="input"
              placeholder="輸入平台名稱（例如：BBIN、AG、PT）"
              value={settings?.platform || ""}
              onChange={(e) => setSettings({ ...settings, platform: e.target.value })}
              onBlur={() => handleSaveSettings({ platform: settings.platform })}
              style={{ flex: 1 }}
            />
            <span style={{ fontSize: "12px", color: "#8a92a6", whiteSpace: "nowrap" }}>
              （所有監控對象套用此平台）
            </span>
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
              type="number"
              placeholder="投注門檻（留空=任何下注都通知）"
              value={newThreshold}
              onChange={(e) => setNewThreshold(e.target.value)}
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
                  <th>投注門檻</th>
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
                    <td>
                      <input
                        className="input"
                        type="number"
                        defaultValue={m.betThreshold || ""}
                        placeholder="留空=任何下注"
                        onBlur={(e) => {
                          const newVal = Number(e.target.value) || 0;
                          if (newVal !== (m.betThreshold || 0)) {
                            handleUpdateThreshold(m.id, newVal);
                          }
                        }}
                        style={{ width: "140px", padding: "6px 10px" }}
                      />
                    </td>
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
    bet_start: "🎰 開始下注",
  }[type] || type;
}
