Implement the backend Rep Matching / Representative Recommendation system required by the New Campaign workflow.

IMPORTANT:
- Inspect the existing Campaign, Representative/Team, Prospect, and PolicyEngine models and APIs before changing anything.
- Do not implement this using an LLM, DronaHQ agent, embeddings, or ML.
- This must be a deterministic, explainable backend scoring engine.
- Do not modify the working Dashboard or existing campaign behavior.
- Do not hardcode representatives or scores.
- Reuse the existing representative roster data.

GOAL:

Given a campaign and a representative, calculate a deterministic Rep Match Score from 0–100 and return an explainable breakdown.

The score should measure configuration compatibility, not historical performance.

Suggested weighting:

ICP / domain fit: 30
Geography / timezone fit: 20
Channel fit: 20
Capacity availability: 15
Role / specialization fit: 10
Working-hours overlap: 5

Total = 100.

Do not include historical response rate, meetings, or subjective performance in this first implementation.

==================================================
ICP FIT
==================================================

Compare campaign structured ICP against representative capabilities.

Use whatever structured fields already exist in the models.

Possible signals:
- industries
- domains
- target roles
- seniority
- company type
- specialization

Missing information should reduce confidence/score appropriately but should not cause crashes.

Return the score component and human-readable reasons.

==================================================
GEOGRAPHY / TIMEZONE
==================================================

Compare:
- campaign target geography
- campaign timezone/working hours if available
- representative geography
- representative timezone

Calculate deterministic overlap.

Return:
- score
- reason
- any timing warning

==================================================
CHANNEL FIT
==================================================

Compare enabled campaign channels against representative supported channels.

Channels:
- LinkedIn
- Email
- Messages
- Call

Calculate based on supported-channel overlap.

Do not assume a representative supports a channel if the backend says otherwise.

==================================================
CAPACITY
==================================================

Use the representative's actual current load and configured capacity.

Return:
- current load
- capacity
- utilization percentage
- capacity score
- warning if near/over capacity

Capacity warnings must NOT hard-block assignment.

For example:

70% → normal
85%+ → warning
95%+ → high warning
100%+ → over-capacity warning

Use sensible thresholds consistent with the existing roster model.

Do not hardcode a capacity of 50 if the backend has another configured capacity.

==================================================
SPECIALIZATION
==================================================

Compare campaign target roles/domain against representative skillset/specialization if such fields exist.

If the existing representative model does not contain this information, do not invent it. Return a neutral/unverified component and document the limitation.

==================================================
WORKING HOURS
==================================================

Calculate overlap between campaign and representative working hours if both are available.

Do not fabricate timezone information.

==================================================
OUTPUT
==================================================

Create a structured result similar to:

{
  "representative_id": "...",
  "score": 87,
  "breakdown": {
    "icp_fit": 27,
    "geography_fit": 18,
    "channel_fit": 17,
    "capacity": 12,
    "specialization": 8,
    "working_hours": 5
  },
  "reasons": [
    "Strong SaaS/Cloud domain match",
    "US geography matches",
    "Supports Email, LinkedIn and Call",
    "Current capacity is 70%"
  ],
  "warnings": []
}

The exact fields can follow existing project conventions.

==================================================
ENDPOINT
==================================================

Add an endpoint following existing API conventions:

GET /api/manager/campaigns/{campaign_id}/rep-matches

It should:

1. Verify manager authorization.
2. Load the campaign.
3. Load active representatives from the existing roster.
4. Calculate deterministic match scores.
5. Return all eligible representatives with score/breakdown/reasons/warnings.
6. Sort by score descending for convenience, but preserve the manager's ability to select any representative.
7. Do not persist a "recommended rep" automatically.

If the project already has a matching endpoint, extend/reuse it instead of creating a duplicate.

==================================================
ASSIGNMENT SUPPORT
==================================================

Inspect the existing campaign assignment model.

If campaign-to-representative assignment already exists, reuse it.

If not, add the minimum clean model/API required to support:
- campaign_id
- representative_id
- daily send limit
- assigned prospect/lead limit where supported
- working hours where supported
- routing rule where supported

Do not implement the entire New Campaign Wizard yet.

==================================================
TESTS
==================================================

Add deterministic tests for:

1. Perfect ICP/geography/channel/capacity match.
2. Partial ICP match.
3. Geography mismatch.
4. Channel mismatch.
5. Near-capacity rep.
6. Over-capacity rep.
7. Missing representative specialization.
8. Missing timezone.
9. Multiple representatives with different scores.
10. Same inputs produce the same score every time.
11. Unauthorized user cannot access manager matching endpoint.
12. Existing backend tests remain passing.

Also test that capacity warnings do not prevent assignment.

==================================================
IMPORTANT
==================================================

Do NOT implement:
- ML
- LLM
- DronaHQ agent
- embeddings
- historical performance optimization
- automatic rep assignment
- New Campaign frontend
- Knowledge Base

This task is ONLY the deterministic Rep Matching backend and the minimum assignment persistence needed to support it.

Run:
- pytest
- any available type/static checks

Report:
- files changed
- models/migrations
- endpoint
- scoring formula
- tests
- anything unavailable because the current representative schema lacks required information.