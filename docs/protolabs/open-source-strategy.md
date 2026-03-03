# Open source strategy

Internal planning document for the protoLabs Studio open-source launch.

**Repository:** `proto-labs-ai/protoMaker` (currently private)
**License:** MIT (already in place)

---

## Executive summary

protoLabs Studio is going open source. We are making the repository public under the MIT license because we believe in transparency, want to build community trust, and our revenue model (consulting, content) benefits from open visibility rather than closed gates.

What makes our model different from a typical open-source project: **we welcome ideas but do not accept code contributions.** Our development workflow is AI-native -- a team of AI agents implements all features internally, executing in isolated git worktrees on self-hosted infrastructure. This means traditional pull-request-based contribution models do not apply. External contributors shape our roadmap through ideas, bug reports, and discussions. We handle the implementation.

This is not unprecedented. Linear, Tailscale, Vercel/Next.js, and Raycast all operate successful projects where the core team retains implementation control while actively incorporating community feedback. Our twist is that the "core team" includes AI agents, and our self-hosted CI runners create hard security constraints that make external code execution impossible to safely support.

### Why open source

1. **Transparency.** People building with AI-native tools deserve to see how those tools work.
2. **Community.** Ideas from real users are the best product input. Open source makes the feedback loop shorter.
3. **Consulting revenue model.** Our business is teaching others to set up their own proto labs. Open code is the best advertisement.
4. **Trust.** Closed-source AI tooling faces justified skepticism. Open code is the antidote.

---

## GitHub configuration (day 1)

Everything in this section should be completed before or at the moment the repository goes public.

### Repository settings

| Setting                         | Value                                          |
| ------------------------------- | ---------------------------------------------- |
| Visibility                      | Public                                         |
| Discussions                     | Enabled (categories below)                     |
| Secret scanning                 | Enabled                                        |
| Push protection                 | Enabled                                        |
| CodeQL                          | Enabled (JavaScript/TypeScript)                |
| Private vulnerability reporting | Enabled                                        |
| Fork PRs                        | Require approval for all outside collaborators |
| Branch protection               | Restrict pushes to team members only           |

### Discussion categories

| Category      | Purpose                                                  |
| ------------- | -------------------------------------------------------- |
| Ideas         | Feature requests and improvement suggestions             |
| Q&A           | Usage questions, setup help, troubleshooting             |
| Show and Tell | Community projects, screenshots, demos                   |
| Announcements | Releases, milestones, roadmap updates (maintainers only) |

### Issue templates

Three files in `.github/ISSUE_TEMPLATE/`:

**`bug_report.yml`** -- Structured bug report form:

- OS and version (dropdown: macOS, Windows, Linux)
- Node.js version (text)
- protoLabs Studio version or commit (text)
- Steps to reproduce (textarea, required)
- Expected behavior (textarea, required)
- Actual behavior (textarea, required)
- Logs / screenshots (textarea, optional)

**`idea.yml`** -- Feature idea form:

- Problem statement (textarea, required: "What problem does this solve?")
- Proposed solution (textarea, required: "How do you envision this working?")
- Area (dropdown: Frontend, Agents, Git/Worktrees, API/Server, Orchestration, Documentation, Other)
- Additional context (textarea, optional)

**`config.yml`** -- Disable blank issues, add external links:

```yaml
blank_issues_enabled: false
contact_links:
  - name: Discord
    url: https://discord.gg/protolabs-studio
    about: Chat with the team and community
  - name: Discussions
    url: https://github.com/proto-labs-ai/protoMaker/discussions
    about: Ideas, Q&A, and general conversation
```

### Auto-close external PRs workflow

This is the most important automation. Because we use self-hosted runners, external code must never execute in our CI pipeline.

