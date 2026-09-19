# Initial Codex prompt

You are the lead backend/AI engineer for a 51-hour buildathon project.

PROJECT:
We are building an autonomous multi-channel SDR (Sales Development Representative) platform for the Inter Guild Buildathon 2026.

IMPORTANT:
Before writing code, inspect the entire repository and read the provided buildathon problem statement carefully. Treat the problem statement as the source of truth for requirements.

The system must feel like ONE intelligent SDR system rather than a collection of disconnected chatbots.

We have limited build time, so prioritize a working, demonstrable end-to-end architecture over unnecessary abstraction or overengineering.

==================================================
1. CORE OBJECTIVE
==================================================

Build the initial backend foundation for an autonomous multi-channel SDR platform with:

- Campaign management
- Prospect management
- Lead discovery
- Lead research/enrichment
- ICP qualification
- Outreach strategy
- Personalized outreach generation
- Conversation handling
- Follow-up decisions
- RAG over sales/company knowledge
- Multi-channel abstraction
- Cross-campaign conflict detection
- Contact-frequency controls
- Agent execution traces
- Human control over campaigns and agents
- DronaHQ integration boundary
- PostgreSQL as the transactional source of truth
- Neo4j as the relationship intelligence layer
- LangGraph for agent/workflow orchestration
- LangChain for LLM/tool/retriever integrations
- FastAPI REST API

DO NOT build the frontend yet.

==================================================
2. TECHNOLOGY STACK
==================================================

Use:

Backend:
- Python 3.11+
- FastAPI
- Pydantic / Pydantic Settings
- SQLAlchemy 2.x
- Alembic
- PostgreSQL
- asyncpg

Agentic AI:
- LangGraph
- LangChain
- LangChain provider integrations
- Structured LLM outputs
- Tool calling

Graph:
- Neo4j
- Official Neo4j Python driver

RAG:
- Start with a clean abstraction for vector retrieval.
- Prefer pgvector with PostgreSQL if practical.
- If pgvector setup becomes a time sink, implement a repository interface with a simple fallback while keeping the architecture ready for pgvector.
- Do NOT build a complicated custom vector database.

Validation:
- Pydantic
- Typed Python models

Testing:
- pytest
- pytest-asyncio

Infrastructure:
- Docker
- Docker Compose
- PostgreSQL
- Neo4j

API:
- REST
- OpenAPI through FastAPI

DO NOT use:
- Node.js
- TypeScript
- GraphQL
- Microservices
- Kubernetes
- unnecessary infrastructure
- unnecessary agent frameworks beyond LangChain/LangGraph

Use a modular monolith.

==================================================
3. FIRST STEP: INSPECT BEFORE IMPLEMENTING
==================================================

Before changing anything:

1. Inspect the repository structure.
2. Identify existing code, configuration, dependencies, Docker files, environment files, and README.
3. Read the entire buildathon problem statement available in the repository/upload.
4. Identify whether any existing implementation should be preserved.
5. Do not blindly overwrite existing work.

Then create:

docs/architecture.md

containing:

- system architecture
- component responsibilities
- database architecture
- agent architecture
- LangGraph workflow
- Neo4j graph model
- RAG flow
- campaign lifecycle
- prospect lifecycle
- policy engine
- channel architecture
- DronaHQ integration boundary
- important design decisions

After that, implement the backend.

==================================================
4. HIGH-LEVEL ARCHITECTURE
==================================================

Use this conceptual architecture:

                         DronaHQ
                            |
                            | REST API
                            v
                       FastAPI API
                            |
                            v
                   Application Services
                            |
             +--------------+--------------+
             |                             |
             v                             v
      Policy Engine                  LangGraph
             |                    Agent Orchestration
             |                             |
             |              +--------------+-------------+
             |              |              |             |
             v              v              v             v
       Conflict       Research       Qualification   Outreach
       Detection       Agent             Agent         Agents
             |              |              |             |
             +--------------+--------------+-------------+
                            |
                            v
                       Channel Layer
                     /      |       \
                  Email     SMS    Voice/LinkedIn
                            |
                            v
                    External Integrations

Data:

PostgreSQL
    = source of truth for application state

Neo4j
    = relationship intelligence / graph reasoning

Vector Store
    = RAG knowledge retrieval


IMPORTANT:
LLMs propose actions.
Deterministic application code/policy validates whether those actions are allowed.

