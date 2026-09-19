Implement the FIRST real DronaHQ-powered SDR agent: the DISCOVERY AGENT.

This is the first agent in our SDR system.

Do NOT implement the Research Agent yet.
Do NOT implement Outreach, Personalization, Conversation, or Follow-up yet.
Do NOT redesign the existing architecture or replace the existing stack.

The goal is to create one working vertical slice:

Manager creates/configures Campaign ICP
        ↓
FastAPI stores ICP
        ↓
DronaHQ Discovery Agent
        ↓
Apollo tool in DronaHQ
        ↓
Prospect candidates
        ↓
ICP Fitment / qualification
        ↓
Structured DiscoveryResult
        ↓
FastAPI persists prospects
        ↓
Manager sees prospect preview
        ↓
Manager approves selected prospects


==================================================
1. DronaHQ IS THE AGENT EXECUTION LAYER
==================================================

For this workflow, DronaHQ must be treated as the actual agentic execution layer.

Do NOT implement Discovery as a normal FastAPI function that simply calls Apollo.

The intended architecture is:

FastAPI
    ↓
triggers/invokes DronaHQ Discovery Agent
    ↓
DronaHQ Discovery Agent
    ↓
Apollo tool
    ↓
prospect candidates
    ↓
DronaHQ agent evaluates candidates against ICP
    ↓
structured output
    ↓
FastAPI


DronaHQ Discovery Agent should be responsible for:

- interpreting the campaign ICP
- determining Apollo search criteria
- calling Apollo
- evaluating returned candidates against the ICP
- identifying likely matches
- producing structured prospect candidates

FastAPI remains responsible for:

- authentication
- campaign state
- persistence
- RBAC
- conflict detection
- suppression/DNC
- audit logs
- policy enforcement
- exposing the results to the product frontend


==================================================
2. USE DronaHQ + Apollo
==================================================

DronaHQ provides a prebuilt Apollo tool/integration for agents.

Use the DronaHQ Apollo tool rather than implementing a separate Apollo integration in Python unless there is a specific backend requirement that DronaHQ cannot satisfy.

Reference the current DronaHQ agent/tool architecture documented here:

https://docs.dronahq.com/agents/getting-started/introduction/

https://docs.dronahq.com/agents/getting-started/tools-overview/

The DronaHQ Discovery Agent should have Apollo available as a tool.

Do not expose unnecessary tools to this agent.

Initially, the Discovery Agent should only need:

- Apollo
- FastAPI/backend tool or API for campaign context if necessary
- structured output capability


==================================================
3. DISCOVERY AGENT RESPONSIBILITY
==================================================

Create a DronaHQ agent conceptually named:

SDR Lead Discovery Agent

Purpose:

Find potential prospects that match a campaign's ICP using Apollo.

The agent receives:

- campaign_id
- ICP
- optional requested prospect count
- optional geographic restrictions
- optional role restrictions
- optional company criteria
- exclusion criteria

The agent should translate the ICP into Apollo search criteria.

Example ICP:

Industry:
B2B SaaS

Company size:
200–2000

Roles:
VP Engineering
CTO
Head of Engineering

Geography:
US

Then the agent should construct an appropriate Apollo search.

The agent should NOT simply search for the literal ICP description.


==================================================
4. DronaHQ AGENT INSTRUCTIONS
==================================================

Create/document the agent instruction set using DronaHQ's recommended structure:

ROLE & PURPOSE
TOOLS
KNOWLEDGE / CONTEXT
RULES & GUARDRAILS
OUTPUT FORMAT
EDGE CASES

The Discovery Agent's core instructions should enforce:

MUST:

1. Use the campaign ICP as the source of truth.
2. Use Apollo to discover prospects.
3. Prefer prospects matching multiple ICP criteria.
4. Return structured candidate data.
5. Explain why each prospect appears to match.
6. Preserve Apollo/source identifiers.
7. Return uncertainty explicitly.
8. Avoid inventing facts that were not returned by Apollo.

NEVER:

1. Invent a person.
2. Invent a company.
3. Invent a title.
4. Invent an Apollo ID.
5. Claim a prospect was found if Apollo did not return them.
6. Treat an uncertain match as a confirmed match.
7. Contact a prospect.
8. Send messages.
9. Modify campaign configuration.

The Discovery Agent ONLY discovers prospects.

It does NOT research them deeply.
It does NOT write outreach.
It does NOT send anything.


==================================================
5. STRUCTURED OUTPUT
==================================================

The DronaHQ Discovery Agent must return structured output.

Create a Pydantic model on the FastAPI side similar to:

