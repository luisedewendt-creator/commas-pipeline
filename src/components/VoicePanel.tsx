import { useEffect, useRef, useState } from "react";
import { messageUrl } from "../../shared/phone.ts";
import { api } from "../lib/api.ts";
import { VoiceClient, type VoiceDrafts } from "../lib/voice.ts";

type Props = {
  onClose: () => void;
  onChanged: () => Promise<void> | void;
  onOpenDeal: (id: string) => void;
};

export function VoicePanel({ onClose, onChanged, onOpenDeal }: Props) {
  const clientRef = useRef<VoiceClient | null>(null);
  const [status, setStatus] = useState("Idle");
  const [transcript, setTranscript] = useState("");
  const [error, setError] = useState("");
  const [drafts, setDrafts] = useState<VoiceDrafts | null>(null);
  const [fallbackUrl, setFallbackUrl] = useState("");

  useEffect(() => {
    return () => {
      clientRef.current?.disconnect();
    };
  }, []);

  async function connect() {
    setError("");
    setTranscript("");
    const client = new VoiceClient({
      onTranscript: (text) => setTranscript(text),
      onStatus: setStatus,
      onError: setError,
      onDrafts: setDrafts,
      onRefresh: onChanged,
      onFocusDeal: onOpenDeal,
    });
    clientRef.current = client;
    try {
      await client.connect();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not start voice");
    }
  }

  function disconnect() {
    clientRef.current?.disconnect();
    clientRef.current = null;
    setStatus("Disconnected");
  }

  async function useDraft(index: number, text: string) {
    if (!drafts) return;
    try {
      const deal = await api.deal(drafts.dealId);
      try {
        await navigator.clipboard.writeText(text);
      } catch {
        // ignore
      }
      const url = messageUrl(deal.phone, deal.channel);
      if (url) {
        setFallbackUrl(url);
        window.open(url, "_blank", "noopener,noreferrer");
      }
      clientRef.current?.pickDraft(index, deal.contactName || deal.name);
      onOpenDeal(deal.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not open chat");
    }
  }

  return (
    <>
      <div className="panel-backdrop" onClick={onClose} />
      <aside className="side-panel">
        <header className="panel-header">
          <h2>Grok Voice</h2>
          <button className="btn ghost" onClick={onClose}>
            Close
          </button>
        </header>
        <div className="panel-body">
          <p className="voice-status">{status}</p>
          <div className="row-actions">
            <button className="btn primary" onClick={() => void connect()}>
              Connect
            </button>
            <button className="btn" onClick={disconnect}>
              Disconnect
            </button>
          </div>
          <p className="notice">
            Voice talks through a local server relay so your API key never goes to the browser.
            Drafts appear here. After you pick one, the chat opens and you press send.
          </p>
          {error && <div className="error">{error}</div>}
          {transcript && <div className="bubble assistant">{transcript}</div>}
          {drafts && (
            <div className="drafts">
              {drafts.drafts.map((draft, index) => (
                <button key={index} className="draft" onClick={() => void useDraft(index, draft)}>
                  <strong>Option {index + 1}</strong>
                  <div>{draft}</div>
                </button>
              ))}
            </div>
          )}
          {fallbackUrl && (
            <a className="btn" href={fallbackUrl} target="_blank" rel="noreferrer">
              Open chat
            </a>
          )}
        </div>
      </aside>
    </>
  );
}
