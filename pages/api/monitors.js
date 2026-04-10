import { getAuthFromRequest } from "../../lib/auth.js";
import { getMonitors, addMonitor, removeMonitor } from "../../lib/store.js";

export default async function handler(req, res) {
  const auth = await getAuthFromRequest(req);
  if (!auth) return res.status(401).json({ error: "Unauthorized" });

  try {
    if (req.method === "GET") {
      const monitors = await getMonitors();
      return res.status(200).json({ monitors });
    }

    if (req.method === "POST") {
      const { id, name, note } = req.body || {};
      if (!id) return res.status(400).json({ error: "會員 ID 為必填" });

      const monitors = await addMonitor({ id, name, note });
      return res.status(200).json({ monitors });
    }

    if (req.method === "DELETE") {
      const { id } = req.query;
      if (!id) return res.status(400).json({ error: "缺少 id 參數" });

      const monitors = await removeMonitor(id);
      return res.status(200).json({ monitors });
    }

    return res.status(405).json({ error: "Method not allowed" });
  } catch (err) {
    return res.status(400).json({ error: err.message });
  }
}
