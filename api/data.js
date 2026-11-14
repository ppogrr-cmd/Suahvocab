// Cheol's Routine — 기기끼리 기록 맞추기 (출입증 있는 기기만)
// 모든 항목에 t(고친 시각)를 붙여, 같은 항목은 더 나중에 고친 쪽을 남긴다.
import { P, kv, kvReady, isAuthed, body } from "./_lib.js";

const KEY = `${P}data`;
const MAPS = ["habits", "checkups", "tasks", "meals"]; // 항목 단위로 병합하는 묶음
const EMPTY = { habits: {}, checkups: {}, tasks: {}, meals: {}, log: {} };

function newer(a, b) {
  return !a || (b && (b.t || 0) > (a.t || 0));
}

function mergeMap(a = {}, b = {}) {
  const out = { ...a };
  for (const [k, v] of Object.entries(b)) if (newer(out[k], v)) out[k] = v;
  return out;
}

function merge(cur, inc) {
  const log = { ...(cur.log || {}) };
  for (const [day, items] of Object.entries(inc.log || {})) log[day] = mergeMap(log[day], items);
  const out = { log };
  for (const m of MAPS) out[m] = mergeMap(cur[m], inc[m]);
  return out;
}

async function read() {
  const raw = await kv(["GET", KEY]);
  if (!raw) return { ...EMPTY };
  try {
    return { ...EMPTY, ...JSON.parse(raw) };
  } catch {
    return { ...EMPTY };
  }
}

export default async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");
  if (!kvReady()) return res.status(503).json({ error: "storage-not-connected" });

  try {
    if (!(await isAuthed(req))) return res.status(401).json({ error: "locked" });

    if (req.method === "GET") return res.status(200).json(await read());

    if (req.method === "POST") {
      const merged = merge(await read(), body(req));
      await kv(["SET", KEY, JSON.stringify(merged)]);
      return res.status(200).json(merged);
    }
    return res.status(405).json({ error: "method-not-allowed" });
  } catch (e) {
    return res.status(500).json({ error: String(e) });
  }
}
