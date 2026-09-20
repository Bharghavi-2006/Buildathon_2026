You are building the frontend for an autonomous multi-channel SDR platform.

IMPORTANT CONTEXT:

There is currently NO working frontend.

A previous Figma/Builder generated frontend attempt did not work and should NOT be used as the implementation.

You need to build the frontend from scratch.

The backend already exists and contains substantial functionality. The backend is the source of truth.

Before writing frontend code, inspect the existing backend thoroughly and understand its actual API contracts.

DO NOT invent backend endpoints.

DO NOT rewrite backend functionality unless absolutely necessary for a frontend integration blocker.

DO NOT create mock backend behavior for functionality that already exists.

============================================================
PRODUCT
============================================================

This is an autonomous multi-channel SDR system.

The product has two roles:

1. MANAGER
2. REPRESENTATIVE / SDR

The manager configures campaigns, agents, ICPs, channels, representatives and policies.

The representative works on assigned campaigns, approvals and conversations.

The backend is FastAPI.

The AI execution layer is DronaHQ.

The database/persistence layer already exists.

The frontend must communicate ONLY with the FastAPI backend.

The frontend must NEVER directly call DronaHQ.

Architecture:

Frontend
   ↓
FastAPI
   ↓
PostgreSQL / other backend services
   ↓
DronaHQ agents where required

============================================================
REFERENCE UI
============================================================

Use the provided reference screenshots as the visual direction.

The desired visual language is:

- dark navy / near-black background
- deep purple accent
- subtle purple borders
- compact left sidebar
- rounded cards
- dense information-rich tables
- small status badges
- purple primary actions
- restrained typography
- minimal decoration
- professional B2B SaaS / sales operations feel
- high information density
- no excessive gradients
- no giant hero sections
- no unnecessary illustrations
- no generic landing-page design

The screenshots show the intended manager dashboard / reps visual style.

Do NOT copy fake names, metrics or data from the screenshots.

Use the screenshots only as visual/reference design.

============================================================
DESIGN PRINCIPLE
============================================================

This should feel like ONE operational SDR platform.

Manager:
configure + supervise + control

Representative:
execute + approve + converse

Both roles must see consistent underlying concepts:

- campaigns
- prospects
- ICP
- fit scores
- agent state
- channels
- capacity
- approvals
- conversations
- campaign pause state
- global kill switch

Do not create two disconnected products.

============================================================
STEP 0 — BACKEND AUDIT FIRST
============================================================

Before building the frontend, inspect the backend repository.

Identify:

1. FastAPI entry point
2. API routers
3. authentication
4. authorization / RBAC
5. campaign APIs
6. campaign models
7. campaign state APIs
8. prospect APIs
9. discovery APIs
10. research APIs
11. ICP fitment APIs
12. agent run APIs
13. approval APIs
14. conversation APIs
15. representative APIs
16. monitoring APIs
17. policy engine
18. campaign pause/resume
19. agent pause
20. channel pause
21. global kill switch
22. daily limits
23. working hours
24. conflict detection
25. prompt/harness versions
26. RAG functionality
27. database models relevant to the frontend

For every usable endpoint record:

METHOD
PATH
REQUEST
RESPONSE
AUTH REQUIREMENTS
CURRENT STATUS

Use the ACTUAL backend implementation.

Do not assume endpoint names.

============================================================
STEP 1 — FRONTEND TECHNOLOGY
============================================================

After inspecting the repository, choose a frontend stack compatible with the existing project.

Prefer:

React + TypeScript + Vite

unless an existing frontend framework already exists in the repository.

Use:

- TypeScript
- React
- React Router if routing is required
- TanStack Query if a data-fetching layer does not already exist
- a lightweight component system
- CSS/Tailwind only if compatible with the repository

Do not introduce unnecessary libraries.

Keep the application easy to deploy.

============================================================
STEP 2 — FRONTEND ARCHITECTURE
============================================================

Create a clean structure similar to:

src/

  api/
    client.ts
    auth.ts
    campaigns.ts
    prospects.ts
    discovery.ts
    research.ts
    fitment.ts
    agents.ts
    approvals.ts
    conversations.ts
    reps.ts
    monitoring.ts
    settings.ts

  components/
    layout/
    ui/
    tables/
    charts/
    status/
    campaign/
    prospect/
    approval/
    conversation/
    reps/

  pages/
    manager/
      Dashboard.tsx
      CampaignDetail.tsx
      NewCampaign.tsx
      Reps.tsx
      RepDetail.tsx
      Monitoring.tsx
      Settings.tsx

    rep/
      MyQueue.tsx
      ApprovalQueue.tsx
      Conversations.tsx
      Escalations.tsx

  hooks/

  types/

  utils/

  router/

