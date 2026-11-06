// Gemini 호출 공통 로직. api/chat.js(Vercel)와 local-server.js(내 PC)가 함께 쓴다.
import { GoogleGenAI } from "@google/genai";

const SYSTEM_INSTRUCTION = "너는 신진엠텍 생산기술실의 AI 비서야. 한국어로 간결하게 답해.";
const DEFAULT_MODEL = "gemini-3.5-flash-lite";
const MAX_TEXT_LENGTH = 2000;
const MAX_MESSAGES = 20;

// 입력이 올바르면 null을, 잘못되면 화면에 보여줄 오류 문구를 돌려준다.
export function validateMessages(messages) {
  if (!Array.isArray(messages) || messages.length === 0) {
    return "메시지를 입력해 주세요.";
  }
  for (const message of messages) {
    if (message?.role !== "user" && message?.role !== "assistant") {
      return "메시지 형식이 올바르지 않습니다.";
    }
    if (typeof message.text !== "string" || message.text.trim() === "") {
      return "메시지를 입력해 주세요.";
    }
    if (message.text.length > MAX_TEXT_LENGTH) {
      return `메시지는 ${MAX_TEXT_LENGTH.toLocaleString("ko-KR")}자까지 입력할 수 있습니다.`;
    }
  }
  if (messages.at(-1).role !== "user") {
    return "마지막 메시지는 사용자의 질문이어야 합니다.";
  }
  return null;
}

// 최근 메시지만 남기고 Gemini 형식으로 바꾼다. (assistant → model)
export function toGeminiContents(messages) {
  const recent = messages.slice(-MAX_MESSAGES);
  // 대화 기록이 AI 답변부터 시작하지 않도록 앞쪽 답변을 뺀다.
  const firstUser = recent.findIndex((message) => message.role === "user");
  return recent.slice(firstUser).map((message) => ({
    role: message.role === "assistant" ? "model" : "user",
    parts: [{ text: message.text }],
  }));
}

// 오류 원문은 숨기고 쉬운 한국어 문구와 상태 코드만 돌려준다.
export function toErrorResponse(error) {
  const status = error?.status;
  if (status === 429) {
    return { status: 429, body: { error: "요청이 많습니다. 잠시 후 다시 시도해 주세요." } };
  }
  if (status === 401 || status === 403 || /api[ _-]?key/i.test(String(error?.message))) {
    return { status: 500, body: { error: "API 키를 확인하세요." } };
  }
  return { status: 502, body: { error: "AI 답변을 가져오지 못했습니다. 잠시 후 다시 시도해 주세요." } };
}

async function generateReply(messages) {
  const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
  const response = await ai.models.generateContent({
    model: process.env.GEMINI_MODEL || DEFAULT_MODEL,
    contents: toGeminiContents(messages),
    config: { systemInstruction: SYSTEM_INSTRUCTION },
  });
  return response.text;
}

// 요청 내용을 받아 { status, body } 형태의 응답을 만든다.
export async function handleChat(requestBody) {
  const messages = requestBody?.messages;
  const invalid = validateMessages(messages);
  if (invalid) {
    return { status: 400, body: { error: invalid } };
  }
  if (!process.env.GEMINI_API_KEY) {
    return { status: 500, body: { error: "API 키를 확인하세요." } };
  }

  try {
    const reply = await generateReply(messages);
    if (!reply) {
      return { status: 502, body: { error: "AI 답변을 가져오지 못했습니다. 다르게 질문해 주세요." } };
    }
    return { status: 200, body: { reply } };
  } catch (error) {
    // 원문에 민감한 내용이 있을 수 있으므로 로그에도 상태 코드만 남긴다.
    console.error(`Gemini 호출 실패 (상태 코드: ${error?.status ?? "없음"})`);
    return toErrorResponse(error);
  }
}
