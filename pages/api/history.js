import { getAuthFromRequest } from "../../lib/auth.js";
import { getHistory, clearHistory } from "../../lib/store.js";

export default async function handler(req, res) {
  const auth = await getAuthFromRequest(req);
  if (!auth) return res.status(401).json({ error: "Unauthorized" });

  if (req.method === "GET") {
    const history = await getHistory();
    return res.status(200).json({ history });
  }

  if (req.method === "DELETE") {
    await clearHistory();
    return res.status(200).json({ history: [] });
  }

  return res.status(405).json({ error: "Method not allowed" });
}
