// Cheol's Routine — Claude API 연결 (Vercel 환경변수 ANTHROPIC_API_KEY 필요)
import { P, kv } from "./_lib.js";

export const aiReady = () => Boolean(process.env.ANTHROPIC_API_KEY);
const FAST = () => process.env.AI_MODEL_FAST || "claude-haiku-5-5"; // 사진 판별
const SMART = () => process.env.AI_MODEL || "claude-sonnet-5-5"; // 조언

async function ask(model, content, maxTokens) {
  const r = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "x-api-key": process.env.ANTHROPIC_API_KEY,
      "anthropic-version": "2023-06-01",
      "content-type": "application/json",
    },
    body: JSON.stringify({ model, max_tokens: maxTokens, messages: [{ role: "user", content }] }),
  });
  const j = await r.json();
  if (!r.ok) throw new Error((j.error && j.error.message) || `AI ${r.status}`);
  return (j.content || []).filter((c) => c.type === "text").map((c) => c.text).join("").trim();
}

function jsonIn(text) {
  const m = text.match(/\{[\s\S]*\}/);
  return m ? JSON.parse(m[0]) : null;
}

// 최신 검진에서 목표 밖인 수치 → 판별·조언의 기준 (코드에는 개인 수치를 두지 않고 저장소에서 읽는다)
const LIMITS = [
  ["tc", "총콜레스테롤", (v) => v > 199], ["ldl", "LDL", (v) => v > 129.9], ["tg", "중성지방", (v) => v > 149],
  ["hdl", "HDL", (v) => v < 60], ["got", "GOT", (v) => v > 40], ["gpt", "GPT", (v) => v > 35],
  ["ggt", "감마GTP", (v) => v > 63], ["sbp", "수축기 혈압", (v) => v > 119], ["dbp", "이완기 혈압", (v) => v > 79],
  ["fbs", "공복혈당", (v) => v > 99], ["hba1c", "당화혈색소", (v) => v > 5.6], ["uric", "요산", (v) => v > 7],
  ["bmi", "BMI", (v) => v > 22.9],
];

export async function loadData() {
  const raw = await kv(["GET", `${P}data`]);
  try { return raw ? JSON.parse(raw) : {}; } catch { return {}; }
}

export function focusOf(data) {
  const ck = data.checkups || {};
  const ys = Object.keys(ck).filter((y) => !ck[y].del).sort();
  if (!ys.length) return "";
  const c = ck[ys[ys.length - 1]];
  const out = LIMITS.filter(([k, , bad]) => c[k] != null && bad(c[k])).map(([k, l]) => `${l} ${c[k]}`);
  if (c.hp === "양성") out.push("헬리코박터 양성");
  return out.length ? `${ys[ys.length - 1]}년 검진에서 목표 밖: ${out.join(", ")}` : "";
}

// 사진 한 장 → { dish, comment }
export async function identify(imgDataUrl, focus) {
  const b64 = imgDataUrl.replace(/^data:image\/\w+;base64,/, "");
  const media = (imgDataUrl.match(/^data:(image\/\w+);/) || [])[1] || "image/jpeg";
  const prompt =
    `식사 사진이야. 한국어로 답해.\n` +
    `1) dish: 보이는 음식 이름을 쉼표로 (예: "김치찌개, 잡곡밥, 계란말이"). 확실치 않으면 "~로 보임".\n` +
    `2) comment: 이 사람 기준으로 한 줄 평 (25자 이내). ${focus ? `기준: ${focus}.` : ""} 좋은 점이나 주의할 점 하나만.\n` +
    `음식 사진이 아니면 dish를 "음식 아님"으로.\n` +
    `JSON만: {"dish":"...","comment":"..."}`;
  const text = await ask(FAST(), [
    { type: "image", source: { type: "base64", media_type: media, data: b64 } },
    { type: "text", text: prompt },
  ], 300);
  const j = jsonIn(text) || { dish: text.slice(0, 60), comment: "" };
  return { dish: String(j.dish || "").slice(0, 80), comment: String(j.comment || "").slice(0, 60) };
}

// 최근 14일 기록 → 조언 글
export async function advise(data, today) {
  const day = (k, n) => { const [y, m, d] = k.split("-").map(Number); const t = new Date(Date.UTC(y, m - 1, d + n)); return t.toISOString().slice(0, 10); };
  const days = []; for (let i = 13; i >= 0; i--) days.push(day(today, -i));
  const habits = Object.entries(data.habits || {}).filter(([, h]) => h.on);
  const meals = Object.values(data.meals || {}).filter((m) => !m.del);
  const lines = days.map((k) => {
    const ms = meals.filter((m) => m.day === k).sort((a, b) => (a.at || 0) - (b.at || 0)).map((m) => {
      const dr = Object.entries(m.drinks || {}).filter(([, n]) => n > 0).map(([t, n]) => `${t} ${n}잔`).join(" ");
      return `  - ${m.slot || ""}: ${(m.ai && m.ai.dish) || "(판별 없음)"}${m.memo ? ` / 메모: ${m.memo}` : ""}${dr ? ` / 술: ${dr}` : ""}`;
    });
    const log = (data.log || {})[k] || {};
    const done = habits.filter(([id]) => log[id] && log[id].v).map(([, h]) => h.name);
    return `${k}\n${ms.join("\n") || "  - 식사 기록 없음"}\n  체크한 습관: ${done.join(", ") || "없음"}`;
  });
  const prompt =
    `너는 이 사람의 식단·생활습관 코치야. 반말로, 휴대폰 화면에서 읽기 좋게 짧게 써.\n` +
    `${focusOf(data) || "검진 기록 없음"}\n` +
    `매일 체크하는 습관: ${habits.map(([, h]) => `${h.name}(${h.kind === "not" ? "참기" : "하기"})`).join(", ")}\n\n` +
    `최근 14일 기록:\n${lines.join("\n")}\n\n` +
    `형식:\n**한 줄 요약**\n**잘한 것** 2개\n**고칠 것** 2~3개 (구체적인 끼니·음식을 짚고, 바꿔 먹을 대안까지)\n**술** 한두 줄\n**이번 주 목표** 하나\n` +
    `기록이 적으면 그 점을 말하고 있는 범위에서만 조언해. 진단이나 약 이야기는 하지 말고, 필요하면 진료 때 물어보라고만 해.`;
  return ask(SMART(), [{ type: "text", text: prompt }], 1200);
}
