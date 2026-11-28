// Cheol's Routine — 음주 도감 (출입증 있는 기기만)
// POST   /api/bottle  { id, img?, hint? } → 사진 저장(있으면) + 술 정보 { ai }
// GET    /api/bottle?id=...               → 사진(jpeg)
// PUT    /api/bottle?id=...  { hint? }    → 저장된 사진(또는 이름)으로 정보 다시 받기
// DELETE /api/bottle?id=...               → 사진 삭제
// 기록(감상·날짜 등)은 /api/data 의 cellar 로 동기화된다.
import { P, kv, kvReady, isAuthed, body } from "./_lib.js";
import { aiReady, bottleInfo } from "./_ai.js";

const ID_RE = /^b[0-9a-z]{6,24}$/;
const MAX = 600 * 1024;

async function info(img, hint) {
  if (!aiReady()) return { ai: null, aiError: "no-key" };
  try { return { ai: await bottleInfo({ img, hint }) }; }
  catch (e) { return { ai: null, aiError: String(e.message || e).slice(0, 160) }; }
}

export default async function handler(req, res) {
  if (!kvReady()) return res.status(503).json({ error: "storage-not-connected" });
  try {
    if (!(await isAuthed(req))) return res.status(401).json({ error: "locked" });
    const b = req.method === "POST" || req.method === "PUT" ? body(req) : {};
    const id = String((req.query && req.query.id) || b.id || "");
    if (!ID_RE.test(id)) return res.status(400).json({ error: "bad-id" });
    const key = `${P}bimg:${id}`;

    if (req.method === "GET") {
      const v = await kv(["GET", key]);
      if (!v) return res.status(404).end();
      res.setHeader("Content-Type", "image/jpeg");
      res.setHeader("Cache-Control", "private, max-age=31536000, immutable");
      return res.status(200).send(Buffer.from(String(v).replace(/^data:image\/\w+;base64,/, ""), "base64"));
    }
    res.setHeader("Cache-Control", "no-store");
    if (req.method === "POST") {
      const img = String(b.img || "");
      if (img) {
        if (!/^data:image\/(jpeg|png|webp);base64,/.test(img)) return res.status(400).json({ error: "bad-image" });
        if (img.length > MAX) return res.status(413).json({ error: "too-big" });
        await kv(["SET", key, img]);
      } else if (!b.hint) return res.status(400).json({ error: "need-img-or-name" });
      if (b.noAi) return res.status(200).json({ ok: true });
      return res.status(200).json({ ok: true, ...(await info(img, b.hint)) });
    }
    if (req.method === "PUT") {
      const img = await kv(["GET", key]);
      if (!img && !b.hint) return res.status(404).json({ error: "no-image" });
      return res.status(200).json({ ok: true, ...(await info(img ? String(img) : "", b.hint)) });
    }
    if (req.method === "DELETE") { await kv(["DEL", key]); return res.status(200).json({ ok: true }); }
    return res.status(405).json({ error: "method-not-allowed" });
  } catch (e) {
    return res.status(500).json({ error: String(e.message || e).slice(0, 200) });
  }
}
