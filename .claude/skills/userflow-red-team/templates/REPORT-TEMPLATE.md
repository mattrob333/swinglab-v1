# UserFlow Red Team Report

Write this as `report/REPORT.md` in the run folder, after `merge.mjs` reports no merge problems. Use global `UFR-###` IDs from `report/ledger.md`. Screenshot paths are relative to the run folder (for example `agents/A2/screens/014-advisor-desktop.png`).

## 1. Executive Summary

### Product
[Name / version / commit / environment]

### Audit Scope
[What was tested]

### Browser Environment
[Driver (browser.mjs / MCP / repo suite), Playwright version and Chromium launch from run.json, viewports]

### Execution Mode
[Sequential / parallel sub-agents: list agent IDs, personas, data boundaries, and any agent that ended blocked or was recovered from its reply]

### Jev Status
[Connected / not connected / partial]

### Treg External Validation Status
[Connected / not connected / partial / not needed]

### Overall Verification Coverage
- EXECUTED - PASS: [count]
- EXECUTED - FAIL: [count]
- EXECUTED - PARTIAL: [count]
- CODE-REVIEW ONLY: [count]
- UNTESTED: [count]

### Most Important Findings
[Use representative actual screenshots for the most material issues]

---

## 2. Product Model

### Product Purpose

### Primary Business Outcome

### Major Inputs

### Major Outputs

### Key Workflow States

---

## 3. Persona Inventory

| Persona | Context | Primary Job-to-Be-Done | Entry Point | Expected End State |
|---|---|---|---|---|

---

## 4. Flow Inventory

### Flow: [Name]

USER
-> ENTRY
-> STEP
-> DECISION
-> STEP
-> RESULT

**Verification:** EXECUTED - PASS / FAIL / PARTIAL / CODE-REVIEW ONLY / UNTESTED

---

## 5. Persona Test Reports

# Persona: [Name]

## Primary Job-to-Be-Done

## Flows Tested

## Overall Journey

ENTRY
-> STEP
-> STEP
-> RESULT

## Successful Tests

| Test ID | Flow | Result | Evidence |
|---|---|---|---|

## Failed Tests

| Severity | Test ID | Location | Failure | User Impact | Evidence |
|---|---|---|---|---|---|

## Ambiguities

| Location | User Question | Why Ambiguous | Recommended Fix |
|---|---|---|---|

## Dead Ends

| Location | Entry Path | Dead End | Required Recovery |
|---|---|---|---|

## Logic and State Problems

| State | Problem | Expected Behavior | Actual Behavior |
|---|---|---|---|

## Jev Findings

For material judgments include:

- Question
- Context
- Jev result
- Confidence
- Interpretation

---

## 6. Cross-User Handoffs

| Origin Persona | Receiving Persona | Handoff | Result | Problem |
|---|---|---|---|---|

---

## 6A. External Reality Validation

| Related Test | Application Claim | External System / Source | Treg Capability / Provider | Result | Evidence |
|---|---|---|---|---|---|

Use result values: MATCH / PARTIAL / MISMATCH / NOT VERIFIED.

For material mismatches include what the application reported, what the external system actually contained, timestamps and IDs where safe, provider/source used, whether freshness or identity-resolution differences could explain the mismatch, and material cost.

---

## 7. Finding Register

# [UFR-001] Finding Name

**Severity:** BLOCKER / LOGIC FAILURE / DEAD END / STATE FAILURE / PERMISSION FAILURE / AMBIGUITY / MISSING STEP / REDUNDANT STEP / POOR FEEDBACK / RECOVERY FAILURE / EDGE CASE / UX FRICTION / POLISH

**Evidence Label:** OBSERVED / INFERRED / UNKNOWN

**User:**

**Job-to-Be-Done:**

**Location:**

**Actual Screenshot:**
`agents/<ID>/screens/<NNN>-<session>-<viewport>.png`

**Problem:**

**User Impact:**

**Expected Behavior:**

**Actual Behavior:**

**Jev Judgment:**

**Root Cause:**

**Recommended Change:**

**Proposed Concept:**
`artifacts/UFR-001-proposed.png` or N/A

**Acceptance Test:**

**Retest Status:** PASS / PARTIAL / FAIL / NOT RETESTED

---

## 8. Dead-End Inventory

| ID | Persona | Location | Entry Path | Recovery Available? |
|---|---|---|---|---|

---

## 9. Ambiguity Inventory

| ID | Persona | Location | Ambiguity | Risk |
|---|---|---|---|---|

---

## 10. State-Machine Problems

| ID | Current State | Action | Expected Next State | Observed Next State |
|---|---|---|---|---|

---

## 11. Permission Problems

| ID | Persona | Object / Action | Expected Permission | Observed Permission |
|---|---|---|---|---|

---

## 12. Automation Opportunities

| Current Manual Step | Why It Exists | Could Be Automated? | Recommendation |
|---|---|---|---|

---

## 13. Highest-Leverage Fixes

Group related symptoms by root cause rather than listing every symptom independently.

### Root Cause A
Affected findings: UFR-001, UFR-004, UFR-011

Recommended systemic fix:

### Root Cause B
...

---

## 14. Retest Plan

| Priority | Flow | Persona | Starting State | Acceptance Criteria |
|---|---|---|---|---|

---

## 15. Evidence Appendix

Run folder: `.userflow-redteam/runs/<run-id>/`. List the ledger, per-agent `actions.jsonl` logs, screenshots and accessibility snapshots cited above, logs, routes, network traces, source references, annotated and proposed images in `artifacts/`, and the local-to-global ID map (`report/id-map.json`).
