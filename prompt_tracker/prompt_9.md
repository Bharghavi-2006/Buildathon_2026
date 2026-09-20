We now need to implement STAGE 2: New Campaign.

IMPORTANT:
- The existing Manager Dashboard is working and is loading real backend/database data.
- DO NOT rewrite, refactor, or destabilize the existing Dashboard, CampaignDetail, ProspectDetail, API client, authentication, layout, or working components unless a small integration change is genuinely required.
- Inspect the existing codebase FIRST.
- Reuse existing components, API clients, types, styling, routing, and backend endpoints wherever possible.
- Do NOT create a parallel campaign architecture.
- Do NOT hardcode campaign data into the frontend.
- Campaign creation/configuration must persist to the existing backend/database.
- Preserve the existing dark navy/purple B2B SDR visual language.
- Run frontend build/typecheck and backend tests after implementation.

==================================================
GOAL
==================================================

Build the complete Manager "New Campaign" flow.

This is a sequential wizard, NOT free-roaming tabs.

The manager should move through the campaign launch process in this order:

1. Identity
2. Targeting / ICP
3. Agents
4. Prospect Sourcing
5. Channels + Prompt Configuration
6. Assign Representatives
7. Pre-Launch Checklist + Activate

Each completed step unlocks the next step.

A manager should not be able to skip ahead to later steps before completing the required information for the current step.

The wizard should persist progress to the backend so that refreshing the page does not unnecessarily destroy campaign configuration.

Use the existing campaign backend/data model if it already supports these concepts. If fields are missing, extend the existing model/API cleanly rather than creating duplicate models.

==================================================
FIRST: INSPECT THE EXISTING IMPLEMENTATION
==================================================

Before writing code, inspect:

- Existing campaign SQLAlchemy models
- Campaign API routes
- Campaign creation endpoint
- Campaign update endpoints
- Campaign schemas/Pydantic models
- Existing campaign status representation
- Existing campaign agent configuration
- Existing campaign prospect/discovery endpoints
- Existing representative/team models and endpoints
- Existing PolicyEngine/auth/RBAC
- Existing frontend campaign API client
- Existing frontend types
- Existing router
- Existing shared UI components
- Existing dashboard navigation / New Campaign button

The previous implementation summary indicates that these backend endpoints already exist:

POST /api/manager/campaigns
PATCH /api/manager/campaigns/{id}/...
POST /api/manager/campaigns/{id}/prospects/discover
GET /team/representatives

Verify their exact paths and schemas in the actual code before using them.

Do not assume the summary is more authoritative than the code.

==================================================
CAMPAIGN CREATION MODEL
==================================================

Campaign creation should produce a real persisted campaign.

The initial campaign should begin in an appropriate draft state.

Do NOT mark the campaign LIVE merely because Step 1 was completed.

Campaign lifecycle should remain:

DRAFT → LIVE → PAUSED → COMPLETED/ARCHIVED

The campaign should only become LIVE when the manager clicks Activate on the final screen and all required pre-launch checks pass.

==================================================
WIZARD UX
==================================================

Create a dedicated route using the existing routing convention.

Preferred route:

/manager/campaigns/new

If the project already has a different manager route convention, follow that instead.

The page should contain:

- Page title: New Campaign
- Short description explaining that the manager will configure targeting, agents, sourcing, channels, and representatives before launch.
- Sequential progress indicator:
  Identity → Targeting → Agents → Prospect Sourcing → Channels → Representatives
- Current step visually highlighted.
- Completed steps visually marked.
- Locked future steps visibly disabled.
- Back button where appropriate.
- Continue / Save & Continue button.
- Preserve the existing application shell/sidebar/topbar.

Do not make this look like a generic multi-tab form.

It should feel like an operational campaign launch workflow.

==================================================
STEP 1 — IDENTITY
==================================================

Fields:

1. Campaign Name *
2. Description
3. Owner *

Campaign Name:
- required
- trim whitespace
- reject empty values
- sensible max length
- display validation inline

Description:
- optional
- multiline textarea

Owner:
- required
- use the existing manager/user identity system if available
- do not hardcode an owner list if the backend already exposes users/managers

"Next" must remain disabled until:
- campaign name is valid
- owner is selected

When the manager clicks Next:

- create the actual campaign using the existing backend campaign creation API
- persist:
  - name
  - description
  - owner
  - draft status
