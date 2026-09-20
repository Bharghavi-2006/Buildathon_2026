Implement the deterministic ICP Fitment layer for the SDR system.

IMPORTANT ARCHITECTURAL DECISION

ICP Fitment must NOT be a DronaHQ agent and must NOT use an LLM.

The architecture is:

Discovery Agent (DronaHQ)
    ↓
Research Agent (DronaHQ)
    ↓
Deterministic ICP Fitment Engine (FastAPI/backend)
    ↓
Outreach Strategy Agent (DronaHQ)

DronaHQ handles open-ended discovery/research.
The backend handles deterministic evaluation of researched evidence against the campaign ICP.

Before changing anything, inspect the existing codebase thoroughly and understand:
- existing campaign models
- campaign ICP/config representation
- Discovery implementation
- Research implementation
- existing Pydantic schemas
- AgentRun model/status conventions
- PolicyEngine
- campaign pause / agent pause / global kill switch handling
- authentication/RBAC
- existing API patterns
- existing manager UI patterns
- existing persistence patterns

Reuse existing abstractions and naming conventions wherever possible.
Do NOT create parallel models or duplicate infrastructure unnecessarily.

==================================================
1. GOAL
==================================================

Build an ICP Fitment Engine that evaluates:

1. Organization fit
2. Contact fit
3. Overall prospect fit

based on:
- campaign ICP/configuration
- structured Discovery data
- structured Research data

The engine must be deterministic and reproducible.

Given the same campaign ICP + research result, it should always produce the same fitment result.

Do NOT call DronaHQ.
Do NOT call an LLM.
Do NOT perform web searches.
Do NOT discover new prospects.

==================================================
2. IMPORTANT PRINCIPLE
==================================================

Research is responsible for finding evidence.

ICP Fitment is responsible for evaluating that evidence.

Do NOT make the fitment engine independently search the web.

For every criterion, distinguish:

MATCHED
UNMATCHED
UNVERIFIED

Definitions:

MATCHED:
Available research evidence satisfies the ICP criterion.

UNMATCHED:
Available research evidence explicitly indicates that the criterion is not satisfied.

UNVERIFIED:
There is insufficient reliable evidence to determine whether the criterion is satisfied.

CRITICAL:

UNVERIFIED must NOT automatically become UNMATCHED.

Missing information is not negative evidence.

==================================================
3. ORGANIZATION-LEVEL FITMENT
==================================================

Evaluate organization-level ICP criteria that are actually configured for the campaign.

Potential criteria include:

- industry
- business model
- B2B/B2C
- geography
- company size / employee count
- target market
- technology requirements
- business characteristics
- company stage
- exclusions

Do NOT assume that all of these fields exist in every campaign.

The engine should evaluate the criteria actually present in the campaign ICP.

For each criterion produce:

- criterion
- status
- expected_value
- actual_value / evidence
- reason

Example:

{
  "criterion": "company_size",
  "status": "MATCHED",
  "expected_value": "200-2000 employees",
  "actual_value": 850,
  "reason": "Research reports approximately 850 employees."
}

If employee count is missing:

{
  "criterion": "company_size",
  "status": "UNVERIFIED",
  "expected_value": "200-2000 employees",
  "actual_value": null,
  "reason": "No reliable employee-count evidence was provided by Research."
}

If employee count is 50:

{
  "criterion": "company_size",
  "status": "UNMATCHED",
  "expected_value": "200-2000 employees",
  "actual_value": 50,
  "reason": "Research reports approximately 50 employees."
}

==================================================
4. CONTACT-LEVEL FITMENT
==================================================

Evaluate every researched contact independently.

Relevant criteria may include:

- target role
- title
- department/function
- seniority
- decision-making relevance
- organization association
- contact-specific exclusions

Example:

Campaign target roles:
- CTO
- VP Engineering
- Head of Engineering
- Head of Technology

Contact:
Murali Swaminathan
Title:
Chief Technology Officer

Result:

MATCHED

Do not assume a contact is a fit merely because their organization is a fit.

For example:

Organization:
MATCHED

Contact:
Recruiter

Contact fit:
UNMATCHED

The organization and contact evaluations must remain independent.

==================================================
5. HARD VS SOFT CRITERIA
==================================================

Respect any hard/required versus preferred/optional distinction that already exists in the campaign ICP model.

Do NOT invent hard/soft classifications if the existing campaign model does not support them.

If an explicit exclusion exists, treat it as a strong negative criterion.

For example:

ICP:
Exclude:
- recruitment agencies
- consulting companies

If Research establishes that the organization is a recruitment agency:

organization criterion = UNMATCHED

and the overall fit should reflect the exclusion.

==================================================
6. SCORING
==================================================

Implement deterministic scores.

Scores must be reproducible.

Do NOT use an LLM or arbitrary generated score.

Prefer a transparent weighted scoring model.

The implementation should make the scoring logic explicit and easy to modify.

Suggested approach:

For each evaluated criterion:

MATCHED = 1.0
UNVERIFIED = 0.5
UNMATCHED = 0.0

Calculate a weighted score across applicable criteria.

However:

