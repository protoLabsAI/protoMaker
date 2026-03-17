---
name: deep-dive
description: Codex-native analysis workflow for root-cause investigation. Use for bugs, performance issues, architectural confusion, and other cases where the main deliverable is findings, not code.
---

# Deep Dive

This skill is the Codex-native replacement for the Claude `deepdive` analyst agent.

## Use This Skill When

- the user wants investigation rather than immediate code changes
- the task is to find root cause
- the task is to analyze a bug, performance issue, or system behavior
- implementation should wait until the problem is understood

## Do Not Use This Skill When

- the issue is already clear and the user wants a fix
- the task is mainly planning rather than diagnosis
- the problem is narrow enough to solve directly without an investigation pass

## Objective

Produce an evidence-backed diagnostic handoff:

- what is happening
- where it is happening
- why it is happening
- what should change next

## Workflow

1. Get bearings in the repo and relevant subsystem.
2. Define the exact problem and scope.
3. Trace behavior through code, config, logs, tests, and dependencies.
4. Form the best-supported root cause or ranked hypotheses.
5. End with a structured handoff suitable for implementation.

## Investigation Rules

- do not jump to the fix before proving the diagnosis
- cite file paths and concrete evidence
- distinguish confirmed facts from hypotheses
- note edge cases and likely blast radius
- if uncertainty remains, say exactly what is missing

## Output Structure

- task
- summary
- root cause analysis
- evidence
- recommended fix direction
- alternatives
- risks and watch-outs
- files to modify
- verification approach

## Notes

- This skill is analysis-first.
- If the user later wants implementation, use the findings as the basis for code changes rather than redoing the investigation.
