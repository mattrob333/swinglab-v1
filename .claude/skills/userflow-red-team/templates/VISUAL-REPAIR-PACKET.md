# Visual Repair Packet

Create this packet for material visual or interaction findings.

## Finding
[UFR-### - short title]

## User
[Persona]

## Job-to-Be-Done
[Outcome]

## Severity
[Classification]

## Screen / Route
[Location]

---

## 1. Actual Screen

Insert or link the driver's screenshot:

`agents/<ID>/screens/<NNN>-<session>-<viewport>.png` (copy it to `artifacts/UFR-###-actual.png` for the report)

Label:

`ACTUAL APPLICATION SCREEN`

### What the User Sees
Describe only what is actually visible.

### What Is Wrong
Explain the observable friction, ambiguity, or failure.

### Likely User Interpretation
What might a reasonable user believe this screen means?

---

## 2. Annotated Actual Screen

Insert or link:

`artifacts/UFR-###-annotated.png`

Label:

`ANNOTATED ACTUAL SCREEN`

Use numbered callouts for:

1. unclear primary action
2. competing CTAs
3. hidden navigation
4. misleading terminology
5. missing context
6. poor hierarchy
7. dangerous action placement
8. state information that should be more prominent

Do not alter the screenshot in a way that misrepresents the original UI.

---

## 3. Jev Judgment

**Question:**

**Context:**

**Result:**

**Confidence:**

**Interpretation:**

If Jev was unavailable, write `JEV NOT EXECUTED`.

---

## 4. Root Cause

Identify whether the problem primarily originates in:

- business logic
- state model
- information architecture
- user flow
- screen layout
- copy / terminology
- visual hierarchy

Fix upstream causes before visual polish.

---

## 5. Proposed Concept

Insert or link:

`artifacts/UFR-###-proposed.png`

Label:

`PROPOSED CONCEPT - NOT CURRENT APPLICATION`

### Required Design Context

**Application:**

**User:**

**User Goal:**

**Existing Problem:**

**Information That Must Remain:**

**Primary Action:**

**Secondary Actions:**

**Desired User Understanding:**

**Existing Design Language:**

### Image Generation Prompt

Generate a product UI concept that preserves the application's existing visual language while correcting the workflow problem described above. Make the intended primary action visually obvious, preserve required context, reduce competing choices, and represent the corrected product state. Do not invent unrelated functionality. This is a concept mockup, not an actual screenshot.

---

## 6. Implementation Notes

Describe the actual product behavior required behind the concept.

A mockup alone is not a fix.

Include:

- state transition changes
- component changes
- copy changes
- API or backend changes
- permission changes
- data requirements
- responsive behavior

---

## 7. Acceptance Test

Define the exact conditions under which this issue is considered fixed.

Example:

Given an advisor has completed research and reaches sufficient coverage, when they open Discovery, then the primary action is Prepare Client Kickoff, secondary research review actions remain available but visually subordinate, and completing the action transitions the workflow into Kickoff Preparation without losing state.

---

## 8. Retest Evidence

### Before
`artifacts/UFR-###-actual.png`

### After Implementation
Rerun the same steps with `browser.mjs --fresh --label retest` and link that screenshot (copy to `artifacts/UFR-###-after.png`).

### Result
PASS / PARTIAL / FAIL
