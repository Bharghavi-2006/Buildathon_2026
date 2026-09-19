# Architecture

FastAPI is the DronaHQ-facing control plane; PostgreSQL is the transactional source of truth; Neo4j is an optional best-effort relationship projection. The policy engine is deterministic and authoritative: agent logic only proposes strategy and content.

The shared workflow is discovery → research → qualification → strategy → personalization → policy → channel → conversation/follow-up. Conditional stops occur for failed qualification, campaign/agent/channel pauses, suppression, frequency limits, conflicts, and global kill switch. `AgentRun`, prompt versions, facts/sources, messages, and outreach events provide the explainability trail.

`CampaignProspect` makes campaigns/prospects many-to-many. Neo4j projects campaign-targets-prospect, company, conversation/message, source/fact, prompt and agent-run relationships but never authorizes writes. RAG has a replaceable retriever and seeded sales knowledge. DronaHQ calls REST APIs and never bypasses policy checks.
