# PRD: Frontend Tech Debt Remediation

## Situation
The frontend has made significant progress — app-store.ts dropped from 4,268 to 1,245 lines, board-view was decomposed, 25 atoms extracted to @protolabsai/ui, and 27 Storybook stories exist. Four high/medium debt items remain: terminal-panel.tsx is 2,251 lines and a refactoring target; Storybook coverage is incomplete (no interaction tests, no Chromatic CI, 5 duplicate stories to delete); libs/ui/src/organisms/ exists but is empty with hitl-form and protolabs-report still in apps/ui/shared; and there is no a11y linting (eslint-plugin-jsx-a11y missing, @storybook/addon-a11y installed but not wired).

## Problem
terminal-panel.tsx is too large to maintain safely. The shared UI library is incomplete — organisms are missing, meaning cross-project reuse is blocked. No a11y linting means regressions go undetected. Storybook coverage gaps mean UI components lack documented states and automated visual regression testing.

## Approach
Four focused milestones, each independently shippable: (1) Wire a11y tooling — quick wins, unblocks Storybook milestone. (2) Storybook cleanup + coverage — delete duplicates, add missing atom stories, wire addon-a11y, set up Chromatic. (3) Terminal panel decomposition — extract toolbar, settings popover, and keyboard map as sub-components. (4) Organisms extraction — migrate hitl-form/* and protolabs-report/* to libs/ui/src/organisms/.

## Results
Zero remaining high/medium frontend tech debt items. Full Storybook coverage with Chromatic visual regression in CI. terminal-panel.tsx under 500 lines. libs/ui organisms populated and usable cross-project. a11y errors caught at lint time.

## Constraints
No breaking changes to component APIs — all exports must remain identical,Each phase must pass npm run typecheck and npm run lint independently,Do not touch the gods store or routing during this project,Chromatic requires a project token — add to CI secrets but do not block ship on it
