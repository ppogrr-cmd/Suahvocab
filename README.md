# Cheol's Routine

https://cheols-routine.vercel.app

박원철 개인용 루틴 앱 (건강 습관 To-do / Not To-do → 이후 중국어·스터디 탭 추가 예정)

- `index.html` — 휴대폰 홈 화면용 웹앱 (기기에도 저장, 서버와 자동 동기화)
- `api/auth.js` — PIN 잠금. 기기마다 처음 한 번 PIN을 넣으면 1년짜리 출입증(HttpOnly 쿠키) 발급
- `api/data.js` — 기록 동기화 (출입증 없는 요청은 401)

PIN은 코드에 없고 Redis에 해시(scrypt)로만 저장된다. Redis 키는 모두 `cr:` 접두어.

## Claude 연결 (선택)
Vercel 환경변수 `ANTHROPIC_API_KEY`를 넣으면
- 식사 사진을 올릴 때마다 요리 이름과 한 줄 평을 붙인다 (`api/meal.js`, 기본 모델 claude-haiku-5-5)
- 식사 탭 '최근 14일 조언 받기'로 식사·술·습관·검진 수치를 묶어 조언을 받는다 (`api/advice.js`, 기본 모델 claude-sonnet-5-5)
모델은 `AI_MODEL_FAST`, `AI_MODEL` 환경변수로 바꿀 수 있다.
