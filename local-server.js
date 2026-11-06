// 내 PC용 서버: http://127.0.0.1:3001/api/chat
// 실행: npm run dev
import http from "node:http";
import { handleChat } from "./lib/gemini.js";

const HOST = "127.0.0.1";
const PORT = 3001;
const MAX_BODY_BYTES = 1024 * 1024;

// 내 PC에서 연 화면만 허용한다. 다른 웹사이트가 이 서버로 내 키를 쓰지 못하게 하기 위해서다.
function isAllowedOrigin(origin) {
  // Origin이 없으면 브라우저 요청이 아니고, "null"은 HTML 파일을 직접 연 경우다.
  if (!origin || origin === "null") return true;
  try {
    return ["localhost", "127.0.0.1", "[::1]"].includes(new URL(origin).hostname);
  } catch {
    return false;
  }
}

function sendJson(res, status, body) {
  res.writeHead(status, { "Content-Type": "application/json; charset=utf-8" });
  res.end(JSON.stringify(body));
}

// 요청 내용을 읽는다. 너무 크면 null을 돌려준다.
async function readBody(req) {
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size <= MAX_BODY_BYTES) chunks.push(chunk);
  }
  return size > MAX_BODY_BYTES ? null : Buffer.concat(chunks).toString("utf8");
}

const server = http.createServer(async (req, res) => {
  try {
    const origin = req.headers.origin;
    if (!isAllowedOrigin(origin)) {
      return sendJson(res, 403, { error: "허용되지 않은 접속입니다." });
    }
    if (origin) {
      res.setHeader("Access-Control-Allow-Origin", origin);
      res.setHeader("Vary", "Origin");
      res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
      res.setHeader("Access-Control-Allow-Headers", "Content-Type");
    }

    const { pathname } = new URL(req.url, `http://${HOST}:${PORT}`);
    if (pathname !== "/api/chat") {
      return sendJson(res, 404, { error: "없는 주소입니다." });
    }
    if (req.method === "OPTIONS") {
      res.writeHead(204);
      return res.end();
    }
    if (req.method !== "POST") {
      res.setHeader("Allow", "POST, OPTIONS");
      return sendJson(res, 405, { error: "POST 요청만 사용할 수 있습니다." });
    }

    const rawBody = await readBody(req);
    if (rawBody === null) {
      return sendJson(res, 413, { error: "보낸 내용이 너무 많습니다." });
    }

    let requestBody;
    try {
      requestBody = JSON.parse(rawBody);
    } catch {
      return sendJson(res, 400, { error: "요청 형식이 올바르지 않습니다." });
    }

    const { status, body } = await handleChat(requestBody);
    sendJson(res, status, body);
  } catch {
    if (res.headersSent) return res.end();
    sendJson(res, 500, { error: "서버에 문제가 생겼습니다. 다시 시도해 주세요." });
  }
});

server.listen(PORT, HOST, () => {
  console.log(`서버 실행 중: http://${HOST}:${PORT}/api/chat`);
});