- receive the actual campaign ID
- store/use the campaign ID for subsequent steps
- navigate to Step 2

Do NOT create a frontend-only campaign object.

If the campaign has already been created and the manager returns to Step 1, update the existing draft instead of creating a duplicate campaign.

Show:
- loading state
- API error state
- successful persistence

==================================================
STEP 2 — TARGETING / ICP
==================================================

This step defines the campaign's structured ICP.

Fields should support:

- ICP description
- Target geography
- Target roles
- Target seniority if supported
- Target industries
- Company criteria
- Company size
- Business characteristics
- Technology requirements
- Exclusion criteria
- Sample/reference profiles

Important architectural rule:

The structured campaign ICP is the SOURCE OF TRUTH for:
- Discovery
- ICP Fitment
- campaign qualification logic

Do NOT replace structured ICP with a free-form knowledge-base document.

Campaign knowledge such as icp_definition.md may provide context later, but structured ICP must remain separately persisted.

Use appropriate controls:
- text inputs
- textareas
- multi-selects/chips
- numeric ranges where appropriate
- repeatable criteria where appropriate

Do not overcomplicate the UI if the existing backend schema is simpler.

Required completion condition:
- campaign must have a meaningful ICP/targeting configuration

On Continue:
- persist to backend
- update the existing draft campaign
- unlock Step 3

==================================================
STEP 3 — AGENTS
==================================================

Display the campaign agent checklist.

Agents:

- ICP Fitment
- Research
- Outreach Strategy
- Personalization
- Conversation
- Follow-up
- Voice

The manager should be able to enable/disable agents for THIS campaign.

For each agent show:

- name
- short responsibility description
- enabled/disabled state

Where the backend already supports agent configuration, persist:
- enabled agents
- campaign association
- configuration/policies if supported

Important:
ICP Fitment is currently implemented as a deterministic backend engine rather than another DronaHQ agent.

Therefore:
- Do not turn ICP Fitment into a DronaHQ agent.
- The UI may still show ICP Fitment as a campaign agent/capability.
- Persist its campaign enablement/configuration in the campaign configuration if the existing model supports it.
- Do not introduce LLM-based fitment logic here.

Voice should remain an optional campaign capability.

At least one relevant execution agent should be enabled before proceeding.

Do not hardcode agent state only in React.

==================================================
STEP 4 — PROSPECT SOURCING
==================================================

This is an important operational step.

Provide two sourcing modes:

A. Auto-discover
B. Upload seed list

------------------------------------------
A. AUTO-DISCOVER
------------------------------------------

Use the campaign ICP from Step 2.

The manager chooses Auto-discover.

Call the existing campaign prospect discovery backend endpoint:

POST /api/manager/campaigns/{campaign_id}/prospects/discover

Verify the exact request schema first.

The discovery system should use the campaign's targeting criteria.

The manager should be able to specify/request a batch size if supported.

The UI should then display a preview batch.

Each prospect preview should show:

- Organization
- Contact
- Title
- Geography
- Fit score (0–100)
- One-line fit explanation / "why"
- Discovery signals
- Conflict status if applicable
- Selection checkbox

Example presentation:

Fit 88
Matches target title + company size
+signal: recent funding

Do not fabricate fit scores in the frontend.

Use backend fitment results when available.

Remember:
- Discovery prioritizes recall.
- Research provides evidence.
- ICP Fitment performs deterministic qualification.

------------------------------------------
CONFLICT DETECTION
------------------------------------------

If a prospect is already active in another campaign:

Show an inline conflict tag immediately in this sourcing review.

Example:

CONFLICT
Active in: US SaaS Enterprise CTOs

The manager must see this BEFORE approving the prospect into the campaign funnel.

Do not silently duplicate the prospect.

Use the existing backend conflict/relationship model if available.

If conflict detection is not currently exposed by an endpoint, implement the smallest backend extension necessary using the existing campaign/prospect relationships.

Do not build an unrelated conflict subsystem.

------------------------------------------
B. UPLOAD SEED LIST
------------------------------------------

Provide an Upload Seed List option.

Support a reasonable CSV upload if the backend currently supports file/seed ingestion.

Expected columns can include:

- organization/company
- domain
- person name
- email
- title
- geography
- LinkedIn/profile URL

Do not assume every field is present.

Show:
- file name
- parsed row count
- validation errors
- preview
- duplicates/conflicts
- selectable rows

