# DronaHQ agent configuration

FastAPI is the policy and persistence boundary. DronaHQ agents receive context
and return structured proposals; they never deliver email or bypass approvals.

| Agent | Variables | Request | Expected response |
|---|---|---|---|
| Discovery | `DRONAHQ_DISCOVERY_WEBHOOK_URL`, `DRONAHQ_DISCOVERY_WEBHOOK_API_KEY` | `{"input":{"campaign_id","icp","requested_count"},"response_format":"json"}` | `result`/`data` with discovery candidates |
| Research | `DRONAHQ_RESEARCH_WEBHOOK_URL`, `DRONAHQ_RESEARCH_WEBHOOK_API_KEY` | `{"input":{"campaign_id","campaign_name","icp","candidate"},"response_format":"json"}` | `result`/`data` with `ResearchResult` fields |
| Outreach Strategy | `DRONAHQ_OUTREACH_STRATEGY_WEBHOOK_URL`, `DRONAHQ_OUTREACH_STRATEGY_WEBHOOK_API_KEY` | campaign, ICP, research, fitment, previous outreach, channels and policy | structured strategy proposal |
| Personalization | `DRONAHQ_PERSONALIZATION_WEBHOOK_URL`, `DRONAHQ_PERSONALIZATION_WEBHOOK_API_KEY` | campaign, prospect, research, fitment, strategy and knowledge | structured draft proposal |
| Conversation | `DRONAHQ_CONVERSATION_WEBHOOK_URL`, `DRONAHQ_CONVERSATION_WEBHOOK_API_KEY` | conversation history, latest reply, campaign and policy | intent and response proposal |
| Follow-up | `DRONAHQ_FOLLOWUP_WEBHOOK_URL`, `DRONAHQ_FOLLOWUP_WEBHOOK_API_KEY` | outreach/conversation history and suppression state | recommendation only |

All published-agent calls use the DronaHQ webhook header `api-key: <key>`, use
JSON bodies, have a 30 second default (`DRONAHQ_TIMEOUT_SECONDS`),
and fail the stage without exposing credentials. The health endpoint reports
only `CONFIGURED` or `NOT_CONFIGURED`.

The exact configured integration variables are in `.env.example`. Every agent
uses its named `*_WEBHOOK_URL` and `*_WEBHOOK_API_KEY`; URLs are deployment
values and keys are secrets. Configure only the stages enabled for a deployment.
Missing optional configuration is reported by `GET /health` and a
stage invocation fails closed with `AGENT_NOT_CONFIGURED`.

Managers can check a published agent without creating a campaign, sending
email, or mutating CRM state via `POST /api/manager/agents/{agent}/connection-test`
where `{agent}` is `discovery`, `research`, `outreach_strategy`,
`personalization`, `conversation`, or `followup`. It sends a static JSON test
payload and returns only connection status, response validity, and latency.

Demo Mode is campaign configuration, not an environment setting. Enable it with
`PATCH /api/manager/campaigns/{id}/demo-mode` and a valid recipient. Every
approved delivery then records the prospect email as `intended_recipient` and
the configured demo address as `actual_recipient`; approval and PolicyEngine
checks continue to apply.
