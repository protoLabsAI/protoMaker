# Gate Formalization

Formalize portfolio and execution gates with real criteria, and decide on authority enforcement model — moving from advisory-only to actionable governance.

**Status:** active
**Created:** 2026-03-10T09:32:07.556Z
**Updated:** 2026-03-10T12:51:59.522Z

## PRD

### Situation

The system has a trust/risk authority model that evaluates proposals but executeAction() is a placeholder. There is no explicit portfolio gate (should we fund this work?) and the execution gate (safe to run now?) only checks dependencies. The research recommends separating work generation from work execution with explicit gate criteria.

### Problem

Without a portfolio gate, any idea that reaches the board can consume agent compute. Without an execution gate that checks review bandwidth, error budget, and CI capacity, the system can launch agents into a saturated pipeline. Without authority enforcement, the trust tier system is monitoring without teeth — agents can take actions beyond their trust level.

### Approach

Three milestones: (1) Portfolio gate that evaluates strategic fit, complexity vs capacity, and cost-of-delay before features enter planning, (2) Execution gate that checks review queue, error budget, and CI readiness before agent launch, (3) Authority enforcement decision — implement executeAction() or explicitly document advisory-only model.

### Results

Features pass a portfolio gate before consuming compute. Agents only launch when pipeline capacity exists. Authority system either enforces or is clearly documented as advisory. Measurable reduction in wasted compute and review saturation.

### Constraints

Portfolio gate must not block well-defined features that arrive via auto-mode (only applies to new ideas from signals). Execution gate must integrate with existing ExecuteProcessor pre-flight flow. Authority enforcement decision requires human input on philosophy (enforcement vs advisory).

## Milestones

### 1. Portfolio Gate

Evaluate ideas before they consume compute.

**Status:** pending

#### Phases

1. **Add portfolio gate to signal intake** (medium)

### 2. Execution Gate

Check pipeline capacity before launching agents.

**Status:** completed

#### Phases

1. **Add execution gate to ExecuteProcessor** (medium)

### 3. Authority Enforcement

Decide and implement: enforcement or advisory.

**Status:** pending

#### Phases

1. **Implement authority enforcement with audit trail** (large)