```yaml
# .github/workflows/close-external-prs.yml
name: Close External PRs
on:
  pull_request_target:
    types: [opened]
permissions:
  pull-requests: write
jobs:
  close-if-external:
    runs-on: ubuntu-latest
    if: github.event.pull_request.head.repo.full_name != github.repository
    steps:
      - name: Close PR with friendly message
        uses: actions/github-script@v7
        with:
          script: |
            const message = `Hey @${context.payload.pull_request.user.login} — thanks for your interest in protoLabs Studio!

            We don't accept external pull requests. Our AI-native team handles all implementation internally, and we use self-hosted CI that can't safely run external code.

            **Here's how you can contribute:**
            - Feature ideas: [Discussions](https://github.com/${context.repo.owner}/${context.repo.repo}/discussions/new?category=ideas)
            - Bug reports: [Issues](https://github.com/${context.repo.owner}/${context.repo.repo}/issues/new?template=bug_report.yml)
            - Chat with us: [Discord](https://discord.gg/protolabs-studio)

            Your ideas shape our roadmap. We just implement them differently.`;
            await github.rest.issues.createComment({
              owner: context.repo.owner,
              repo: context.repo.repo,
              issue_number: context.payload.pull_request.number,
              body: message
            });
            await github.rest.pulls.update({
              owner: context.repo.owner,
              repo: context.repo.repo,
              pull_number: context.payload.pull_request.number,
              state: 'closed'
            });
            await github.rest.issues.addLabels({
              owner: context.repo.owner,
              repo: context.repo.repo,
              issue_number: context.payload.pull_request.number,
              labels: ['external-pr', 'auto-closed']
            });
```

### Auto-triage workflow

```yaml
# .github/workflows/triage.yml
# Triggers on: issues opened, discussion created
# Actions:
#   - Add 'needs-triage' label to new issues
#   - Add 'community' label if author is not a team member
#   - Welcome message for first-time contributors
#   - Route bug reports vs ideas to appropriate labels
```

### Stale issue management

```yaml
# .github/workflows/stale.yml
# Schedule: daily
# Configuration:
#   - 60-day inactivity warning
#   - 14-day grace period after warning
#   - Exempt labels: 'accepted', 'priority:critical', 'priority:high'
#   - Stale label: 'stale'
#   - Close message: "Closing due to inactivity. Reopen if still relevant."
```

### CONTRIBUTING.md rewrite

The current CONTRIBUTING.md needs to be replaced with a concise version (~100-150 lines) that:

1. **Leads with the model.** First paragraph: "We welcome ideas, bug reports, and feedback. We do not accept pull requests."
2. **Explains why.** Self-hosted runners, AI-native workflow, security constraints.
3. **Shows the path.** How an idea becomes a feature: submit idea -> team triage -> Automaker board -> AI agent implements -> credit in changelog.
4. **Lists contribution channels.** Ideas (Discussions), bugs (Issues), chat (Discord), documentation feedback, use case stories.
5. **Describes the contribution license.** MIT applies to all submitted content.

### SECURITY.md

New file at repository root:

- Preferred reporting: GitHub private vulnerability reporting
- Backup channel: Discord DM to maintainer
- Response SLA: acknowledge within 48 hours, fix within 90 days
- Scope: the protoLabs Studio application (server, UI, CLI, MCP tools)
- Out of scope: third-party dependencies (report upstream), social engineering, DoS

### CODEOWNERS

```
# Sensitive paths require core team review
/.github/workflows/        @proto-labs-ai/core
/.env*                     @proto-labs-ai/core
/apps/server/src/lib/auth* @proto-labs-ai/core
/packages/mcp-server/      @proto-labs-ai/core
```

---

## Security quarantine pipeline (implemented)

The quarantine pipeline is **fully implemented and shipped**. This section documents the current state for reference.

### Architecture

All external input passes through a 4-stage validation pipeline (`QuarantineService` in `apps/server/src/services/quarantine-service.ts`):

```
External Submission
  |
  v
Stage 1: Gate
  - Trust tier check (bypass, advisory, or full validation)
  - Tier >= 3: bypass all stages
  - Tier 2: advisory mode (warnings logged but don't block)
  - Tier <= 1: full validation
  |
  v
Stage 2: Syntax
  - Unicode normalization (NFC)
  - Title length validation (1-200 chars)
  - Description length validation (1-10,000 chars)
  - Null byte detection and removal
  - Control character detection
  |
  v
Stage 3: Content
  - Markdown sanitization for LLM safety
  - Prompt injection detection (pattern matching)
  |
  v
Stage 4: Security
  - File path validation
  - Path traversal prevention
  - Project root boundary enforcement
```

### Trust tier system (implemented)

Trust tiers are defined in `libs/types/src/quarantine.ts`:

| Tier | Name        | Description                           | Validation mode |
| ---- | ----------- | ------------------------------------- | --------------- |
| 0    | Anonymous   | External, unknown source              | Full validation |
| 1    | GitHub user | Verified GitHub account, opened issue | Full validation |
| 2    | Contributor | Past merged contribution via idea     | Advisory mode   |
| 3    | Maintainer  | Team member                           | Bypass          |
| 4    | System      | Internal/MCP/CLI, full trust          | Bypass          |

Trust tier management is available via API (`/api/quarantine/trust-tiers/`) and documented in `docs/server/quarantine-pipeline.md`.

### Implemented components

| Component                            | Location                                         |
| ------------------------------------ | ------------------------------------------------ |
| Quarantine types                     | `libs/types/src/quarantine.ts`                   |
| Sanitization utilities               | `libs/utils/src/sanitize.ts`                     |
| QuarantineService (4-stage pipeline) | `apps/server/src/services/quarantine-service.ts` |
| TrustTierService                     | `apps/server/src/services/trust-tier-service.ts` |
| API routes                           | `apps/server/src/routes/quarantine.ts`           |
| Feature creation quarantine gate     | `apps/server/src/routes/features.ts`             |
| Unit tests                           | `apps/server/tests/unit/quarantine-*.test.ts`    |
| Sanitization tests                   | `libs/utils/tests/sanitize.test.ts`              |
| Pipeline documentation               | `docs/server/quarantine-pipeline.md`             |
| Contribution model documentation     | `docs/dev/contribution-model.md`                 |

---

## Self-hosted runner security

This section documents why we cannot accept external PRs and what we are doing to harden our CI pipeline.

### Why external code cannot run on our runners

GitHub's own documentation states: **"We recommend that you only use self-hosted runners with private repositories."** Our reasons are specific and technical:

| Risk                   | Description                                                                                                 |
| ---------------------- | ----------------------------------------------------------------------------------------------------------- |
| Crypto mining          | Persistent runners provide long-lived compute. Fork PRs could run mining workloads.                         |
| API key exfiltration   | Runner environment contains Anthropic, GitHub, Discord, Linear, and Langfuse credentials.                   |
| Supply chain poisoning | Modified `package.json` or build scripts could install backdoored dependencies.                             |
| Lateral movement       | Runner is on our Tailscale network, with access to staging and other internal services.                     |
| Persistent backdoors   | Unlike ephemeral GitHub-hosted runners, our runner persists between jobs. A backdoor survives the workflow. |

### CI hardening checklist

| Action                                                | Status | Notes                                             |
| ----------------------------------------------------- | ------ | ------------------------------------------------- |
| Pin all GitHub Actions by SHA (not tag)               | To do  | Prevents tag-mutation supply chain attacks        |
| Set `permissions: contents: read` as default          | To do  | Principle of least privilege                      |
| Fork PRs: run on `ubuntu-latest` only                 | To do  | Never on self-hosted runner                       |
| Never pass secrets to fork PR workflows               | To do  | Use `pull_request_target` carefully               |
| `persist-credentials: false` on all checkout steps    | To do  | Prevents token leakage to subsequent steps        |
| Audit all workflow triggers for `pull_request_target` | To do  | This event runs in the context of the BASE branch |
| Add `concurrency` groups to prevent parallel abuse    | To do  | One CI run per PR                                 |

---

## Idea-to-feature pipeline

External ideas flow through a structured pipeline that ends with AI agent implementation and proper attribution.

```
GitHub Issue or Discussion (external submission)
  |
  v
Quarantine Pipeline (automatic)
  - Trust tier check
  - Syntax, content, and security validation
  - Block or pass based on tier and violations
  |
  v
Team Review
  - Weekly triage session
  - First response SLA: 48 hours
  - Label: 'accepted', 'wont-fix', or 'duplicate'
  |
  v
If Accepted:
  - Create Linear issue (strategic tracking)
  - Intake bridge creates Automaker board feature (execution tracking)
  - GitHub issue linked via feature metadata
  |
  v
Agent Implementation
  - Feature enters auto-mode or Lead Engineer state machine
  - AI agent implements in isolated worktree
  - PR created with "Closes #N" reference (auto-closes GitHub issue)
  |
  v
Closure and Credit
  - PR merged -> GitHub issue auto-closed
  - Release notes credit the original submitter
  - Submitter notified via GitHub mention
```

### Label taxonomy

| Category | Labels                                                                                    |
| -------- | ----------------------------------------------------------------------------------------- |
| Status   | `needs-triage`, `triaged`, `accepted`, `wont-fix`, `duplicate`                            |
| Type     | `bug`, `idea`, `enhancement`, `question`                                                  |
| Priority | `priority:critical`, `priority:high`, `priority:medium`, `priority:low`                   |
| Area     | `area:frontend`, `area:agents`, `area:git`, `area:api`, `area:orchestration`, `area:docs` |
| Source   | `community`, `internal`                                                                   |
| Meta     | `external-pr`, `auto-closed`, `stale`, `good-first-issue`                                 |

The `good-first-issue` label is repurposed: instead of marking easy code contributions, it marks ideas that are well-scoped and likely to be implemented quickly. This gives new community members visibility into what gets picked up fast.

---

## Implementation phases

### Phase 0: Pre-launch essentials

These items must be completed before the repository goes public. They represent the minimum viable security and community infrastructure.

| #   | Item                                                        | Effort | Status | Notes                                        |
| --- | ----------------------------------------------------------- | ------ | ------ | -------------------------------------------- |
| 1   | Secrets audit -- scan git history for leaked credentials    | 2h     | To do  | Use trufflehog or gitleaks                   |
| 2   | Enable secret scanning + push protection in GitHub settings | 30m    | To do  | GitHub settings toggle                       |
| 3   | SECURITY.md                                                 | 1h     | To do  | Agent task                                   |
| 4   | CODEOWNERS                                                  | 1h     | To do  | Agent task                                   |
| 5   | Pin all Action SHAs, set minimum permissions                | 2h     | To do  | Agent task, see CI hardening checklist       |
| 6   | Issue templates (bug_report.yml, idea.yml, config.yml)      | 2h     | To do  | Agent task                                   |
| 7   | Auto-close external PRs workflow                            | 1h     | To do  | Agent task, workflow YAML above              |
| 8   | Rewrite CONTRIBUTING.md                                     | 2h     | To do  | Agent task, see spec above                   |
| 9   | Create labels in GitHub                                     | 15m    | To do  | `external-pr`, `auto-closed`, taxonomy above |
| 10  | Enable Discussions with configured categories               | 15m    | To do  | GitHub settings                              |
| 11  | Enable private vulnerability reporting                      | 15m    | To do  | GitHub settings                              |
| 12  | README open-source section                                  | 1h     | To do  | Agent task                                   |

**Already completed (not in Phase 0):**

- Quarantine pipeline (QuarantineService, TrustTierService, sanitization utilities)
- Quarantine API routes and MCP tools
- Unit tests for quarantine and sanitization
- Documentation: `docs/server/quarantine-pipeline.md`
- Documentation: `docs/dev/contribution-model.md`
- Auto-close GitHub issues via PR `Closes` keyword (PR #1067)

**Definition of done for Phase 0:** Repository can be made public. External PRs are auto-closed. Issues are funneled through templates. No secrets in git history. Security reporting channel exists.

### Phase 1: Advanced security (post-launch)

Deeper defenses and community trust automation. These are not blockers for launch.

| Item                        | Description                                             |
| --------------------------- | ------------------------------------------------------- |
| Semgrep custom rules        | Project-specific static analysis for agent output       |
| Guardian model              | Secondary LLM that validates agent output before commit |
| Docker sandboxed execution  | Run agent builds in isolated containers, not on host    |
| Trust tier auto-progression | Automated promotion based on contribution history       |
| Community flagging          | Allow trusted users to flag suspicious submissions      |
| OSSF Scorecard optimization | Target 8+ score for supply chain credibility            |
| Dependency review workflow  | Auto-check new dependencies for known vulnerabilities   |
| CodeQL setup                | GitHub Advanced Security for JS/TS                      |
| Dependabot configuration    | Automated dependency updates                            |

---

## Communication strategy

### README addition

Add a section near the top of README.md, after the project description:

> **Open Source, AI-Native Development**
>
> protoLabs Studio is open source under the MIT license. We share our code openly because we believe in transparency, but our development workflow is AI-native -- our team of AI agents implements all features internally.
>
> **Want to contribute?** We welcome ideas, bug reports, and feedback through Issues, Discussions, and Discord. See CONTRIBUTING.md for details.

### Blog post

Working title: **"How We Open-Source an AI Development Studio Without Accepting PRs"**

Key angles:

- The unique challenge of open-sourcing when AI agents write the code
- Why traditional contribution models break with self-hosted runners and AI-native workflows
- Our quarantine pipeline as a novel approach to community input security
- Building trust tiers for a community-driven but maintainer-executed project
- What other projects can learn from the "ideas only" model

This blog post doubles as thought leadership content for the consulting business. It demonstrates the depth of thinking behind our approach, which is exactly what prospective consulting clients want to see. Timing TBD based on content pipeline.

### Discord announcement

Structure for the `#announcements` channel:

1. **What is changing.** The protoLabs Studio repository is now public. Anyone can read the code, file issues, and join discussions.
2. **How to participate.** Ideas go to GitHub Discussions. Bugs go to GitHub Issues. Chat happens here on Discord.
3. **What is NOT changing.** We still implement everything internally. AI agents still do the work. PRs from external contributors are auto-closed with a friendly redirect.
4. **Why we are doing this.** Transparency, community input, and because open source is the right default for developer tools.

---

## Precedents

Projects that successfully operate with limited or no external code contributions:

| Project              | Model                                       | What they accept                        | How ideas flow                          |
| -------------------- | ------------------------------------------- | --------------------------------------- | --------------------------------------- |
| **Linear**           | Public issue tracker, closed implementation | Bug reports, feature requests           | Public roadmap, internal implementation |
| **Tailscale**        | Open source, highly selective PRs           | Tiny fixes only, major work is internal | GitHub issues, blog posts for direction |
| **Vercel / Next.js** | Open source, Discussions for ideas          | Community PRs for docs and minor fixes  | Discussions -> internal prioritization  |
| **Raycast**          | Feedback portal, closed core runtime        | Extension PRs (separate repo), not core | Feedback portal, community extensions   |

Our model is closest to Linear's: fully transparent codebase, community-driven ideas, internal implementation. The difference is that our "internal team" includes AI agents, which adds the security dimension that Linear does not face.

---

## Open questions

Items that need decisions before or shortly after launch:

1. **GitHub Sponsors.** Do we enable GitHub Sponsors on the repo? Could fund bounties for community ideas that ship.
2. **Extension / plugin ecosystem.** Should we open a separate repo for community-built MCP tools or agent templates? This would give contributors a code contribution path without touching core.
3. **Changelog attribution format.** How exactly do we credit community idea submitters? Options: `(thanks @username)` in changelog, dedicated "Community" section in release notes, or both.
4. **Monorepo vs. split.** Should we extract `libs/` packages into separate repos with their own contribution policies? Some packages (types, utils) are low-risk for external PRs.
5. **CLA vs. DCO.** MIT license is in place but we have no formal contributor agreement for issue/discussion content. Is one needed? Legal review recommended.
6. **Discord invite link.** Need a permanent invite link for the public-facing Discord server before launch.

---

## Appendix: Secrets audit procedure

Before making the repository public, run this audit:

```bash
# 1. Scan full git history for secrets
# Use trufflehog or gitleaks
trufflehog git file://. --since-commit=HEAD~1000 --only-verified

# 2. Check for .env files that may have been committed historically
git log --all --diff-filter=A -- '*.env' '.env*' 'credentials*' '*.key' '*.pem'

# 3. Check for hardcoded API keys or tokens
git log --all -p -S 'sk-ant-' --     # Anthropic keys
git log --all -p -S 'ghp_' --        # GitHub PATs
git log --all -p -S 'ghs_' --        # GitHub App tokens
git log --all -p -S 'xoxb-' --       # Slack/Discord bot tokens

# 4. If any secrets are found in history:
# Option A: Rotate the secret immediately (preferred, always do this)
# Option B: Use git-filter-repo to remove from history (if secret is in many commits)
# Option C: Use BFG Repo Cleaner for targeted removal

# 5. After cleanup, enable push protection to prevent future leaks
```

**Important:** Even if secrets are removed from git history, assume they are compromised. Always rotate any secret that was ever committed, regardless of how quickly it was removed.