- explicit exclusions should be treated as disqualifying where the campaign ICP marks them as exclusions
- do not allow an irrelevant contact to become a strong contact fit simply because the organization matches
- do not allow a strong contact match to completely compensate for an organization-level hard mismatch

If the existing codebase already has a scoring convention, reuse it instead of introducing a second convention.

Return:
- organization_fit_score: 0-100
- contact_fit_score: 0-100 for each contact
- overall_fit_score: 0-100

Document the scoring formula in code comments/docstrings.

==================================================
7. STATUS CALCULATION
==================================================

Organization status:

STRONG_FIT
PARTIAL_FIT
WEAK_FIT
NOT_A_FIT
UNVERIFIED

Contact status:

MATCHED
UNMATCHED
UNVERIFIED

Overall status:

STRONG_FIT
PARTIAL_FIT
WEAK_FIT
NOT_A_FIT
UNVERIFIED

Do not introduce arbitrary status logic without documenting it.

Recommended next stage:

OUTREACH_ELIGIBLE
NEEDS_RESEARCH
NOT_A_FIT
NEEDS_HUMAN_REVIEW

Use deterministic rules for these values.

Suggested semantics:

OUTREACH_ELIGIBLE:
Required evidence is sufficiently satisfied and no disqualifying criterion exists.

NEEDS_RESEARCH:
Important criteria remain UNVERIFIED.

NOT_A_FIT:
A required criterion is explicitly UNMATCHED or an exclusion applies.

NEEDS_HUMAN_REVIEW:
Evidence is contradictory or the existing campaign rules make the decision ambiguous.

Do not use "OUTREACH_ELIGIBLE" merely because the score is numerically high if a hard exclusion exists.

==================================================
8. RESEARCH DATA COMPATIBILITY
==================================================

Reuse the Research result structure already implemented in the repository.

The Research agent currently produces organization research, contacts, ICP evidence, business context, personalization signals, sources, uncertainties, etc.

Do NOT redesign the Research agent.

Build an adapter/parser if necessary so the deterministic engine can consume the existing ResearchResult representation.

Be tolerant of optional/missing fields.

Do not silently fabricate values.

==================================================
9. DATA MODEL
==================================================

Inspect the existing models before adding anything.

If an appropriate fitment/prospect evaluation model does not exist, introduce a clean model such as:

ProspectFitment

Possible fields:

- id
- campaign_id
- prospect_id
- organization_fit_score
- organization_fit_status
- organization_criteria
- contact_fit_score
- contact_fit_status
- contact_criteria
- overall_fit_score
- overall_fit_status
- recommended_next_stage
- key_fit_signals
- key_risk_factors
- uncertainties
- evaluated_at
- engine_version

Use the project's existing JSON/JSONB conventions where appropriate.

Do not duplicate organization/contact entities that already exist.

IMPORTANT:
If the repository already has a suitable Prospect/Lead/Research model, extend/reuse it rather than creating redundant entities.

==================================================
10. VERSION THE ENGINE
==================================================

Store an explicit fitment engine version, e.g.:

"icp-fitment-v1"

This is important because scoring/policy logic may change later.

An evaluation should remain auditable.

==================================================
11. AGENT RUN / AUDITABILITY
==================================================

Follow the existing AgentRun conventions if they are already used.

Although ICP Fitment is NOT an AI agent, it should still be auditable as a system action if the existing architecture records workflow steps.

Use an appropriate run/action type such as:

ICP_FITMENT

or the repository's existing equivalent.

Record:
- started
- completed
- failed

Do not pretend this was a DronaHQ/LLM execution.

==================================================
12. API
==================================================

Inspect existing Research endpoints and follow their API conventions.

Add an endpoint for running ICP Fitment on a researched prospect.

Preferred shape if consistent with the existing API:

POST
/api/manager/campaigns/{campaign_id}/prospects/{prospect_id}/fitment

Optional:

force_refresh=true

The endpoint should:

1. authenticate the user
2. enforce RBAC
3. verify campaign exists
4. verify prospect belongs to campaign
5. verify required research exists
6. enforce campaign/agent/global policy where appropriate
7. load campaign ICP
8. load Research result
9. execute deterministic ICPFitmentEngine
10. persist the result
11. return the fitment result

Do NOT call DronaHQ from this endpoint.

==================================================
13. POLICY / CAMPAIGN CONTROLS
==================================================

Respect existing control-plane rules.

At minimum inspect and integrate with:

- campaign paused state
- global kill switch
- authorization/RBAC

If the existing PolicyEngine already handles these checks, reuse it.

Do not create a second policy system.

Fitment itself should be safe to run while a campaign is paused if the existing architecture considers analysis/read operations safe; however, follow the existing policy conventions rather than inventing new semantics.

Most importantly:
DO NOT bypass the PolicyEngine.

==================================================
14. IDEMPOTENCY
==================================================

Running fitment multiple times against the same unchanged Research result should not create uncontrolled duplicates.

Reuse/update the existing fitment result or version it according to existing persistence conventions.

If force_refresh is supported, make its behavior explicit.

==================================================
15. TEST CASES
==================================================

Write comprehensive tests.

At minimum:

TEST 1 — Full match