Never allow an LLM to directly bypass campaign state, suppression rules,
contact-frequency limits, or global kill switches.

==================================================
5. DATABASE MODEL
==================================================

Use PostgreSQL as the source of truth.

Create appropriate SQLAlchemy models and Alembic migrations.

At minimum implement these entities:

User
Campaign
CampaignAgent
Company
Prospect
CampaignProspect
Conversation
Message
AgentRun
AgentDecision
PromptVersion
OutreachEvent
ScheduledAction
KnowledgeDocument
KnowledgeChunk
ResearchFact
Source
SuppressionEntry
ChannelConfiguration
AuditLog

You may add supporting tables where useful.

--------------------------------------------------
CAMPAIGN
--------------------------------------------------

Campaign should include:

- id
- name
- description
- status
- ICP configuration
- target geography
- target industries
- target roles
- company size constraints
- campaign instructions
- active channels
- daily outreach limit
- approval requirements
- created_at
- updated_at

Campaign statuses:

DRAFT
LIVE
PAUSED
COMPLETED
ARCHIVED

Campaigns must operate independently.

Pausing Campaign A must NOT stop Campaign B.

--------------------------------------------------
PROSPECT
--------------------------------------------------

Include:

- id
- first_name
- last_name
- email
- phone
- linkedin_url
- title
- company_id
- location
- industry
- employee_count
- website
- metadata
- lifecycle_status
- created_at
- updated_at

Prospect lifecycle:

DISCOVERED
RESEARCHED
QUALIFIED
CONTACTED
ENGAGED
MEETING
OPPORTUNITY
DISQUALIFIED
SUPPRESSED

--------------------------------------------------
CAMPAIGN_PROSPECT
--------------------------------------------------

This is important.

A prospect can belong to multiple campaigns.

Store:

- campaign_id
- prospect_id
- qualification_status
- qualification_score
- qualification_reason
- current_stage
- last_contacted_at
- next_followup_at
- campaign_specific_context
- created_at
- updated_at

Do NOT assume one prospect belongs to only one campaign.

==================================================
6. AGENTS
==================================================

Implement the following logical agent capabilities:

1. LeadDiscoveryAgent
2. ResearchEnrichmentAgent
3. QualificationAgent
4. OutreachStrategyAgent
5. PersonalizationAgent
6. ConversationAgent
7. FollowUpAgent

IMPORTANT:

Do NOT create seven completely independent autonomous systems.

They should be coordinated through a shared LangGraph workflow and shared prospect/campaign state.

The architecture should feel like one SDR brain.

==================================================
7. LANGGRAPH
==================================================

Build a LangGraph-based orchestration layer.

Create a shared state object containing things such as:

- campaign_id
- prospect_id
- prospect
- campaign
- research_facts
- retrieved_knowledge
- qualification
- outreach_strategy
- personalization
- conversation_context
- proposed_action
- policy_result
- channel
- errors
- execution_metadata

Example conceptual workflow:

DISCOVER
   |
RESEARCH
   |
QUALIFY
   |
OUTREACH STRATEGY
   |
PERSONALIZE
   |
POLICY CHECK
   |
CHANNEL EXECUTION
   |
WAIT / RESPONSE
   |
CONVERSATION
   |
FOLLOW-UP

Not every execution must run every node.

The graph should support conditional routing.

For example:

If qualification fails:
    -> DISQUALIFIED

If campaign is paused:
    -> STOP

If prospect is suppressed:
    -> STOP

If policy blocks outreach:
    -> SUPPRESSED / WAIT

If prospect responds:
    -> CONVERSATION AGENT

If response indicates meeting intent:
    -> MEETING

If response indicates objection:
    -> objection handling

If response says "later":
    -> schedule follow-up

==================================================
8. LANGCHAIN
==================================================

Use LangChain where it actually helps:

- LLM abstraction
- structured outputs
- tool calling
- retrievers
- prompt templates
- document loading/chunking
- model integrations

Create a clean LLM service abstraction so the application does not depend directly on one model provider everywhere.

For example:

LLMService
    - generate_structured(...)
    - generate(...)
    - invoke_with_tools(...)

Use Pydantic models for structured agent outputs.

Agents should NOT return arbitrary strings when making decisions.

Example:

QualificationResult:
- qualified: bool
- score: float
- reasons: list[str]
- evidence: list[str]

