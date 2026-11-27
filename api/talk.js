// Cheol's Routine — 중국어 회화 애드리브 (POST /api/talk)
import { kvReady, isAuthed, body } from "./_lib.js";
import { aiReady, talk } from "./_ai.js";

export default async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");
  if (!kvReady()) return res.status(503).json({ error: "storage-not-connected" });
  try {
    if (!(await isAuthed(req))) return res.status(401).json({ error: "locked" });
    if (req.method !== "POST") return res.status(405).json({ error: "method-not-allowed" });
    if (!aiReady()) return res.status(501).json({ error: "no-key" });
    const b = body(req);
    if (!b.me || !b.you) return res.status(400).json({ error: "bad-request" });
    return res.status(200).json(await talk(b));
  } catch (e) {
    return res.status(500).json({ error: String(e.message || e).slice(0, 200) });
  }
}
