// Gemini 연결 확인용 테스트
// 실행: node --env-file=.env check-gemini.js
import { GoogleGenAI } from "@google/genai";

const apiKey = process.env.GEMINI_API_KEY;
const model = process.env.GEMINI_MODEL || "gemini-3.5-flash-lite";

// 오류 내용에 키 값이 섞여 있어도 화면에 나오지 않게 가린다.
function hideKey(text) {
  const message = String(text);
  return apiKey ? message.replaceAll(apiKey, "[키 숨김]") : message;
}

if (!apiKey) {
  console.error("실패: GEMINI_API_KEY 값을 찾지 못했습니다. .env 파일을 확인해 주세요.");
  process.exit(1);
}

console.log(`사용 모델: ${model}`);

try {
  const ai = new GoogleGenAI({ apiKey });
  const response = await ai.models.generateContent({
    model,
    contents: '"연결 성공"이라고 한 문장으로만 답해 주세요.',
  });
  console.log(`Gemini 응답: ${response.text}`);
} catch (error) {
  console.error(`실패: 오류 코드 ${error.status ?? "없음"}`);
  console.error(hideKey(error.message));
  process.exit(1);
}
