// Cheol's Routine — PIN 잠금
// GET  /api/auth                         → { ready, hasPin, authed }
// POST /api/auth { action:"setup", pin }  → 처음 한 번 PIN 만들기 (+ 이 기기 출입증 발급)
// POST /api/auth { action:"login", pin }  → PIN 확인 후 1년짜리 출입증 발급
// POST /api/auth { action:"logout" }      → 이 기기만 잠그기
// POST /api/auth { action:"logout-all" }  → 모든 기기 출입증 폐기
// POST /api/auth { action:"change", pin, next } → PIN 바꾸기 (다른 기기는 모두 잠김)
import {
  P, kv, kvReady, hashPin, checkPin, issuePass, isAuthed, clearPass, readCookie, sha, COOKIE, body,
} from "./_lib.js";

const MAX_FAIL = 5; // 연속 5번 틀리면
const LOCK_SEC = 15 * 60; // 15분 동안 시도 막기
const PIN_RE = /^\d{4,8}$/;

async function dropAllPasses() {
  const ids = (await kv(["SMEMBERS", `${P}passes`])) || [];
  for (const id of ids) await kv(["DEL", `${P}pass:${id}`]);
  await kv(["DEL", `${P}passes`]);
}

export default async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");
  if (!kvReady()) return res.status(503).json({ error: "storage-not-connected" });

  try {
    const stored = await kv(["GET", `${P}pin`]);

    if (req.method === "GET") {
      return res.status(200).json({ ready: true, hasPin: Boolean(stored), authed: await isAuthed(req) });
    }
    if (req.method !== "POST") return res.status(405).json({ error: "method-not-allowed" });

    const b = body(req);
    const pin = String(b.pin || "");

    if (b.action === "setup") {
      if (stored) return res.status(409).json({ error: "already-set" });
      if (!PIN_RE.test(pin)) return res.status(400).json({ error: "pin-format" });
      // NX: 동시에 두 곳에서 만들려 해도 먼저 온 쪽만 성공
      const ok = await kv(["SET", `${P}pin`, hashPin(pin), "NX"]);
      if (!ok) return res.status(409).json({ error: "already-set" });
      await issuePass(res);
      return res.status(200).json({ ok: true });
    }

    if (b.action === "login" || b.action === "change") {
      const fails = Number((await kv(["GET", `${P}fail`])) || 0);
      if (fails >= MAX_FAIL) {
        const ttl = Number(await kv(["TTL", `${P}fail`]));
        return res.status(429).json({ error: "locked", wait: ttl > 0 ? ttl : LOCK_SEC });
      }
      if (!checkPin(pin, stored)) {
        await kv(["INCR", `${P}fail`]);
        await kv(["EXPIRE", `${P}fail`, LOCK_SEC]);
        return res.status(401).json({ error: "wrong-pin", left: MAX_FAIL - fails - 1 });
      }
      await kv(["DEL", `${P}fail`]);

      if (b.action === "change") {
        const next = String(b.next || "");
        if (!PIN_RE.test(next)) return res.status(400).json({ error: "pin-format" });
        await kv(["SET", `${P}pin`, hashPin(next)]);
        await dropAllPasses();
      }
      await issuePass(res);
      return res.status(200).json({ ok: true });
    }

    if (b.action === "logout") {
      const token = readCookie(req, COOKIE);
      if (token) {
        const id = sha(token);
        await kv(["DEL", `${P}pass:${id}`]);
        await kv(["SREM", `${P}passes`, id]);
      }
      clearPass(res);
      return res.status(200).json({ ok: true });
    }

    if (b.action === "logout-all") {
      if (!(await isAuthed(req))) return res.status(401).json({ error: "locked" });
      await dropAllPasses();
      clearPass(res);
      return res.status(200).json({ ok: true });
    }

    return res.status(400).json({ error: "unknown-action" });
  } catch (e) {
    return res.status(500).json({ error: String(e) });
  }
}
