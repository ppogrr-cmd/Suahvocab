# Cheol's Routine

박원철 개인용 루틴 앱 (건강 습관 To-do / Not To-do → 이후 중국어·스터디 탭 추가 예정)

- `index.html` — 휴대폰 홈 화면용 웹앱 (기기에도 저장, 서버와 자동 동기화)
- `api/auth.js` — PIN 잠금. 기기마다 처음 한 번 PIN을 넣으면 1년짜리 출입증(HttpOnly 쿠키) 발급
- `api/data.js` — 기록 동기화 (출입증 없는 요청은 401)
- `api/sync.js` — 예전 단어장(Candy's Voca) 서버 기록. suahstudy로 이전 확인 후 지워도 됨

PIN은 코드에 없고 Redis에 해시(scrypt)로만 저장된다. Redis 키는 모두 `cr:` 접두어.
