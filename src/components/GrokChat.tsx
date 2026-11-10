import { useState } from "react";
import { api } from "../lib/api.ts";

type Message = { role: "user" | "assistant"; content: string };

type Props = {
  onClose: () => void;
};

export function GrokChat({ onClose }: Props) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function send() {
    const text = input.trim();
    if (!text || busy) return;
    const next = [...messages, { role: "user" as const, content: text }];
    setMessages(next);
    setInput("");
    setBusy(true);
    setError("");
    try {
      const result = await api.chat(next);
      setMessages([...next, { role: "assistant", content: result.content }]);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Chat failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <div className="panel-backdrop" onClick={onClose} />
      <aside className="side-panel">
        <header className="panel-header">
          <h2>Grok</h2>
          <button className="btn ghost" onClick={onClose}>
            Close
          </button>
        </header>
        <div className="panel-body">
          <div className="chat-log">
            {messages.length === 0 && (
              <p className="empty">
                Ask Grok to recap overdue deals, draft a WhatsApp, or plan the next follow-up.
                Nothing is sent unless you press send yourself.
              </p>
            )}
            {messages.map((message, index) => (
              <div key={index} className={`bubble ${message.role}`}>
                {message.content}
              </div>
            ))}
          </div>
          {error && <div className="error">{error}</div>}
          <div className="composer">
            <textarea
              rows={3}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  void send();
                }
              }}
              placeholder="Ask about a deal or request a draft..."
            />
            <button className="btn primary" onClick={() => void send()} disabled={busy}>
              {busy ? "..." : "Send"}
            </button>
          </div>
        </div>
      </aside>
    </>
  );
}