Do not contact anyone from uploaded data automatically.

------------------------------------------
BATCH REVIEW
------------------------------------------

The manager reviews the discovered/uploaded prospects.

Provide:
- fit score
- one-line reason
- conflict tags
- selection checkboxes
- select all / clear selection
- qualify/reject threshold control if supported

The manager can adjust the qualify/reject threshold.

Important:
Changing the threshold must NOT silently rewrite the underlying fit score.

It only changes which prospects are considered eligible for approval.

Provide:

Approve Batch

and

Reject / Remove selected

The manager should also be able to manually select exactly which prospects and how many prospects enter the campaign.

Example:

Selected: 8 / 20

The campaign should only proceed with the selected prospects.

Do not automatically enroll every discovered prospect.

Persist the approved prospect selection to the backend.

==================================================
STEP 5 — CHANNELS + PROMPT CONFIGURATION
==================================================

The channel options should be:

- LinkedIn
- Email
- Messages
- Call

Important:
The available/appropriate channels should ultimately be derived from the selected prospects and campaign configuration, rather than blindly assuming every channel is valid.

Show channel availability clearly.

For example:

Email
12 prospects available

LinkedIn
8 prospects available

Call
5 prospects available

Messages
6 prospects available

Use existing prospect/contact data to determine availability where possible.

Do not fabricate availability.

------------------------------------------
PROMPT CONFIGURATION
------------------------------------------

Prompt configuration belongs INSIDE this step.

Do not create another wizard step for prompts.

Provide:

Campaign System Prompt

and one editable prompt for each enabled agent.

Example:

Campaign System Prompt
[textarea]

Research Agent Prompt
[textarea]

Personalization Agent Prompt
[textarea]

Conversation Agent Prompt
[textarea]

Follow-up Agent Prompt
[textarea]

etc.

Only show agent-specific prompt editors for enabled agents.

Each prompt should support:

- editing
- save
- validation
- version association if the existing backend supports prompt/harness versions

Provide:

"Start from template"

This should allow the manager to populate a sensible existing template instead of starting from an empty textarea.

Do not overwrite an existing customized prompt without explicit manager action.

Prompt versions must remain auditable and associated with meaningful agent actions where the backend already supports this.

------------------------------------------
REP APPROVAL
------------------------------------------

Add:

Require rep approval before every send

Default:

ON

Persist this campaign-level policy.

Do not confuse this with manager campaign activation.

==================================================
STEP 6 — ASSIGN REPRESENTATIVES
==================================================

Use the existing Reps roster endpoint:

GET /team/representatives

Verify the actual schema first.

Display a table of recommended representatives.

Columns:

- Rep Name
- ICP Match
- Geography / Timing Fit
- Channel Fit
- Current Load
- Capacity
- Select

Example:

Aisha
ICP Match: 92%
Geography: Strong
Channels: Email, LinkedIn
Load: 35 / 50
Capacity: 70%

Current load must come from backend data.

Do not hardcode "35/50" or "70%".

------------------------------------------
CAPACITY
------------------------------------------

Show capacity visually.

Example:

35 / 50 units
70%

If assigning this campaign would push a representative beyond their configured capacity threshold:

show an inline warning.

Use a warning presentation consistent with the SDR roster's red capacity bar style.

IMPORTANT:

Capacity warnings are NOT hard blocks.

The manager can still assign the rep.

The system should communicate:

"Capacity threshold exceeded. Manager override required."

or an equivalent clear warning.

Do not prevent assignment unless an existing explicit backend policy requires it.

------------------------------------------
ASSIGNMENT CONFIGURATION
------------------------------------------

For each selected rep allow the manager to configure:

- per-campaign daily send limit
- working hours
- number of leads assigned to this rep for this campaign

If the existing backend has campaign-level limits versus rep-level limits, follow the existing data model rather than creating duplicate concepts.

The manager must be able to control how many campaign prospects are assigned to each selected rep.

Validate that total assigned leads are sensible relative to the selected prospect pool.

------------------------------------------
ROUTING
------------------------------------------

If multiple reps are selected, allow:

Round-robin

OR

Funnel-stage split

Persist the selected routing rule.

Do not implement complex routing logic unless the backend already supports it.

At minimum:
- persist the selected routing strategy
- expose it to the campaign configuration
- keep the implementation extensible