OutreachDecision:
- should_contact: bool
- channel: str
- objective: str
- message_angle: str
- reasoning: str

FollowUpDecision:
- action: enum
- delay_minutes: int
- channel: str
- reason: str

==================================================
9. TOOL SYSTEM
==================================================

Create tool interfaces for agents.

At minimum:

search_web
research_company
research_person
retrieve_sales_knowledge
get_campaign
get_prospect
get_conversation_history
check_contact_policy
check_campaign_conflicts
schedule_followup
create_outreach_draft

Initially, external tools may use mock implementations.

The architecture must make it easy to replace them with real integrations later.

DO NOT spend the entire buildathon implementing fragile third-party APIs.

Prioritize interfaces + mock/demo providers.

==================================================
10. LEAD DISCOVERY
==================================================

Create:

LeadDiscoveryProvider

with implementations:

MockLeadDiscoveryProvider
WebSearchLeadDiscoveryProvider

The mock provider must return realistic synthetic prospects.

Example:

- CTO at SaaS company
- CIO at Indian BFSI company
- Founder at AI startup

Discovery should create/update Prospect and CampaignProspect records.

IMPORTANT:

Discovery and research are different.

Discovery:
"Find people who fit this ICP."

Research:
"Now that we know who this person/company is, find relevant information about them."

Keep these as separate services/agents.

==================================================
11. RESEARCH / ENRICHMENT
==================================================

Research agent should gather structured facts such as:

- company description
- recent company news
- funding
- hiring
- product launches
- technology stack
- person's role
- relevant business signals
- relevant pain points

Every research fact should ideally contain:

- fact
- source
- source_url
- timestamp
- confidence

Do not let the personalization agent invent facts.

Personalization should use grounded research facts.

Create:

ResearchFact
Source

and relationships between them.

==================================================
12. QUALIFICATION
==================================================

Qualification agent should evaluate the prospect against campaign ICP.

Input:

- campaign ICP
- prospect data
- research facts

Output structured result:

- qualified
- score
- reasons
- evidence
- missing_information

Do NOT hard-code a fake score without explaining the criteria.

The qualification logic should be campaign-specific.

==================================================
13. RAG
==================================================

Implement a RAG subsystem.

Knowledge should include examples of:

- company/product information
- case studies
- sales playbooks
- ICP definitions
- objection handling
- email examples
- messaging examples
- voice scripts

Create:

KnowledgeDocument
KnowledgeChunk

and interfaces:

DocumentLoader
DocumentChunker
EmbeddingService
VectorStore
Retriever

The initial implementation should be simple and reliable.

Seed the system with a small but useful knowledge base.

Example documents:

product_overview.md
sales_playbook.md
case_study_1.md
case_study_2.md
icp_definitions.md
objection_handling.md
email_examples.md
voice_scripts.md

RAG retrieval should be used by relevant agents rather than just existing as unused infrastructure.

==================================================
14. OUTREACH STRATEGY + PERSONALIZATION
==================================================

Separate:

OutreachStrategyAgent
PersonalizationAgent

Strategy determines:

- whether to contact
- preferred channel
- objective
- messaging angle
- timing

Personalization generates the actual message using:

- campaign instructions
- prospect information
- research facts
- retrieved RAG knowledge
- conversation history

Output structured data:

{
    channel,
    subject,
    body,
    personalization_facts,
    CTA,
    reasoning
}

Store the resulting decision.

==================================================
15. POLICY ENGINE
==================================================

This is CRITICAL.

LLM decisions must pass through a deterministic PolicyEngine.

Policy engine checks:

1. Campaign is LIVE
2. Agent is enabled
3. Channel is enabled
4. Global kill switch is not active
5. Prospect is not suppressed
6. Prospect has not exceeded contact frequency
7. Campaign daily limit has not been exceeded
8. Cross-campaign conflicts
9. Required approval is satisfied
10. Channel-specific restrictions

Example:

LLM says:
"Send email."

PolicyEngine says:
"BLOCKED: prospect contacted 30 minutes ago."

The email must NOT be sent.

Create clear policy result objects:

PolicyResult:
- allowed
- reason
- rule
- metadata

==================================================
16. CROSS-CAMPAIGN CONFLICTS
==================================================

This is one of the important differentiators.

A prospect can appear in multiple campaigns.

Example:

Campaign A:
    target John
    email him

Campaign B:
    target John
    LinkedIn message him

