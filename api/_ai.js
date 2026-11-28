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

// 회화 애드리브: 대본 장면을 이어서 상대역이 한마디 → { zh, py, ko, tip }
export async function talk({ scene, me, you, script, log }) {
  const hist = (log || []).map((m) => `${m.me ? me.name : you.name}：${String(m.zh || "").slice(0, 200)}`).join("\n");
  const prompt =
    `너는 중국 직장 드라마의 등장인물 "${you.name}"(${you.ko})이야. 상대는 "${me.name}"(${me.ko}). 상대역은 중국어가 유창한 한국인 학습자가 연기 중이야.\n` +
    `장면: ${scene}\n대본 마지막 부분:\n${(script || []).join("\n")}\n\n이후 즉흥 대화:\n${hist}\n\n` +
    `${you.name}로서 다음 한마디를 해. 규칙:\n- 실제 상하이 직장인이 쓰는 자연스러운 구어체 보통화, 1~2문장, 캐릭터 성격 유지, 장면을 조금씩 앞으로 진행\n` +
    `- 상대 마지막 말에 어색하거나 틀린 중국어가 있으면 tip에 한국어로 짧게 더 자연스러운 표현을 알려주고, 없으면 tip은 빈 문자열\n` +
    `JSON만: {"zh":"중국어","py":"성조 표시 병음","ko":"한국어 뜻","tip":""}`;
  const text = await ask(SMART(), [{ type: "text", text: prompt }], 400);
  const j = jsonIn(text) || { zh: text.slice(0, 120) };
  return { zh: String(j.zh || "").slice(0, 200), py: String(j.py || "").slice(0, 300), ko: String(j.ko || "").slice(0, 200), tip: String(j.tip || "").slice(0, 200) };
}

// 음주 도감: 라벨 사진(또는 이름) → 술 정보
export async function bottleInfo({ img, hint }) {
  const prompt =
    `${img ? "술병 라벨 사진이야." : `술 이름: "${String(hint || "").slice(0, 120)}"`}${img && hint ? ` 참고 메모: "${String(hint).slice(0, 120)}"` : ""}\n` +
    `와인·위스키·사케·맥주·전통주·소주·고량주·리큐르 등 무엇이든 될 수 있어. 한국 애호가가 보는 '술 도감' 항목을 한국어로 써줘.\n` +
    `라벨에서 읽히는 사실(이름·생산자·빈티지·도수·용량)은 정확히 옮기고, 모르는 건 빈 문자열로 둬. 추측한 건 '~로 보임'으로.\n` +
    `JSON만:\n{"kind":"와인|위스키|브랜디|사케|맥주|전통주|소주|고량주|럼|진|보드카|데킬라|리큐르|기타",` +
    `"style":"세부 종류(예: 레드, 싱글몰트, 준마이긴죠, IPA, 약주)","nameKo":"한국어 이름","nameOrig":"원어 이름","producer":"생산자",` +
    `"country":"국가(한국어)","region":"산지","vintage":"빈티지 또는 숙성 연수, 없으면 NV","abv":"도수(예: 13.5%)","base":"품종·원료(예: 카베르네 소비뇽 70%, 메를로 30% / 맥아 100% / 야마다니시키)",` +
    `"story":"생산자와 산지(테루아·증류소·양조장) 이야기 3~4문장","visual":"외관","nose":"향","palate":"맛·구조·여운","aromas":["대표 향 3~5개"],` +
    `"serve":{"temp":"서빙 온도","glass":"잔","how":"디캔팅·물 몇 방울 등 다루는 법"},"pairing":["어울리는 음식 3~5개"],` +
    `"price":"국내 대략 가격대(원)","rarity":1~5 숫자,"rarityNote":"희귀도 한 줄","drink":"마시기 좋은 시기 또는 보관 팁","confidence":"high|mid|low"}\n` +
    `술병이 아니면 {"kind":"없음"}.`;
  const content = [];
  if (img) {
    const b64 = img.replace(/^data:image\/\w+;base64,/, "");
    const media = (img.match(/^data:(image\/\w+);/) || [])[1] || "image/jpeg";
    content.push({ type: "image", source: { type: "base64", media_type: media, data: b64 } });
  }
  content.push({ type: "text", text: prompt });
  const text = await ask(SMART(), content, 1800);
  const j = jsonIn(text);
  if (!j) throw new Error("AI 응답을 읽지 못했어요");
  const s = (v, n) => String(v == null ? "" : v).slice(0, n);
  const arr = (v, n) => (Array.isArray(v) ? v : String(v || "").split(/[,·]/)).map((x) => s(x, 40).trim()).filter(Boolean).slice(0, n);
  const sv = j.serve || {};
  return {
    kind: s(j.kind, 10), style: s(j.style, 40), nameKo: s(j.nameKo, 80), nameOrig: s(j.nameOrig, 100), producer: s(j.producer, 80),
    country: s(j.country, 30), region: s(j.region, 60), vintage: s(j.vintage, 20), abv: s(j.abv, 12), base: s(j.base, 120),
    story: s(j.story, 700), visual: s(j.visual, 200), nose: s(j.nose, 300), palate: s(j.palate, 300), aromas: arr(j.aromas, 6),
    serve: { temp: s(sv.temp, 40), glass: s(sv.glass, 40), how: s(sv.how, 120) }, pairing: arr(j.pairing, 6),
    price: s(j.price, 60), rarity: Math.max(0, Math.min(5, Math.round(+j.rarity || 0))), rarityNote: s(j.rarityNote, 100),
    drink: s(j.drink, 120), confidence: s(j.confidence, 6),
  };
}
