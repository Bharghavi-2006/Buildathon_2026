Implement ONE focused vertical slice next: the complete Manager Campaign Creation and Launch workflow.

Do NOT redesign the existing architecture.
Do NOT replace the existing stack.
Do NOT implement the Representative workflow yet.
Do NOT implement Monitoring yet.
Do NOT implement DronaHQ yet.

Use the existing backend models/services where possible and extend them only when necessary.

The goal is to make this entire Manager flow functional end-to-end:

Manager Dashboard
      ↓
Create Campaign
      ↓
Step 1: Identity
      ↓
Step 2: Targeting / ICP
      ↓
Step 3: Agents
      ↓
Step 4: Prospect Sourcing
      ↓
Step 5: Channels + Prompts
      ↓
Step 6: Representative Assignment
      ↓
Pre-launch Validation
      ↓
Activate Campaign


==================================================
1. MANAGER CAMPAIGN DASHBOARD
==================================================

Implement the backend APIs required for the Manager Dashboard.

Endpoints:

GET /api/manager/dashboard
GET /api/manager/campaigns
GET /api/manager/alerts

The dashboard should return:

- pending approvals
- replies needing attention
- meetings booked today
- active alerts
- all campaigns

Each campaign should expose:

- id
- name
- ICP summary
- status
- prospect count
- outreach sent
- meetings booked
- created_at
- updated_at

Campaign statuses must support:

DRAFT
LIVE
PAUSED
COMPLETED
ARCHIVED

Implement inline campaign controls:

POST /api/manager/campaigns/{campaign_id}/pause
POST /api/manager/campaigns/{campaign_id}/resume

These operations must go through the existing PolicyEngine/business rules and create an AuditLog entry.

Pausing one campaign must NOT affect other campaigns.


==================================================
2. CAMPAIGN CREATION
==================================================

Implement:

POST /api/manager/campaigns

A newly created campaign must start as:

DRAFT

The manager must be able to progressively configure the campaign.

Do not require every field at creation time because the wizard is sequential.


==================================================
3. STEP 1 — IDENTITY
==================================================

Support:

name
description
owner_id

Validation:

- name is required
- owner_id is required
- campaign must remain DRAFT while being configured

Endpoint:

PATCH /api/manager/campaigns/{campaign_id}/identity


==================================================
4. STEP 2 — TARGETING / ICP
==================================================

Implement structured campaign ICP configuration.

Support fields such as:

- geography
- target_roles
- industries
- company_size
- revenue_range
- funding_stage
- technologies
- exclusion_criteria
- reference_profiles
- custom_criteria

Do NOT hard-code ICP logic inside individual agents.

Store the ICP as campaign configuration so Discovery, Research and Qualification can consume the same source of truth.

Endpoint:

PATCH /api/manager/campaigns/{campaign_id}/icp

Also implement:

GET /api/manager/campaigns/{campaign_id}/icp


==================================================
5. STEP 3 — AGENTS
==================================================

Support campaign-level agent configuration.

Agents:

- ICP Fitment
- Research
- Outreach Strategy
- Personalization
- Conversation
- Follow-up
- Voice

Use the existing CampaignAgent model if available.

Each campaign-agent configuration should contain at least:

- agent type
- enabled
- responsibilities
- decision thresholds
- escalation rules
- prompt version reference if available

Endpoints:

GET /api/manager/campaigns/{campaign_id}/agents

PATCH /api/manager/campaigns/{campaign_id}/agents/{agent_id}

POST /api/manager/campaigns/{campaign_id}/agents/{agent_id}/pause

POST /api/manager/campaigns/{campaign_id}/agents/{agent_id}/resume

IMPORTANT:

Agent pause means that specific capability is skipped.

Do NOT make downstream agents assume that every other agent has executed.

For example, if Research is disabled:

research context should be represented as unavailable/null/skipped,
NOT fabricated by an LLM.

Record skipped agent execution explicitly, e.g.:

agent = RESEARCH
status = SKIPPED
reason = AGENT_DISABLED

Foundational context such as ICP and existing prospect/company information should still be usable by downstream agents.


==================================================
6. STEP 4 — PROSPECT SOURCING
==================================================

