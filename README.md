# Commas Pipeline

A self-hosted sales pipeline CRM for Luis Dewendt at Commas. It keeps deals on a board, reminds you when to follow up, and drafts texts with Grok or Grok Voice. Nothing is ever sent for you. The app opens WhatsApp or Messages so you can press send.

Deal value is always **Projected monthly GMV**, shown as pipeline GMV/mo in the top bar and on each column.

## What you need

- Node.js 20 or newer
- An xAI API key from [console.x.ai](https://console.x.ai) if you want Grok chat or Grok Voice 3.0. The board, list, and deal drawer work without a key.

## Setup

```bash
cp .env.example .env
# paste your key: XAI_API_KEY=...
npm install
npm run dev
```

Open the link it prints, usually [http://localhost:5173](http://localhost:5173).

Production:

```bash
npm run build
APP_PASSWORD=choose-a-password SESSION_SECRET=choose-a-long-secret npm start
```

That serves the built app and API from one Express server on `0.0.0.0` and `PORT` (3000 by default, or whatever the host sets). In production, `APP_PASSWORD` and `SESSION_SECRET` are required. The server sets a signed httpOnly cookie after login (`Secure` is added automatically on HTTPS).

Local `npm run dev` still skips login if `APP_PASSWORD` is unset.

Other commands:

```bash
npm run typecheck
npm test              # cadence logic, including business days and pinned dates
npm run reset-demo    # restore the six fictional demo deals
npm run reset-empty   # start with an empty pipeline
```

Keep `.env`, the app password, the session secret, and the API key private. Never share them or paste them into screenshots.

## Demo data

The first time the app starts, or whenever the data file is missing or empty, it seeds six obviously fictional deals (example.com emails and 555-01xx numbers), including one overdue follow-up and one approved account that has not started transacting.

Data is stored at `$DATA_DIR/crm.json`, or `./data/crm.json` if `DATA_DIR` is unset. To restore the demo deals, run `npm run reset-demo`.

## How follow-ups work

Reminders only. The app never sends messages.

Dates use **America/New_York** business days. A routine date that lands on a Saturday or Sunday moves to Monday. A date you set yourself is an agreed date and is not overwritten when you log a message, log a call, or change stage.

Default cadence is 3 business days, with these stage rules:

| Stage | Follow-up |
| --- | --- |
| New Lead | Same business day |
| Contacted | Every 3 business days |
| Meeting Set | Reminder 24 hours before the meeting date; **Mark no-show** creates a same-day outreach task |
| Discovery Completed / Qualified | Next business day |
| Onboarding / Documents Pending | Every 2 business days |
| Underwriting | Daily internal status check |
| Approved / Ready to Launch | Next business day after entering the stage, then every 2 business days until it is live |
| Live / Transacting | One check-in 3 business days after going live, then none |
| Lost / Disqualified | No automatic follow-up unless you set a re-engagement date |

Logging a message or call marks overdue and due-today tasks done and leaves exactly one next follow-up, unless an agreed future date is already set. New deals start with a "First outreach" task due today.

Approved and actually processing are separate. The top bar shows how many accounts are **Approved, not transacting**, and those cards show how many days they have been sitting there.

## Messaging

Each deal has a channel: WhatsApp by default, or iMessage/SMS.

- WhatsApp opens `https://wa.me/<digits>`
- iMessage/SMS opens `sms:+<number>`

Numbers that already include a country code are left alone. A 10-digit number is treated as US (+1). If a draft is chosen, it is copied to the clipboard before the chat opens. Browsers sometimes block app links, so an **Open chat** fallback stays visible.

## Grok and Grok Voice

Grok chat calls `grok-4.7` on the server with your key. Voice uses `grok-voice-3.0` over a local WebSocket relay at `/voice/ws`, so the browser never sees `XAI_API_KEY`.

Voice walks overdue deals first, can offer drafts on its own, and will not re-read a draft after you pick it. After you say a message was sent, it logs the message, tells you the next follow-up date, and moves on.

Drafts are written in Luis's voice: 2 to 4 short sentences, one reason for reaching out, one easy question. Em dashes are stripped before a draft is shown.

## Customize

Almost everything lives in `config/crm.config.ts`: app name, theme, stages, cadence, value labels, profile, chat model, and voice settings. Colors are applied as CSS variables from that file (`src/theme.css` holds the same defaults).

You can also ask in chat to change font, colors, stages, cadence, or the profile. Add new features one at a time.

## Later

These are written down on purpose and are not built yet:

- Gmail logging attached to each prospect
- Google Calendar and Calendly links
- CSV import/export for pipeline records
- Salesforce sync to reduce duplicate entry
- Charts showing projected monthly GMV, activated GMV, stage conversion, and stalled accounts
- WhatsApp conversation logging

## Hosting on Render

`render.yaml` describes a free Node web service. After you connect the repo (do not put secrets in git):

1. Set `APP_PASSWORD` in the Render dashboard (a password only you know).
2. Leave `SESSION_SECRET` as the generated value.
3. Optionally set `XAI_API_KEY` if you want Grok chat and Voice.
4. `NODE_ENV` is already set to `production`.

Render's free tier can spin down and may wipe the local disk on restart, so demo or deal data can reset. That is expected on a trial.

## Notes

This app now has a simple shared password so it can be put on a private Render URL. It is still a single password, not per-user logins. Treat the URL and password like access to your pipeline.