Adapt this structure to the existing project where appropriate.

============================================================
STEP 3 — CENTRAL API CLIENT
============================================================

Create ONE centralized API client.

The backend URL must come from an environment variable.

For example:

VITE_API_BASE_URL

Do not hardcode localhost in individual components.

Centralize:

- base URL
- authentication
- headers
- JSON parsing
- error handling
- API errors
- timeout behavior where appropriate

All API calls must use this client.

Do not call fetch/axios directly from UI components if the project has a centralized API layer.

============================================================
STEP 4 — AUTHENTICATION
============================================================

Inspect the backend authentication system.

Implement the frontend login flow using the actual backend authentication mechanism.

Do not invent a frontend-only login.

After authentication:

- determine the user's role
- route manager → Manager Dashboard
- route representative → My Queue

Protect routes based on role.

A representative must NOT see manager pages.

A manager must have access to manager controls.

============================================================
MANAGER EXPERIENCE
============================================================

Build the manager experience first.

The manager sidebar should contain:

Dashboard
Reps
Monitoring
Settings

The campaign itself is accessed from Dashboard / Campaign Detail.

Top-right:

Notification bell
Profile
Global Kill Switch

The Global Kill Switch should always be visible.

============================================================
MANAGER STAGE 1 — DASHBOARD
============================================================

Build the dashboard based on the reference screenshots.

Top:

- Pending Approvals
- Replies Needing Attention
- Meetings Booked Today
- Active Alerts

If the backend exposes additional useful metrics, use them.

Below:

GLOBAL ALERT / WARNING BANNER

Examples:

- aging approvals
- rep capacity warnings
- DNC/suppression issues
- escalations

Do not fabricate alerts.

Only show alerts supported by backend data.

============================================================
CAMPAIGN TABLE
============================================================

The dashboard should contain one table containing all campaigns.

Columns:

Campaign Name
ICP
Status
Prospects
Outreach Sent
Meetings Booked
Agents / activity if space permits
Pause/Resume

Campaign status:

Draft
Live
Paused
Completed
Archived

Each row has an inline Pause/Resume control.

IMPORTANT:

Clicking the toggle must NOT open Campaign Detail.

Clicking elsewhere on the row opens Campaign Detail.

A paused campaign should show:

Paused
+ open conversation count if available

Example:

Paused · 2 open

Do not hardcode the count.

============================================================
MANAGER STAGE 2 — CAMPAIGN DETAIL
============================================================

Create a detailed campaign workspace.

Header:

Campaign name
Status
ICP summary
Owner / reps
Pause/Resume
Campaign controls

Main sections/tabs:

Overview
Prospects
Agent Activity
Open Conversations
Prompts / Configuration

Overview should show:

- funnel
- discovered
- researched
- ICP fit
- outreach ready
- contacted
- replied
- meeting booked

Use real backend values.

============================================================
PROSPECT TABLE
============================================================

Show:

Organization
Contact
Title
Fit Score
Discovery
Research
ICP Fit
Current Stage
Assigned Rep
Conflict
Status

Clicking a prospect opens Prospect Detail.

============================================================
PROSPECT DETAIL
============================================================

Create a useful prospect workspace.

Show:

Organization information

Contact information

Discovery evidence

Research

ICP evidence

Deterministic fitment

Personalization signals

Business context

Sources

Uncertainties

Agent execution history

Current funnel stage

Assigned representative

Conflict information

============================================================
RESEARCH UI
============================================================

The research UI must connect to the existing backend Research functionality.

Show:

Research status

Organization research

Contact research

ICP evidence

Business context

Personalization signals

Sources

Uncertainties

Provide:

Research
Researching...
Research complete
Retry

based on actual backend state.

Do not create fake progress.

============================================================
ICP FITMENT UI
============================================================

ICP Fitment is deterministic backend logic.

The frontend must NOT calculate the score.

Display backend results:

Organization Fit
Contact Fit
Overall Fit

Score:

0–100

Criterion table:

Criterion
Expected
Actual
Status
Evidence

Statuses:

MATCHED
UNMATCHED
UNVERIFIED

Also show:

Key Fit Signals
Risk Factors
Uncertainties
Recommended Next Stage

============================================================
CAMPAIGN CREATION
============================================================

Build the manager New Campaign flow as a sequential wizard.

Do NOT make it a free-form page.

Steps:

1. Identity
2. Targeting / ICP
3. Agents
4. Prospect Sourcing
5. Channels + Prompt Configuration
6. Representative Assignment
7. Pre-launch Checklist

------------------------------------------------------------
STEP 1 — IDENTITY
------------------------------------------------------------

Fields:

Campaign name
Description
Owner

Next disabled until required fields are valid.

Persist using actual backend API.

------------------------------------------------------------
STEP 2 — TARGETING
------------------------------------------------------------

Configure:

ICP
Geography
Target roles
Target seniority
Company size
Industry
Business model
Technology
Business characteristics
Exclusions
Sample/reference profiles

Use the actual campaign schema.

Do not create frontend fields that the backend cannot persist.

------------------------------------------------------------
STEP 3 — AGENTS
------------------------------------------------------------

Show available agents.

Current core agents include:

Discovery
Research
ICP Fitment
Outreach Strategy
Personalization
Conversation
Follow-up
Voice SDR

Clearly distinguish:

AI agents
Deterministic backend logic

ICP Fitment should NOT be presented as a DronaHQ AI agent if the backend implements it deterministically.

Allow enabling/disabling agents only if backend supports it.

------------------------------------------------------------
STEP 4 — PROSPECT SOURCING
------------------------------------------------------------

Support the backend capabilities that actually exist.

Possible modes:

Auto-discover
Upload seed list

Auto-discover should invoke the existing Discovery backend functionality.

Display discovered organizations and contacts.

Show:

Fit score
Why
Conflict
Organization
Contact
Title

Manager can select prospects if supported by backend.

Do not implement fake sourcing if the backend does not yet support a particular action.

------------------------------------------------------------
STEP 5 — CHANNELS + PROMPTS
------------------------------------------------------------

Channels:

Email
LinkedIn
Messages
Call / Voice

Only display channels supported by the backend.

Campaign prompt configuration:

Campaign system prompt
Agent prompts
Prompt versions

Require approval before send toggle.

Use existing prompt/version APIs.

------------------------------------------------------------
STEP 6 — REPRESENTATIVE ASSIGNMENT
------------------------------------------------------------

Show available representatives.

Columns:

Rep
Current load
Capacity
Skillset
Timezone
Channel compatibility
Active campaigns

Allow assignment if backend supports it.

Allow campaign-specific limits if backend supports it.

Show warnings when capacity is exceeded.

Do not hard-block unless backend policy does.

------------------------------------------------------------
STEP 7 — PRE-LAUNCH
------------------------------------------------------------

Show checklist:

ICP defined
Prospects sourced
Batch approved
Prompt reviewed
Representative assigned

Activate button only enabled when backend conditions are satisfied.

The backend remains authoritative.

============================================================
MANAGER — REPS
============================================================

Build the Reps screen based on the provided reference.

Table:

Rep
Channels
Timezone
Active Campaigns
Skillset
Capacity
Status
Agents

Capacity:

Current / maximum
percentage

Use actual backend values.

Filter:

Search
Bandwidth
Skillset
Status

Clicking a rep opens Rep Detail.

============================================================
REP DETAIL
============================================================

Show:

Profile
Channels
Timezone
Skills
Capacity
Assigned campaigns

For each campaign:

Campaign
Daily limit
Working hours
Channels
Status

If offboarding exists in backend, show relevant workflow.

Do not implement a fake offboarding workflow if backend support is absent.

============================================================
MANAGER — MONITORING
============================================================

Build:

Rep Name
Approval Turnaround
Response Rate
Meetings Booked
Monitoring Status

Show warning banner for aging queues if backend exposes this.

Add:

Review Now

where backend supports navigation to affected queue.

Autonomous Rebalance Mode:

Only implement if backend functionality exists.

Otherwise show the UI as unavailable / coming later rather than pretending it works.

============================================================
MANAGER — SETTINGS
============================================================

Build settings around actual backend functionality.

Potential sections:

Authentication
Integrations
Available models/tools
Security policies
Suppression/DNC
Notifications
Team permissions

Global Kill Switch remains globally accessible even though its configuration lives conceptually in Settings.

Do not create fake configuration persistence.

============================================================
REP EXPERIENCE
============================================================

Once manager workflow is functional, implement representative UI.

Representative login routes to:

MY QUEUE

They see ONLY their assigned campaigns and prospects.

No global campaign list.

============================================================
REP HEADER
============================================================

Show:

Pending Approvals
Active Conversations
Meetings Booked
Daily Sending Capacity

Capacity must use the same units as manager capacity.

Example:

32 / 50 units

Do not create a second capacity model.

Show channel operational state:

Email: Live
Voice: Paused
LinkedIn: Live

using actual backend state.

============================================================
REP ASSIGNED CAMPAIGNS
============================================================

Cards:

Campaign name
ICP
Channels
Status

Paused campaign:

dim card
"Paused by Manager"

If open conversations exist:

"2 conversations still open"

If conflict exists:

Conflict badge

All values must come from backend.