Support two modes:

AUTO_DISCOVER
SEED_LIST

Endpoints:

POST /api/manager/campaigns/{campaign_id}/prospects/discover

POST /api/manager/campaigns/{campaign_id}/prospects/import

GET /api/manager/campaigns/{campaign_id}/prospects/preview

POST /api/manager/campaigns/{campaign_id}/prospects/approve-batch


AUTO_DISCOVER:

Use the campaign ICP as the discovery criteria.

For now, if a real external discovery provider is not available, use the existing mock provider/interface.

Do NOT hard-code fake prospects directly into the API route.

The provider should return prospects through the existing discovery abstraction.


For every discovered prospect, calculate/return:

- fit_score: 0–100
- fit_reasons
- company
- role/title
- research status
- existing campaign conflicts
- suppression status


Example:

{
  "prospect_id": "...",
  "fit_score": 88,
  "fit_reasons": [
    "Target title matches",
    "Company size matches",
    "Industry matches"
  ],
  "conflicts": [],
  "suppressed": false
}


IMPORTANT:

Fit scoring should be deterministic/reproducible where possible.

Do not ask an LLM to invent a random score.


==================================================
7. CROSS-CAMPAIGN CONFLICTS
==================================================

Before approving a prospect into a campaign, check whether the prospect is already active elsewhere.

Example:

Prospect John
    ↓
Campaign A
Campaign B

Return conflict information such as:

- conflicting campaign
- current campaign status
- last contacted timestamp
- current representative if assigned
- current channel
- suppression status

If a prospect is already actively targeted elsewhere, flag it.

Do NOT silently duplicate outreach.

Use PostgreSQL as the transactional source of truth.

Use Neo4j where the existing architecture benefits from relationship queries, but do not move transactional campaign state into Neo4j.


==================================================
8. MANAGER APPROVES PROSPECT BATCH
==================================================

The manager should be able to review the preview batch and select which prospects should actually enter the campaign.

Endpoint:

POST /api/manager/campaigns/{campaign_id}/prospects/select

Payload should contain selected prospect IDs.

Validate each selected prospect:

- campaign is still DRAFT
- prospect is not suppressed
- prospect satisfies campaign qualification rules
- no blocking cross-campaign conflict
- prospect exists

Create the CampaignProspect relationship.

Do not automatically assign a representative yet.


==================================================
9. STEP 5 — CHANNELS
==================================================

Support campaign-level channels:

EMAIL
LINKEDIN
MESSAGE
VOICE

Implement:

GET /api/manager/campaigns/{campaign_id}/channels

PATCH /api/manager/campaigns/{campaign_id}/channels

Each channel should support:

- enabled
- daily_limit
- working_hours
- approval_required

Campaign channel state must be independent.

Example:

Campaign = LIVE
Email = PAUSED
LinkedIn = LIVE
Voice = LIVE

Pausing Email must not pause the campaign or other channels.


==================================================
10. STEP 5 — PROMPTS
==================================================

Implement campaign-level prompt configuration.

Support:

- campaign system prompt
- agent-specific prompts
- prompt version
- active version
- created_by
- created_at

Endpoints:

GET /api/manager/campaigns/{campaign_id}/prompts

POST /api/manager/campaigns/{campaign_id}/prompts

POST /api/manager/campaigns/{campaign_id}/prompts/{prompt_id}/activate


Every agent execution that uses a prompt must record the prompt version used.

Do not allow representatives to edit these prompts.


==================================================
11. STEP 6 — REPRESENTATIVE ASSIGNMENT PREPARATION
==================================================

For this task, do NOT implement the full representative matching workflow yet.

Instead, implement the campaign data/API boundary needed for the next task.

The campaign should be able to store:

- assigned representative IDs
- per-campaign daily send limit
- per-campaign working hours
- allowed representative channels
- maximum leads per representative

If the Representative/Assignment models already exist, reuse them.

If they do not exist, create the minimum schema necessary for the next implementation phase.

Do not build the matching algorithm yet.


==================================================
12. PRE-LAUNCH VALIDATION
==================================================

Implement a single endpoint:

GET /api/manager/campaigns/{campaign_id}/launch-check

