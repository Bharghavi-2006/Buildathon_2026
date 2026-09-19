Do **not** rewrite the architecture or replace the existing stack.

The next task is to implement the actual **Manager and Representative workflows**, RBAC, representative assignment/matching, approval queues, monitoring, and the DronaHQ integration boundary.

The product must feel like **one SDR operating system**, not a collection of disconnected agents.

---

# 1. Core Product Roles

Implement two authenticated roles:
```
MANAGER
REPRESENTATIVE
```

Use RBAC throughout the API.

## Manager

Managers can:

- &#x20;create campaigns&#x20;
- &#x20;configure campaigns&#x20;
- &#x20;define ICP&#x20;
- &#x20;configure agents&#x20;
- &#x20;configure channels&#x20;
- &#x20;configure prompts&#x20;
- &#x20;source prospects&#x20;
- &#x20;approve/reject prospect batches&#x20;
- &#x20;select prospects&#x20;
- &#x20;view all representatives&#x20;
- &#x20;see representative capacity&#x20;
- &#x20;receive AI representative recommendations&#x20;
- &#x20;assign representatives to campaigns&#x20;
- &#x20;assign specific leads to representatives&#x20;
- &#x20;reassign leads&#x20;
- &#x20;monitor representative performance&#x20;
- &#x20;pause/resume campaigns&#x20;
- &#x20;pause/resume agents&#x20;
- &#x20;pause/resume channels&#x20;
- &#x20;use global kill switch&#x20;
- &#x20;view cross-campaign analytics&#x20;
- &#x20;configure global settings&#x20;
- &#x20;manage team permissions&#x20;

## Representative

Representatives can only access:

- &#x20;their assigned campaigns&#x20;
- &#x20;their assigned prospects/leads&#x20;
- &#x20;their approval queue&#x20;
- &#x20;their conversations&#x20;
- &#x20;their outreach drafts&#x20;
- &#x20;follow-up tasks&#x20;
- &#x20;escalations&#x20;
- &#x20;their own performance&#x20;

Representatives must NOT be able to:

- &#x20;change ICP&#x20;
- &#x20;change campaign prompts&#x20;
- &#x20;change campaign agent configuration&#x20;
- &#x20;change campaign channels&#x20;
- &#x20;pause campaigns&#x20;
- &#x20;activate campaigns&#x20;
- &#x20;use global kill switch&#x20;
- &#x20;change global suppression rules&#x20;
- &#x20;see other representatives' private performance data&#x20;

Campaign configuration visible to representatives should be read-only.