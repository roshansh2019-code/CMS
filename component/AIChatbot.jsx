import React, { useEffect, useRef, useState } from "react";
import axios from "axios";
import "./aiChatbot.css";

const API = `http://${window.location.hostname}:5000`;

const BotIcon = () => (
  <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor"
       strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <rect x="3" y="8" width="18" height="12" rx="3" />
    <path d="M12 3v5M8 14h.01M16 14h.01" />
  </svg>
);

const CloseIcon = () => (
  <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor"
       strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M6 6l12 12M18 6L6 18" />
  </svg>
);

const SendIcon = () => (
  <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor"
       strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M22 2L11 13M22 2l-7 20-4-9-9-4 20-7z" />
  </svg>
);

const SUGGESTIONS = [
  "What is my GPA?",
  "How is my attendance?",
  "What is my weakest subject?",
  "How much fee is due?",
];

function AIChatbot({ user }) {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState([
    {
      role: "assistant",
      content: `Hi ${user?.full_name?.split(" ")[0] || "there"}! I can help with your GPA, attendance, fees, results, and notices. What would you like to know?`,
    },
  ]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const bottomRef = useRef(null);

  useEffect(() => {
    if (open) bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, open, loading]);

  const sendMessage = async (text) => {
    const trimmed = text.trim();
    if (!trimmed || loading) return;

    const nextMessages = [...messages, { role: "user", content: trimmed }];
    setMessages(nextMessages);
    setInput("");
    setError("");
    setLoading(true);

    try {
      const history = nextMessages
        .filter((m) => m.role === "user" || m.role === "assistant")
        .slice(-8);

      const res = await axios.post(`${API}/ai/chat`, {
        roll: user.roll,
        message: trimmed,
        history,
      });

      if (res.data.status === "success") {
        setMessages((prev) => [...prev, { role: "assistant", content: res.data.reply }]);
      } else {
        setError(res.data.message || "Something went wrong. Please try again.");
      }
    } catch (err) {
      setError(err?.response?.data?.message || "Couldn't reach the assistant. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    sendMessage(input);
  };

  if (!user || String(user.role).toLowerCase() !== "student") return null;

  return (
    <div className="aiChat_root">
      {open && (
        <div className="aiChat_panel">
          <div className="aiChat_header">
            <div className="aiChat_headerTitle">
              <BotIcon />
              <span>Study Assistant</span>
            </div>
            <button className="aiChat_iconBtn" onClick={() => setOpen(false)} aria-label="Close chat">
              <CloseIcon />
            </button>
          </div>

          <div className="aiChat_body">
            {messages.map((m, i) => (
              <div key={i} className={`aiChat_bubbleRow ${m.role === "user" ? "aiChat_rowRight" : ""}`}>
                <div className={`aiChat_bubble ${m.role === "user" ? "aiChat_bubbleUser" : "aiChat_bubbleBot"}`}>
                  {m.content}
                </div>
              </div>
            ))}

            {loading && (
              <div className="aiChat_bubbleRow">
                <div className="aiChat_bubble aiChat_bubbleBot aiChat_typing">
                  <span></span><span></span><span></span>
                </div>
              </div>
            )}

            {error && <div className="aiChat_errorBox">{error}</div>}
            <div ref={bottomRef} />
          </div>

          {messages.length <= 1 && (
            <div className="aiChat_suggestions">
              {SUGGESTIONS.map((s) => (
                <button key={s} type="button" className="aiChat_suggestionChip" onClick={() => sendMessage(s)}>
                  {s}
                </button>
              ))}
            </div>
          )}

          <form className="aiChat_inputRow" onSubmit={handleSubmit}>
            <input
              className="aiChat_input"
              type="text"
              placeholder="Ask about your GPA, attendance, fees..."
              value={input}
              onChange={(e) => setInput(e.target.value)}
              disabled={loading}
            />
            <button className="aiChat_sendBtn" type="submit" disabled={loading || !input.trim()} aria-label="Send">
              <SendIcon />
            </button>
          </form>
        </div>
      )}

      <button className="aiChat_fab" onClick={() => setOpen((o) => !o)} aria-label="Toggle assistant">
        {open ? <CloseIcon /> : <BotIcon />}
      </button>
    </div>
  );
}

export default AIChatbot;