# @protolabs-ai/tools

## 0.5.0

### Minor Changes

- ### Features
  - escalation dedup persistence and pipeline state drift fix (#1327)
  - wire missing escalation channels and Discord DM/Linear acknowledgment (#1324)
  - Wiring, Escalation & Hardening (#1323)
  - critical + high pipeline bug fixes — verify gate hold, GTM signal, dep resolver (#1319)
  - signal-aware channel router — Discord + GitHub gate holds (#1320)

  ### Bug Fixes
  - pin deploy-staging to [self-hosted, staging] runner label (#1333)
  - fix 4 electron/action failures — step order, windows quoting, stale SHAs (#1331)
  - normalize HUSKY=0 in worktree-recovery-service execEnv (#1329)
  - memory files use merge=ours to prevent stale agent memory conflicts on rebase
  - add workflow_dispatch to checks.yml for manual trigger on epic branches
  - remove branches filter so CI runs on all PRs including epic/\* branches

  ### Refactors
  - decompose wiring.ts into self-registering service modules (#1328)
  - AntagonisticReviewService wiring and EM Agent guard (#1325)

### Patch Changes

- Updated dependencies
  - @protolabs-ai/types@0.5.0

## 0.4.0

### Minor Changes

- ### Features
  - component library panel for PEN design editor (#1089)
  - property editing and file save for PEN design inspector (#1088)
  - Grafana alerting rules with Discord notification pipeline (#1087)
  - regenerate site stats with accurate PR count and date cutoff (#1086)
  - node selection and property inspector panel for designs view (#1085)

### Patch Changes

- Updated dependencies
  - @protolabs-ai/types@0.4.0

## 0.3.0

### Patch Changes

- Updated dependencies [3e55d9f]
  - @protolabs-ai/types@0.3.0
