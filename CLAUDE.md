# CLAUDE.md — 성경말씀 암송 (익명 앱)

로그인 없이 쓰는 **성경암송 웹앱** (오직 성경, 말씀이 답이다).
순수 **바닐라 JS 정적 사이트** — 백엔드/Supabase 없음, 데이터는 `verses.json`.

## 핵심
- **주요 파일**: `index.html`, `app.js`, `style.css`, `verses.json`(구절 데이터), `kakao-redirect.js`(카톡 인앱 대응)
- **배포**: GitHub Pages (`.github/workflows/deploy.yml`). 커밋+푸시하면 자동 배포.
- **커스텀 도메인**: `with.onlybible.kr` (CNAME)
- **repo**: sewoongkim1/bible-memorize-app

## 작업 규칙
- **변경 후 자동 배포**: 수정하면 확인 없이 커밋+푸시(GitHub Pages).
- **캐시 버전 갱신**: `app.js`/`style.css` 수정 시 `index.html`의 `?v=` 태그를 갱신(현재 날짜 `YYYYMMDD` 형식. 예: `app.js?v=20260701`). 안 하면 사용자 브라우저가 옛 파일 캐시.

## 앱 계열 관계
- 이 앱 = **익명(비로그인)** 버전. 수정은 **요청 시에만**.
- **회원(로그인) 앱**은 별도: `bible-memorize-church-app-v2`(Supabase 백엔드, 활성). v1 `bible-memorize-church-app`은 리다이렉트 껍데기.
