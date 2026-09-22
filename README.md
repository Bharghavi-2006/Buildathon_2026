# Autonomous SDR Platform

Policy-controlled, multi-channel SDR platform for the GTM AI Buildathon: a FastAPI backend (PostgreSQL as the transactional source of truth; Neo4j as an optional relationship-intelligence projection) plus a React/TypeScript manager and representative web workspace. Agents propose actions, but the deterministic policy engine authorizes them — nothing sends without passing through it.

**Live demo:** frontend on Vercel — `https://buildathon-2026-rs1w-zeta.vercel.app` · backend on Render — `https://autonomous-sdr-backend-r696.onrender.com`. Sign in with one of the demo identities below; there is no password, just an identity switcher in the top bar.

## Feature status

This is a buildathon build: some things are fully wired end to end, some are intentionally simplified, and a few are explicitly out of scope. Listed honestly below so it's clear what's demo-ready versus illustrative.

### Fully implemented

**Manager workspace**
- Dashboard — real campaign table (status, prospects, outreach sent, meetings booked, open conversations), pause/resume toggle, platform-wide alert banner (aging approvals, reps over capacity, suppression/DNC blocks, escalated hurdles), notification bell
- New Campaign wizard (all steps) — identity, ICP/targeting (incl. exclusion criteria and reference/sample profiles), agent checklist, prospect sourcing (discovery or import, fit scores + conflict/suppression tags, adjustable qualify/reject threshold), channels + prompts, representative assignment (match scoring, daily limits, working hours), pre-launch checklist and activation
- Campaign Detail — funnel overview, prospects table, team roster (who's working the campaign and which prospect they're each in talks with), open conversations with reply (works even while the campaign is paused), per-agent and per-channel status, sender-bot draft generation buttons
- Reps roster — capacity meter, skillset/bandwidth filters, per-rep active/paused agent types, assign-to-campaign, capacity alert banner
- Global Kill Switch — always accessible from the top bar; disables all outbound activity platform-wide, and the representative workspace reflects it immediately
- Settings — suppression/DNC list (add/remove), notification thresholds (aging + capacity), team & permissions (grant/revoke manager access), read-only guardrails and integration/agent status

