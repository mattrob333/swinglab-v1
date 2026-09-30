# Treg External Validation Playbook

Use this playbook when treg is available to the coding agent.

Treg is a capability router for external tools and data providers. In this UserFlow Red Team system, its purpose is to **independently validate real-world outcomes and supply realistic external data**, not to replace browser testing.

## First-time setup / discovery

Prefer the environment's existing treg MCP or CLI integration.

If the agent needs current setup instructions, read:

`https://treg.to/llms.txt`

Do not hardcode assumptions about the catalog. Discover the capability needed for the current test.

## Capability-selection routine

1. Define the external fact or action that needs validation.
2. Search by capability/job, not by favorite vendor.
3. Prefer a connected first-party account when validating the user's own external system.
4. Prefer read-only calls for validation.
5. If multiple providers exist, compare relevance, freshness, success rate, latency, and price where exposed.
6. Use the minimum number of calls needed to establish evidence.
7. Record the provider and endpoint/capability used in the audit evidence.

## High-value UserFlow Red Team uses

### 1. Verify external side effects

Use the application normally, then independently inspect the destination.

Examples:

- App says "Slack message sent" → read the actual Slack channel.
- App says analytics conversion recorded → query the connected GA4 property.
- App says tracking configured → inspect GTM tags/triggers/container state.

This tests the difference between **reported success** and **real success**.

### 2. Validate integration data quality

For apps that enrich companies, people, websites, markets, or public entities, compare important application output against one or more external sources.

Use this to detect:

- stale data
- identity-resolution errors
- missing fields
- impossible values
- provider-specific blind spots
- false confidence in inferred data

Do not expect different providers to be identical. Investigate provenance and freshness before declaring a failure.

### 3. Create realistic edge cases

Use external data to find examples that stress the product:

- tiny company vs global enterprise
- company with incomplete public data
- person with ambiguous identity
- domain with redirects or unusual structure
- records with missing fields
- conflicting data between providers

Use public or authorized data only.

### 4. Validate analytics and observability

Where authorized, use connected analytics tools to confirm:

- events fire
- conversions/key events are recorded
- routes or pages receive expected traffic
- device or channel dimensions are populated
- tracking changes propagate as expected

Browser assertions alone cannot prove downstream analytics ingestion.

### 5. Validate notifications and handoffs

If a user-flow ends with a message, notification, or collaboration handoff, inspect the destination system when treg supports it.

Confirm destination, actor, timestamp, content, links, duplicates, and thread/context.

### 6. Public-web and market reality checks

When the product makes a claim derived from public data, use external search/crawl/research providers to validate freshness and coverage.

This is useful for apps that depend on research, company intelligence, SEO/AEO, public profiles, social data, or market data.

Do not add market research unless it materially tests a product assumption or user outcome.

### 7. Visual remediation fallback

If GPT Image or another preferred image-generation system is unavailable, treg may expose image-generation providers for **PROPOSED CONCEPT** mockups. Generated images are conceptual only.

### 8. Provider resilience tests

If the application is designed to be provider-agnostic, treg can help compare equivalent provider outputs for schema assumptions, null handling, pagination differences, field names, confidence semantics, or degraded responses.

Only do this when provider portability is actually a product requirement.

## What treg must NOT replace

Treg does not replace:

- Playwright/browser testing
- the application's own API path
- repository inspection
- Jev judgment
- database/state inspection
- direct implementation evidence

Bad test:

> "The app has a Slack integration. I used treg to post to Slack successfully, therefore the app integration passes."

Correct test:

> "I used the app's Slack workflow. The app claimed success. Then I used treg as an independent reader and verified the correct message appeared in the correct channel."

## Write safety

Default to read-only validation. Only use writes when the assignment authorizes it, the target is safe, and the action will not message real customers, alter production campaigns, spend money unexpectedly, or modify important external data without permission.

## Cost discipline

Some catalog calls are paid. Before paid use, inspect the quoted price, prefer the cheapest adequate read-only validation, avoid unnecessary batch calls, and record material external-test cost in the report.

## Report format

### External Validation: [Name]

**Related test:** agent-local finding ID (A2-003) until merge, then the global UFR-### ID

**Application claim:**

**External destination/source:**

**Treg capability/provider:**

**Validation mode:** READ / WRITE / COMPARE

**Result:** MATCH / PARTIAL / MISMATCH / NOT VERIFIED

**Observed evidence:**

**Cost, if material:**

**Interpretation:**

**Caveats:**
