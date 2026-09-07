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

async function read() {
  const j = await kv(`get/${KEY}`);
  if (!j || !j.result) return { l: [], c: [], r: {} };
  try {
    return JSON.parse(j.result);
  } catch {
    return { l: [], c: [], r: {} };
  }
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

      const merged = {
        // 합집합으로 모으되, 그 기기에서 방금 푼 표시(del)는 빼 준다
        l: [...new Set([...(cur.l || []), ...(body.l || [])])].filter((x) => !del.has(x)),
        c: [...new Set([...(cur.c || []), ...(body.c || [])])],
        r: { ...(cur.r || {}), ...(body.r || {}) },
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