The system should detect that John is already being contacted through another campaign.

Implement:

ConflictDetectionService

It should be able to detect:

- same prospect in multiple campaigns
- overlapping active outreach
- recent contact
- conflicting campaign instructions
- excessive contact frequency

Initially deterministic rules are sufficient.

==================================================
17. NEO4J
==================================================

Use Neo4j as a relationship intelligence layer.

Do NOT use Neo4j as the primary transactional database.

PostgreSQL remains the source of truth.

Create:

Neo4jService
GraphSyncService
ConflictDetectionService

Graph entities should include relationships between:

Campaign
Prospect
Company
Conversation
Message
AgentRun
ResearchFact
Source
PromptVersion
Channel

Example graph:

Campaign -TARGETS-> Prospect
Prospect -WORKS_AT-> Company
Prospect -HAS_CONVERSATION-> Conversation
Conversation -CONTAINS-> Message
AgentRun -GENERATED-> Message
AgentRun -USED_SOURCE-> Source
AgentRun -USED_PROMPT-> PromptVersion
AgentRun -FOR_PROSPECT-> Prospect
Prospect -TARGETED_BY-> Campaign

After PostgreSQL writes, sync important relationship changes to Neo4j.

Build graph queries for:

- campaigns targeting a prospect
- prospect contact history
- related companies
- research sources used for an outreach decision
- cross-campaign conflicts

==================================================
18. EXPLAINABILITY
==================================================

Every meaningful agent decision should be traceable.

For example:

"Why did we send this email?"

The system should be able to show:

Campaign
  ↓
Prospect
  ↓
Research fact
  ↓
Source
  ↓
RAG context
  ↓
Prompt version
  ↓
Agent run
  ↓
Agent decision
  ↓
Message

Store this information.

Create:

AgentRun
AgentDecision
PromptVersion
AuditLog

==================================================
19. PROMPT VERSIONING
==================================================

Prompts must be versioned.

Create PromptVersion with:

- id
- agent_type
- version
- prompt_text
- configuration
- active
- created_at

Every important agent run should record the prompt version used.

Do not allow silent prompt replacement.

The architecture should support rollback to an earlier prompt version.

==================================================
20. CHANNEL ABSTRACTION
==================================================

Create:

ChannelAdapter

with implementations:

EmailAdapter
SmsAdapter
VoiceAdapter
LinkedInAdapter

For the initial build:

- EmailAdapter can be a mock/demo implementation.
- SmsAdapter can be a mock/demo implementation.
- VoiceAdapter can be a placeholder.
- LinkedInAdapter can be a placeholder.

The important part is the abstraction.

All channels should consume a common OutreachAction model.

Example:

OutreachAction:
- prospect_id
- campaign_id
- channel
- content
- scheduled_at
- metadata

Do not implement four separate brains.

One decision engine chooses the channel.

==================================================
21. DEMO MODE
==================================================

This buildathon needs a reliable live demo.

Implement DEMO_MODE.

When enabled:

- scheduled follow-ups can happen in minutes rather than days
- mock email/SMS providers can immediately generate simulated responses
- deterministic demo data can be seeded
- external API failures should not break the demo

Example:

Real:
next_followup = 2 days

Demo:
next_followup = 2 minutes

This should be controlled by configuration.

==================================================
22. SEED DATA
==================================================

Create a seed script.

Seed at least:

3 campaigns.

Campaign 1:
US SaaS CTOs

Campaign 2:
India BFSI CIOs

Campaign 3:
AI Startup Founders

Each must have:

- different ICP
- different instructions
- different target audience
- different active channels
- different campaign configuration

Seed at least 10-15 synthetic prospects.

IMPORTANT:

At least one prospect must belong to two campaigns so that cross-campaign conflict detection can be demonstrated.

Seed conversations and research facts where useful.

==================================================
23. REQUIRED API ENDPOINTS
==================================================

Implement REST APIs for:

Health:

GET /health

Campaigns:

GET /campaigns
POST /campaigns
GET /campaigns/{id}
PATCH /campaigns/{id}
POST /campaigns/{id}/pause
POST /campaigns/{id}/resume
POST /campaigns/{id}/complete

Prospects:

GET /prospects
GET /prospects/{id}
POST /prospects
GET /campaigns/{id}/prospects

Agents:

GET /agents
GET /agents/runs
GET /agents/runs/{id}

