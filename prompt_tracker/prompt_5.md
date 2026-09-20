You are working on our autonomous multi-channel SDR platform.

We have already implemented the Discovery Agent using DronaHQ. The Discovery Agent uses DronaHQ Web Search to find potential prospects from a campaign ICP. Discovery intentionally has a relatively low threshold: it finds plausible candidates based on one or more meaningful ICP signals. It does NOT perform final qualification.

Now implement the backend integration for the SECOND agent:

# SDR PROSPECT RESEARCH AGENT

The Research Agent is also a DronaHQ Agent. Do NOT implement the research reasoning/LLM logic inside FastAPI. FastAPI must orchestrate the agent, validate its output, persist results, and enforce authorization/policy.

## ARCHITECTURAL RESPONSIBILITY

Discovery Agent:
- Finds potential prospects.
- Uses DronaHQ Web Search.
- Produces candidate information and discovery signals.

Research Agent:
- Receives ONE discovered candidate.
- Researches that specific person and company using DronaHQ Web Search.
- Verifies identity, current role, company, and relevant company information.
- Gathers ICP-relevant evidence.
- Gathers useful business context.
- Gathers legitimate professional/personalization signals.
- Reports uncertainties and source URLs.
- Does NOT calculate the final ICP score.
- Does NOT decide whether outreach should happen.
- Does NOT contact the prospect.

ICP Fitment Agent will consume the Research Agent output later and calculate the final ICP fit score.

==================================================
1. FIRST INSPECT THE EXISTING CODEBASE
==================================================

Before modifying anything, inspect the existing project structure.

Identify:

- FastAPI application structure
- existing routers
- services
- models
- schemas
- database setup
- SQLAlchemy models
- Alembic migrations
- existing DronaHQ integration
- DronaHQ client/service created for the Discovery Agent
- campaign models
- campaign prospect models
- discovery models
- agent run / audit models
- authentication / RBAC
- PolicyEngine
- configuration/settings
- tests

DO NOT create duplicate abstractions if equivalent functionality already exists.

Reuse the existing DronaHQ client and patterns established for the Discovery Agent.

==================================================
2. DronaHQ INTEGRATION
==================================================

The Research Agent is executed by DronaHQ.

Do NOT call an LLM directly from FastAPI.

Do NOT use LangChain/LangGraph to replace DronaHQ.

FastAPI is the control plane and system of record.

Create/reuse a single DronaHQ integration boundary.

Prefer a structure similar to:

DronaHQClient
    invoke_agent(...)
    
DronaHQResearchService
    research_candidate(...)

If the existing DronaHQ client already supports generic agent invocation, extend it rather than creating a second HTTP client.

Use environment variables/configuration rather than hardcoding secrets.

Expected configuration should follow the existing Discovery integration pattern.

Add configuration for the Research Agent, for example:

DRONAHQ_RESEARCH_WEBHOOK_URL
DRONAHQ_RESEARCH_WEBHOOK_API_KEY
DRONAHQ_RESEARCH_AGENT_ID

Use the exact existing naming conventions if the project already has them.

NEVER commit API keys or secrets.

==================================================
3. INPUT CONTRACT
==================================================

The Research Agent must receive ONE discovered candidate.

The request sent from FastAPI to DronaHQ should contain at minimum:

{
  "campaign_id": "...",
  "campaign_name": "...",
  "icp": {...},
  "candidate": {
    "source": "...",
    "source_id": "...",
    "person_name": "...",
    "first_name": "...",
    "last_name": "...",
    "title": "...",
    "email": "...",
    "linkedin_url": "...",
    "company_name": "...",
    "company_domain": "...",
    "company_size": "...",
    "industry": "...",
    "source_url": "...",
    "discovery_signals": [...],
    "unverified_criteria": [...]
  }
}

Do not require fields that Discovery may legitimately leave unknown.

Discovery has a deliberately lower threshold, so missing information is expected.

==================================================
4. RESEARCH OUTPUT CONTRACT
==================================================

Create Pydantic schemas for the Research Agent result.

Expected logical structure:

ResearchResult:
- campaign_id
- candidate_status
- research_summary
- person_research
- company_research
- icp_evidence
- business_context
- personalization_signals
- sources
- uncertainties

candidate_status must be one of:

- verified
- partially_verified
- unverified

Because the current DronaHQ structured-output UI represents nested arrays as Array[String], the DronaHQ response may contain fields such as icp_evidence, business_context, personalization_signals, sources, and uncertainties as arrays of strings.

