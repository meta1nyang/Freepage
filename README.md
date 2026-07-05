# Freepage

드래그 앤 드롭으로 배경 · 이미지 · 텍스트(링크 포함)를 자유롭게 배치해서
나만의 한 장짜리 페이지를 만들고, 짧은 링크로 공유하는 도구예요.
고급 사용자는 Raw CSS로 세밀하게 커스터마이징할 수도 있어요.

순수 HTML/CSS/JS + Vercel 서버리스 함수로만 만들어져 있고, 프레임워크나
npm 의존성이 전혀 없어요. `npm install` 없이 그대로 GitHub → Vercel로 배포하면 돼요.

## 주요 기능

- **자유배치 에디터**: 텍스트/이미지를 마우스로 드래그해서 원하는 위치에 배치, 모서리로 크기 조절
- **텍스트 박스 디자인**: 글꼴(한글 지원 6종) · 크기 · 색 · 정렬 · 배경색 · 여백 · 모서리 둥글기 · 테두리 · 그림자
- **링크 연결**: 텍스트나 이미지에 URL을 연결해서 누르면 이동하도록 설정 (새 탭 열기 여부 선택 가능)
- **배경 설정**: 단색 또는 이미지(URL/업로드) 배경
- **Raw CSS**: 직접 CSS를 작성해 더 세밀하게 커스터마이징 (요소별 CSS 클래스 지정 가능)
- **미리보기**: 실제 공유됐을 때와 100% 동일한 모습을 저장 전에 확인
- **공유 링크 발급**: `공유하기`를 누르면 짧은 공개 링크(`/p/abc123`)와, 나만 사용할 편집 링크(`/edit/abc123?key=...`)가 발급돼요
- **내 페이지 목록**: 브라우저에 최근 만든 페이지 목록이 저장되어 다시 찾아 편집하기 편해요

## 폴더 구조

```
freepage/
├── api/
│   ├── pages.js          # POST  /api/pages      새 페이지 저장 + ID 발급
│   └── pages/[id].js     # GET   /api/pages/:id   페이지 조회 (공개)
│                         # PUT   /api/pages/:id   페이지 수정 (편집 토큰 필요)
├── lib/
│   └── redis.js          # Upstash Redis REST API 호출 헬퍼
├── css/
│   ├── editor.css        # 에디터 스타일
│   └── view.css          # 공개 뷰어 스타일
├── js/
│   ├── render.js         # 페이지 데이터 -> HTML 변환 (에디터 미리보기 & 뷰어 공용)
│   ├── editor.js         # 에디터 동작 전체
│   └── view.js           # 공개 뷰어 동작
├── index.html            # 시작 화면
├── editor.html           # 에디터 화면 (/edit/:id 로도 열림)
├── view.html             # 공개 뷰어 화면 (/p/:id 로 열림)
├── vercel.json            # /p/:id, /edit/:id 짧은 링크를 위한 rewrite 설정
├── package.json
└── .env.example
```

## 1. 데이터 저장소 연결하기 (Upstash Redis)

Vercel은 자체 KV/Postgres 상품을 마켓플레이스 형태로 바꿨어요. 이 프로젝트는
**Upstash Redis**를 씁니다. 페이지 하나를 `키: page:아이디` → `값: JSON 문자열`로
그냥 저장하는 단순한 구조라서 Redis가 딱 맞고, 설정도 제일 간단해요.

1. 아래 "3. Vercel로 배포하기"까지 먼저 진행해서 Vercel 프로젝트를 만드세요.
2. Vercel 대시보드에서 프로젝트 선택 → **Storage** 탭 → **Create Database** (또는 **Browse Marketplace**)
3. **Upstash** 선택 → **Redis** 상품 선택 → 리전은 배포 지역과 가까운 곳으로 선택 → 생성
4. 생성 후 프로젝트에 자동으로 연결하라고 나오면 연결하세요. 이때
   `UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN` 환경변수가
   프로젝트에 자동으로 추가돼요 (코드 수정 필요 없음).
