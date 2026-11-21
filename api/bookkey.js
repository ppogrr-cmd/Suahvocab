// Cheol's Routine — 책 묶음(books/*.enc) 여는 열쇠
// 책 본문은 저작물이라 공개 저장소에는 암호화된 묶음만 두고, 열쇠는 Redis에만 둔다.
// GET /api/bookkey        → { key }  (출입증 있는 기기만)
// PUT /api/bookkey { key } → 열쇠 저장 (출입증 있는 기기만)
import { P, kv, kvReady, isAuthed, body } from "./_lib.js";

const KEY = `${P}bookkey`;

export default async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");
  if (!kvReady()) return res.status(503).json({ error: "storage-not-connected" });
  try {
    if (!(await isAuthed(req))) return res.status(401).json({ error: "locked" });
    if (req.method === "GET") {
      const key = await kv(["GET", KEY]);
      return key ? res.status(200).json({ key }) : res.status(404).json({ error: "no-key" });
    }
    if (req.method === "PUT") {
      const key = String(body(req).key || "");
      if (!/^[A-Za-z0-9+/]{43}=$/.test(key)) return res.status(400).json({ error: "bad-key" });
      await kv(["SET", KEY, key]);
      return res.status(200).json({ ok: true });
    }
    return res.status(405).json({ error: "method-not-allowed" });
  } catch (e) {
    return res.status(500).json({ error: String(e.message || e).slice(0, 200) });
  }
}
