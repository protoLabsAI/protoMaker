# Release Notes

## Overview

protoLabs Studio uses an LLM-powered release notes rewriter to transform raw conventional commit messages into polished, user-facing release notes. The system has two components:

1. **Prompt template** (`libs/prompts/src/release-notes.ts`) — reusable from any TypeScript context
2. **CLI script** (`scripts/rewrite-release-notes.mjs`) — standalone runner for CI or manual use

## How It Works

```
git tags (v0.29.0..v0.30.1)
    |
    v
git log --pretty=format:"%s"
    |
    v
Filter (remove merge/chore/promote commits)
    |
    v
Claude API (Haiku) + system prompt
    |
    v
Themed, user-facing release notes
    |
    v
(optional) Discord #dev webhook embed
```

Raw commits like `feat(ui): wire file editor to upstream parity` become grouped, themed sections:

```markdown
**File Editor**

- File editor is now stable and removes its beta flag, matching upstream
  feature parity with CodeMirror syntax highlighting, multi-tab support,
  tree context menus, diff viewing, and support for 30+ languages.
```

## CLI Usage

```bash
# Auto-detect latest two tags
node scripts/rewrite-release-notes.mjs

# Specify versions explicitly
node scripts/rewrite-release-notes.mjs v0.30.1 v0.29.0

# Preview the prompt without calling Claude
node scripts/rewrite-release-notes.mjs --dry-run

# Generate and post to Discord #dev
node scripts/rewrite-release-notes.mjs --post-discord
```

### Flags

| Flag             | Description                                    |
| ---------------- | ---------------------------------------------- |
| `--dry-run`      | Print system + user prompt without calling API |
| `--post-discord` | Post result to #dev via `DISCORD_DEV_WEBHOOK`  |

### Environment Variables

| Variable              | Required | Description                          |
| --------------------- | -------- | ------------------------------------ |
| `ANTHROPIC_API_KEY`   | Yes      | Anthropic API key for Claude calls   |
| `DISCORD_DEV_WEBHOOK` | No       | Discord webhook URL for #dev channel |

## Prompt Template

The prompt lives in `libs/prompts/src/release-notes.ts` and exports:

- `RELEASE_NOTES_SYSTEM_PROMPT` — system prompt defining voice, rules, and format
- `buildReleaseNotesPrompt(input)` — builds the user prompt from version info and commits
- `ReleaseNotesInput` — TypeScript interface for the input shape

### Voice Guidelines

The system prompt enforces:

- Technical, direct, pragmatic tone — speak to builders
- No marketing fluff or AI hype words ("revolutionizing", "game-changing")
- 2-4 themed sections grouped by user impact (not raw commit categories)
- Each item: one sentence, present tense, user-facing impact
- Under 300 words total
- Plain markdown (bold headers, bullet lists)
- No emojis

### Commit Filtering

Both the prompt template and CLI script filter out:

- `merge *` — merge commits
- `chore: release*` — version bump commits
- `promote*` — promotion commits

If no meaningful commits remain after filtering, the prompt instructs Claude to write a brief maintenance release note.

## Programmatic Usage

```typescript
import { RELEASE_NOTES_SYSTEM_PROMPT, buildReleaseNotesPrompt } from '@protolabsai/prompts';

const prompt = buildReleaseNotesPrompt({
  version: 'v0.30.1',
  previousVersion: 'v0.29.0',
  commits: [
    'feat: wire file editor to upstream parity',
    'fix: dark mode for date picker and scrollbars',
  ],
});

// Feed RELEASE_NOTES_SYSTEM_PROMPT as system prompt
// and the returned prompt as user message to Claude
```

## CI Integration

The `auto-release.yml` workflow calls the rewriter script as the final step after creating the GitHub Release. The step auto-detects the previous tag and passes both versions to the script:

```yaml
- name: Rewrite and post release notes to Discord
  if: ${{ env.DISCORD_DEV_WEBHOOK != '' }}
  run: |
    VERSION="v${{ steps.version.outputs.version }}"
    PREV_TAG=$(git tag --sort=-v:refname | grep -v "^${VERSION}$" | head -1)
    node scripts/rewrite-release-notes.mjs "$VERSION" "$PREV_TAG" --post-discord
  env:
    ANTHROPIC_API_KEY: ${{ secrets.ANTHROPIC_API_KEY }}
```

The step is gated on `DISCORD_DEV_WEBHOOK` being set (defined at job level from secrets). If the webhook or API key is missing, the step is skipped gracefully.

### Enabling/Disabling

- **Enabled by default**: Wired into `auto-release.yml` — runs on every `staging->main` merge
- **Requires two secrets**: `ANTHROPIC_API_KEY` (Claude API) and `DISCORD_DEV_WEBHOOK` (Discord channel)
- **Manual runs**: `node scripts/rewrite-release-notes.mjs` locally with `ANTHROPIC_API_KEY` set
- **Disable in CI**: Remove or comment out the "Rewrite and post release notes" step in `auto-release.yml`; the GitHub Release body still contains the raw auto-generated notes from `gh release create`

## Model Selection

The CLI script uses `claude-haiku-4-5-20251001` (Haiku 4.5) for speed and cost efficiency. Release notes rewriting is a structured text task that does not require Sonnet or Opus capabilities. To change the model, edit the `model` field in the `callClaude()` function in `scripts/rewrite-release-notes.mjs`.