class DiscoveryCandidate(BaseModel):
    source: str
    source_id: str
    person_name: str | None
    first_name: str | None
    last_name: str | None
    title: str | None
    email: str | None
    linkedin_url: str | None
    company_name: str | None
    company_domain: str | None
    company_size: int | None
    industry: str | None

    fit_score: float
    fit_reasons: list[str]

    matched_criteria: list[str]
    unmatched_criteria: list[str]

    confidence: Literal["HIGH", "MEDIUM", "LOW"]


Then:

class DiscoveryResult(BaseModel):
    campaign_id: str
    candidates: list[DiscoveryCandidate]
    total_found: int
    search_summary: str


Do not allow arbitrary unstructured text to be the primary output.


==================================================
6. FASTAPI ↔ DRONAHQ CONTRACT
==================================================

Create a clean integration boundary.

Do NOT scatter DronaHQ-specific HTTP calls throughout the codebase.

Create something similar to:

DronaHQClient
DronaHQDiscoveryService

For example:

class DronaHQClient:
    async def invoke_agent(...)

class DiscoveryService:
    async def discover_for_campaign(...)

The rest of FastAPI should call:

discovery_service.discover_for_campaign(campaign_id)

rather than directly calling DronaHQ.


==================================================
7. DISCOVERY ENDPOINT
==================================================

Implement:

POST /api/manager/campaigns/{campaign_id}/prospects/discover

Request:

{
    "requested_count": 25
}


The backend should:

1. Authenticate the manager.
2. Verify the campaign exists.
3. Verify campaign is in a state where discovery is allowed.
4. Load campaign ICP.
5. Invoke the DronaHQ Discovery Agent.
6. Validate the structured response using Pydantic.
7. Run backend-side validation.
8. Check suppression/DNC.
9. Check cross-campaign conflicts.
10. Persist valid candidates as prospects / discovery candidates.
11. Return the preview batch.


==================================================
8. IMPORTANT: DronaHQ SHOULD NOT OWN OUR DATABASE
==================================================

DronaHQ should perform the agentic discovery.

FastAPI/PostgreSQL remains the source of truth.

The flow should be:

Apollo
  ↓
DronaHQ Discovery Agent
  ↓
FastAPI
  ↓
PostgreSQL

Do NOT make DronaHQ the authoritative database for:

- campaigns
- prospects
- assignments
- approvals
- suppression
- agent state


==================================================
9. BACKEND VALIDATION
==================================================

Even though DronaHQ evaluates the ICP, FastAPI must validate the result.

For every candidate:

Check:

- valid source
- valid source ID
- required identity fields
- campaign conflict
- suppression/DNC
- duplicate prospect
- valid fit score range

If the candidate is already in another active campaign:

mark:

conflict = true

and return the conflicting campaign information.

Do NOT silently create duplicate campaign outreach.


==================================================
10. FIT SCORE
==================================================

The Discovery Agent may produce a fit score and reasons.

However, do not blindly trust arbitrary model output.

Validate:

0 <= fit_score <= 100

Also retain:

fit_reasons
matched_criteria
unmatched_criteria

The score should be explainable.

Example:

{
    "fit_score": 88,
    "fit_reasons": [
        "VP Engineering matches target role",
        "Company size is within ICP range",
        "Company industry matches B2B SaaS"
    ]
}


==================================================
11. DISCOVERY CANDIDATE VS PROSPECT
==================================================

Keep these concepts logically separate if the existing schema supports it.

Discovery candidate:

Apollo result that the manager has not approved yet.

Prospect:

Entity that exists in our system.

CampaignProspect:

Prospect explicitly selected/approved for this campaign.

Flow:

Apollo candidate
      ↓
Discovery Preview
      ↓
Manager selects
      ↓
CampaignProspect created


Do NOT automatically treat every Apollo result as an active campaign prospect.


==================================================
12. MANAGER PREVIEW
==================================================

The API should return data suitable for the Manager's prospect preview table.

Each row should contain:

Name
Title
Company
Fit Score
Fit Reasons
Source
Conflict Status
Suppression Status

Example:

John Smith
VP Engineering
Acme
88
"Title + company size + industry match"
Apollo
No conflict
Not suppressed


==================================================
13. DISCOVERY JOB STATE
==================================================

Discovery may take time.

Create a simple job/execution state if the existing architecture supports async execution.

States:

QUEUED
RUNNING
COMPLETED
FAILED

Expose:

GET /api/manager/campaigns/{campaign_id}/discovery/{run_id}

Return:

- run status
- candidate count
- started_at
- completed_at
- error
- DronaHQ execution ID if available


==================================================
14. AGENT RUN RECORD
==================================================

Every Discovery Agent execution must create an AgentRun.

Record:

- campaign_id
- agent_type = DISCOVERY
- execution status
- started_at
- completed_at
- DronaHQ execution ID
- tool used = APOLLO
- requested count
- candidate count
- error if any