Return structured validation results.

Example:

{
  "ready": false,
  "checks": [
    {
      "key": "identity",
      "label": "Campaign identity configured",
      "passed": true
    },
    {
      "key": "icp",
      "label": "ICP configured",
      "passed": true
    },
    {
      "key": "prospects",
      "label": "Prospects sourced and approved",
      "passed": true
    },
    {
      "key": "prompts",
      "label": "At least one prompt reviewed",
      "passed": true
    },
    {
      "key": "representative",
      "label": "Representative assigned",
      "passed": false
    }
  ]
}


Required launch checks:

1. Identity configured
2. ICP configured
3. At least one agent enabled
4. At least one prospect selected
5. At least one channel enabled
6. At least one prompt configured/reviewed
7. At least one representative assigned
8. No blocking suppression/conflict state
9. Campaign is currently DRAFT


==================================================
13. ACTIVATE CAMPAIGN
==================================================

Implement:

POST /api/manager/campaigns/{campaign_id}/activate

Activation MUST call the launch validation first.

If any required check fails:

- return a clear validation error
- do not activate the campaign

If all checks pass:

DRAFT → LIVE

Create an AuditLog entry.

After activation:

- campaign becomes visible to assigned representatives
- enabled agents can begin processing
- enabled channels can execute according to policy
- disabled agents remain disabled
- disabled channels remain disabled


==================================================
14. IMPORTANT POLICY RULE
==================================================

Campaign activation must NOT mean "start sending immediately without checks."

Every actual outbound action must still go through PolicyEngine.

PolicyEngine should independently verify:

- global kill switch
- campaign status
- campaign channel status
- agent status
- representative status
- representative channel availability
- working hours
- daily limits
- DNC/suppression
- contact-frequency rules
- cross-campaign conflicts


==================================================
15. AUDIT LOGGING
==================================================

Create audit records for:

- campaign created
- campaign updated
- ICP updated
- agent enabled/disabled
- channel enabled/disabled
- prompt created
- prompt activated
- prospect batch discovered
- prospect batch approved
- prospect selected
- campaign activated
- campaign paused
- campaign resumed


==================================================
16. TESTS
==================================================

Add tests for the complete workflow.

At minimum:

1. Manager can create campaign.
2. New campaign starts as DRAFT.
3. Identity validation works.
4. ICP can be saved.
5. Agents can be enabled/disabled.
6. Disabled Research is recorded as SKIPPED rather than fabricated.
7. Discovery uses campaign ICP.
8. Prospect fit scores are returned.
9. Cross-campaign conflicts are detected.
10. Suppressed prospects cannot be selected.
11. Channels can be independently configured.
12. Prompts can be versioned.
13. Launch validation correctly identifies missing configuration.
14. Campaign cannot activate if validation fails.
15. Campaign activates when all required checks pass.
16. Pausing one campaign does not affect another.
17. Audit logs are created for state changes.
18. All activation/state-changing endpoints enforce MANAGER RBAC.


==================================================
17. DEMO SEED DATA
==================================================

Make sure there is enough seed data to demonstrate this workflow.

Seed:

- at least 3 campaigns
- different ICPs
- different agent configurations
- different channel configurations
- prospects across campaigns
- at least one cross-campaign conflict
- at least one paused campaign
- at least one draft campaign ready to configure

The data should make the Manager Dashboard meaningful rather than empty.


==================================================
18. DELIVERABLE
==================================================

At the end of this task:

1. Run the backend tests.
2. Run the relevant lint/type checks if configured.
3. Run database migrations.
4. Verify the complete API flow manually or through integration tests.
5. Update README/API documentation with the new endpoints.
6. Summarize:
   - files changed
   - migrations added
   - endpoints added
   - tests added
   - anything intentionally deferred to the next task

Do NOT start implementing the Representative UI/workflow, Monitoring UI, or DronaHQ integration in this task.

The goal is one clean, fully working vertical slice:

Manager Dashboard
→ Campaign Creation
→ ICP
→ Agents
→ Prospect Sourcing
→ Channels
→ Prompts
→ Assignment Preparation
→ Launch Validation
→ Campaign Activation