ICP:

B2B SaaS
India
200-2000 employees
target role = CTO / VP Engineering / Head of Engineering

Research:

B2B SaaS
India
850 employees
B2B
contact = CTO

Expected:

organization criteria mostly MATCHED
contact MATCHED
high deterministic score
OUTREACH_ELIGIBLE

--------------------------------------------------

TEST 2 — Missing company size

Research:

B2B SaaS
India
employee count unknown
contact = CTO

Expected:

industry = MATCHED
geography = MATCHED
business model = MATCHED
company size = UNVERIFIED
contact = MATCHED

Do NOT mark company size UNMATCHED.

--------------------------------------------------

TEST 3 — Explicit mismatch

ICP:

200-2000 employees

Research:

50 employees

Expected:

company size = UNMATCHED
fit score reduced
appropriate non-eligible status

--------------------------------------------------

TEST 4 — Exclusion

ICP:

Exclude recruitment agencies.

Research:

organization is a recruitment agency.

Expected:

explicit exclusion = UNMATCHED / disqualifying
overall result = NOT_A_FIT
recommended_next_stage = NOT_A_FIT

--------------------------------------------------

TEST 5 — Matching organization, irrelevant contact

Organization satisfies ICP.

Contact:
Recruiter

Campaign target:
CTO / VP Engineering / Head of Engineering

Expected:

organization = fit
contact = UNMATCHED
overall prospect should not be marked outreach eligible for that contact.

--------------------------------------------------

TEST 6 — Matching organization, unverified contact

Organization matches.

Contact exists but seniority/current role cannot be verified.

Expected:

organization = fit
contact = UNVERIFIED
recommended stage should require research or human review according to deterministic rules.

--------------------------------------------------

TEST 7 — Multiple contacts

One organization with:

Contact A = CTO
Contact B = Recruiter
Contact C = Head of Engineering

Evaluate independently.

Do not let Contact B inherit Contact A's fit.

--------------------------------------------------

TEST 8 — Contradictory evidence

Research contains conflicting evidence about a criterion.

Do not silently choose a value.

Use the existing Research uncertainty/conflict representation where available.

Result should be deterministic and should surface the uncertainty or require human review.

--------------------------------------------------

TEST 9 — Repeat execution

Run the same fitment twice.

Expected:
same result
no uncontrolled duplicate records

==================================================
16. API TESTS
==================================================

Test:

- unauthorized request
- authorized manager request
- wrong campaign
- prospect not belonging to campaign
- missing research
- paused campaign
- global kill switch
- invalid ICP
- malformed research data
- successful fitment
- repeated fitment
- force refresh if implemented

Follow existing project conventions.

==================================================
17. FRONTEND / MANAGER UI
==================================================

Inspect the existing manager campaign/prospect UI.

If the project already has a research status/action, add ICP Fitment alongside it rather than creating a separate page.

Expose at minimum:

- Organization Fit
- Contact Fit
- Overall Fit
- Fit score
- criterion statuses
- key fit signals
- risk factors
- uncertainties
- recommended next stage

Make it obvious why a prospect is or is not considered a fit.

Do not build an elaborate UI if the current frontend architecture is not ready for it.

A compact fitment panel is sufficient.

==================================================
18. IMPORTANT ARCHITECTURAL CONSTRAINTS
==================================================

DO NOT:

- add LangGraph
- add another LLM
- add another AI provider
- call DronaHQ for ICP scoring
- perform web searches
- duplicate the Research agent
- duplicate the PolicyEngine
- duplicate campaign models
- hard-code the current demo campaign
- hard-code Freshworks
- hard-code a specific contact
- invent ICP fields that aren't supported by the existing campaign model

The fitment engine must work generically for multiple campaigns.

==================================================
19. CODE QUALITY
==================================================

Follow the repository's existing:

- Python style
- typing conventions
- Pydantic conventions
- SQLAlchemy patterns
- service/repository architecture
- error handling
- logging
- migrations
- test structure

Keep the implementation modular.

Prefer something like:

services/
    icp_fitment/
        engine.py
        rules.py
        schemas.py
        scoring.py

or the equivalent architecture already used by the repository.

Do not over-engineer if the existing structure suggests a simpler implementation.

==================================================
20. README / DOCUMENTATION
==================================================

Document:

- why ICP Fitment is deterministic
- what data it consumes
- how criteria are evaluated
- MATCHED vs UNMATCHED vs UNVERIFIED
- scoring formula
- exclusion handling
- recommended-next-stage logic
- engine version
- API endpoint
- example input/output

Explicitly document the architectural boundary:

DronaHQ:
Discovery + Research + later AI-driven outreach tasks

FastAPI:
Persistence + policy + deterministic ICP evaluation

==================================================
21. FINAL DELIVERABLE

After implementation:

1. summarize the existing architecture you found
2. list files changed
3. list migrations created
4. explain the ICP evaluation algorithm
5. explain scoring
6. explain hard/exclusion handling
7. explain API behavior
8. explain UI changes
9. report tests run and their results
10. identify any assumptions or gaps

Do not merely describe what should be done.

Actually implement it, run the relevant tests, and fix failures before finishing.