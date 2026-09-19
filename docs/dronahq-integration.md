# DronaHQ integration

Use a REST connector to call `/campaigns` for controls, `/campaigns/{id}/prospects` for tables, `/agents/runs` for trace views, the campaign research/qualify/outreach routes for actions, `/campaigns/{id}/analytics` and `/dashboard/overview` for charts, and `/control/kill-switch` for the emergency control. Send replies to `/webhooks/inbound-message`.

The connector must propagate the authenticated identity as `X-User-Email`. The backend, not DronaHQ, resolves the role and enforces access: managers use team, matching, assignment, approval, monitoring, configuration, and campaign-control endpoints; representatives use only `/me/*` assignment-scoped endpoints. This keeps DronaHQ a UI/control boundary and prevents it from becoming an authorization authority. The header is a demo adapter; production integrations should map an OIDC/JWT subject to the same `User` and `AccessProfile` records.
