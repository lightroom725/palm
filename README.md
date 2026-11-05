# ✋ 손금 운세 — 배포 가이드

손바닥을 촬영하거나 사진을 불러오면, AI(Claude)가 손금 위치를 찾아 사진 위에 그려 주고 운세를 알려 주는 모바일 웹앱입니다.
로그인 없이 누구나 주소만 있으면 쓸 수 있습니다.

## 폴더 구성

| 파일 | 역할 |
|---|---|
| `index.html` | 앱 화면 (촬영·불러오기, 손금 그리기, 결과) |
| `api/analyze.js` | 서버 함수: 사진을 받아 Claude API로 손금을 분석 |
| `vercel.json` | 서버 함수 설정 (최대 60초) |
| `manifest.json`, `icon.svg` | 휴대폰 홈 화면에 추가할 때 쓰는 앱 정보·아이콘 |

API 키는 서버(`api/analyze.js`)에서만 쓰이고, 사용자 휴대폰에는 절대 전달되지 않습니다.

---

## 1단계. Anthropic API 키 만들기

1. https://console.anthropic.com 에 가입하고 로그인합니다.
2. **Billing**에서 결제 수단을 등록하고 크레딧을 충전합니다.
3. **Limits**에서 **월 사용 한도(Spend limit)** 를 정해 두세요. 예상보다 많이 쓰이는 것을 막아 줍니다.
4. **API Keys → Create Key**로 키를 만들고 복사해 둡니다. (`sk-ant-...` 로 시작, 다시 볼 수 없으니 안전한 곳에 보관)

## 2단계. GitHub에 코드 올리기

1. https://github.com 에 가입·로그인합니다.
2. 오른쪽 위 **+ → New repository**, 이름은 `palm-fortune` 처럼 정하고 **Create repository**.
3. 만들어진 페이지에서 **uploading an existing file** 링크를 누릅니다.
4. 압축을 푼 `palm-app` 폴더 **안의 내용물 전부**(index.html, api 폴더, vercel.json 등)를 끌어다 놓고 **Commit changes**.
   - `api` 폴더가 그대로 올라갔는지 꼭 확인하세요 (`api/analyze.js`).

## 3단계. Vercel로 배포하기

1. https://vercel.com 에서 **GitHub 계정으로 가입**합니다.
2. **Add New… → Project** → 방금 만든 `palm-fortune` 저장소의 **Import**.
3. 설정 화면에서 **Environment Variables**를 펼치고 추가합니다.
   - Name: `ANTHROPIC_API_KEY`
   - Value: 1단계에서 복사한 키
4. **Deploy**를 누릅니다. 1분쯤 뒤 `https://palm-fortune-xxxx.vercel.app` 같은 주소가 생깁니다.
5. 이 주소를 휴대폰에서 열어 테스트하고, 사람들에게 공유하면 끝입니다.

> 키를 나중에 넣었거나 바꿨다면: Vercel 프로젝트 → **Settings → Environment Variables**에서 수정 후 **Deployments → 최신 배포의 ⋯ → Redeploy** 해야 반영됩니다.

## 휴대폰 홈 화면에 앱처럼 추가하기

- **아이폰(Safari)**: 공유 버튼 → **홈 화면에 추가**
- **안드로이드(Chrome)**: ⋮ 메뉴 → **홈 화면에 추가** 또는 **앱 설치**

---

## 선택 설정 (Vercel 환경 변수)

| 이름 | 기본값 | 설명 |
|---|---|---|
| `ANTHROPIC_MODEL` | `claude-sonnet-5-5` | 분석에 쓸 Claude 모델. 비용을 줄이려면 `claude-haiku-5-5` (정확도는 낮아질 수 있음) |
| `RATE_LIMIT_PER_10MIN` | `10` | 한 사람(IP)이 10분 동안 분석할 수 있는 횟수 |

## 문제 해결

- **"서버에 API 키가 설정되지 않았어요"** → 3단계의 환경 변수를 확인하고 Redeploy.
- **"AI 분석 서버에 문제가 생겼어요"** → Anthropic 콘솔에서 크레딧 잔액과 키가 유효한지 확인. Vercel 프로젝트의 **Logs** 탭에 자세한 오류가 남습니다.
- **손금 위치가 어긋남** → 밝은 곳에서 손바닥을 활짝 펴고 화면에 꽉 차게 찍어 주세요. 결과 화면의 **손금 직접 고치기**로 수정할 수 있습니다.

## 참고

- 사진은 분석 요청에만 쓰이고 서버에 저장하지 않습니다.
- Vercel 무료(Hobby) 요금제는 개인·비상업용입니다. 광고나 유료 서비스로 운영하려면 Pro 요금제가 필요합니다.
- 손금 풀이는 재미용 콘텐츠입니다.
