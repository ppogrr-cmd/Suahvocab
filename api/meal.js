// Cheol's Routine — 식사 사진 (출입증 있는 기기만)
// POST   /api/meal  { id, img:"data:image/jpeg;base64,..." }  → 사진 저장
// GET    /api/meal?id=...                                     → 사진(jpeg)
// PUT    /api/meal?id=...                                     → 저장된 사진으로 요리 다시 판별
// DELETE /api/meal?id=...                                     → 사진 삭제
// 사진 저장·다시 판별 응답에 { ai:{dish,comment} } 가 붙는다 (ANTHROPIC_API_KEY 가 있을 때)
// 사진 설명·시간 같은 정보는 /api/data 의 meals 에 함께 동기화된다.
import { P, kv, kvReady, isAuthed, body } from "./_lib.js";
import { aiReady, identify, loadData, focusOf } from "./_ai.js";

async function tryIdentify(img) {
  if (!aiReady()) return { ai: null, aiError: "no-key" };
  try { return { ai: await identify(img, focusOf(await loadData())) }; }
  catch (e) { return { ai: null, aiError: String(e.message || e).slice(0, 120) }; }
}

const ID_RE = /^m[0-9a-z]{6,24}$/;
const MAX = 600 * 1024; // base64 기준 약 600KB (앱이 보통 60~120KB로 줄여 보냄)

export default async function handler(req, res) {
  if (!kvReady()) return res.status(503).json({ error: "storage-not-connected" });
  try {
    if (!(await isAuthed(req))) return res.status(401).json({ error: "locked" });

    const id = String((req.query && req.query.id) || (req.method === "POST" ? body(req).id : "") || "");
    if (!ID_RE.test(id)) return res.status(400).json({ error: "bad-id" });
    const key = `${P}img:${id}`;

    if (req.method === "GET") {
      const v = await kv(["GET", key]);
      if (!v) return res.status(404).end();
      const b64 = String(v).replace(/^data:image\/\w+;base64,/, "");
      res.setHeader("Content-Type", "image/jpeg");
      res.setHeader("Cache-Control", "private, max-age=31536000, immutable");
      return res.status(200).send(Buffer.from(b64, "base64"));
    }

    res.setHeader("Cache-Control", "no-store");

    if (req.method === "POST") {
      const img = String(body(req).img || "");
      if (!/^data:image\/(jpeg|png|webp);base64,/.test(img)) return res.status(400).json({ error: "bad-image" });
      if (img.length > MAX) return res.status(413).json({ error: "too-big" });
      await kv(["SET", key, img]);
      return res.status(200).json({ ok: true, ...(await tryIdentify(img)) });
    }

    if (req.method === "PUT") {
      const img = await kv(["GET", key]);
      if (!img) return res.status(404).json({ error: "no-image" });
      return res.status(200).json({ ok: true, ...(await tryIdentify(String(img))) });
    }

    if (req.method === "DELETE") {
      await kv(["DEL", key]);
      return res.status(200).json({ ok: true });
    }

    return res.status(405).json({ error: "method-not-allowed" });
  } catch (e) {
    return res.status(500).json({ error: String(e) });
  }
}