FastAPI must parse and validate these carefully.

Do NOT assume malformed JSON strings are valid research objects.

If the DronaHQ output contains JSON encoded inside strings, parse it safely and validate it.

Reject malformed structured output rather than silently accepting arbitrary text.

==================================================
5. ICP EVIDENCE MODEL
==================================================

Each ICP evidence item should logically represent:

- criterion
- status
- evidence
- source

Status must be one of:

MATCHED
UNMATCHED
UNVERIFIED

Do NOT calculate the final ICP score here.

The Research Agent only supplies evidence.

Example:

{
  "criterion": "Industry",
  "status": "MATCHED",
  "evidence": "Company describes its product as B2B SaaS.",
  "source": "https://..."
}

Another example:

{
  "criterion": "Company size",
  "status": "UNVERIFIED",
  "evidence": "No reliable current employee-count source was found.",
  "source": ""
}

==================================================
6. DATABASE PERSISTENCE
==================================================

Inspect the existing data model first.

If there is already a Prospect/CampaignProspect/AgentRun/Research model, extend it rather than duplicating it.

If a dedicated research record does not exist, introduce an appropriate model such as:

ProspectResearch

Fields should conceptually include:

- id
- campaign_id
- prospect_id or discovery_candidate_id
- status
- research_summary
- person_research
- company_research
- icp_evidence
- business_context
- personalization_signals
- sources
- uncertainties
- agent_run_id
- created_at
- updated_at

Use JSON/JSONB where appropriate for structured collections, depending on the existing PostgreSQL conventions.

Do NOT make research the authoritative campaign qualification decision.

==================================================
7. AGENT RUN TRACKING
==================================================

Reuse the existing AgentRun model if available.

Every Research Agent execution should record:

- campaign_id
- agent type = RESEARCH
- status
- started_at
- completed_at
- candidate/prospect identifier
- DronaHQ execution identifier if available
- tool/source = WEB_SEARCH
- error information if failed

Statuses should follow the existing project convention.

At minimum:

QUEUED
RUNNING
COMPLETED
FAILED

Do not create fake successful runs.

==================================================
8. API ENDPOINT
==================================================

Add an endpoint following the existing API conventions.

Suggested endpoint:

POST
/api/manager/campaigns/{campaign_id}/prospects/{prospect_id}/research

Request should optionally support:

{
  "force_refresh": false
}

The endpoint must:

1. Authenticate the user.
2. Verify manager authorization.
3. Verify the campaign exists.
4. Verify the prospect belongs to the campaign.
5. Verify the prospect has discovery information.
6. Check campaign state according to the existing policy rules.
7. Create an AgentRun.
8. Invoke the DronaHQ Research Agent.
9. Validate the response.
10. Persist the research result.
11. Mark AgentRun completed.
12. Return the research result.

Do not let a representative trigger research for arbitrary prospects unless existing RBAC explicitly permits it.

Reuse existing authorization dependencies.

==================================================
9. RESEARCH REFRESH
==================================================

If research already exists:

- return the existing research by default
- only invoke DronaHQ again when force_refresh=true

Do not accidentally create unlimited duplicate research records.

If the project supports research versioning, preserve previous results.

If it does not, at minimum update the existing research record and maintain an audit trail.

==================================================
10. POLICY / CAMPAIGN CONTROLS
==================================================

Research is read-only and does not contact prospects.

Therefore:

- campaign pause should prevent new research jobs if that is consistent with the existing PolicyEngine
- agent pause must prevent the Research Agent from executing
- global kill switch must prevent execution
- disabled Research Agent must not be invoked

Do NOT bypass PolicyEngine.

The LLM/DronaHQ agent must never be the final authority for authorization.

FastAPI/PolicyEngine remains authoritative.

==================================================
11. ERROR HANDLING
==================================================

Handle:

- DronaHQ unavailable
- webhook timeout
- invalid API key
- DronaHQ agent failure
- Web Search failure reported by DronaHQ
- malformed DronaHQ output
- empty research result
- candidate no longer verifiable
- campaign paused
- research agent paused
- global kill switch
- unauthorized manager
- prospect not belonging to campaign

Do not silently convert failures into successful research.

Return useful API errors according to existing project conventions.

AgentRun should be marked FAILED when appropriate.

==================================================
12. IDEMPOTENCY
==================================================

Do not create duplicate research jobs when the same request is accidentally submitted twice.

Use the existing job/idempotency patterns if available.

If no existing pattern exists, implement a simple safe mechanism around:

