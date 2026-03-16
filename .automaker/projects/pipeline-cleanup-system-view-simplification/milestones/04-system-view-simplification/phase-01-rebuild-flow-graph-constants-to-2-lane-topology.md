# Phase 1: Rebuild flow-graph constants to 2-lane topology

**Duration**: 1-1.5 weeks
**Owner**: TBD
**Dependencies**: None
**Parallel Work**: Can run alongside other phases (if applicable)

---

## Overview

Rewrite apps/ui/src/components/views/flow-graph/constants.ts to define exactly 2 lanes: (1) Production lane at y=100 with nodes: lead-engineer-rules, auto-mode-orchestrator, agent-execution, git-workflow, pr-pipeline. (2) Integration nodes sidebar at x=1400: github-integration, discord-integration. Remove: pre-production lane (signal-sources, triage, decomposition, launch), pipeline-stages lane (backlog/in-progress/review/done stage nodes), GTM branch nodes, reflection loop nodes. Update static edge definitions and NODE_IDs exports for the new 2-lane topology.

---

## Tasks

### Files to Create/Modify

- [ ] `apps/ui/src/components/views/flow-graph/constants.ts`

### Verification

- [ ] constants.ts defines exactly 2 lanes
- [ ] No pre-production lane or pipeline-stages lane nodes
- [ ] Production lane nodes match actual running services (Lead Engineer, Auto-Mode, Agent Execution, Git Workflow, PR Pipeline)
- [ ] Static edges connect only existing node IDs
- [ ] npm run build passes

---

## Deliverables

- [ ] Code implemented and working
- [ ] Tests passing
- [ ] Documentation updated

---

## Handoff Checklist

Before marking Phase 1 complete:

- [ ] All tasks complete
- [ ] Tests passing
- [ ] Code reviewed
- [ ] PR merged to main
- [ ] Team notified

**Next**: Phase 2