5. Vercel 대시보드 → 프로젝트 → **Deployments**에서 최신 배포를 **Redeploy** 해서
   방금 추가된 환경변수를 반영하세요.

> 로컬(내 컴퓨터)에서 `vercel dev`로 테스트하고 싶다면, 터미널에서
> `vercel env pull .env.local` 을 실행하면 위 환경변수를 자동으로 받아와요.

## 2. GitHub에 업로드하기

터미널을 열고 압축을 푼 `freepage` 폴더로 이동한 뒤:

```bash
cd freepage
git init
git add .
git commit -m "Freepage 초기 커밋"
```

GitHub에서 새 저장소를 만든 다음(README/​.gitignore 추가 없이 빈 저장소로),
저장소 페이지에 나오는 안내를 따라 연결하세요. 보통 이런 명령이에요:

```bash
git remote add origin https://github.com/내계정/freepage.git
git branch -M main
git push -u origin main
```

## 3. Vercel로 배포하기

1. [vercel.com](https://vercel.com) 에 GitHub 계정으로 로그인
2. **Add New... → Project** 클릭
3. 방금 올린 `freepage` 저장소 Import
4. Framework Preset은 **Other**(또는 자동 감지된 그대로) 두고, 빌드 설정은 건드릴 필요 없어요
   (정적 파일 + `/api` 서버리스 함수 조합이라 별도 빌드 명령이 필요 없어요)
5. **Deploy** 클릭

배포가 끝나면 `https://프로젝트이름.vercel.app` 주소가 생겨요. 아직 데이터 저장소를
연결 전이라면, 위 "1. 데이터 저장소 연결하기"를 진행한 뒤 한 번 더 Redeploy 해주세요.

## 사용 흐름

1. `editor.html` (또는 배포된 주소의 `/editor.html`)을 열어요.
2. 왼쪽 `요소 추가`에서 텍스트/이미지를 추가하고, 캔버스에서 자유롭게 드래그·크기 조절해요.
3. 요소를 선택한 상태에서 오른쪽 속성 패널로 스타일과 링크를 설정해요.
4. 더 세밀하게 만들고 싶다면 `Raw CSS`에서 직접 CSS를 작성해요. (예: `.pf-el.my-title { transform: rotate(-3deg); }`)
5. `미리보기`로 실제 결과를 확인하고, `공유하기`를 누르면 공개 링크와 편집 링크가 발급돼요.
6. 나중에 다시 수정하고 싶다면 발급받은 **편집 링크**로 접속하면 기존 내용을 불러와 이어서 편집할 수 있어요.

## 보안에 대한 참고

이 프로젝트는 로그인/회원가입이 없는 아주 단순한 구조예요. 그래서 "편집 링크를
아는 사람은 누구나 그 페이지를 수정할 수 있음"이 보안 모델이에요 (구글 문서의
"링크가 있는 모든 사용자 - 편집 가능"과 같은 방식이에요). 그러니:

- 공유 링크(`/p/...`)는 자유롭게 퍼뜨려도 되지만
- 편집 링크(`/edit/...?key=...`)는 본인만 보관하세요

## 더 확장하고 싶다면

- **이미지 용량**: 지금은 업로드한 이미지를 압축해서 base64로 페이지 데이터에 함께 저장해요.
  이미지를 많이/크게 쓸 계획이라면 Vercel Marketplace의 **Blob** 스토리지를 연결해서
  이미지 파일 자체를 업로드하고 URL만 저장하는 방식으로 바꾸면 훨씬 가벼워져요.
- **비밀번호/만료일**: `api/pages.js`, `api/pages/[id].js`에 필드를 추가하면
  페이지에 비밀번호나 만료일을 붙이는 것도 어렵지 않아요.
- **Raw CSS/JS 전체 개방**: 지금은 안전을 위해 CSS만 열어뒀어요. JS까지 열고 싶다면
  `js/render.js`의 `sanitize` 계열 함수들을 참고해서 꼭 안전하게 iframe 샌드박스
  (`sandbox` 속성)를 적용한 뒤 진행하세요.