==================================================
FINAL SCREEN — PRE-LAUNCH CHECKLIST
==================================================

Before activation, show a clear operational checklist.

Checklist:

[✓] ICP defined
[✓] Batch sourced and approved
[✓] At least one prompt reviewed
[✓] At least one representative assigned

Also verify any other mandatory backend constraints.

Each item should link/navigate back to the relevant step where useful.

For incomplete items:

- show why it is incomplete
- provide a "Fix" action where appropriate

ACTIVATE CAMPAIGN must remain disabled until all mandatory checks pass.

When Activate is clicked:

1. Validate the complete campaign configuration again on the backend.
2. Do NOT rely solely on frontend validation.
3. Ensure required ICP exists.
4. Ensure approved prospects exist.
5. Ensure required prompt configuration exists.
6. Ensure at least one rep is assigned.
7. Ensure required campaign policies/configuration exist.
8. Change campaign status from DRAFT to LIVE.
9. Persist activation.
10. Navigate to Campaign Detail or the campaign list.
11. Show a success confirmation.

The backend should be authoritative for activation validation.

Do not allow a frontend-only status change to LIVE.

==================================================
ERROR / LOADING / RECOVERY STATES
==================================================

Every backend operation should have:

- loading state
- disabled action while submitting
- success handling
- meaningful error message
- retry option where appropriate

The wizard should not lose already persisted campaign configuration because one later API call fails.

If the manager refreshes after Step 4, previously saved configuration should be loaded from the backend where supported.

Avoid creating duplicate campaigns if a draft already exists.

==================================================
DATA INTEGRITY
==================================================

Do NOT duplicate entities unnecessarily.

Reuse existing:

- Campaign
- Prospect
- Organization
- Contact
- Representative
- Agent configuration
- Prompt/version
- Campaign assignment
- Fitment
- Conflict
- Policy

models where they exist.

If a schema extension is required, keep it additive and compatible with existing seed data.

Do not break the existing three seeded campaigns.

Do not alter their current states:

US SaaS Enterprise CTOs → LIVE
India BFSI Digital Leaders → PAUSED
AI Infrastructure Scale-up → LIVE

==================================================
DESIGN
==================================================

Match the existing dashboard visual language:

- dark navy / near-black background
- deep purple accent
- compact professional controls
- subtle borders
- status pills
- readable tables
- dense but not cluttered layout
- minimal decoration
- professional B2B sales operations product

Avoid:
- excessive gradients
- giant cards
- excessive whitespace
- generic SaaS landing-page styling
- AI-generated-looking decorative graphics

The wizard should feel like it belongs to the existing Manager Workspace.

==================================================
TESTING
==================================================

After implementation:

Frontend:
- npm run build
- TypeScript must have zero errors

Backend:
- run the existing pytest suite
- do not break existing tests

Test at minimum:

1. Cannot continue Step 1 without name.
2. Cannot continue Step 1 without owner.
3. Step 1 creates a real draft campaign.
4. Refreshing after Step 1 does not create duplicate campaign.
5. Step 2 persists ICP.
6. Step 3 persists enabled agents.
7. Auto-discovery uses the campaign's ICP.
8. Prospect preview displays backend fitment/conflict information.
9. Manager can manually select prospects.
10. Only selected prospects are approved.
11. Channel configuration persists.
12. Prompt configuration persists.
13. Rep assignment persists.
14. Capacity warning does not hard-block assignment.
15. Activation is disabled when checklist requirements are incomplete.
16. Backend rejects invalid activation even if frontend is bypassed.
17. Successful activation changes DRAFT → LIVE.
18. Existing Dashboard and seeded campaigns continue working.

==================================================
IMPORTANT SCOPE CONTROL
==================================================

Implement the New Campaign workflow only.

DO NOT implement the Knowledge Base in this task.

DO NOT implement the complete Rep Workspace.

DO NOT implement the complete Monitoring screen.

DO NOT redesign the Dashboard.

DO NOT replace DronaHQ.

DO NOT replace the deterministic ICP Fitment backend with an LLM.

DO NOT introduce hardcoded mock campaign data.

If something required by the wizard is missing from the backend, implement the minimum clean backend extension necessary for the wizard, but do not refactor unrelated systems.

At the end, provide a concise summary of:
- files changed
- backend changes
- frontend changes
- database/migration changes
- tests run
- build result
- anything that remains intentionally unimplemented