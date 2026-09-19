Implement the Manager Control + Representative Approval workflow.

Do NOT redesign or replace the existing architecture/stack.
Do NOT implement the full Manager dashboard or campaign creation workflow.
Do NOT implement Monitoring/Rebalancing yet.
Do NOT implement DronaHQ yet.

Focus only on making the separation between Manager-level control and Representative-level execution functional.

The core principle is:

MANAGER = controls the SDR system
REPRESENTATIVE = executes day-to-day human approvals

The manager should NOT normally approve individual outreach messages.
The representative owns the approval queue.

The manager DOES have authority to pause/enable downstream agents, channels, and campaigns.


==================================================
1. MANAGER AGENT CONTROL
==================================================

A manager must be able to control individual agents within a campaign.

Supported agents:

- ICP Fitment
- Research
- Outreach Strategy
- Personalization
- Conversation
- Follow-up
- Voice

Implement:

POST /api/manager/campaigns/{campaign_id}/agents/{agent_id}/pause

POST /api/manager/campaigns/{campaign_id}/agents/{agent_id}/resume

GET /api/manager/campaigns/{campaign_id}/agents


When an agent is paused:

- set its campaign-specific status to PAUSED/DISABLED
- create an AuditLog
- future executions of that agent must be skipped
- the rest of the campaign must continue where possible

IMPORTANT:

Agent pause does NOT mean the entire workflow stops.

For example:

Research Agent = PAUSED

Then:

Discovery
   ↓
Research → SKIPPED
   ↓
Qualification / Outreach
   ↓
Personalization

Downstream agents must explicitly understand that research context is unavailable.

Do NOT fabricate missing research context.

Represent skipped execution explicitly:

{
  "agent": "RESEARCH",
  "status": "SKIPPED",
  "reason": "AGENT_DISABLED"
}


==================================================
2. AGENT DEPENDENCY / CONTEXT HANDLING
==================================================

Agent outputs must be optional.

For example:

ProspectContext:

- prospect
- company
- icp_fit
- research_context: optional
- outreach_strategy: optional
- personalization_context: optional
- conversation_context: optional

If Research is disabled:

research_context = null

Downstream agents may use:

- prospect data
- company data
- ICP
- campaign configuration
- RAG knowledge
- previous conversation history

but MUST NOT invent external research facts.

If a downstream agent critically requires unavailable context, it should either:

1. operate with reduced context, OR
2. produce an explicit escalation/review state.

Do not silently hallucinate.


==================================================
3. MANAGER CHANNEL CONTROL
==================================================

Managers can independently pause/resume channels for a campaign.

Supported channels:

EMAIL
LINKEDIN
MESSAGE
VOICE

Implement:

POST /api/manager/campaigns/{campaign_id}/channels/{channel}/pause

POST /api/manager/campaigns/{campaign_id}/channels/{channel}/resume

Example:

Campaign = LIVE

Email = PAUSED
LinkedIn = LIVE
Voice = LIVE

Only Email outbound actions should be blocked.

The campaign itself must remain LIVE.


==================================================
4. MANAGER CAMPAIGN CONTROL
==================================================

Managers can pause/resume entire campaigns.

Implement/use:

POST /api/manager/campaigns/{campaign_id}/pause

POST /api/manager/campaigns/{campaign_id}/resume

When a campaign is paused:

- no new outbound actions may execute
- pending drafts should remain in the queue
- existing conversations remain accessible
- data/history must not be deleted
- other campaigns must continue normally

When resumed, eligible queued actions can continue subject to PolicyEngine.


==================================================
5. MANAGER APPROVAL VISIBILITY
==================================================

The manager should be able to MONITOR the approval backlog.

The manager does not normally own the approval queue.

Implement:

GET /api/manager/approvals/summary

Return aggregate information such as:

{
  "total_pending": 12,
  "aging_count": 3,
  "oldest_age_hours": 31,
  "by_representative": [
    {
      "representative_id": "...",
      "pending": 5,
      "aging": 1
    }
  ]
}


The manager should be able to identify:

