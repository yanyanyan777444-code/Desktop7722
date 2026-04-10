import { getAuthFromRequest } from "../../lib/auth.js";
import { getSettings, updateSettings } from "../../lib/store.js";

export default async function handler(req, res) {
  const auth = await getAuthFromRequest(req);
  if (!auth) return res.status(401).json({ error: "Unauthorized" });

  if (req.method === "GET") {
    const settings = await getSettings();
    return res.status(200).json({ settings });
  }

  if (req.method === "POST") {
    const updates = req.body || {};
    const allowed = ["deposit", "bet", "idleMinutes", "enabled"];
    const filtered = {};
    for (const key of allowed) {
      if (updates[key] !== undefined) filtered[key] = updates[key];
    }
    const settings = await updateSettings(filtered);
    return res.status(200).json({ settings });
  }

  return res.status(405).json({ error: "Method not allowed" });
}
