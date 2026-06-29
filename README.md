# Achiever AI

목표를 계층형 실행 지도로 분해하고, 지금 바로 실행할 Task에 집중하도록 돕는 한국어 AI 웹앱입니다.

## 현재 구조

- Frontend: React + Vite + Tailwind CSS
- Tree Map: D3.js v7 `d3.tree()`
- AI: Google Gemini API `gemini-3.1-flash-lite`
- API: `/api/gemini` 프록시
- Deploy: Netlify
- State: Browser LocalStorage
- DB, 로그인, 회원가입 없음

## 실행 방법

```bash
npm install
npm run dev
```

개발 서버 주소:

```text
http://localhost:5173
```

로컬 개발에서는 `.env`에 아래 값을 설정합니다.

```text
GEMINI_API_KEY=your_gemini_api_key_here
```

## Netlify 배포

Netlify Site Settings에서 환경변수를 등록합니다.

```text
GEMINI_API_KEY=your_gemini_api_key_here
```

Netlify 설정은 `netlify.toml`에 포함되어 있습니다.

- Build command: `npm run build`
- Publish directory: `dist`
- Functions directory: `netlify/functions`
- API route: `/api/gemini`

사용자는 API Key를 입력하지 않고 바로 프로젝트 시작 화면에서 목표를 입력합니다.

## LocalStorage Keys

```text
achiever_goal_tree
achiever_active_task
achiever_start_time
achiever_map_phase
achiever_projects
achiever_active_project
```

기존 `achiever_api_key`는 새 플로우에서 사용하지 않으며, 새 목표 시작 시 레거시 키와 함께 정리됩니다.

## 검증 명령

```bash
npm run build
```
