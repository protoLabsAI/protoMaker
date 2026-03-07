# Phase 1: Standalone setup CLI package

**Duration**: 2+ weeks
**Owner**: TBD
**Dependencies**: None
**Parallel Work**: Can run alongside other phases (if applicable)

---

## Overview

Create packages/setup-cli/ — a lightweight Node.js CLI that bundles repo-research-service, gap-analysis-service, report-generator-service, and the new proto.config writer. Runs without a server or API key. Entry point: npx @protolabsai/setup (or npx protolabs-setup). Accepts a path argument (defaults to cwd). Outputs proto.config.yaml, .automaker/ structure, and HTML report. Does NOT create notes tabs or board features (those require the server).

---

## Tasks

### Files to Create/Modify
- [ ] `packages/setup-cli/package.json`
- [ ] `packages/setup-cli/src/index.ts`
- [ ] `packages/setup-cli/src/cli.ts`
- [ ] `package.json`

### Verification
- [ ] CLI runs standalone with no server dependency
- [ ] npx protolabs-setup . works end-to-end
- [ ] Generates proto.config.yaml, .automaker/ structure, HTML report
- [ ] Opens HTML report in default browser
- [ ] Clean terminal output with progress indicators
- [ ] No API key required
- [ ] Package publishable to npm

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