Execution:

POST /campaigns/{id}/run
POST /campaigns/{id}/discover
POST /campaigns/{id}/research
POST /campaigns/{id}/qualify
POST /campaigns/{id}/outreach

Conversations:

GET /prospects/{id}/conversations
POST /webhooks/inbound-message

Knowledge:

GET /knowledge
POST /knowledge

Analytics:

GET /campaigns/{id}/analytics
GET /dashboard/overview

Control:

POST /control/kill-switch
POST /control/kill-switch/reset

The API should return useful structured JSON.

==================================================
24. CAMPAIGN CONTROL
==================================================

Implement:

Campaign pause
Campaign resume
Agent pause
Channel pause
Global kill switch

The global kill switch must override everything.

Campaign A being paused must not stop Campaign B.

Agent pause should affect the relevant agent only.

Channel pause should prevent actions through that channel.

==================================================
25. SCHEDULED ACTIONS
==================================================

Implement ScheduledAction.

It should support:

- action type
- campaign
- prospect
- channel
- scheduled_at
- status
- metadata

Implement a simple scheduler/background worker.

Do NOT introduce Celery/Redis unless absolutely necessary.

For the initial build, a FastAPI background worker / asyncio-based scheduler is sufficient.

The architecture should allow a real queue to be added later.

==================================================
26. Dronahq INTEGRATION
==================================================

DronaHQ must be treated as a meaningful control plane.

Do NOT make DronaHQ just a pretty dashboard.

Expose backend APIs that allow DronaHQ to:

- create campaigns
- configure campaigns
- activate/pause campaigns
- view prospects
- view agent activity
- inspect agent decisions
- inspect conflicts
- inspect outreach
- trigger discovery
- trigger research
- trigger qualification
- trigger outreach
- view analytics
- trigger global kill switch

Create:

docs/dronahq-integration.md

describing exactly which APIs DronaHQ should consume.

==================================================
27. DASHBOARD DATA
==================================================

Even though we are NOT building the frontend yet, create backend endpoints that can power a dashboard.

Metrics:

- active campaigns
- total prospects
- qualified prospects
- outreach sent
- replies
- positive replies
- meetings
- opportunities
- follow-ups pending
- agent runs
- blocked actions
- conflicts detected
- channel performance

Campaign-specific analytics should be independent.

==================================================
28. TESTING
==================================================

Write meaningful tests.

At minimum test:

1. Campaign creation
2. Campaign lifecycle
3. Campaign pause
4. Campaign resume
5. Campaign independence
6. Agent pause
7. Channel pause
8. Global kill switch
9. Prospect qualification
10. Suppression
11. Contact-frequency policy
12. Daily campaign limit
13. Cross-campaign conflict
14. Structured LLM output validation
15. RAG retrieval
16. Agent run persistence
17. Prompt version tracking
18. Neo4j connectivity
19. PostgreSQL connectivity
20. Full synthetic SDR lifecycle

The most important test:

Campaign A paused
Campaign B live

Running the orchestrator must execute B while refusing execution for A.

==================================================
29. FOLDER STRUCTURE
==================================================

Use a clean modular structure similar to:

app/
    main.py

    api/
        routes/
            campaigns.py
            prospects.py
            agents.py
            conversations.py
            knowledge.py
            analytics.py
            control.py
            webhooks.py

    core/
        config.py
        logging.py
        exceptions.py

    db/
        session.py
        models/
        repositories/

    agents/
        base.py
        discovery.py
        research.py
        qualification.py
        strategy.py
        personalization.py
        conversation.py
        followup.py

    orchestration/
        graph.py
        state.py
        nodes.py
        router.py

    policy/
        engine.py
        rules.py
        conflicts.py

    llm/
        service.py
        prompts/
        schemas.py

    rag/
        loaders.py
        chunking.py
        embeddings.py
        vector_store.py
        retriever.py

    graph/
        neo4j.py
        sync.py
        queries.py

    channels/
        base.py
        email.py
        sms.py
        voice.py
        linkedin.py

    discovery/
        base.py
        mock.py
        web.py

    research/
        base.py
        mock.py
        web.py

    scheduler/
        worker.py
        service.py

    services/
        campaigns.py
        prospects.py
        conversations.py
        analytics.py

    schemas/
        ...

    seed/
        ...

tests/
    ...

docs/
    architecture.md
    dronahq-integration.md