campaign_id + prospect_id + active research run

Only one active Research Agent run should exist for a prospect unless an explicit refresh mechanism is being used.

==================================================
13. DISCOVERY → RESEARCH FLOW
==================================================

The intended workflow is:

Discovery Agent
    ↓
Discovery Candidate
    ↓
Manager/system selects candidate
    ↓
CampaignProspect
    ↓
POST /research
    ↓
FastAPI PolicyEngine
    ↓
DronaHQ Research Agent
    ↓
Web Search
    ↓
ResearchResult
    ↓
FastAPI validation
    ↓
PostgreSQL
    ↓
ICP Fitment Agent later

Do NOT automatically send outreach after research.

Do NOT automatically qualify the candidate as an accepted lead.

==================================================
14. FRONTEND / MANAGER UI
==================================================

Inspect the existing manager campaign/prospect UI.

If a prospect detail page already exists, add research status and actions without redesigning the application.

Useful states:

Research not started
Research queued
Research running
Research completed
Research failed

Add a simple:

"Research Prospect"

action for a manager where appropriate.

After completion, display:

- Candidate status
- Research summary
- Person research
- Company research
- ICP evidence
- Business context
- Personalization signals
- Sources
- Uncertainties

Do not expose raw internal DronaHQ credentials or implementation details.

If there is already an Agent Activity UI, integrate Research Agent activity into it.

==================================================
15. TESTS
==================================================

Add tests following the project's existing test conventions.

At minimum test:

### Authorization

- manager can trigger research
- unauthorized role cannot trigger research
- prospect from another campaign cannot be researched

### DronaHQ invocation

- correct campaign context is sent
- correct candidate information is sent
- ICP is sent
- Research Agent webhook is invoked
- API key is not logged

### Output validation

- valid ResearchResult is accepted
- invalid candidate_status is rejected
- malformed research output is rejected
- malformed JSON inside array strings is rejected if parsing is required
- missing required fields are handled correctly

### Persistence

- successful research is persisted
- AgentRun is completed
- failed research creates FAILED AgentRun
- existing research is reused unless force_refresh=true

### Policy

- paused campaign blocks execution
- paused Research Agent blocks execution
- global kill switch blocks execution

### Failure handling

- DronaHQ timeout
- DronaHQ 4xx
- DronaHQ 5xx
- empty result
- invalid response

### Integration behavior

Mock the DronaHQ client.

Do NOT make tests depend on the real DronaHQ workspace or Web Search.

==================================================
16. DEMO / MOCK MODE

If the existing project has demo/mock providers, implement:

MockResearchProvider

with deterministic research data.

The production architecture must still use:

FastAPI → DronaHQ → Research Agent → Web Search

Mock mode is only for local tests/demo fallback.

Clearly distinguish mock data from real DronaHQ execution.

==================================================
17. OBSERVABILITY

Log:

- campaign_id
- prospect_id
- agent type
- AgentRun ID
- DronaHQ execution ID if available
- execution duration
- success/failure
- error category

NEVER log:

- API keys
- authorization headers
- secrets

Avoid logging unnecessary personal data.

==================================================
18. DOCUMENTATION

Update README/documentation with:

1. Research Agent purpose
2. DronaHQ setup
3. Required environment variables
4. Expected webhook input
5. Expected structured output
6. API endpoint
7. Local testing instructions
8. Mock mode
9. Failure handling

Do not invent undocumented DronaHQ API behavior.

Document the actual webhook mechanism already established for the Discovery Agent.

==================================================
19. IMPORTANT ARCHITECTURAL CONSTRAINTS

Do NOT:

- implement another LLM inside FastAPI
- replace DronaHQ with LangGraph
- make Research automatically send outreach
- calculate final ICP score
- bypass PolicyEngine
- bypass RBAC
- hardcode DronaHQ credentials
- make Apollo mandatory
- make Web Search calls directly from FastAPI
- duplicate the DronaHQ client
- create unnecessary microservices

Keep this as part of the existing modular monolith.

==================================================
20. DELIVERABLE

Implement the complete Research Agent backend vertical slice.

At the end, report:

1. Files created/modified
2. Database changes/migrations
3. New API endpoints
4. New schemas/models
5. DronaHQ integration changes
6. Tests added
7. Environment variables required
8. README changes
9. Any assumptions or blockers

Before coding, inspect the existing Discovery Agent implementation and reuse its patterns.

Do not rewrite working Discovery functionality.

Focus on a clean, production-like vertical slice rather than adding unnecessary abstractions.