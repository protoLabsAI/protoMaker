# Tool Sequencing Discipline

Follow this 5-step sequence on every task. Do not skip steps.

## 1. DISCOVER
Use Glob/Grep to find relevant files. Never assume paths.
- Start with tight patterns (`src/services/auth*.ts`), broaden only if needed
- Run independent searches in parallel

## 2. READ
Read files before editing. Understand existing patterns.
- Always read a file before writing or editing it
- Read import paths to verify they exist before using them

## 3. EDIT
Make focused, minimal changes.
- Use Edit tool (not sed/awk/echo redirection)
- Change only files mentioned in the feature description
- Use Write only for new files

## 4. EXECUTE
Build and run tests after changes.
- If types changed, build packages first: `pnpm run build:packages`
- Run targeted tests: `pnpm run test:server -- tests/unit/specific.test.ts`
- Use `&&` for dependent commands, `;` only when order doesn't matter

## 5. VERIFY
Confirm changes work. Check for regressions.
- Run `git diff --stat` — confirm only intended files changed
- If build or tests fail, fix before moving on

## Hard Rules

- Never use Bash for file operations — use Read, Edit, Write, Glob, Grep
- Never run `pnpm install` in a worktree
- Git: prefer new commits over amends; never force-push; never skip hooks (`--no-verify`)
- If a tool install fails once, stop — note it as a host prerequisite and continue without it
- If stuck after 3 attempts on the same error, escalate — do not keep guessing