scripts/
    seed.py

docker/
    ...

alembic/
    ...

==================================================
30. ENVIRONMENT CONFIGURATION
==================================================

Create:

.env.example

Include variables such as:

DATABASE_URL=
NEO4J_URI=
NEO4J_USERNAME=
NEO4J_PASSWORD=

LLM_PROVIDER=
LLM_API_KEY=
LLM_MODEL=

EMBEDDING_MODEL=
VECTOR_STORE=

DEMO_MODE=true
GLOBAL_KILL_SWITCH=false

DRONAHQ_BASE_URL=
DRONAHQ_API_KEY=

Do not commit secrets.

==================================================
31. DOCKER
==================================================

Create:

Dockerfile
docker-compose.yml

Local services:

- backend
- postgres
- neo4j

Make the system start with a simple:

docker compose up

or clearly document the exact commands.

==================================================
32. README
==================================================

Create/update README with:

- project overview
- architecture
- setup
- environment variables
- database setup
- migrations
- seed commands
- running locally
- running tests
- API documentation
- demo instructions
- DronaHQ integration
- Neo4j explanation
- LangGraph explanation

Include a short "5-minute demo flow."

==================================================
33. ENGINEERING PRINCIPLES
==================================================

Prioritize:

1. Working end-to-end flow
2. Reliability
3. Clear separation of concerns
4. Deterministic policy enforcement
5. Agent traceability
6. Simple deployability
7. Demoability
8. Testability

Avoid:

- overengineering
- premature microservices
- excessive abstractions
- unnecessary dependencies
- giant agent prompts
- autonomous behavior without policy checks

==================================================
34. IMPORTANT AGENT DESIGN PRINCIPLE
==================================================

The LLM is NOT the authority.

The LLM proposes:

"Send this personalized email."

The application decides:

"Is sending this email allowed?"

The PolicyEngine is authoritative.

This distinction must be visible in the code.

==================================================
35. FIRST DEMO SCENARIO
==================================================

Make sure the seeded application can demonstrate:

1. Three campaigns are LIVE.
2. Each campaign has different ICP and instructions.
3. Prospects are discovered.
4. A prospect is researched.
5. Research facts are stored with sources.
6. RAG retrieves relevant sales knowledge.
7. Prospect is qualified.
8. Outreach strategy is generated.
9. Personalized message is generated.
10. Policy engine validates the action.
11. Mock channel sends the message.
12. Agent run + decision + prompt version are persisted.
13. A synthetic response arrives.
14. Conversation agent classifies the response.
15. Follow-up is scheduled.
16. One campaign is paused.
17. Another campaign continues operating.
18. A cross-campaign conflict is detected for a shared prospect.
19. The conflicting action is blocked.
20. Global kill switch stops all outreach.

This flow must work without requiring real external customer data.

==================================================
36. IMPLEMENTATION PRIORITY
==================================================

Build in this order:

PHASE 1
Project structure
Configuration
PostgreSQL
SQLAlchemy
Alembic
Core models
Seed data

PHASE 2
FastAPI routes
Campaign lifecycle
Prospect lifecycle
Policy engine

PHASE 3
LangChain LLM abstraction
Pydantic agent schemas
LangGraph state
Agent nodes
Basic end-to-end agent workflow

PHASE 4
RAG
Knowledge base
Retriever
Research facts

PHASE 5
Neo4j
Graph synchronization
Conflict detection

PHASE 6
Channel abstraction
Mock email/SMS
Conversation webhook
Follow-up scheduler
Demo mode

PHASE 7
Analytics
DronaHQ API boundary
Tests
Documentation

Do not spend excessive time polishing things before the core workflow works.

==================================================
37. IMPORTANT OUTPUT AFTER IMPLEMENTATION
==================================================

After implementing, provide:

1. Summary of what was built
2. Repository structure
3. How to run it
4. Environment variables required
5. Database migration commands
6. Seed commands
7. How to run tests
8. API endpoint summary
9. How the LangGraph workflow works
10. How Neo4j is used
11. How RAG is used
12. How DronaHQ connects
13. Exact 5-minute demo sequence
14. Known TODOs / intentionally mocked integrations

If something cannot realistically be completed, implement a clean mock/interface rather than leaving the architecture broken.

Do not stop after creating boilerplate.

The final state must have a runnable backend with a working synthetic end-to-end SDR flow.