============================================================
REP APPROVAL QUEUE
============================================================

Build prioritized queue.

Each item:

Prospect
Organization
Fit score
Why
Draft
Channel
Prompt version
RAG context

Actions:

Approve
Edit & Approve
Reject

Reject requires reason if backend requires it.

Do not bypass PolicyEngine.

If backend says approval is blocked:

show the backend reason.

============================================================
REP CONVERSATIONS
============================================================

Build unified conversation view.

Show:

- prospect
- organization
- channel
- message history
- funnel stage
- AI assistance
- agent information
- prompt version where available

Paused campaign:

human rep may continue an existing conversation if backend policy allows.

New automated outbound must remain blocked.

Show a small banner:

"Campaign paused — you can finish this conversation, but no new prospects will enter this campaign until resumed."

Only show this if the backend state/policy allows it.

============================================================
REP ESCALATIONS
============================================================

Show:

Escalated items
Agent note
Diagnostic context
Resolution paths

If the backend supports manager escalation:

show that status.

Do not create fake escalation persistence.

============================================================
GLOBAL KILL SWITCH
============================================================

The kill switch must be visible to managers.

Representatives should see its effect.

When globally active:

Disable outbound actions.

Show:

"All outbound activity has been stopped platform-wide by an administrator."

Do not implement a frontend-only kill switch.

============================================================
VISUAL DESIGN
============================================================

Follow the provided reference screenshots.

Use:

background:
near-black navy

primary accent:
purple

secondary status colors:
green = active/success
amber = warning/paused
red = critical
muted gray = inactive

Avoid excessive use of bright colors.

Use subtle borders and compact cards.

Tables should feel operational, not decorative.

Use consistent:

StatusBadge
MetricCard
DataTable
PageHeader
AlertBanner
ProgressBar
CapacityMeter
AgentStatus
CampaignStatus

components.

============================================================
RESPONSIVENESS
============================================================

Primary target:

Desktop

The application is an operations dashboard.

Make it usable around:

1280px
1440px
1920px

Mobile can be secondary.

============================================================
REAL DATA ONLY
============================================================

This is extremely important.

Do not populate the production UI with:

Alex Mercer
Maya Patel
James O'Brien
Freshworks
fake campaign counts
fake meetings
fake approval counts

unless those records actually exist in the backend.

The screenshots are design references, NOT data sources.

If backend data is empty:

show an excellent empty state.

Example:

"No campaigns yet"
"Create your first campaign to begin discovering prospects."

============================================================
LOADING / ERROR / EMPTY STATES
============================================================

Every backend-driven screen needs:

Loading state
Empty state
Error state
Retry action

Buttons need:

idle
loading
success/error

Do not leave blank screens while APIs are loading.

============================================================
DEMO PRIORITY
============================================================

Build in this order:

P0:

1. Authentication
2. Manager Dashboard
3. Campaign list
4. Campaign pause/resume
5. Campaign Detail
6. Prospect list
7. Prospect Detail
8. Discovery execution
9. Research execution
10. ICP Fitment
11. Basic campaign creation
12. Basic agent activity

P1:

13. Representative dashboard
14. Approval queue
15. Conversation view
16. Reps
17. Monitoring
18. Agent/channel controls
19. Conflict indicators
20. Open conversations during pause

P2:

21. Advanced Settings
22. Offboarding workflow
23. Autonomous rebalance
24. Coach dashboard
25. Advanced analytics
26. Advanced voice UI

Do not spend time polishing P2 while P0 is incomplete.

============================================================
CRITICAL IMPLEMENTATION RULE
============================================================

Before implementing each feature:

1. Find the backend endpoint.
2. Inspect its request schema.
3. Inspect its response schema.
4. Create/update the frontend TypeScript type.
5. Implement API function.
6. Connect React UI.
7. Add loading/error/empty states.
8. Test the complete interaction.

Do not guess.

============================================================
BACKEND GAPS
============================================================

If a required UI feature has no backend support:

DO NOT invent an API.

Instead:

1. Record the missing endpoint/functionality.
2. Continue implementing everything else that is supported.
3. Create a TODO with the exact backend requirement.
4. At the end provide a backend gap report.

============================================================
FINAL DELIVERABLE
============================================================

At the end provide:

1. frontend architecture
2. files created
3. files modified
4. API endpoints integrated
5. pages completed
6. pages partially completed
7. backend functionality missing
8. frontend functionality remaining
9. environment variables required
10. commands to run frontend
11. commands to run backend
12. build/typecheck/lint results
13. exact recommended next implementation steps

Do not stop after creating static screens.

The goal is a FUNCTIONAL FRONTEND connected to the EXISTING BACKEND.