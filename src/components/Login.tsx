import { useState, type FormEvent } from "react";
import { crmConfig } from "../../config/crm.config.ts";
import { api } from "../lib/api.ts";

type Props = {
  onLoggedIn: () => void;
};

export function Login({ onLoggedIn }: Props) {
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      await api.login(password);
      onLoggedIn();
    } catch {
      setError("That password is not correct.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="login-page">
      <form className="login-card" onSubmit={(e) => void submit(e)}>
        <h1>{crmConfig.appName}</h1>
        <p>Enter the app password to open your pipeline.</p>
        <label className="field">
          <span>Password</span>
          <input
            type="password"
            autoFocus
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </label>
        {error && <div className="error">{error}</div>}
        <button className="btn primary" type="submit" disabled={busy || !password}>
          {busy ? "Checking…" : "Log in"}
        </button>
      </form>
    </div>
  );
}
