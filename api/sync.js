// 딸 기기끼리 기록을 맞추기 위한 저장소.
// Vercel에 KV(Upstash Redis)를 연결하면 KV_REST_API_URL / KV_REST_API_TOKEN 이 자동으로 들어온다.
// 연결 전에는 503을 돌려주고, 앱은 기존처럼 기기 안에만 저장한다.

const KEY = "vocab-suah";

async function kv(path, opts = {}) {
  const base = process.env.KV_REST_API_URL;
  const token = process.env.KV_REST_API_TOKEN;
  const r = await fetch(`${base}/${path}`, {
    ...opts,
    headers: { Authorization: `Bearer ${token}`, ...(opts.headers || {}) },
  });
  return r.json();
}

const EMPTY = { l: [], c: [], r: {}, st: {}, sp: {}, sr: {}, sk: { n: 0, best: 0, last: "", days: [] } };

async function read() {
  const j = await kv(`get/${KEY}`);
  if (!j || !j.result) return { ...EMPTY };
  try {
    return { ...EMPTY, ...JSON.parse(j.result) };
  } catch {
    return { ...EMPTY };
  }
}

// 단계·점수는 큰 값, 복습 일정은 더 앞선 단계를 남긴다.
function mergeMax(a = {}, b = {}, del) {
  const out = { ...a };
  for (const [k, v] of Object.entries(b)) {
    if ((out[k] || 0) < v) out[k] = v;
  }
  if (del) for (const k of del) delete out[k];
  return out;
}
// 복습 일정은 '가장 최근에 푼 쪽'을 남긴다. t가 없으면 기기가 자동으로 깐 것이라 0으로 본다.
function mergeSrs(a = {}, b = {}, del) {
  const out = { ...a };
  for (const [k, v] of Object.entries(b)) {
    if (!v || typeof v.n !== "number") continue;
    if (!out[k] || (out[k].t || 0) < (v.t || 0)) out[k] = v;
  }
  if (del) for (const k of del) delete out[k];
  return out;
}
function mergeStreak(a = {}, b = {}) {
  const days = [...new Set([...(a.days || []), ...(b.days || [])])].sort().slice(-120);
  const later = (b.last || "") > (a.last || "") ? b : a;
  return {
    n: later.n || 0,
    last: later.last || "",
    best: Math.max(a.best || 0, b.best || 0),
    days,
  };
}

export default async function handler(req, res) {
  if (!process.env.KV_REST_API_URL || !process.env.KV_REST_API_TOKEN) {
    return res.status(503).json({ error: "storage-not-connected" });
  }

  try {
    if (req.method === "GET") {
      return res.status(200).json(await read());
    }

    if (req.method === "POST") {
      const body = typeof req.body === "string" ? JSON.parse(req.body) : req.body || {};
      const cur = await read();
      const del = new Set(body.del || []);

      // 초기화(mode:"replace")일 때만 연습 기록을 보낸 쪽 상태로 갈아 끼운다.
      // 외운 단어(l)는 어느 경우에도 합집합을 유지한다.
      const replace = body.mode === "replace";

      const merged = {
        // 합집합으로 모으되, 그 기기에서 방금 푼 표시(del)는 빼 준다
        l: [...new Set([...(cur.l || []), ...(body.l || [])])].filter((x) => !del.has(x)),
        c: [...new Set([...(cur.c || []), ...(body.c || [])])],
        r: { ...(cur.r || {}), ...(body.r || {}) },
        st: replace ? body.st || {} : mergeMax(cur.st, body.st, del),
        sp: replace ? body.sp || {} : mergeMax(cur.sp, body.sp),
        sr: replace ? body.sr || {} : mergeSrs(cur.sr, body.sr, del),
        sk: replace
          ? body.sk || { n: 0, best: 0, last: "", days: [] }
          : mergeStreak(cur.sk, body.sk),
      };

      await kv(`set/${KEY}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(merged),
      });
      return res.status(200).json(merged);
    }

    return res.status(405).json({ error: "method-not-allowed" });
  } catch (e) {
    return res.status(500).json({ error: String(e) });
  }
}