If the DronaHQ platform exposes execution/tool traces, preserve the relevant identifiers/metadata.

Do not fabricate trace IDs.


==================================================
15. ERROR HANDLING
==================================================

Handle:

- DronaHQ unavailable
- Apollo unavailable
- Apollo authentication failure
- Apollo rate limit
- malformed agent output
- empty Apollo result
- invalid candidate
- timeout

Do not return HTTP 500 with an unexplained stack trace.

Return structured errors.

Example:

{
    "code": "DISCOVERY_PROVIDER_UNAVAILABLE",
    "message": "Lead discovery is temporarily unavailable."
}


==================================================
16. DEMO MODE
==================================================

Because this is a buildathon, support a safe development/demo mode.

If DronaHQ/Apollo credentials are unavailable locally:

allow a MockDiscoveryProvider.

BUT:

The production/demo architecture must still clearly show:

DronaHQ Discovery Agent
        ↓
Apollo

Do not replace the real DronaHQ integration with mock code and call the mock implementation complete.

Use dependency injection so:

DiscoveryProvider =
    DronaHQDiscoveryProvider
OR
    MockDiscoveryProvider


==================================================
17. DEMO DATA
==================================================

Seed one campaign with a meaningful ICP.

Example:

Campaign:
"US B2B SaaS Engineering Leaders"

ICP:

- US
- B2B SaaS
- 200–2000 employees
- VP Engineering
- CTO
- Head of Engineering

Discovery should produce realistic candidates through the configured Apollo/DronaHQ integration.

Include at least one candidate that:

- strongly matches
- partially matches
- conflicts with another campaign


==================================================
18. TESTS
==================================================

Test:

1. Manager can trigger discovery.
2. Representative cannot trigger manager discovery.
3. Campaign ICP is passed correctly to the discovery service.
4. DronaHQ client is called.
5. Apollo is represented as the discovery tool.
6. Structured DiscoveryResult validates correctly.
7. Invalid fit scores are rejected.
8. Duplicate prospects are detected.
9. Cross-campaign conflicts are detected.
10. Suppressed prospects are flagged/rejected.
11. DronaHQ failure is handled gracefully.
12. Empty discovery result is handled.
13. AgentRun is created.
14. Discovery candidates do not automatically become active CampaignProspects.
15. Mock provider can be used in tests.


==================================================
19. DronaHQ CONFIGURATION DOCUMENTATION
==================================================

Update README with a section:

## DronaHQ Discovery Agent Setup

Document the manual DronaHQ setup required.

Include:

1. Create DronaHQ Agent:
   SDR Lead Discovery Agent

2. Add Apollo as a DronaHQ Agent Tool.

3. Configure the Apollo account/credentials in DronaHQ.

4. Configure the agent instructions.

5. Configure the structured output expected by the backend.

6. Configure the endpoint/webhook/API mechanism used by FastAPI to invoke the agent.

7. Record the DronaHQ Agent identifier in backend configuration.

Use environment variables for backend configuration.

Example:

DRONAHQ_BASE_URL=
DRONAHQ_DISCOVERY_AGENT_ID=
DRONAHQ_API_KEY=

Do NOT commit credentials.


==================================================
20. IMPORTANT ARCHITECTURAL BOUNDARY
==================================================

The final architecture for this agent must be:

                FastAPI
                   │
                   │ campaign ICP
                   ▼
          DronaHQ Discovery Agent
                   │
                   │ tool call
                   ▼
                Apollo
                   │
                   │ candidates
                   ▼
          DronaHQ Discovery Agent
                   │
                   │ structured result
                   ▼
                FastAPI
                   │
          ┌────────┴─────────┐
          ▼                  ▼
      PostgreSQL           Neo4j
          │
          ▼
    Manager Preview


DronaHQ = agentic discovery execution
Apollo = lead discovery source/tool
FastAPI = backend authority
PostgreSQL = transactional source of truth
Neo4j = relationship/conflict intelligence


==================================================
21. ACCEPTANCE CRITERIA
==================================================

This task is complete when I can demonstrate:

1. Manager defines an ICP.
2. Manager clicks "Discover Prospects".
3. FastAPI invokes the DronaHQ Discovery Agent.
4. DronaHQ uses Apollo.
5. Apollo returns candidate prospects.
6. DronaHQ evaluates candidates against the ICP.
7. Structured candidates return to FastAPI.
8. FastAPI validates them.
9. Conflicts/suppression are identified.
10. Manager sees the preview.
11. Manager selects prospects.
12. Only selected prospects become CampaignProspects.
13. The Discovery Agent execution is recorded.
14. No outreach is sent.
15. No Research Agent is involved yet.

Do NOT implement Research yet.

The ONLY agent being implemented in this task is:

DISCOVERY AGENT.