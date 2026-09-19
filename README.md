# Autonomous SDR Platform

Policy-controlled, multi-channel SDR backend for the GTM AI Buildathon. PostgreSQL is the transactional source of truth; Neo4j is the relationship intelligence projection. Agents propose actions, but the deterministic policy engine authorizes them.

## Run directly with Uvicorn (recommended)

No Docker, PostgreSQL, or Neo4j installation is needed for local development. From the repository root:

```bash
python -m pip install -r requirements.txt
python -m uvicorn app.main:app --reload
```

The default configuration uses a local SQLite database (`sdr.db`) and mock/demo providers. It automatically seeds three live campaigns and synthetic prospects. API docs are at `http://localhost:8000/docs`.

For a direct non-container deployment, install the same requirements, set `DATABASE_URL` to a managed PostgreSQL `postgresql+asyncpg://...` URL, and run:

```bash
python -m uvicorn app.main:app --host 0.0.0.0 --port 8000
```

Neo4j remains optional: leave `NEO4J_URI` empty when relationship projection is not needed.

## Optional Docker deployment

Docker Compose is an optional convenience path for a full local PostgreSQL + Neo4j stack. Run `docker compose up --build`; its Compose configuration supplies the container-specific database settings. It is not required for development or deployment.

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

When those variables are unset, the backend uses deterministic `MockResearchProvider` data for local development and tests. Failed provider calls and malformed responses create a failed `RESEARCH` agent run; no credentials or authorization headers are logged.
