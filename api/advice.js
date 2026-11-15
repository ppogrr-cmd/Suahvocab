// Cheol's Routine — 최근 14일 식사·술·습관으로 Claude 조언 받기
// GET  /api/advice → { ai, last:{text,at}|null }
// POST /api/advice → 새 조언 만들기 (ANTHROPIC_API_KEY 필요)
import { P, kv, kvReady, isAuthed } from "./_lib.js";
import { aiReady, advise, loadData } from "./_ai.js";

const KEY = `${P}advice`;
const kstToday = () => new Date(Date.now() + 9 * 3600e3).toISOString().slice(0, 10);

export default async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");
  if (!kvReady()) return res.status(503).json({ error: "storage-not-connected" });
  try {
    if (!(await isAuthed(req))) return res.status(401).json({ error: "locked" });
    if (req.method === "GET") {
      const raw = await kv(["GET", KEY]);
      return res.status(200).json({ ai: aiReady(), last: raw ? JSON.parse(raw) : null });
    }
    if (req.method === "POST") {
      if (!aiReady()) return res.status(501).json({ error: "no-key" });
      const text = await advise(await loadData(), kstToday());
      const last = { text, at: Date.now() };
      await kv(["SET", KEY, JSON.stringify(last)]);
      return res.status(200).json({ ai: true, last });
    }
    return res.status(405).json({ error: "method-not-allowed" });
  } catch (e) {
    return res.status(500).json({ error: String(e.message || e).slice(0, 200) });
  }
}
