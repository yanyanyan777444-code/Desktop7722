import { kv } from "@vercel/kv";

/**
 * 監控對象清單管理
 * 結構：[{ id: "user001", name: "張三", note: "VIP", addedAt: "..." }, ...]
 */

const KEY_MONITORS = "monitors:list";
const KEY_SETTINGS = "settings:thresholds";
const KEY_HISTORY = "history:alerts";
const KEY_LAST_CHECK = "system:last_check";
const KEY_NOTIFIED = "notified:"; // 加上 ID 形成完整 key

// ===== 監控對象 =====

export async function getMonitors() {
  return (await kv.get(KEY_MONITORS)) || [];
}

export async function addMonitor(member) {
  const list = await getMonitors();
  // 已存在則不重複加入
  if (list.find((m) => m.id === member.id)) {
    throw new Error("此會員 ID 已在監控清單中");
  }
  list.push({
    id: member.id,
    name: member.name || "",
    note: member.note || "",
    addedAt: new Date().toISOString(),
  });
  await kv.set(KEY_MONITORS, list);
  return list;
}

export async function removeMonitor(id) {
  const list = await getMonitors();
  const updated = list.filter((m) => m.id !== id);
  await kv.set(KEY_MONITORS, updated);
  return updated;
}

// ===== 門檻設定 =====

const DEFAULT_SETTINGS = {
  deposit: 10000,
  bet: 50000,
  idleMinutes: 20,
  enabled: true,
};

export async function getSettings() {
  const stored = (await kv.get(KEY_SETTINGS)) || {};
  return { ...DEFAULT_SETTINGS, ...stored };
}

export async function updateSettings(updates) {
  const current = await getSettings();
  const merged = { ...current, ...updates };
  await kv.set(KEY_SETTINGS, merged);
  return merged;
}

// ===== 歷史警報紀錄 =====

export async function addHistory(alert) {
  const history = (await kv.get(KEY_HISTORY)) || [];
  history.unshift({
    ...alert,
    timestamp: new Date().toISOString(),
  });
  // 只保留最近 200 筆
  const trimmed = history.slice(0, 200);
  await kv.set(KEY_HISTORY, trimmed);
  return trimmed;
}

export async function getHistory() {
  return (await kv.get(KEY_HISTORY)) || [];
}

export async function clearHistory() {
  await kv.del(KEY_HISTORY);
  return [];
}

// ===== 系統狀態 =====

export async function getLastCheck() {
  return await kv.get(KEY_LAST_CHECK);
}

export async function setLastCheck(timestamp) {
  await kv.set(KEY_LAST_CHECK, timestamp);
}

// ===== 防止重複通知 =====

export async function isNotified(eventKey) {
  return await kv.get(KEY_NOTIFIED + eventKey);
}

export async function markNotified(eventKey, ttlSeconds = 3600) {
  await kv.set(KEY_NOTIFIED + eventKey, "1", { ex: ttlSeconds });
}
