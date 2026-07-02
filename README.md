# Achiever AI

목표를 실행 가능한 Task로 쪼개고, 지금 할 일에 집중하도록 돕는 한국어 AI 웹앱입니다.

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

## 브랜치 운영

- `main`: 개발 브랜치입니다. 평소 작업과 푸시는 이 브랜치에서 진행합니다.
- `release`: 배포 브랜치입니다. 실제 사이트 배포가 필요할 때만 `main`을 병합해서 푸시합니다.

Netlify에서는 Production branch를 `release`로 설정하세요. 이 저장소에는 `release`가 아닌 브랜치의 Netlify 빌드를 스킵하는 `ignore` 설정이 들어 있습니다.

릴리즈 배포가 필요할 때:

```bash
git checkout main
git pull origin main
git checkout release
git merge main
git push origin release
git checkout main
```

## LocalStorage Keys

```text
achiever_goal_tree
achiever_active_task
achiever_start_time
achiever_map_phase
achiever_projects
achiever_active_project
```

기존 `achiever_api_key`는 새 플로우에서 사용하지 않습니다.

## 검증 명령

```bash
npm run build
```