**Representative workspace**
- My Queue header — pending approvals, active conversations, meetings booked, daily sending capacity in the same "units" language as the manager's capacity meter, and per-channel agent status (Email/LinkedIn/SMS/Voice — Live/Paused), scoped to the rep's own assigned campaigns
- Assigned campaigns bar — paused-by-manager state, an amber "still open, you can reply" tag when a paused campaign has live threads, and a conflict tag when a prospect is also active in another campaign
- Approval queue — fit score + one-line "why" on every item (the same data the manager saw during sourcing), a conflict badge, a collapsible context drawer (agent, prompt version, RAG context used), Approve / Edit & Approve / Reject-with-reason (reasons feed a fixed, structured vocabulary), batch approve
- Live conversations — full multi-channel message thread with reply, pause-aware (a paused campaign doesn't cut off an already-open conversation), meeting-intent status syncs live to both rep and manager
- AI Hurdles — escalation queue materialized from real backend signals (blocked outreach, failed agent runs, aging approvals — never fabricated), diagnostic context, resolve/escalate/attach-knowledge actions, and a recurring-pattern prompt ("this has come up N times this week — flag as a knowledge gap?")
- Guardrails — read-only, live projection of kill switch, capacity, working hours, channel availability and conflicts, computed from the same tables the policy engine authoritatively checks

**Sender bots & the agent pipeline**
- Manager-triggered "Generate Drafts" per channel (Email / LinkedIn / SMS) drafts outreach through the same DronaHQ agent pipeline the wizard uses, and queues each draft into the assigned rep's approval queue — nothing bypasses human approval
- Every agent call falls back to a clearly-labeled demo draft when no live DronaHQ webhook is configured (the expected state for this deployment), so the flow works end to end without external credentials
- Delivery is channel-aware: approving a draft resolves to the prospect's email, LinkedIn URL, or phone number depending on channel, and every send/block is written to an audit trail (`OutreachEvent`, `DeliveryRecord`)

**Deployment**
- Frontend on Vercel, backend on Render, with a normalized async-Postgres connection path for managed providers and a SQLite fallback for local dev

### Partially implemented

- **Rep Monitoring** (manager side) — the turnaround/response-rate/meetings-booked numbers are illustrative rather than computed from a real analytics pipeline; the rep status states (Active/Warn/Standby/Critical), aging-queue banner with jump-to-rep, and Adjust Limits modal are real
- **Reject reasons as a "Coach" signal** — rejections already write to a fixed, structured reason vocabulary (not free text), which is the data a coaching/edit-rate feature would read — but there is no Coach Dashboard or trend-line UI surfacing it
- **Knowledge-gap flagging** — the rep-side flag action and the count-this-week query are real and persisted; there is no manager-facing surface that reads the flags back yet
- **Settings' integration/model configuration** — LLM provider, DronaHQ agent status, and demo mode are surfaced read-only; they're environment-variable-driven and not editable from the UI, since a fake editable form wouldn't actually take effect

### Not implemented (explicitly out of scope)

- Full representative offboarding pipeline (leave request → manager approval → auto-reassignment by capacity/expertise → completion)
- "Autonomous Rebalance Mode" (automatic load redistribution across reps)
- Native LinkedIn, SMS, and voice transports — these channels remain policy-governed simulated delivery records; approved drafts can additionally be sent to the configured demo inbox through SMTP when SMTP credentials are supplied
- Background/scheduled automation — there is no job scheduler; draft generation and all agent pipeline stages are triggered synchronously by a manager or rep action, never run autonomously on a timer

## Run directly with Uvicorn (recommended)

No Docker, PostgreSQL, or Neo4j installation is needed for local development. From the repository root:

```bash
python -m pip install -r requirements.txt
python -m uvicorn app.main:app --reload
```

The default configuration uses a local SQLite database (`sdr.db`) and demo providers. Every agent stage runs locally in demo mode, and outgoing delivery remains guarded by the per-campaign demo recipient. It automatically seeds three live campaigns and synthetic prospects. API docs are at `http://localhost:8000/docs`.

For a direct non-container deployment, install the same requirements, set `DATABASE_URL` to a managed PostgreSQL `postgresql+asyncpg://...` URL, and run:

```bash
python -m uvicorn app.main:app --host 0.0.0.0 --port 8000
```

Neo4j remains optional: leave `NEO4J_URI` empty when relationship projection is not needed.

## PostgreSQL / AWS RDS deployment

PostgreSQL is the production source of truth. The application accepts one async SQLAlchemy URL through `DATABASE_URL`; it does not contain RDS credentials in source code. Apply migrations before starting a PostgreSQL-backed API:

```bash
# Set this in your shell, deployment secret store, or generated environment file.
# For IAM auth, generate the short-lived token outside the app and URL-encode it.
$env:DATABASE_URL='postgresql+asyncpg://<db-user>:<password-or-iam-token>@<rds-host>:5432/<database>?ssl=require'
python -m alembic upgrade head
python scripts/import_sqlite_to_postgres.py --source sdr.db
python -m uvicorn app.main:app --host 0.0.0.0 --port 8000
```

The importer is ID-preserving and copies every application table in foreign-key order. It refuses a non-empty target unless `--replace` is supplied. Do not use `--replace` against a database that contains production data. SQLite remains the default local workflow; PostgreSQL startup intentionally fails with a clear message until Alembic has created its schema.

For AWS IAM DB authentication, use a runtime process with AWS credentials authorized for `rds-db:connect`, generate the token immediately before migrations or startup, and keep it out of source control:

```powershell
$env:RDS_HOST = 'database-1.cluster-cryqucg2c15b.ap-south-1.rds.amazonaws.com'
$token = aws rds generate-db-auth-token --hostname $env:RDS_HOST --port 5432 --region ap-south-1 --username postgres
$encodedToken = [uri]::EscapeDataString($token)
$env:DATABASE_URL = "postgresql+asyncpg://postgres:$encodedToken@$env:RDS_HOST`:5432/postgres?ssl=require"
python -m alembic upgrade head
python scripts/import_sqlite_to_postgres.py --source .\sdr.db
python -m alembic current
python -m uvicorn app.main:app --host 0.0.0.0 --port 8000
```

IAM tokens expire after 15 minutes. Generate a new URL/token before a process needs to open new database connections, or have your deployment platform refresh it; the application intentionally does not generate or store AWS credentials. Verify the imported data with `python -m alembic current`, `GET /health`, and `GET /api/manager/dashboard` using the manager demo identity header.

## Optional Docker deployment

Docker Compose is an optional convenience path for a full local PostgreSQL + Neo4j stack. Run `docker compose up --build`; its Compose configuration supplies the container-specific database settings. It is not required for development or deployment.

## Frontend (manager & representative web app)

The `frontend/` directory is a React + TypeScript + Vite app with two workspaces (manager and representative) served from one router, backed entirely by the API above.

```bash
cd frontend
npm install
npm run dev
```

By default it proxies API calls to `http://localhost:8000` for local dev (see `vite.config.ts`). To point it at a deployed backend, set `VITE_API_BASE_URL` (see `frontend/.env.example`) — this is a Vite build-time variable, so it must be set before `npm run build` runs, not just at deploy time. `frontend/vercel.json` configures the SPA rewrite needed for client-side routing on Vercel.

There is no login form — identity is a demo header (`X-User-Email`, see Demo RBAC below) set by an account switcher in the top bar. Pick `manager@demo.local`, `aisha@demo.local`, or `vikram@demo.local` to see the corresponding workspace.

## Five-minute demo

1. `GET /campaigns` and select a live campaign ID.
2. `POST /campaigns/{id}/research`, then `/qualify`, then `/outreach`.
3. Inspect `GET /agents/runs` and campaign analytics.
4. Pause that campaign with `POST /campaigns/{id}/pause`; a different live campaign remains runnable.
5. Trigger `POST /control/kill-switch` and show all later outreach is blocked.
6. Submit a reply to `POST /webhooks/inbound-message` to demonstrate conversation classification.

Run tests with `python -m pytest -q`. The design, DronaHQ wiring, and intentionally mocked providers are described in `docs/`.

## Demo RBAC

All manager control endpoints require `X-User-Email: manager@demo.local`. Representative workspaces require `X-User-Email: aisha@demo.local` or `vikram@demo.local`; use `/me/campaigns`, `/me/leads`, `/me/approvals`, `/me/follow-ups`, and `/me/performance`. Managers use `/team/representatives`, campaign representative recommendations, campaign/lead assignment routes, `/approvals`, and `/monitoring/representatives`. The header is a demo authentication boundary; replace it with an OIDC/JWT identity adapter for production without changing role checks or assignment scope.

## Manager campaign launch API

The campaign creation vertical slice is available at `/api/manager`: dashboard, draft creation, identity/ICP, agents, deterministic prospect discovery/import/preview/selection, channels, prompts, launch check, activation, and lifecycle actions. Configure a draft, call `GET /api/manager/campaigns/{id}/launch-check`, then call `/activate` only when `ready` is true. All endpoints require the manager demo identity header.

## DronaHQ Discovery Agent Setup

Create and publish a DronaHQ agent named **SDR Lead Discovery Agent**. Add only the Apollo DronaHQ tool and connect its Apollo account. Configure the agent to accept `campaign_id`, `icp`, and `requested_count`, use Apollo to translate the ICP into search criteria, and return JSON matching `DiscoveryResult` in `app.schemas`.

Use instructions structured as: **Role & Purpose** (discover candidates only), **Tools** (Apollo only), **Knowledge / Context** (the supplied ICP), **Rules & Guardrails** (never invent people, companies, titles, IDs, or Apollo results; do not contact prospects or mutate campaigns), **Output Format** (structured candidates), and **Edge Cases** (return an empty candidate list and uncertainty rather than guesses). Each candidate must retain `source: "APOLLO"`, its Apollo `source_id`, explainable fit criteria, and a `HIGH`, `MEDIUM`, or `LOW` confidence.

Set these environment variables outside source control:

```text
DRONAHQ_BASE_URL=https://<your-tenant>
DRONAHQ_DISCOVERY_AGENT_ID=<published-agent-id>
DRONAHQ_API_KEY=<api-key>
# Optional: use your tenant's published-agent API path.
DRONAHQ_DISCOVERY_INVOKE_PATH=/api/agents/{agent_id}/invoke
```

The backend posts campaign ICP to that published-agent endpoint and expects a JSON object (or `data`/`result` wrapper) matching `DiscoveryResult`. DronaHQ remains the agentic Apollo execution layer; FastAPI validates candidates, records the `DISCOVERY` agent run, handles conflicts/suppression, and owns all database writes. With no DronaHQ configuration, development uses a contract-compatible mock provider only.

## DronaHQ Prospect Research Agent

The Research Agent receives one manager-selected discovery prospect and uses **DronaHQ Web Search** to verify the person/company and collect cited ICP evidence. It does not qualify a prospect, calculate a final fit score, contact anyone, or send outreach. Trigger it with `POST /api/manager/campaigns/{campaign_id}/prospects/{prospect_id}/research`; pass `{"force_refresh": true}` only when replacing an existing research record.

Create a separate DronaHQ agent configured with Web Search only. Its webhook receives `campaign_id`, `campaign_name`, campaign `icp`, and a candidate object containing discovery identifiers and any known person/company fields. It must return structured `ResearchResult` JSON: `candidate_status` (`verified`, `partially_verified`, or `unverified`), summary, person/company objects, ICP evidence items (`criterion`, `status`, `evidence`, `source`), business context, personalization signals, source URLs, and uncertainties. Array fields may be JSON-encoded strings only when they decode to arrays; malformed output is rejected.

Configure the following outside source control:

```text
DRONAHQ_RESEARCH_WEBHOOK_URL=https://<published-research-webhook>
DRONAHQ_RESEARCH_WEBHOOK_API_KEY=<webhook-key>
DRONAHQ_RESEARCH_AGENT_ID=<research-agent-id>
```

When demo mode is enabled (the default), the backend uses deterministic local providers and never calls DronaHQ. With `DEMO_MODE=false`, Discovery and Research call DronaHQ first. If an agent call, timeout, or response validation fails, they fall back to a conservative public DuckDuckGo HTML search scraper. Scraper leads are marked `WEB_SCRAPER`/low-confidence and research results explicitly remain unverified. If both providers fail, the original DronaHQ failure is returned and the run is marked failed; no credentials or authorization headers are logged.

## Deterministic ICP Fitment

`POST /api/manager/campaigns/{campaign_id}/prospects/{prospect_id}/fitment` evaluates persisted research with `icp-fitment-v1`; it never calls DronaHQ, an LLM, or web search. DronaHQ owns discovery/research, while FastAPI owns persistence, policy, and repeatable evaluation.

Each configured industry, geography, company-size, target-role, and exclusion criterion is `MATCHED`, `UNMATCHED`, or `UNVERIFIED`. Scores use equal weights: matched = 1, unverified = 0.5, unmatched = 0, multiplied by 100. Exclusions and explicit role mismatches are disqualifying regardless of score. The result includes organization/contact/overall scores, evidence, risks, uncertainties, recommended next stage, and engine version. Repeated calls reuse the current result unless `{"force_refresh": true}` is supplied.