- how many approvals are pending
- which representatives have pending approvals
- how many are aging
- oldest pending approval
- campaign associated with the approval

Do NOT expose unrelated private representative data.


==================================================
6. AGING APPROVAL ALERT
==================================================

Create a simple configurable approval aging threshold.

For example:

approval_aging_threshold_hours = 24

If an approval remains pending beyond the threshold, mark it:

AGING

The manager dashboard should be able to retrieve:

GET /api/manager/approvals/aging

Return:

- approval ID
- representative
- campaign
- prospect
- age
- channel
- message preview
- created_at


==================================================
7. REPRESENTATIVE APPROVAL QUEUE
==================================================

Representatives own their individual approval queue.

Implement:

GET /api/rep/approvals

The endpoint must only return approvals assigned to the authenticated representative.

Each approval should include:

- campaign
- prospect
- channel
- generated message
- priority
- intent
- agent that generated it
- prompt version
- RAG/source references
- created_at
- status


Statuses:

PENDING
APPROVED
REJECTED
SCHEDULED
SENT
BLOCKED


==================================================
8. REPRESENTATIVE ACTIONS
==================================================

Implement:

POST /api/rep/approvals/{approval_id}/approve

POST /api/rep/approvals/{approval_id}/edit-approve

POST /api/rep/approvals/{approval_id}/reject


Approve:

- verify the approval belongs to the authenticated representative
- pass through PolicyEngine
- if allowed, send or schedule the message
- update approval state
- record audit/event

Edit + Approve:

Accept the representative's edited message.

Then run the edited message through the same PolicyEngine.

Do NOT bypass policy because the representative edited it.


Reject:

Require a rejection reason.

Supported reasons:

- WRONG_PERSONA
- IRRELEVANT_HOOK
- WRONG_INFORMATION
- DUPLICATE_ACCOUNT
- OTHER

Store the rejection as feedback/audit data.


==================================================
9. BATCH APPROVAL
==================================================

Implement:

POST /api/rep/approvals/batch-approve

The representative can approve multiple eligible items.

IMPORTANT:

Every individual message must still be validated by PolicyEngine.

Do not assume that because one item passed, every item passes.

Possible result:

{
  "approved": 7,
  "blocked": 2,
  "scheduled": 1,
  "results": [...]
}


==================================================
10. POLICY ENGINE IS THE FINAL AUTHORITY
==================================================

The frontend must NEVER be the source of truth.

Every outbound approval must pass through PolicyEngine.

Check at minimum:

1. Global kill switch
2. Campaign status
3. Agent status
4. Channel status
5. Representative active status
6. Representative channel availability
7. Working hours
8. Representative daily limit
9. Campaign daily limit
10. DNC/suppression
11. Contact-frequency rules
12. Cross-campaign conflict rules

If any blocking rule fails:

Do NOT send.

Return a structured reason.

Example:

{
  "allowed": false,
  "reason_code": "CAMPAIGN_PAUSED",
  "message": "Campaign is currently paused by the manager."
}


==================================================
11. IMPORTANT SEPARATION OF RESPONSIBILITIES
==================================================

Enforce this distinction:

MANAGER:

- pause/resume campaign
- pause/resume individual agents
- pause/resume channels
- monitor approval backlog
- view aging approvals
- intervene when a representative is unavailable
- use global controls

REPRESENTATIVE:

- approve individual messages
- edit and approve
- reject
- batch approve
- respond to prospects
- handle escalations
- execute assigned outreach

Do NOT give representatives permission to:

- pause campaigns
- activate campaigns
- pause campaign agents
- change campaign prompts
- change ICP
- change campaign channels
- use global kill switch


==================================================
12. MANAGER EMERGENCY OVERRIDE
==================================================

Implement an optional manager emergency override for a specific approval.

Endpoint:

POST /api/manager/approvals/{approval_id}/approve

This is NOT the normal workflow.

It exists for cases such as:

- representative unavailable
- approval aging beyond SLA
- urgent manager intervention

Even this endpoint MUST go through PolicyEngine.

The manager override does NOT bypass:

- DNC
- suppression
- campaign pause
- global kill switch
- channel restrictions
- contact-frequency limits
- working-hour restrictions

The manager is allowed to override the human-approval ownership,
NOT the safety/policy layer.


==================================================
13. AGENT STATE VS APPROVAL STATE
==================================================

Keep these separate.

Example:

Agent:

Research
Status = PAUSED

Approval:

Pending
Status = PENDING

Pausing Research should NOT delete existing approvals.

Similarly:

Campaign:

PAUSED

Existing approval:

PENDING

The approval remains in the queue but cannot be sent while the campaign is paused.

When the campaign resumes, the approval can be evaluated again by PolicyEngine.


==================================================
14. AUDIT LOGGING
==================================================

Create audit records for:

Manager:

- agent paused
- agent resumed
- channel paused
- channel resumed
- campaign paused
- campaign resumed
- manager approval override

Representative:

- approval approved
- approval edited
- approval rejected
- batch approval

Record:

- actor
- role
- timestamp
- campaign
- prospect
- action
- reason
- previous state
- new state


==================================================
15. TESTS
==================================================

Add tests for the complete workflow.

Manager tests:

1. Manager can pause Research.
2. Manager can resume Research.
3. Manager can pause Email without pausing LinkedIn.
4. Manager can pause a campaign.
5. Manager can resume a campaign.
6. Manager can see approval summary.
7. Manager can see aging approvals.
8. Manager can perform emergency approval override.

Representative tests:

9. Representative sees only their approvals.
10. Representative can approve their approval.
11. Representative can edit + approve.
12. Representative can reject.
13. Representative can batch approve.
14. Representative cannot approve another representative's approval.
15. Representative cannot pause an agent.
16. Representative cannot pause a campaign.
17. Representative cannot change channel configuration.

Policy tests:

18. Approval blocked when campaign is paused.
19. Approval blocked when channel is paused.
20. Approval blocked when agent is disabled.
21. Approval blocked when representative is inactive.
22. Approval blocked by DNC.
23. Approval blocked by global kill switch.
24. Approval blocked when daily limit is reached.
25. Approval scheduled when outside working hours.
26. Existing approvals remain after agent/campaign pause.
27. Existing approvals become eligible again after valid resume.

Agent context tests:

28. Disabled Research produces SKIPPED, not fake research.
29. Personalization works with reduced context when Research is unavailable.
30. No downstream agent may fabricate missing research facts.


==================================================
16. DEMO SCENARIO
==================================================

Make the implementation easy to demonstrate:

Campaign A:
- LIVE
- Research = ON
- Email = ON
- 3 pending representative approvals

Campaign B:
- LIVE
- Research = OFF
- Email = ON
- Personalization continues using available context
- Research execution is recorded as SKIPPED

Campaign C:
- PAUSED
- Has existing pending approvals
- Approvals remain visible but cannot be sent

Then demonstrate:

1. Manager pauses Research in Campaign A.
2. New Research runs are skipped.
3. Existing approval drafts remain.
4. Manager pauses Email in Campaign B.
5. LinkedIn continues working.
6. Representative logs in.
7. Representative sees only their own approval queue.
8. Representative edits and approves a message.
9. PolicyEngine validates it.
10. Campaign C approval is blocked because campaign is paused.
11. Manager sees the aging approval summary.
12. Manager can perform an emergency approval if necessary, but PolicyEngine still applies all safety rules.


==================================================
17. ACCEPTANCE CRITERIA
==================================================

This task is complete only when:

- Manager and Representative permissions are enforced server-side.
- Manager can control campaigns, agents, and channels independently.
- Representative owns normal message approval.
- Manager can monitor approval backlog without becoming the normal approval owner.
- Existing approvals survive campaign/agent pauses.
- PolicyEngine is always the final outbound authority.
- Disabling an upstream agent does not cause downstream agents to fabricate missing context.
- All important actions are auditable.
- Tests cover the separation of responsibilities.

After implementation:

- run all relevant tests
- run migrations
- report files changed
- report endpoints added/modified
- report tests added
- mention anything intentionally deferred