# Jev Question Bank

Use this as a base library. Select only questions relevant to the current user, screen, state, and decision.

## Orientation

- Can this user determine where they are?
- Can this user determine what this screen is for?
- Can this user determine what they are expected to do next?
- Does the screen provide enough context for the next decision?

## Action Clarity

- What action would this user most likely take next?
- Is the intended primary action obvious?
- Are multiple actions competing for attention?
- Does the control label accurately predict what will happen?
- Is the visual hierarchy consistent with the workflow hierarchy?

## Workflow Logic

- Does this step logically follow the previous step?
- Does the user have the information required to make this decision?
- Is the application asking the user to decide too early?
- Is an important step missing?
- Is the sequence unnecessarily complicated?
- Could this step be automated instead of delegated to the user?

## Ambiguity

- Could two reasonable users interpret this screen differently?
- Is terminology unclear to this persona?
- Are multiple next steps presented without enough guidance?
- Is the difference between the available choices obvious?

## Completion

- Does this flow terminate in a meaningful success state?
- Can the user tell the task is complete?
- Does the result satisfy the original job-to-be-done?
- Is another step silently required after apparent completion?
- Does the product clearly communicate what happens next?

## Dead Ends

- Can the user reach a screen with no reasonable next action?
- Can the user become trapped in an incomplete state?
- Is there a valid path back or forward?
- Can the user recover from an incorrect choice?

## State Consistency

- Does the interface accurately reflect underlying state?
- Can contradictory states exist simultaneously?
- Can an action be repeated when it should be idempotent?
- Can the user perform an action that should no longer be allowed?
- Does refresh or re-entry preserve the correct state?

## Error Handling

- What happens if this operation fails?
- Does the user understand what failed?
- Does the user know how to recover?
- Is previous work preserved?
- Can the operation safely be retried?

## Data Requirements

- Does the application request information it already has?
- Does the user have access to the information being requested?
- Are required fields genuinely required?
- Are important fields missing?
- Is information requested at the correct stage?

## Permissions

- Should this user see this information?
- Should this user be allowed to modify this object?
- Could this user accidentally perform an administrative action?
- Could permission restrictions unexpectedly break the flow?

## Cognitive Load

- Is the user being asked to understand too much at once?
- Are unnecessary decisions presented?
- Could the system make a reasonable default decision?
- Is the user being forced to understand internal architecture?

## Confidence

- How confident are we that the intended next action is understandable?
- How confident are we that this flow produces the expected outcome?
- What missing evidence prevents higher confidence?

## Cross-User Handoff

- Does the receiving user understand why this task exists?
- Does the receiving user know what is required?
- Does the receiving user have enough context to act correctly?
- Does completion return the workflow to the correct owner and state?

## Product-Specific Expansion

Add domain questions based on the product. Examples:

- Does this recommendation contain enough evidence for the user to trust it?
- Does this construction takeoff result trace back to a source page?
- Does this approval preserve separation-of-duties rules?
- Does this AI-generated output clearly distinguish observed facts from inference?
