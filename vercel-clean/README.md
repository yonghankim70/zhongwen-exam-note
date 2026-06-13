# 중문시험노트

중국어 문장 사진을 찍거나 문장을 직접 입력하면 시험 대비 노트로 정리해 주는
모바일 우선 PWA입니다.

## 기능

- 사진 업로드 또는 카메라 촬영
- 중국어 문장 인식 및 분석
- 중국어 문장, 단어, 예문을 표준어 발음으로 듣기
- 단어별 설명, 전체 의미, 상황별 의미, 실제 대화 예시
- 비슷한 표현 비교, 자주 쓰는 패턴, 정리
- 시험 포인트와 자주 나오는 출제 유형
- 휴대폰 홈 화면에 앱처럼 설치
- 최근 분석 결과를 기기 안에 저장

## 설정

`.env.example`을 참고해서 환경변수를 설정합니다.

```bash
OPENAI_API_KEY=sk-your-api-key
OPENAI_MODEL=gpt-5.2
```

배포 환경에서는 `OPENAI_API_KEY`를 서버 환경변수로 넣어야 합니다. 이 키는
브라우저에 노출되지 않습니다.

## 실행

```bash
npm install
npm run dev
```

## Vercel 배포

GitHub에 올린 뒤 Vercel에서 프로젝트를 가져올 때 설정은 기본값을 쓰면 됩니다.

```text
Framework Preset: Next.js
Build Command: npm run build
Install Command: npm install
```

환경변수에는 아래 값을 추가해야 사진 분석이 작동합니다.

```text
OPENAI_API_KEY=본인의 OpenAI API 키
OPENAI_MODEL=gpt-5.2
```

## 휴대폰 설치

1. 배포된 주소를 휴대폰 Chrome 또는 Safari에서 엽니다.
2. Chrome은 설치 버튼 또는 메뉴의 앱 설치를 누릅니다.
3. iPhone Safari는 공유 버튼을 누른 뒤 홈 화면에 추가를 선택합니다.

1차 버전은 분석 요청에 인터넷이 필요합니다. 다만 앱 화면 자체는 한 번 연 뒤
홈 화면에서 다시 열 수 있게 캐시됩니다.

음성 듣기는 휴대폰 브라우저의 기본 음성 읽기 기능을 사용합니다. 중국어 음성이
설치된 기기에서는 `zh-CN` 표준어 음성을 우선 선택합니다.
