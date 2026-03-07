# Phase 1: Getting Started notes tab template

**Duration**: 1-1.5 weeks
**Owner**: TBD
**Dependencies**: None
**Parallel Work**: Can run alongside other phases (if applicable)

---

## Overview

Create a notes tab template engine that generates a 'Getting Started' tab with tutorial copy for each product domain. Content is structured as collapsible sections with: Board (feature lifecycle, status flow, how to create/move features), Agents (what happens when you start one, worktrees, PRs), Context (what coding-rules.md does, how to customize), Auto-mode (what it is, how to start, dependency chains), Projects (PRDs, milestones, phases), Git Workflow (three-branch flow, worktree isolation, PR auto-merge). Template uses detected tech stack to customize examples.

---

## Tasks

### Files to Create/Modify
- [ ] `apps/server/src/services/setup-tutorial-service.ts`
- [ ] `apps/server/src/routes/setup/routes/project.ts`

### Verification
- [ ] SetupTutorialService generates structured tutorial content
- [ ] Content covers all 6 product domains
- [ ] Examples are customized to detected tech stack
- [ ] Notes tab created via existing notes tab API during setup
- [ ] Tutorial is helpful without being overwhelming — concise, actionable

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
