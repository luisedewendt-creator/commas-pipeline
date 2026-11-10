import { useEffect, useState } from "react";
import { crmConfig } from "../../config/crm.config.ts";
import { messageUrl } from "../../shared/phone.ts";
import type { Channel, DealDetail } from "../../shared/types.ts";
import { api } from "../lib/api.ts";
import { formatDate, statusLabel } from "../lib/format.ts";

type Props = {
  dealId: string | "new";
  onClose: () => void;
  onChanged: () => Promise<void> | void;
};

const emptyForm = {
  name: "",
  company: "",
  stage: crmConfig.stages[0].id,
  value: "",
  contactName: "",
  phone: "",
  email: "",
  channel: crmConfig.defaultChannel as Channel,
  notes: "",
  meetingDate: "",
  reengagementDate: "",
};

export function DealDrawer({ dealId, onClose, onChanged }: Props) {
  const [deal, setDeal] = useState<DealDetail | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [error, setError] = useState("");
  const [note, setNote] = useState("");
  const [taskTitle, setTaskTitle] = useState("Follow up");
  const [taskDate, setTaskDate] = useState("");
  const [copied, setCopied] = useState(false);
  const [fallbackUrl, setFallbackUrl] = useState("");
  const isNew = dealId === "new";

  async function load() {
    if (isNew) {
      setDeal(null);
      setForm(emptyForm);
      return;
    }
    const next = await api.deal(dealId);
    setDeal(next);
    setForm({
      name: next.name,
      company: next.company,
      stage: next.stage,
      value: next.value == null ? "" : String(next.value),
      contactName: next.contactName,
      phone: next.phone,
      email: next.email,
      channel: next.channel,
      notes: next.notes,
      meetingDate: next.meetingDate ?? "",
      reengagementDate: next.reengagementDate ?? "",
    });
  }

  useEffect(() => {
    load().catch((err: Error) => setError(err.message));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dealId]);

  function update<K extends keyof typeof form>(key: K, value: (typeof form)[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  function payload() {
    return {
      name: form.name,
      company: form.company,
      stage: form.stage,
      value: form.value === "" ? null : Number(form.value),
      contactName: form.contactName,
      phone: form.phone,
      email: form.email,
      channel: form.channel,
      notes: form.notes,
      meetingDate: form.meetingDate || null,
      reengagementDate: form.reengagementDate || null,
    };
  }

  async function save() {
    setError("");
    try {
      if (isNew) {
        const created = await api.createDeal(payload());
        await onChanged();
        onClose();
        return created;
      }
      const updated = await api.updateDeal(dealId, payload());
      setDeal(updated);
      await onChanged();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Save failed");
    }
  }

  async function log(type: "message" | "call" | "note", body?: string) {
    if (isNew) return;
    const updated = await api.log(dealId, { type, body, channel: form.channel });
    setDeal(updated);
    setNote("");
    await onChanged();
  }

  async function openMessage(text?: string) {
    const url = messageUrl(form.phone, form.channel);
    if (!url) {
      setError("Add a phone number before opening a chat.");
      return;
    }
    if (text) {
      try {
        await navigator.clipboard.writeText(text);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      } catch {
        setError("Could not copy the draft. You can still open the chat and paste it yourself.");
      }
    }
    setFallbackUrl(url);
    window.open(url, "_blank", "noopener,noreferrer");
  }

  async function markNoShow() {
    const updated = await api.markNoShow(dealId);
    setDeal(updated);
    await onChanged();
  }

  async function addFollowUp() {
    if (!taskDate) {
      setError("Pick a follow-up date.");
      return;
    }
    const updated = await api.addTask(dealId, {
      title: taskTitle || "Follow up",
      dueDate: taskDate,
      pinned: true,
    });
    setDeal(updated);
    setTaskDate("");
    await onChanged();
  }

  async function completeTask(taskId: string) {
    const updated = await api.updateTask(dealId, taskId, { done: true });
    setDeal(updated);
    await onChanged();
  }

  async function remove() {
    if (!confirm(`Delete ${form.name || "this deal"}? This cannot be undone.`)) return;
    await api.deleteDeal(dealId);
    await onChanged();
    onClose();
  }

  return (
    <>
      <div className="drawer-backdrop" onClick={onClose} />
      <aside className="drawer">
        <header className="drawer-header">
          <div>
            <h2>{isNew ? "New deal" : form.name || "Deal"}</h2>
            {deal?.nextTask && (
              <p className="empty" style={{ padding: 0 }}>
                Next: {deal.nextTask.title} · {statusLabel(deal.status, deal.nextTask.dueDate)}
                {deal.nextTask.pinned ? " (agreed date)" : ""}
              </p>
            )}
          </div>
          <button className="btn ghost" onClick={onClose}>
            Close
          </button>
        </header>
        <div className="drawer-body">
          {error && <div className="error">{error}</div>}
          <div className="form-grid">
            <label className="field">
              <span>Deal name</span>
              <input value={form.name} onChange={(e) => update("name", e.target.value)} />
            </label>
            <label className="field">
              <span>Company</span>
              <input value={form.company} onChange={(e) => update("company", e.target.value)} />
            </label>
            <label className="field">
              <span>Contact name</span>
              <input value={form.contactName} onChange={(e) => update("contactName", e.target.value)} />
            </label>
            <label className="field">
              <span>Stage</span>
              <select value={form.stage} onChange={(e) => update("stage", e.target.value)}>
                {crmConfig.stages.map((stage) => (
                  <option key={stage.id} value={stage.id}>
                    {stage.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="field">
              <span>{crmConfig.valueField.label}</span>
              <input
                type="number"
                min="0"
                placeholder="Unset"
                value={form.value}
                onChange={(e) => update("value", e.target.value)}
              />
            </label>
            <label className="field">
              <span>Channel</span>
              <select
                value={form.channel}
                onChange={(e) => update("channel", e.target.value as Channel)}
              >
                <option value="whatsapp">WhatsApp</option>
                <option value="imessage">iMessage / SMS</option>
              </select>
            </label>
            <label className="field">
              <span>Phone</span>
              <input value={form.phone} onChange={(e) => update("phone", e.target.value)} placeholder="+44... or 555..." />
            </label>
            <label className="field">
              <span>Email</span>
              <input value={form.email} onChange={(e) => update("email", e.target.value)} />
            </label>
            <label className="field">
              <span>Meeting date</span>
              <input type="date" value={form.meetingDate} onChange={(e) => update("meetingDate", e.target.value)} />
            </label>
            <label className="field">
              <span>Re-engagement date</span>
              <input
                type="date"
                value={form.reengagementDate}
                onChange={(e) => update("reengagementDate", e.target.value)}
              />
            </label>
            <label className="field wide">
              <span>Notes</span>
              <textarea value={form.notes} onChange={(e) => update("notes", e.target.value)} />
            </label>
          </div>

          <div className="row-actions">
            <button className="btn primary" onClick={() => void save()}>
              {isNew ? "Create deal" : "Save"}
            </button>
            {!isNew && (
              <>
                <button className="btn" onClick={() => void openMessage()}>
                  Open message
                </button>
                <button className="btn" onClick={() => void log("message")}>
                  Log message sent
                </button>
                <button className="btn" onClick={() => void log("call")}>
                  Log call
                </button>
                {form.stage === "meeting" && (
                  <button className="btn" onClick={() => void markNoShow()}>
                    Mark no-show
                  </button>
                )}
                <button className="btn danger" onClick={() => void remove()}>
                  Delete
                </button>
              </>
            )}
          </div>
          <div className="notice">
            Nothing is sent for you. Open message opens WhatsApp or Messages so you can press send.
            {copied ? " Draft copied." : ""}
            {fallbackUrl && (
              <>
                {" "}
                <a href={fallbackUrl} target="_blank" rel="noreferrer">
                  Open chat
                </a>
              </>
            )}
          </div>

          {!isNew && (
            <>
              <section className="section">
                <h3>Log a note</h3>
                <div className="composer">
                  <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="What happened?" />
                  <button className="btn" onClick={() => void log("note", note)} disabled={!note.trim()}>
                    Add note
                  </button>
                </div>
              </section>

              <section className="section">
                <h3>Follow-ups</h3>
                {deal?.tasks.map((task) => (
                  <div key={task.id} className={`task ${task.done ? "done" : ""}`}>
                    <div>
                      <p>{task.title}</p>
                      <small>
                        {formatDate(task.dueDate)} {task.pinned ? "· agreed date" : ""}{" "}
                        {task.done ? "· done" : `· ${statusLabel(deal.status, deal.nextTask?.id === task.id ? task.dueDate : task.dueDate)}`}
                      </small>
                    </div>
                    {!task.done && (
                      <button className="btn" onClick={() => void completeTask(task.id)}>
                        Done
                      </button>
                    )}
                  </div>
                ))}
                <div className="composer">
                  <input value={taskTitle} onChange={(e) => setTaskTitle(e.target.value)} />
                  <input type="date" value={taskDate} onChange={(e) => setTaskDate(e.target.value)} />
                  <button className="btn" onClick={() => void addFollowUp()}>
                    + follow-up
                  </button>
                </div>
                <p className="notice">
                  A date you set here is an agreed date. Logging a message or changing stage will not overwrite it.
                </p>
              </section>

              <section className="section">
                <h3>Activity</h3>
                {deal?.activities.map((activity) => (
                  <div key={activity.id} className="activity">
                    <div>
                      <p>{activity.body}</p>
                      <small>
                        {activity.type}
                        {activity.channel ? ` · ${activity.channel}` : ""} ·{" "}
                        {new Date(activity.at).toLocaleString("en-US", { timeZone: crmConfig.cadence.timezone })}
                      </small>
                    </div>
                  </div>
                ))}
              </section>
            </>
          )}
        </div>
      </aside>
    </>
  );
}
