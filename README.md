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
