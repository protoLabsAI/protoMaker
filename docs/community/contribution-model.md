# Contribution model

protoLabs uses an **ideas-only contribution model**. We accept feature ideas and bug reports from the community, but we do not accept code contributions via pull requests. This document explains why, how to submit ideas, and what to expect after submission.

## Ideas only, no code PRs

### Why we don't accept code PRs

protoLabs is an **AI-native project** with a unique development workflow that is incompatible with traditional code contributions:

1. **Self-hosted runners**: Our GitHub Actions run on our own infrastructure, not GitHub's ephemeral runners. Accepting code PRs would require us to execute untrusted code on our servers, creating significant security risks.

2. **AI agent workflow**: Features are implemented by AI agents that maintain consistency with the codebase's architecture, patterns, and conventions. Human-written code would need to be rewritten by agents anyway to maintain this consistency.

3. **Quarantine pipeline**: All external input goes through a 4-stage validation pipeline (see [Quarantine pipeline](/security/quarantine-pipeline)) to prevent prompt injection and other attacks. Code contributions would bypass this security layer.

4. **Feature coordination**: The AI agent system manages parallel feature implementation across multiple worktrees. External PRs would create merge conflicts and coordination challenges.

5. **Quality control**: Our agents follow strict verification gates (build, test, lint) and architectural guidelines enforced through prompts. External PRs would require manual review to ensure the same standards.

### What we DO accept

We welcome:

