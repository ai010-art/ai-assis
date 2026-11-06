# 생산기술실 AI 비서 프로젝트 규칙
- 화면은 public/ 폴더에 React로 만든다. React는 CDN으로 불러오고 빌드 도구는 쓰지 않는다.
- 서버 공통 로직은 lib/gemini.js에 두고, api/chat.js(Vercel)와 local-server.js(내 PC)가 함께 쓴다.
- Express는 쓰지 않는다. 내 PC 서버는 Node.js 기본 http 모듈로 만든다.
- API 키는 .env와 Vercel 환경변수에만 둔다. 코드, 문서, 대화, 로그에 키 값을 쓰지 않는다.
- .env 파일을 읽거나 내용을 출력하지 않는다.
- 커밋과 푸시는 내가 요청할 때만 한다.
- 나는 개발자가 아니다. 작업 후 바꾼 파일과 확인 방법을 쉬운 한국어로 짧게 알려준다.
