const { useEffect, useLayoutEffect, useRef, useState } = React;

const isLocal = ["127.0.0.1", "localhost"].includes(window.location.hostname);
const API_URL = isLocal ? "http://127.0.0.1:3001/api/chat" : "/api/chat";

const MAX_TEXT_LENGTH = 2000;
const MAX_HISTORY = 20;

// 서버로 보낼 대화 기록을 만든다. 오류 문구는 대화가 아니므로 뺀다.
// AI 답변이 길면 서버의 글자 수 제한에 걸려 다음 질문까지 실패하므로 앞부분만 보낸다.
function toRequestMessages(messages) {
  return messages
    .filter((message) => message.role !== "error")
    .slice(-MAX_HISTORY)
    .map(({ role, text }) => ({ role, text: text.slice(0, MAX_TEXT_LENGTH) }));
}

async function requestReply(messages) {
  let response;
  try {
    response = await fetch(API_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ messages: toRequestMessages(messages) }),
    });
  } catch {
    throw new Error("서버에 연결하지 못했습니다. 서버가 켜져 있는지 확인해 주세요.");
  }

  const data = await response.json().catch(() => null);
  if (!response.ok || !data?.reply) {
    throw new Error(data?.error || "답변을 가져오지 못했습니다. 잠시 후 다시 시도해 주세요.");
  }
  return data.reply;
}

function App() {
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const nextId = useRef(1);
  const chatEnd = useRef(null);
  const inputBox = useRef(null);
  const chatIcon = useRef(null);

  const createMessage = (role, text) => ({
    id: nextId.current++,
    role,
    text,
    time: new Date().toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit", hour12: false }),
  });
  const canSend = input.trim() !== "" && !isLoading;

  function closeChat() {
    setIsOpen(false);
    chatIcon.current?.focus();
  }

  // 팝업을 열면 바로 입력할 수 있게 입력창으로 이동한다.
  useEffect(() => {
    if (isOpen) inputBox.current?.focus();
  }, [isOpen]);

  // Esc 키로 팝업을 닫는다.
  useEffect(() => {
    if (!isOpen) return undefined;
    function handleEscape(event) {
      if (event.key === "Escape" && !event.isComposing) closeChat();
    }
    document.addEventListener("keydown", handleEscape);
    return () => document.removeEventListener("keydown", handleEscape);
  }, [isOpen]);

  useEffect(() => {
    chatEnd.current?.scrollIntoView({ block: "end" });
  }, [messages, isLoading, isOpen]);

  // 입력한 줄 수에 맞춰 입력창 높이를 바꾼다.
  useLayoutEffect(() => {
    const box = inputBox.current;
    if (!box) return;
    box.style.height = "auto";
    box.style.height = `${box.scrollHeight}px`;
  }, [input, isOpen]);

  async function sendMessage() {
    if (!canSend) return;

    const nextMessages = [...messages, createMessage("user", input.trim())];
    setMessages(nextMessages);
    setInput("");
    setIsLoading(true);
    inputBox.current?.focus();

    try {
      const reply = await requestReply(nextMessages);
      setMessages((current) => [...current, createMessage("assistant", reply)]);
    } catch (error) {
      setMessages((current) => [...current, createMessage("error", error.message)]);
    } finally {
      setIsLoading(false);
    }
  }

  function handleKeyDown(event) {
    // 한글을 조합하는 중에 누른 Enter는 전송하지 않는다. (같은 글자가 두 번 전송되는 문제 방지)
    if (event.key !== "Enter" || event.shiftKey || event.nativeEvent.isComposing) return;
    event.preventDefault();
    sendMessage();
  }

  function clearChat() {
    setMessages([]);
    inputBox.current?.focus();
  }

  return (
    <>
      {isOpen && (
        <div className="chat-popup" role="dialog" aria-label="생산기술실 AI 비서">
          <header className="header">
            <div className="avatar" aria-hidden="true">AI</div>
            <div className="header-title">
              <h2>생산기술실 AI 비서</h2>
              <p>AI 챗봇</p>
            </div>
            <button
              type="button"
              className="clear-button"
              onClick={clearChat}
              disabled={isLoading || messages.length === 0}
            >
              대화 지우기
            </button>
            <button
              type="button"
              className="close-button"
              onClick={closeChat}
              aria-label="챗봇 닫기"
              title="닫기"
            >
              <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true">
                <path fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" d="M6 6l12 12M18 6 6 18" />
              </svg>
            </button>
          </header>

          <main className="chat" role="log" aria-live="polite">
            {messages.length === 0 && !isLoading && (
              <p className="empty">궁금한 내용을 입력해 보세요.</p>
            )}
            {messages.map((message) => (
              <div key={message.id} className={`bubble ${message.role}`}>
                <span className="text">{message.text}</span>
                <span className="time">{message.time}</span>
              </div>
            ))}
            {isLoading && <div className="bubble assistant waiting">답변 작성 중...</div>}
            <div ref={chatEnd} />
          </main>

          <footer className="footer">
            <form
              className="composer"
              onSubmit={(event) => {
                event.preventDefault();
                sendMessage();
              }}
            >
              <textarea
                ref={inputBox}
                rows="1"
                value={input}
                maxLength={MAX_TEXT_LENGTH}
                placeholder="질문을 입력하세요"
                aria-label="질문 입력"
                onChange={(event) => setInput(event.target.value)}
                onKeyDown={handleKeyDown}
              />
              <button
                type="submit"
                className="send-button"
                disabled={!canSend}
                aria-label="보내기"
                title="보내기"
              >
                <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true">
                  <path fill="currentColor" d="M3 20.5 21.5 12 3 3.5l.01 6.6L15 12 3.01 13.9z" />
                </svg>
              </button>
            </form>
            <p className="notice">실습용 챗봇입니다. 실제 회사 자료나 개인정보를 입력하지 마세요.</p>
          </footer>
        </div>
      )}

      <button
        ref={chatIcon}
        type="button"
        className="chat-fab"
        onClick={() => (isOpen ? closeChat() : setIsOpen(true))}
        aria-expanded={isOpen}
        aria-label={isOpen ? "챗봇 닫기" : "챗봇 열기"}
        title={isOpen ? "챗봇 닫기" : "챗봇 열기"}
      >
        {isOpen ? (
          <svg viewBox="0 0 24 24" width="26" height="26" aria-hidden="true">
            <path fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" d="M6 6l12 12M18 6 6 18" />
          </svg>
        ) : (
          <svg viewBox="0 0 24 24" width="30" height="30" aria-hidden="true">
            <path fill="currentColor" d="M12 3C6.5 3 2 6.8 2 11.5c0 2.5 1.3 4.8 3.3 6.3L4.5 21.5l4.2-2.1c1 .3 2.1.4 3.3.4 5.5 0 10-3.7 10-8.3S17.5 3 12 3z" />
          </svg>
        )}
      </button>
    </>
  );
}

ReactDOM.createRoot(document.getElementById("root")).render(<App />);