- **Feature ideas**: Describe what you want added or changed
- **Bug reports**: Describe what's broken and how to reproduce it
- **Use case descriptions**: Explain your workflow and pain points
- **Architecture suggestions**: Propose high-level approaches (we'll implement them)
- **Documentation improvements**: Typos, clarifications, missing information

The AI agents will implement your ideas while maintaining consistency with the codebase.

### What this means for you

- **You don't need to know TypeScript, React, or our stack** — just describe what you need
- **You don't need to understand the codebase** — the agents will figure out where changes go
- **You don't need to write tests** — the agents will write them
- **You don't need to follow our conventions** — the agents will enforce them

Your contribution is the **idea**, not the implementation.

## How to submit an idea

### Step 1: Check existing issues

Before submitting a new idea, search existing issues to avoid duplicates:

1. Visit [github.com/proto-labs-ai/automaker/issues](https://github.com/proto-labs-ai/automaker/issues)
2. Search for keywords related to your idea
3. Check both open and closed issues (we may have already implemented it)

If you find a similar issue:

- Add a 👍 reaction to show support
- Add a comment with your specific use case or variation

### Step 2: Choose the right issue template

We have issue templates for different types of submissions:

| Template          | Use when...                                  |
| ----------------- | -------------------------------------------- |
| **Feature idea**  | You want something new added                 |
| **Bug report**    | Something is broken or not working correctly |
| **Documentation** | Docs are missing, wrong, or unclear          |

Click "New issue" and select the appropriate template.

### Step 3: Fill out the template

Each template has specific fields. Here's what to include:

#### Feature idea template

**Title**: Short, clear description (e.g., "Add dark mode toggle to settings")

**Problem**: What problem does this solve? Who is affected?

```text
Example: "Users working at night find the bright white UI straining on their eyes.
Many modern apps have dark mode, and users expect it."
```

**Proposed solution**: What should the feature do? Be specific about behavior.

```text
Example: "Add a dark mode toggle in Settings > Appearance. When enabled:
- All panels should use dark backgrounds (#1a1a1a) with light text (#e0e0e0)
- Code editor should switch to a dark theme (e.g., GitHub Dark)
- Setting should persist across sessions"
```

**Alternatives considered** (optional): Other approaches you thought about

```text
Example: "Could auto-detect system theme, but explicit toggle gives users control"
```

**Additional context** (optional): Screenshots, mockups, links to similar features

#### Bug report template

**Title**: What's broken (e.g., "Syntax error in generated TypeScript")

**Bug description**: What happened vs. what should happen

```text
Example: "When I ask the agent to create a TypeScript interface, it generates code
with a syntax error: missing semicolon after property declarations."
```

**Reproduction steps**: Exact steps to reproduce the bug

```text
1. Open a new project
2. Tell agent: "Create an interface User with name and email fields"
3. Observe generated code in src/types.ts
4. Notice missing semicolons
```

**Expected behavior**: What should happen instead

```text
"Generated code should be valid TypeScript with proper semicolons"
```

**Environment**:

- protoLabs version: (e.g., v0.2.0)
- OS: (e.g., macOS 14.0, Ubuntu 22.04)
- Browser (if UI issue): (e.g., Chrome 120)

**Additional context**: Logs, screenshots, error messages

#### Documentation template

**Title**: Which doc needs fixing (e.g., "Installation guide missing Node.js version")

**Documentation issue**: What's wrong or missing

```text
Example: "The installation guide doesn't mention what version of Node.js is required.
Users might install on an unsupported version and get errors."
```

**Suggested fix**: What should be changed

```text
Example: "Add a requirements section at the top:
- Node.js 18.x or higher
- npm 9.x or higher"
```

**Page location**: Link to the docs page

### Step 4: Submit and wait for triage

After submitting:

1. A maintainer will review within **2-3 business days**
2. They'll add labels (e.g., `feature`, `bug`, `priority:high`)
3. They may ask clarifying questions
4. If approved, the issue moves to the feature backlog

## What happens after submission

### 1. Triage (2-3 days)

A maintainer reviews your submission and decides:

- **Accept**: Move to feature backlog, assign to agent
- **Clarify**: Ask questions in comments
- **Decline**: Close with explanation (duplicate, out of scope, or won't fix)

**Accepted submissions** get:

- Label indicating type (`feature`, `bug`, `docs`)
- Priority label (`priority:high`, `priority:medium`, `priority:low`)
- Size label (`size:small`, `size:medium`, `size:large`)
- Milestone assignment (e.g., `v0.3.0`)

### 2. Agent assignment (automatic)

Once accepted, an AI agent is assigned to implement your idea:

1. **Feature spec generation**: Agent reads your issue and generates a detailed spec
2. **Worktree creation**: Agent creates an isolated worktree to avoid conflicts
3. **Implementation**: Agent writes code, tests, and documentation
4. **Verification gates**: Agent runs build, test, lint, and type-check
5. **Pull request**: Agent creates a PR linking back to your issue

You'll see automated comments on your issue as the agent progresses.

### 3. Code review (automated + human)

The generated PR goes through:

1. **Automated checks**: CI/CD pipeline runs tests, builds, linting
2. **Antagonistic review**: Another AI agent reviews the code for issues
3. **Remediation loop**: If issues found, implementing agent fixes them
4. **Human approval**: Maintainer does final review and merges

You'll be notified when the PR is merged.

### 4. Release (varies by milestone)

After merging:

1. **Staging deployment**: Changes deploy to staging environment (automatic)
2. **Smoke testing**: Maintainers verify in staging
3. **Release**: Included in next version release (weekly or milestone-based)
4. **Changelog**: Your issue is linked in the release notes

You can track releases at [github.com/proto-labs-ai/automaker/releases](https://github.com/proto-labs-ai/automaker/releases).

### Timeline expectations

| Stage              | Duration            | Notes                               |
| ------------------ | ------------------- | ----------------------------------- |
| Triage             | 2-3 business days   | May be faster for critical bugs     |
| Agent assignment   | Immediate           | Automatic once approved             |
| Implementation     | 1-7 days            | Varies by size and complexity       |
| Code review        | 1-2 days            | Automated + human review            |
| Merge to main      | After review pass   | Immediate if checks pass            |
| Staging deployment | Immediate           | Automatic via GitHub Actions        |
| Production release | Weekly or milestone | Check roadmap for next release date |

**Note**: Timelines are estimates. High-priority bugs may be expedited; large features may take longer.

## Trust tier progression

Your **trust tier** determines how strictly your submissions are validated (see [Quarantine pipeline](/security/quarantine-pipeline) for details).

### Initial tier (Tier 1: GitHub user)

When you first submit an idea:

- **Trust tier**: 1 (GitHub user)
- **Validation**: Full validation (all quarantine stages)
- **Privileges**: Can submit ideas, subject to full sanitization

Your submission goes through all 4 quarantine stages:

1. Gate: Full validation mode
2. Syntax: Length, unicode, control characters
3. Content: Prompt injection, markdown sanitization
4. Security: Path traversal, file access

### After first merge (Tier 2: Contributor)

Once your first idea is successfully implemented and merged:

- **Trust tier**: 2 (Contributor)
- **Validation**: Advisory mode (warnings don't block)
- **Privileges**: Can submit ideas with less friction

Your submissions still go through quarantine, but:

- Violations are logged but don't block submission
- Maintainers review violations and may reject manually
- You've proven you're not submitting malicious ideas

This is **automatic** — no action required. The system tracks merged features linked to your GitHub account.

### Maintainer tier (Tier 3)

If you become a team member:

- **Trust tier**: 3 (Maintainer)
- **Validation**: Bypass all stages
- **Privileges**: Full trust, no quarantine

This tier is **manually granted** by project admins. To become a maintainer:

1. Submit multiple high-quality ideas (typically 5-10 merged features)
2. Demonstrate understanding of project goals and architecture
3. Show consistent positive engagement with the community
4. Apply or be invited by existing maintainers

### How to check your tier

You can't check your tier directly, but you can infer it:

- **Tier 1**: Your first submission
- **Tier 2**: After your first merged feature (check closed issues you opened)
- **Tier 3**: You've been explicitly granted maintainer access

Maintainers can check tiers via the API:

```bash
curl -X POST https://api.protolabs.studio/api/quarantine/trust-tiers/list \
  -H "Authorization: Bearer YOUR_TOKEN"
```

## Frequently asked questions

### Q: Why can't I just fork the repo and open a PR like normal?

**A**: You can fork and explore the code, but we won't merge code PRs for security and workflow reasons (see [Why we don't accept code PRs](#why-we-dont-accept-code-prs)). Submit an issue describing your change instead.

### Q: What if my idea is rejected?

**A**: We'll explain why in the issue. Common reasons:

- **Duplicate**: Already exists or in progress
- **Out of scope**: Doesn't align with project goals
- **Won't fix**: Intentional behavior or design decision

You can appeal by providing additional context or use cases.

### Q: Can I submit multiple ideas at once?

**A**: Yes! Submit separate issues for each idea so they can be triaged, implemented, and tracked independently.

### Q: How detailed should my idea be?

**A**: More detail is better, but not required. The AI agents will ask clarifying questions if needed. Focus on:

- **What** you want (the outcome)
- **Why** you want it (the problem)
- **Who** benefits (the use case)

Don't worry about **how** to implement it — the agents will figure that out.

### Q: What if I want to suggest a large architectural change?

**A**: Submit a feature idea describing the high-level change and why it's needed. Tag it `discussion` in the issue. Maintainers will discuss feasibility and approach before agents implement.

### Q: Can I submit ideas if I'm not using protoLabs yet?

**A**: Yes! You don't need to be a user to suggest features. Just describe the use case and why it would be valuable.

### Q: What if my submission gets stuck in quarantine?

**A**: If your submission is flagged by the quarantine pipeline:

1. A maintainer will review it manually
2. They'll either approve (if false positive) or reject (if unsafe)
3. You'll get a comment explaining the decision

Common false positives:

- Legitimate use of words like "ignore" in a different context
- File paths that look like traversal but aren't (e.g., `../README.md` in docs)

If rejected, revise and resubmit without the flagged content.

### Q: How do I report a security vulnerability?

**A**: Don't use public issues for security vulnerabilities. Follow the [SECURITY.md](../../SECURITY.md) process:

1. Email security contact (listed in SECURITY.md)
2. Include detailed reproduction steps
3. Wait for acknowledgment before public disclosure

### Q: What if I have a question, not a feature idea?

**A**: Use GitHub Discussions instead of issues:

- [github.com/proto-labs-ai/automaker/discussions](https://github.com/proto-labs-ai/automaker/discussions)

Issues are for actionable ideas; discussions are for questions, brainstorming, and general feedback.

### Q: Can I contribute by triaging issues?

**A**: Not currently. Triage is handled by maintainers and AI agents. You can help by:

- Adding 👍 reactions to issues you care about (signals priority)
- Commenting with additional use cases or context
- Answering questions from other users in discussions

### Q: What if the agent misunderstands my idea?

**A**: The agent will add a comment to your issue with its interpretation. Review it and reply with corrections. The agent will revise the spec and re-implement.

### Q: How do I know if my idea is being worked on?

**A**: Check the issue labels:

- `status:triaged` — Approved, waiting for agent assignment
- `status:in-progress` — Agent is implementing
- `status:review` — PR created, under review
- `status:merged` — Merged to main, waiting for release

You'll also get notifications when the agent comments or creates a PR.

### Q: Can I withdraw my idea after submitting?

**A**: Yes. Comment on your issue asking to close it. A maintainer will close it and stop any in-progress work.

### Q: What if I want to implement my own feature locally?

**A**: You can fork the repo and implement locally, but:

- We won't merge your implementation (submit an idea instead)
- You'll need to maintain your fork separately
- Your changes may conflict with our releases

We recommend submitting an idea and waiting for the agent implementation.

### Q: How can I speed up implementation of my idea?

**A**: You can't directly control timing, but you can help by:

- Providing very detailed requirements upfront
- Adding screenshots, mockups, or examples
- Responding quickly to clarifying questions
- Upvoting the issue (👍) to signal demand

High-priority issues get expedited implementation.

### Q: What if I disagree with how the agent implemented my idea?

**A**: Comment on the PR with feedback. The agent will revise based on your input. If you disagree with a design decision, tag a maintainer for discussion.

### Q: Can I contribute documentation directly?

**A**: Documentation follows the same process — submit an issue describing what's wrong or missing. The agent will update the docs. This ensures consistency and prevents merge conflicts.

Exception: If you spot a typo, you can submit an issue and the agent will fix it within hours.

## Related documentation

- [Quarantine pipeline](/security/quarantine-pipeline) — How external submissions are validated
- [Feature lifecycle](/dev/idea-to-production) — What happens after your idea is approved
- [SECURITY.md](../../SECURITY.md) — Security vulnerability reporting process
- [GitHub Issues](https://github.com/proto-labs-ai/automaker/issues) — Submit your ideas here
- [GitHub Discussions](https://github.com/proto-labs-ai/automaker/discussions) — Ask questions and discuss
