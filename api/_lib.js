// Cheol's Routine — 서버 공용 도구 (밑줄로 시작하는 파일은 Vercel이 API로 노출하지 않는다)
import crypto from "node:crypto";

const BASE = () => process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL;
const TOKEN = () => process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;

export const P = "cr:"; // 이 앱이 쓰는 Redis 키 접두어 (예전 단어장 키 'vocab-suah'와 겹치지 않음)
export const YEAR = 365 * 24 * 60 * 60; // 출입증 유효기간: 1년(초)
export const COOKIE = "cr_pass";

export function kvReady() {
  return Boolean(BASE() && TOKEN());
}

// Upstash REST: 명령을 배열로 보낸다. 예) kv(["SET","k","v","EX",60])
export async function kv(cmd) {
  const r = await fetch(BASE(), {
    method: "POST",
    headers: { Authorization: `Bearer ${TOKEN()}`, "Content-Type": "application/json" },
    body: JSON.stringify(cmd.map(String)),
  });
  const j = await r.json();
  if (j.error) throw new Error(j.error);
  return j.result;
}

export const sha = (s) => crypto.createHash("sha256").update(s).digest("hex");

export function hashPin(pin, salt = crypto.randomBytes(16).toString("hex")) {
  const h = crypto.scryptSync(pin, salt, 32).toString("hex");
  return `${salt}:${h}`;
}

export function checkPin(pin, stored) {
  if (!stored) return false;
  const [salt, h] = stored.split(":");
  const a = Buffer.from(crypto.scryptSync(pin, salt, 32).toString("hex"));
  const b = Buffer.from(h);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

export function readCookie(req, name) {
  const raw = req.headers.cookie || "";
  for (const part of raw.split(";")) {
    const [k, ...v] = part.trim().split("=");
    if (k === name) return decodeURIComponent(v.join("="));
  }
  return "";
}

export function setPass(res, token) {
  res.setHeader(
    "Set-Cookie",
    `${COOKIE}=${token}; Path=/; Max-Age=${YEAR}; HttpOnly; Secure; SameSite=Strict`
  );
}

export function clearPass(res) {
  res.setHeader("Set-Cookie", `${COOKIE}=; Path=/; Max-Age=0; HttpOnly; Secure; SameSite=Strict`);
}

// 새 출입증 발급: 원문은 쿠키로만 주고, 서버에는 해시만 1년 기한으로 둔다.
export async function issuePass(res) {
  const token = crypto.randomBytes(32).toString("hex");
  const id = sha(token);
  await kv(["SET", `${P}pass:${id}`, Date.now(), "EX", YEAR]);
  await kv(["SADD", `${P}passes`, id]);
  setPass(res, token);
}

export async function isAuthed(req) {
  const token = readCookie(req, COOKIE);
  if (!token || !/^[0-9a-f]{64}$/.test(token)) return false;
  return Boolean(await kv(["GET", `${P}pass:${sha(token)}`]));
}

export function body(req) {
  if (!req.body) return {};
  return typeof req.body === "string" ? JSON.parse(req.body) : req.body;
}
