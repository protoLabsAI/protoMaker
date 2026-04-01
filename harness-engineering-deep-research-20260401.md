# Harness Engineering: Deep Research Synthesis

**Compiled:** 2026-04-01
**Sources:** Four primary articles on harness design for AI coding agents

---

## SOURCE 1: "Harness Design for Long-Running Apps"

**Author:** Prithvi Rajasekaran (Anthropic Labs)
**URL:** https://www.anthropic.com/engineering/harness-design-long-running-apps
**Date:** March 24, 2026

---

### Core Innovation: Generator-Evaluator Architecture

The central architectural decision is separating generation from evaluation, drawing direct inspiration from GANs (Generative Adversarial Networks). This addresses a fundamental model limitation: **"when asked to evaluate work they've produced, agents tend to respond by confidently praising the work."**

The key insight is that the evaluator can be tuned to skepticism more effectively than training generators toward self-critique. Separation makes what was intractable tractable.

---

### The Two Critical Failure Modes (and their solutions)

**Failure Mode 1: Context Management / Context Anxiety**

- Models "lose coherence on lengthy tasks as the context window fills"
- Exhibit "context anxiety": wrapping up work prematurely near perceived limits
- **Solution**: Context RESETS (not compaction) — provide a clean slate with structured handoff artifacts
- Compaction preserves noise; resets force clean structured handoffs

**Failure Mode 2: Self-Evaluation Limitation**

- Agents cannot reliably evaluate their own work
- **Solution**: Separate the generator from the evaluator entirely — the evaluator is a different agent instance

---

### Frontend Design Implementation

**Four grading criteria that make subjective quality gradable:**

1. **Design Quality** — Coherent aesthetics combining colors, typography, layout
2. **Originality** — Evidence of custom decisions versus templates
3. **Craft** — Technical execution: hierarchy, spacing, contrast
4. **Functionality** — User comprehension and task completion

**Implementation detail:** The evaluator uses Playwright MCP for interactive testing. Runs 5-15 iterations. Full cycles take up to four hours.

**Key pattern:** Specific evaluation criteria transform vague judgments ("is this beautiful?") into concrete, measurable standards. Subjectivity is gradable when decomposed.

---

### Full-Stack Coding Architecture: Three-Agent System

**Agent 1: Planner**

- Input: 1-4 sentence user prompt
- Output: Detailed product spec with 16+ features distributed across 10 sprints
- Integrates design principles and AI features "opportunistically"
- Negotiates "sprint contracts" with the evaluator before implementation begins

**Agent 2: Generator**

- Works one feature per sprint
- Self-evaluates before QA handoff
- Uses git version control
- Stack: React / Vite / FastAPI / SQLite

**Agent 3: Evaluator**

- Navigates running applications via Playwright
- Tests UI, API, and database states
- Tests against "sprint contracts" — pre-agreed success criteria negotiated between generator and evaluator
- The contract mechanism bridges high-level specs to concrete testable requirements

---

### Performance Data: Solo vs. Harness

| Configuration | Duration | Cost | Output Quality                                                                        |
| ------------- | -------- | ---- | ------------------------------------------------------------------------------------- |
| Solo agent    | 20 min   | $9   | Non-functional game — "wiring between entity definitions and game runtime was broken" |
| Full harness  | 6 hr     | $200 | Sprite animation, behavior templates, AI-assisted generation, shareable game export   |

**Interpretation:** The harness costs 22x more and takes 18x longer but produces something that actually works and is ambitious.

---

### Evolution: How Opus 4.6 Changed the Architecture

With Claude Opus 4.6 release, architectural assumptions were re-examined. Improved planning, long-context retrieval, and debugging capabilities in the newer model reduced dependencies on sprint decomposition.

**DAW (Digital Audio Workstation) Example with updated harness:**

- Eliminated the sprint construct entirely
- Enabled 2+ hours of uninterrupted building
- Total duration: 3 hr 50 min
- Cost: $124.70
- QA remained valuable for edge cases and complex features but became conditionally necessary, not always essential

**Anti-pattern revealed:** Every component in a harness encodes an assumption about what the model can't do on its own. Those assumptions become stale as models improve. Stress test them regularly.

---

### Key Engineering Principles (direct quotes)

1. **"Assume Nothing Permanent"** — "Every component in a harness encodes an assumption about what the model can't do on its own, and those assumptions are worth stress testing."

2. **"Subjective Quality is Gradable"** — Specific evaluation criteria transform vague judgments into concrete, measurable standards.

3. **"Iteration Matters"** — Evaluator feedback drives directional change. One museum website example pivoted from standard landing page to CSS-rendered 3D spatial experience by iteration 10.

4. **"Contract-Based Handoff"** — Generator and evaluator negotiate testable "sprint contracts" before implementation, bridging high-level specs to concrete requirements.

---

### Limitations and Honest Failure Modes

- QA agents require extensive tuning to avoid over-praising mediocre work
- Subtle bugs in deeply nested features still slip through
- Layout intuitiveness and workflow guidance gaps persist
- Musical taste evaluation fails when models cannot perceive audio (evaluator has no sensory access to generated audio)
- Improved models don't eliminate harness complexity — they shift where complexity provides value

---

---

## SOURCE 2: "Effective Harnesses for Long-Running Agents"

**Author:** Justin Young (with contributions from David Hershey, Prithvi Rajasakeran, Jeremy Hadfield, Naia Bouscal, Michael Tingley, Jesse Mu, Jake Eaton, Marius Buleandara, Maggie Vo, Pedram Navid, Nadine Yasser, Alex Notov)
**URL:** https://www.anthropic.com/engineering/effective-harnesses-for-long-running-agents
**Date:** November 26, 2025

---

### The Core Problem Statement (verbatim)

"The core challenge of long-running agents is that they must work in discrete sessions, and each new session begins with no memory of what came before."

Analogy used: engineers on shift work with no memory of previous shifts cannot maintain project continuity.

**Empirical finding:** Even Claude Opus 4.5 running on the Claude Agent SDK in a loop across multiple context windows will fail to build a production-quality web app if given only a high-level prompt like "build a clone of claude.ai."

---

### The Two Failure Patterns (Observed Empirically)

**Pattern 1: One-shotting**

- Agent tries to do everything at once
- Runs out of context mid-implementation
- Next session starts with features half-implemented and undocumented
- Next agent has to guess what happened and spends time recovering broken state
- **Happens even with compaction** — compaction doesn't always pass perfectly clear instructions to the next agent

**Pattern 2: Premature Victory Declaration**

- Later in a project, an agent instance looks around, sees that progress has been made, and declares the job done
- Occurs because agents lack the full feature list and assume partial progress = completion

---

### The Two-Part Solution

**Note from authors:** These are referred to as separate agents "only because they have different initial user prompts. The system prompt, set of tools, and overall agent harness was otherwise identical."

**Part 1: Initializer Agent (first session only)**

Specialized prompt that asks the model to set up:

1. An `init.sh` script for running the development environment
2. A `claude-progress.txt` file documenting what agents have done
3. An initial git commit showing what files were added

**Part 2: Coding Agent (every subsequent session)**

Tasked with:

1. Making incremental progress
2. Leaving structured updates
3. Committing changes with descriptive messages

---

### Environment Management: Feature List Design

**The feature list is the central innovation for preventing premature victory and one-shotting.**

The initializer agent writes a comprehensive JSON file of feature requirements. For a claude.ai clone: 200+ features.

**Example feature entry (exact JSON format):**

```json
{
  "category": "functional",
  "description": "New chat button creates a fresh conversation",
  "steps": [
    "Navigate to main interface",
    "Click the 'New Chat' button",
    "Verify a new conversation is created",
    "Check that chat area shows welcome state",
    "Verify conversation appears in sidebar"
  ],
  "passes": false
}
```

**Critical implementation details:**

- All features initially marked `"passes": false`
- Coding agents are explicitly instructed to edit this file ONLY by changing the `passes` field
- **Exact prompt wording used:** "It is unacceptable to remove or edit tests because this could lead to missing or buggy functionality."
- **Why JSON not Markdown:** "the model is less likely to inappropriately change or overwrite JSON files compared to Markdown files"
- This is a deliberate format choice based on empirical testing — JSON is structurally harder to accidentally corrupt

---

### Incremental Progress Design

**The one-feature-at-a-time constraint:**

- Coding agents are instructed to work on ONE feature at a time
- This constraint directly prevents one-shotting behavior
- After each feature: commit to git with descriptive message, write progress summary

**Why git matters here:**

- Agent can use git to revert bad code changes and recover working states
- Creates an audit trail the next agent can read to understand current state
- Eliminates "guessing what happened" problem

**"Clean state" definition used:** Code appropriate for merging to a main branch — no major bugs, orderly and well-documented, a developer could immediately begin work on a new feature without cleanup.

---

### Testing: The Third Failure Mode

**Failure mode:** Claude marks features as complete without proper testing. Even with unit tests or `curl` commands, Claude fails to verify end-to-end functionality.

**Solution:** Explicitly prompt Claude to use browser automation tools (Puppeteer MCP) and test as a human user would.

**Puppeteer MCP specifics:**

- Provides screenshots that Claude reviews
- Enables true end-to-end verification as a user would experience it
- Claude can identify and fix bugs not obvious from code alone

**Remaining limitation:** Claude cannot see browser-native alert modals through the Puppeteer MCP. Features relying on alert modals tend to be buggier as a result.

---

### Session Initialization: The Exact Prompt Pattern

The coding agent begins every session with this series of steps (these are the exact instructions given):

```
1. Run `pwd` to see the directory you're working in. You'll only be able to edit files in this directory.
2. Read the git logs and progress files to get up to speed on what was recently worked on.
3. Read the features list file and choose the highest-priority feature that's not yet done to work on.
```

Additional step: read and execute `init.sh` to start the development server.

**Then run a baseline end-to-end test before implementing anything new.**

For the claude.ai clone: start local dev server, use Puppeteer to start a new chat, send a message, receive a response. This ensures the agent can immediately identify and fix any broken state before making things worse.

---

### Typical Session Transcript (exact assistant messages)

```
[Assistant] I'll start by getting my bearings and understanding the current state of the project.
[Tool Use] <bash - pwd>
[Tool Use] <read - claude-progress.txt>
[Tool Use] <read - feature_list.json>
[Assistant] Let me check the git log to see recent work.
[Tool Use] <bash - git log --oneline -20>
[Assistant] Now let me check if there's an init.sh script to restart the servers.
<Starts the development server>
[Assistant] Excellent! Now let me navigate to the application and verify that some fundamental features are still working.
<Tests basic functionality>
[Assistant] Based on my verification testing, I can see that the fundamental functionality is working well. The core chat features, theme switching, conversation loading, and error handling are all functioning correctly. Now let me review the tests.json file more comprehensively to understand what needs to be implemented next.
<Starts work on a new feature>
```

---

### The Failure Mode / Solution Matrix (complete)

| Problem                                                      | Initializer Agent Solution                                                  | Coding Agent Solution                                                                               |
| ------------------------------------------------------------ | --------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------- |
| Claude declares victory on entire project too early          | Set up feature list file: JSON with all requirements, all initially failing | Read feature list at start; choose ONE feature to work on                                           |
| Claude leaves environment with bugs or undocumented progress | Initial git repo + progress notes file                                      | Read progress notes + git logs at start; run basic dev server test; commit + update progress at end |
| Claude marks features as done prematurely                    | Set up feature list file                                                    | Self-verify all features; mark passing ONLY after careful testing                                   |
| Claude has to spend time figuring out how to run the app     | Write `init.sh` script that starts dev server                               | Read `init.sh` at session start                                                                     |

---

### Open Research Questions (from the authors)

1. Whether single general-purpose agents outperform specialized multi-agent architectures — unclear
2. Specialized agents (testing, QA, cleanup) might improve sub-task performance
3. Current approach optimized for web app development — generalization to scientific research or financial modeling unexplored

---

---

## SOURCE 3: "Harness Engineering: Leveraging Codex in an Agent-First World"

**Author:** OpenAI Engineering Team
**URL:** https://openai.com/index/harness-engineering/ (403 — reconstructed from multiple secondary sources)
**Date:** February 11, 2026
**Context:** Built an internal software product over 5 months with zero manually-written code — ~1 million lines of code, ~1,500 merged PRs, team of 3 engineers growing to 7

---

### The Fundamental Shift

"Humans steer. Agents execute."

**Old role:** Translating requirements into syntax
**New role:** Designing environments, specifying intent, building feedback loops

When a task fails, the response is never "prompt better." It is: "What capability is missing, and how do we make it both legible and enforceable for the agent?"

**Throughput numbers:**

- 3.5 PRs per engineer per day
- Throughput INCREASED as team grew from 3 to 7 (contradiction of Brooks's Law — works because agents don't need the same onboarding/communication overhead as humans)
- August 2025 to January 2026 (5 months)

---

### Rule 1: Give Agents a Map, Not a 1,000-Page Instruction Manual

**The failure of comprehensive AGENTS.md files:**

- Initial approach: large, comprehensive AGENTS.md
- Failed due to: context constraints, information decay, inability to verify currency
- Context is scarce; comprehensive guidance crowds out task and code context
- Excessive guidance becomes non-guidance when everything appears important
- Monolithic manuals decay rapidly without maintenance

**The solution: Table of Contents approach**

- Single short `AGENTS.md` file, ~100 lines
- Acts as a map with pointers to deeper sources of truth
- Points to a structured `docs/` directory containing:
  - Design documentation with core beliefs
  - Architecture documentation mapping domains and package layering
  - Execution plans with progress logs
  - Product specifications
  - Quality scorecards
  - Design system and technology references

**Why this works:** Progressive disclosure — agents start with stable entry points and fetch more context only when needed, rather than overwhelming context on every run.

**Mechanical validation:** Linters and CI jobs validate that the documentation is current, cross-linked correctly, and structurally intact. The map itself is verified to be accurate.

---

### Rule 2: Enforce Architecture Mechanically, Not Via Instructions

**The dependency layer model:**

```
Types → Config → Repo → Service → Runtime → UI
```

Cross-cutting concerns (auth, connectors, telemetry, feature flags) enter through single explicit Providers interfaces.

**Enforcement mechanism:** Custom linters and structural tests — not documentation, not prompts.

- If an agent tries to make a UI component depend directly on a database repo, the linter fails the PR
- The linter injects exact remediation instructions into agent context
- "Telling agents 'don't do X' in a markdown file is a suggestion. Making X trigger a build failure is a rule."

**Additional mechanical rules:**

- Structured logging requirements
- Naming conventions
- File size limits
- Platform-specific reliability requirements

**The principle:** "Enforce invariants, not implementations." Don't micromanage how the agent writes every function — constrain what it's allowed to produce at the structural level.

---

### Rule 3: Parse, Don't Validate

**Pattern:** Lean heavily into the "parse, don't validate" pattern. Force the agent to parse data into strict shapes (e.g., using Zod) at the boundaries of the system.

**Why this works for agents specifically:**

- Internal logic always deals with valid data
- Reduces the state space the agent has to reason about
- Makes hallucinations far less likely (smaller reasoning surface)
- Prevents the agent from needing to handle "what if this is invalid" in business logic

**Mechanism:** Data parsed at system boundaries into strict types. Invalid data fails immediately at the boundary, not deep in business logic where causation is obscure.

---

### Rule 4: Entropy Management as Garbage Collection

**The problem:** Because agents replicate existing patterns, suboptimal practices compound over time. Initial manual cleanup consumed 20% of weekly engineering time.

**The solution:** Encode "golden principles" — opinionated, mechanical rules — directly into the repository. Then run recurring background Codex tasks that:

1. Scan for deviations from established patterns
2. Update quality grades
3. Open targeted refactoring PRs (most reviewable in under one minute and automerged)

**Key insight:** This is "garbage collection" — technical debt paid continuously in small increments rather than compounding into crises.

**Examples of golden principles enforced:**

- Prefer shared utility packages over hand-rolled helpers
- Validate data at boundaries rather than YOLO-style probing

---

### Rule 5: Agent Legibility as Primary Codebase Goal

**"Code for the agent's eyes, not just yours."**

For humans: code legibility = clean variable names, helpful comments
For agents: legibility = entire business domain can be reasoned about directly from the repository

**Practical implication:** If a decision is made in a Slack thread or a Google Doc, it effectively doesn't exist for the agent. All architectural decisions, constraints, and business logic must be in the repository.

**Technology choice implication:** Prefer "boring" technologies with stable APIs and strong training set representation. Sometimes reimplemented functionality rather than integrating opaque dependencies. The agents have seen stable, widely-used tools extensively in training — these work better than cutting-edge libraries.

---

### Rule 6: Modified Merge Philosophy — Throughput Over Gates

**Traditional approach:** Comprehensive approval workflows, blocking merge gates

**Agent-first approach:**

- Minimal blocking merge gates
- Short-lived PRs
- Test flakes addressed with follow-up runs, not blocking merges

**Rationale:** "In a system where agent throughput far exceeds human attention, corrections are cheap, and waiting is expensive."

**The inversion:** Human attention is the scarce resource. Blocking merges to wait for human review wastes the scarce resource. Agents can fix mistakes faster than humans can review them.

---

### Rule 7: Agent-to-Agent Code Review

**The loop:**

1. Agent executes task and opens PR
2. Agent reviews its own changes locally
3. Agent requests specific agent reviews from other Codex instances
4. Agent responds to feedback (human or agent)
5. Agent iterates until all reviewers satisfied
6. Agent merges changes

**Humans remain in the loop at different abstraction levels:**

- Prioritizing work
- Translating user feedback into acceptance criteria
- Validating outcomes
- Escalation when judgment is required

**Most "nitpicking" happens agent-to-agent.** This keeps human engineers at high abstraction level.

---

### Rule 8: Observability Wired Into Agent Runtime

**The innovation:** Made the application's runtime legible to the agent in real time.

**Implementation:**

- Chrome DevTools Protocol wired into agent runtime
- Provides: DOM snapshots, screenshots, navigation
- Application instances boot per git worktree
- Local observability stack: LogQL for logs, PromQL for metrics and traces
- Ephemeral local stacks per agent run

**What this enables (example):**
An agent runs for six hours straight, launches a version of the app, queries logs to find a service startup delay, identifies bottleneck in a trace, writes a fix, validates startup time is now under 800ms.

**This is the full loop:** agent sees runtime behavior, diagnoses the issue in telemetry, implements a fix, verifies the fix — all autonomously.

---

### Full Autonomy Capability Profile

Given a single prompt, a properly harnessed Codex can:

1. Validate current codebase state
2. Reproduce reported bugs
3. Record video demonstrations
4. Implement fixes
5. Validate fixes through application driving
6. Record resolution videos
7. Open pull requests
8. Respond to feedback
9. Detect and remediate build failures
10. Escalate to humans when judgment is required
11. Merge changes

This requires specific repository structure and tooling investments — it doesn't happen without harness engineering.

---

### What Agents Produce (full list)

- Product code and tests
- CI configuration and release tooling
- Internal developer tools
- Documentation and design history
- Evaluation harnesses
- Review comments and responses
- Repository management scripts
- Production dashboard definitions

---

### Acknowledged Unknowns

- Long-term architectural coherence in fully agent-generated systems
- Optimal human judgment leverage points and how to encode them
- System evolution as model capabilities advance
- Generalizability beyond this specific repository setup

---

### The Core Reframe

"Building software still demands discipline, but the discipline shows up more in the scaffolding rather than the code."

Martin Fowler's characterization: Harness Engineering is "a valuable framing of a key part of AI-enabled software development," because it encodes scaffolding, feedback loops, and architectural constraints into machine-readable artifacts.

---

---

## SOURCE 4: "Ralph Wiggum as a Software Engineer"

**Author:** Geoffrey Huntley
**URL:** https://ghuntley.com/ralph/
**Named After:** Ralph Wiggum from The Simpsons — the well-meaning character who keeps falling off the slide

---

### What Ralph Is

Ralph is a technique implemented as a Bash loop:

```bash
while :; do cat PROMPT.md | claude-code ; done
```

It automates software development through agentic loops, specifically designed for greenfield projects. Every iteration of the loop handles one well-defined task. The context window limit (~170k) is a feature, not a bug.

---

### Fundamental Constraint: One Item Per Loop

**This is the most critical rule. Huntley repeats it explicitly:**

"One item per loop. I need to repeat myself here — one item per loop."

**Why:**

- Preserves context window efficiency
- Prevents context exhaustion
- Maintains output quality
- Each loop iteration is self-contained and verifiable

---

### Deterministic Stack Allocation Per Loop

Every loop iteration must receive the same foundational resources:

- **`@fix_plan.md`** — prioritized task list (the current TODO being executed)
- **`@specs/`** — project specifications
- **`@AGENT.md`** — compilation and execution instructions

This is the stable context floor — every iteration starts from the same known base.

---

### Context Window Management Strategy

Rather than filling primary context with execution results (test output, compilation results, file reads), spawn parallel subagents:

- Primary agent acts as scheduler
- Subagents handle: filesystem searches (ripgrep), test result summaries, code writing, documentation updates
- **Exception:** Single subagent limitation for build/test validation to prevent backpressure

**Why:** Execution results are noisy. The primary agent's context window should stay clean for high-level reasoning and task coordination.

---

### Anti-Pattern: Assumption-Based Search Failure

Code-based search via ripgrep can be non-deterministic. Common failure: the LLM incorrectly concludes code isn't implemented, then implements it again — causing duplicate implementations.

**Mitigation prompt:** "Before making changes search codebase (don't assume an item is not implemented) using parallel subagents. Think hard."

The "think hard" directive is specific and deliberate — it triggers more careful reasoning before acting on search results.

---

### Phase One: Code Generation Quality Control

Cost of generation is now negligible. Quality is controlled through:

1. **Standard Library Definition** — establish technical patterns and conventions before generation begins
2. **Specification Completeness** — specifications must exactly match actual requirements

**Warning:** Specification errors compound rapidly. Example given: duplicate keyword definitions in a lexer caused significant wasted effort across many loop iterations.

---

### Phase Two: Backpressure

"The wheel has got to turn fast" — but balanced against correctness.

**Language choice implications:**

- **Rust**: Excellent type system but slower compilation — requires more LLM attempts per iteration
- **Dynamically-typed languages**: Faster iteration but require static analysis integration (Dialyzer for Elixir, Pyrefly for Python) to prevent quality collapse without the type system safety net

**Validation gate options:**

- Testing frameworks: unit tests immediately after implementation
- Security/static analysis: integrated scanners as validation gates

**The metaphor:** Backpressure is the resistance that the loop must push against. Too little backpressure = code that passes but is wrong. Too much = the loop stalls.

---

### Test Documentation Pattern

Capture reasoning WITHIN test documentation itself, because future loop iterations have no memory of the original reasoning:

```
Tests verify QueryOptimizer module implementing caching, batching, and
analysis of database queries to improve performance. Uses real database
calls and mocks for comprehensive coverage and isolation.
```

This leaves "little notes for future iterations" explaining what a test verifies and WHY it matters. Without this, a future iteration may delete or break a test without understanding what it was protecting.

---

### Planning Strategy: No Static Plans

"I don't plan. The models know what a compiler is better than I do. I just ask it."

- Generate fresh TODO lists through explicit prompts
- Delete and regenerate frequently — don't maintain a static plan
- The fix_plan.md is "what I'm watching like a hawk"
- Run a dedicated planning loop periodically that regenerates the full fix_plan.md from scratch

**Planning prompt (periodic re-planning):**

- Study all source code (src/, examples/, tree-sitter/, src/stdlib/)
- Compare against specifications using up to 500 subagents
- Generate prioritized fix_plan.md (incomplete items only)
- Search for TODOs, placeholders, minimal implementations

---

### Iterative Refinement / Tuning

Metaphor: "Ralph is like a guitar that needs tuning."

When Ralph exhibits problematic behavior:

1. Observe the bad behavior ("Ralph falls off slide")
2. Add a specific "sign" to the prompt ("SLIDE DOWN, DON'T JUMP, LOOK AROUND")
3. Eventually Ralph becomes over-focused on signs and over-steers
4. Deploy a fresh agent without the defect perception accumulated by the over-tuned one

**The insight:** Prompts are tunable instruments, not static configurations. They drift toward over-specification over time and need periodic reset.

---

### Self-Improvement Loop

The agent should update its own context:

- Update `@AGENT.md` with discovered commands and workflows
- Document bugs in `@fix_plan.md` even if unrelated to the current work item
- Create new `@fix_plan.md` entries when discovering better approaches

**The agent writes its own instructions for future iterations** — a form of emergent documentation.

---

### Placeholder Prevention

LLMs exhibit "inherent bias to do minimal and placeholder implementations."

**Direct prompt text used:**

> "If functionality is missing then it's your job to add it as per the application specifications. Think hard... DO NOT IMPLEMENT PLACEHOLDER OR SIMPLE IMPLEMENTATIONS. WE WANT FULL IMPLEMENTATIONS. DO IT OR I WILL YELL AT YOU"

**Escalation pattern:** If Ralph ignores the directive:

1. Run a separate loop specifically designed to identify placeholder implementations
2. That loop converts placeholders to TODO items in fix_plan.md
3. Main loop then picks up those TODO items as real work

---

### Code Integration Workflow

After successful tests:

```bash
git add -A
git commit -m "description of changes"
git push
# Create semantic version tag (0.0.0 → 0.0.1)
```

This keeps the repository in a recoverable state throughout the loop.

---

### Failure Recovery

**When context fills with compilation errors:**

- External models (Gemini) can generate recovery plans for Ralph
- Using a different model to diagnose failure avoids the same blind spots

**When codebase becomes unmaintainable:**

- `git reset --hard` and restart loops
- There is no permanent failure state — any problem created by the AI method resolves through different prompt sequences and additional loops

---

### Production Prompt Stack

**Building prompt (current implementation):**

- Study specifications and fix_plan
- Implement top 10 items from fix_plan
- Search before assuming non-implementation
- Run tests for modified units
- Update documentation with "why" reasoning
- Keep @fix_plan.md current
- Full implementations only (no placeholders)
- Resolve unrelated failing tests
- Create git tags at clean states

**Planning prompt (periodic re-planning):**

- Study all source code
- Compare against specifications using up to 500 subagents
- Generate prioritized fix_plan.md (incomplete items only)
- Search for TODOs, placeholders, minimal implementations
- Plan stdlib migration
- Create missing spec files if needed

---

### Scope and Applicability

**Effective for:**

- Greenfield projects
- 90% completion target (not 100%)
- Projects with clear specifications
- Technical environments with good type systems or static analysis

**Ineffective for:**

- Existing codebases: "There's no way in heck would I use Ralph in an existing code base"
- Projects lacking senior engineering oversight

---

### ROI Evidence

- $50k USD contract, delivered as MVP, tested and reviewed: $297 USD in AI costs
- Y Combinator hackathon: "We Put a Coding Agent in a While Loop and It Shipped 6 Repos Overnight"

---

### On Senior Engineering Oversight

"Engineers are still needed. There is no way this is possible without senior expertise guiding Ralph."

The technique displaces junior/mid-level SWE work for greenfield projects but requires senior engineers for:

- Prompt crafting and tuning
- Specification accuracy
- Failure diagnosis
- Quality gate design

---

---

## BONUS SOURCE: "Skill Issue: Harness Engineering for Coding Agents"

**Author:** Kyle (@0xblacklight), HumanLayer
**URL:** https://www.humanlayer.dev/blog/skill-issue-harness-engineering-for-coding-agents
**Date:** March 12, 2026

This article synthesizes all of the above into a practitioner framework. It's the most actionable of the five sources.

---

### The Core Formula

```
coding agent = AI model(s) + harness
```

The harness encompasses:

- Skills (progressive knowledge disclosure)
- MCP servers (tool capabilities)
- Sub-agents (context isolation)
- Memory systems
- AGENTS.md files
- Hooks (lifecycle automation)

---

### Harness Engineering vs. Context Engineering

Harness engineering is a subset of context engineering. Context engineering is the broader discipline of controlling what information agents receive and when. Harness engineering specifically addresses:

- Providing new agent capabilities
- Teaching codebase-specific knowledge
- Adding determinism beyond system message instructions
- Adapting behavior for specific codebases
- Increasing task success rates
- Preventing rapid context window inflation with poor content

---

### ETH Zurich Study: What Actually Works in CLAUDE.md/AGENTS.md Files

ETH Zurich tested 138 agentfiles across repositories. Findings:

- LLM-generated files hurt performance while costing 20%+ more tokens
- Human-written files helped only ~4% of the time
- Agents spent 14-22% more reasoning tokens on context file instructions, took more steps, ran additional tools — without improving resolution rates
- Codebase overviews and directory listings provided NO benefit

**What actually works (validated by HumanLayer):**

1. Hand-craft the file — never auto-generate it
2. Less is more — under 60 lines total for their CLAUDE.md
3. Use progressive disclosure — don't include everything up front
4. Keep contents concise and universally applicable — conditional rules reduce effectiveness
5. No codebase overviews or directory listings

---

### MCP Servers: The "Too Many Tools" Problem

**Context inflation pattern:** Excessive MCP tools flood context windows with descriptions, pushing agents into "the dumb zone" faster.

**The instruction budget:** Every tool description consumes reasoning capacity. Irrelevant tools are not free — they actively hurt performance.

**Anthropic's response:** Released experimental MCP tool search to progressively disclose tools when too many are connected.

**Recommendation sequence:**

1. Turn off servers providing large unused tool sets
2. If MCP duplicates CLI functionality already in training data (GitHub, Docker, databases), prompt the agent to use CLI commands instead
3. Custom CLIs with example usages in CLAUDE.md are often more efficient than MCP servers

**Concrete example — HumanLayer's Linear CLI wrapper:**

```markdown
## Linear

Use the Linear CLI for:

- fetching issues: `linear get-issue ENG-XXXX`
- listing issues: `linear list-issues` or `linear my-issues`
- adding comments: `linear add-comment -i ENG-XXXX "comment"`
- adding links: `linear add-link ENG-XXXX "url" -t "link title"`
- updating status: `linear update-status ENG-XXXX "status name"`
- get branch name: `linear get-issue-v2 ENG-XXXX --fields branch`
- get images from ticket: `linear fetch-images ENG-XXXX`
```

Saved thousands of tokens vs. MCP tool definitions and verbose responses.

---

### Sub-Agents as Context Firewalls (not role-based)

**What doesn't work:** Role-based sub-agent architectures ("frontend engineer," "backend engineer," "data analyst")

**What works:** Sub-agents as context ISOLATION boundaries

- Discrete tasks run in isolated context windows
- Parent agent sees only: the prompt it wrote + the sub-agent's final condensed response
- Intermediate tool calls, file reads, grep results don't accumulate in parent context
- Prevents "context rot" — performance degradation from accumulated noise

**Context rot research:** Chroma's research confirms models perform worse at longer context lengths. Performance degrades even on simple tasks. Degradation accelerates when semantic similarity between questions and relevant context is low.

**Sub-agent use cases:**

- Locating specific code definitions/implementations
- Analyzing codebases for patterns
- Tracing information flow across service boundaries
- General code/documentation/web research

These tasks have straightforward questions but require many intermediate tool calls — those calls don't belong in the parent's context.

**Cost optimization:** Expensive models (Opus) for parent orchestration. Cheaper models (Sonnet, Haiku) for sub-agents handling discrete tasks.

**Sub-agents must specify:**

- Role definition (what to do AND explicitly what NOT to do)
- Return information format (concise, with `filepath:line` or URL citations)
- Available tools

---

### The "Dumb Zone" and Context Length Skepticism

Models have an "instruction budget" — a fixed amount of processing capacity for instructions. As context grows, instructions get pushed into what the authors call "the dumb zone" — they're processed less effectively.

Extended context model versions (e.g., using YaRN mathematical techniques) extend sequence length WITHOUT enlarging the instruction budget. Larger context windows don't improve needle-in-haystack finding — they enlarge the haystack.

**For agents:** Stuffing more instructions deeper into a larger context window makes those instructions less effective, not more.

---

### Hooks: Automated Lifecycle Control

Claude Code and Opencode support hooks — user-defined scripts executing automatically at lifecycle events.

**Applications:**

- Run silently on events (notifications, integrations)
- Execute when tools are called, injecting additional context
- Surface build/type errors before agent completion, forcing resolution

**The HumanLayer Stop hook (complete bash script):**

```bash
#!/bin/bash
cd "$CLAUDE_PROJECT_DIR"

# prebuild generates types and builds SDK packages for typecheck
PREBUILD_OUTPUT=$(bun run generate-cache-key && turbo run build --filter=@humanlayer/hld-sdk && bun install 2>&1)
if [ $? -ne 0 ]; then
   echo "prebuild failed:" >&2
   echo "$PREBUILD_OUTPUT" >&2
   exit 2
fi

# biome and typecheck run in parallel for tight feedback
# biome --write exits 1 if changes made, so run twice; if first pass fixes issues, second passes
OUTPUT=$(bun run --parallel \
   "biome check . --write --unsafe || biome check . --write --unsafe" \
   "turbo run typecheck" 2>&1)

if [ $? -ne 0 ]; then
   echo "$OUTPUT" >&2
   exit 2
fi
```

**Exit code semantics:**

- Success: complete silence (nothing added to agent context)
- Failure: only errors surface; exit code 2 signals harness to re-engage agent for fixes

**Key design principle:** Don't flood successful runs with passing output. Only errors should reach the agent.

---

### Back-Pressure: The Highest-Leverage Investment

Back-pressure mechanisms (verification systems) correlate strongly with agent task success.

**Verification stack used by HumanLayer:**

- Typechecks and build steps (strongly-typed languages preferred)
- Unit/integration tests
- Code coverage reporting (Stop hooks prompt coverage increases if it drops)
- UI interaction testing (Playwright, agent-browser)

**Critical requirement:** Verification must be context-efficient.

**Anti-pattern:** Running full test suites after changes — 4,000 lines of passing tests flooded context, causing agents to lose track and hallucinate.

**Correct pattern:** "Swallow the output and only surface errors" — builds succeed silently; only failures produce verbose output.

---

### What Didn't Work (Anti-Patterns)

- Designing ideal configuration upfront before real failures occur
- Installing dozens of unused skills/MCP servers "just in case"
- Running full test suites (5+ minutes) at session end
- Micro-optimizing sub-agent tool access (caused tool thrash and worse results)

### What Worked

- Starting simply; adding configuration only after actual failures
- Iterating, testing, and discarding unhelpful additions
- Distributing battle-tested configurations team-wide
- Optimizing iteration speed over first-attempt success rate
- Providing agents with broad capability sets, then carefully narrowing exposed functionality

---

### Post-Training Coupling Warning

Frontier models undergo post-training on specific harnesses (Claude with Claude Code; GPT-5 Codex with Codex harness). This tight coupling means models may perform optimally with their native harness.

**Concrete example:** Codex models depend on the `apply_patch` tool. OpenCode added this tool for Codex models while using standard `edit`/`write` tools for Claude.

**But:** Models can over-fit to their harness. Terminal Bench 2.0 shows Opus 4.6 ranks #33 in Claude Code but #5 in different harnesses — suggesting customization yields significant benefits despite post-training alignment.

---

---

## CROSS-ARTICLE SYNTHESIS

### Patterns That Appear in ALL FOUR Articles

---

**1. Context is the scarcest resource — manage it aggressively**

- Anthropic Art 1: Context resets beat compaction; "context anxiety" causes premature wrap-up
- Anthropic Art 2: Compaction alone is insufficient; structured handoff artifacts needed
- OpenAI: "Give agents a map, not a 1,000-page instruction manual"; 100-line AGENTS.md vs comprehensive docs
- Ralph: One item per loop; subagents for expensive operations; primary context stays clean
- HumanLayer: "Instruction budget"; too many tools push instructions into "the dumb zone"; sub-agents as context firewalls

**Consensus:** Context window management is NOT primarily a technical problem (compaction, larger windows). It is an architectural and content design problem. The solution is progressive disclosure, strict limits on what goes in context, and structured handoffs rather than compressed history.

---

**2. One-thing-at-a-time as a fundamental constraint**

- Anthropic Art 1: One feature per sprint; sprint contracts negotiated before implementation
- Anthropic Art 2: Work on ONE feature at a time; this constraint directly prevents one-shotting
- OpenAI: Short-lived PRs; depth-first execution (break goals into blocks, execute one block)
- Ralph: "One item per loop. I need to repeat myself here — one item per loop."
- HumanLayer: Sub-agents for single discrete tasks; parent stays in "smart zone"

**Consensus:** This is the most universally agreed-upon pattern across all sources. Agents attempting to do too much at once is the root cause of most failures. The architectural response is enforced granularity — not as a prompt suggestion but as a structural constraint.

---

**3. Git as state machine and recovery mechanism**

- Anthropic Art 1: Generator uses git version control; commit per sprint
- Anthropic Art 2: "Ask the model to commit its progress to git with descriptive commit messages"; git enables reverting bad changes and recovering working states
- OpenAI: Short-lived PRs are the unit of work; agent-to-agent review through PRs; ~1,500 merged PRs
- Ralph: `git add -A && git commit -m "..." && git push` after successful tests; create semantic version tags at clean states; `git reset --hard` for recovery
- HumanLayer: Git commits as checkpoint mechanism

**Consensus:** Git is not just version control in these workflows — it is the primary state persistence and recovery mechanism. Each commit is a safe checkpoint. The ability to `git reset --hard` represents the "no permanent failure state" guarantee.

---

**4. Separate generation from verification**

- Anthropic Art 1: Generator-Evaluator architecture; evaluator is a separate agent instance; can't self-evaluate
- Anthropic Art 2: Browser automation (Puppeteer MCP) for end-to-end verification; can't self-verify from code alone
- OpenAI: Agent-to-agent code review; structural tests; linters as mechanical validators; observability stack for runtime verification
- Ralph: Test-first after implementation; backpressure validation gates; separate planning loop from building loop
- HumanLayer: Back-pressure mechanisms; hooks surface errors; verification must be context-efficient

**Consensus:** Self-evaluation is unreliable. Every architecture separates the doer from the verifier — whether through separate agent instances, separate loops, mechanical validators, or automated test suites. The verifier must have access to ground truth (running application, type system, test suite) that the generator does not self-supply.

---

**5. Structured artifacts over raw text for cross-session state**

- Anthropic Art 1: Sprint contracts (negotiated before implementation)
- Anthropic Art 2: JSON feature list (not Markdown — "model is less likely to inappropriately change or overwrite JSON files"); `claude-progress.txt`; `init.sh`
- OpenAI: Structured `docs/` directory; quality scorecards; execution plans with progress logs; AGENTS.md as map
- Ralph: `@fix_plan.md` + `@specs/` + `@AGENT.md`; test documentation with embedded reasoning; self-updating AGENT.md
- HumanLayer: Skills as structured directories; `filepath:line` citation format for sub-agent responses

**Consensus:** Unstructured text degrades across sessions. Artifacts that survive session boundaries must be deliberately structured — preferably in formats that are hard to accidentally corrupt (JSON over Markdown), machine-readable, and mechanically validated.

---

**6. Mechanical enforcement over instructed constraints**

- Anthropic Art 1: Specific grading criteria for evaluators; Playwright for verification (not prompts)
- Anthropic Art 2: JSON format (structural protection); strongly-worded prohibitions with exact prompt text
- OpenAI: Custom linters fail PRs for architectural violations; structural tests validate dependency flow; CI validates documentation currency; "telling agents 'don't do X' in markdown is a suggestion; making X trigger a build failure is a rule"
- Ralph: Backpressure gates (compilation, tests); separate loops for identifying placeholders
- HumanLayer: Hooks enforce at lifecycle boundaries; exit code 2 forces re-engagement; typecheck/build as hard gates

**Consensus:** Prompt instructions are suggestions. Structural enforcement is a rule. Every source moves critical constraints from prompts to mechanisms — linters, CI gates, validation hooks, format choices. The more important the constraint, the more mechanical its enforcement should be.

---

**7. Technical debt management as active background process**

- Anthropic Art 1: Architecture evolved (sprint construct eliminated) as model improved — what was a constraint became unnecessary overhead
- Anthropic Art 2: Agents leave environment in "clean state" per session; git history as evidence trail
- OpenAI: Recurring background Codex tasks scan for deviations; garbage collection metaphor; most cleanup PRs reviewable in under one minute and automerged
- Ralph: Periodic re-planning loops regenerate fix_plan.md from scratch; separate loops for placeholder identification; delete and regenerate TODO lists frequently
- HumanLayer: Code coverage stop hooks; periodic refactoring; start simple, add configuration only after failures

**Consensus:** Entropy is the natural trajectory of agent-generated code. Every successful harness treats maintenance as continuous background work, not periodic cleanup. The garbage collection metaphor (OpenAI) is apt — it must run constantly in small increments.

---

### Points of Divergence and Contradiction

---

**Divergence 1: Multi-agent vs. single general-purpose agent**

- Anthropic Art 1: Strong multi-agent stance — Generator + Evaluator + Planner as distinct agents
- Anthropic Art 2: Acknowledges uncertainty — "unclear whether a single general-purpose coding agent performs best across contexts, or if better performance can be achieved through a multi-agent architecture"
- OpenAI: Agent-to-agent review but Codex instances, not specialized role-based agents
- Ralph: Single agent loop (Ralph) with subagents for context isolation, not for roles
- HumanLayer: Explicitly says role-based sub-agents ("frontend engineer," "backend engineer") DON'T work; sub-agents for context isolation DO work

**Resolution:** The divergence is between role-based specialization (unclear benefit) and context isolation (clear benefit). Sub-agents as context firewalls work; sub-agents as simulated human roles do not.

---

**Divergence 2: How much to put in AGENTS.md/CLAUDE.md**

- OpenAI: 100-line table of contents; everything else in structured `docs/`
- HumanLayer: Under 60 lines; hand-crafted; no auto-generation; ETH Zurich study confirms less is more
- Ralph: AGENT.md with compilation/execution instructions; agent self-updates it
- Anthropic Art 2: No specific line limit mentioned; focus on JSON feature list and progress file

**Resolution:** Strong consensus that LESS is better and that comprehensive documentation in a single file actively hurts performance. The disagreement is on exactly how to structure the "map to docs" approach. All sources agree: never auto-generate it.

---

**Divergence 3: Planning vs. no planning**

- Anthropic Art 1: Planner agent creates detailed spec with 16+ features across 10 sprints before any implementation
- Anthropic Art 2: Initializer agent creates comprehensive feature list before coding begins
- OpenAI: Design documentation, architecture documentation, execution plans — all pre-existing before agent runs
- Ralph: "I don't plan. The models know what a compiler is better than I do. I just ask it." — Generate TODO lists dynamically, delete and regenerate frequently

**Resolution:** This is the sharpest real contradiction. Huntley's approach trusts the model's domain knowledge and generates plans dynamically. The Anthropic and OpenAI approaches front-load planning into structured artifacts. The resolution may be domain-dependent: for well-defined software tasks, dynamic planning works; for novel or complex product requirements, front-loaded planning reduces specification errors that compound.

---

**Divergence 4: Session continuity vs. clean resets**

- Anthropic Art 1: Context RESETS (not compaction) — structured handoff artifacts enable reset
- Anthropic Art 2: Compaction is insufficient; agents need `claude-progress.txt` + git history for continuity
- OpenAI: Short-lived PRs (sessions are short); progressive disclosure (AGENTS.md as map); no explicit reset strategy
- Ralph: `while :; do ... ; done` — each loop iteration is a fresh context; reset is structural
- HumanLayer: Sub-agents with fresh contexts; parent thread maintained in "smart zone"

**Resolution:** All sources agree compaction alone is insufficient. The divergence is on HOW to bridge sessions — whether through structured artifacts (Anthropic Art 2), frequent resets (Ralph), or very short-lived sessions (OpenAI). All approaches arrive at the same place: context must be managed deliberately, not left to automatic mechanisms.

---

### The Meta-Pattern: The Harness as Discipline

All sources converge on one insight that transcends any specific pattern:

**The engineering discipline has moved from writing code to designing systems that make good code inevitable.**

Every specific pattern is an instance of this shift:

- Context management = designing information architecture for agents
- Mechanical enforcement = designing constraints that prevent mistakes structurally
- Structured artifacts = designing state persistence that survives session boundaries
- Verification separation = designing feedback loops that provide ground truth
- Garbage collection = designing maintenance into the system, not as afterthought

The model writes the code. The engineer designs the environment in which the model can only write good code.

---

### Decision Tree: Which Patterns to Apply When

**For greenfield projects with clear specs:**
→ Ralph approach: while loop, one item per loop, dynamic planning, minimal upfront structure

**For complex product development requiring long-horizon work:**
→ Anthropic Art 2 approach: initializer + coding agent, JSON feature list, session initialization checklist

**For teams building production systems at scale (>500k LOC):**
→ OpenAI approach: AGENTS.md as map, strict layering + mechanical enforcement, agent-to-agent review, observability wired into runtime, garbage collection background agents

**For individual developers optimizing existing setups:**
→ HumanLayer approach: audit CLAUDE.md for size/quality, replace MCP servers with CLI wrappers, add hooks at lifecycle boundaries, use sub-agents for context isolation, start simple and add only after actual failures

---

### Implementation Priority Stack (synthesized across all sources)

**Tier 1 (highest ROI, do first):**

1. Enforce one task at a time (structural, not prompted)
2. Use git commits as session checkpoints after every completed unit
3. Separate verification from generation (separate agent, separate loop, or mechanical gate)
4. Write a structured JSON/machine-readable task list (not markdown prose)

**Tier 2 (significant ROI):** 5. AGENTS.md/CLAUDE.md as map only — under 100 lines, hand-crafted, no auto-generation 6. Hooks at lifecycle boundaries that fail silently on success, loudly on failure 7. Sub-agents for context isolation on research/lookup tasks 8. Custom CLI wrappers instead of large MCP server tool sets

**Tier 3 (at scale):** 9. Mechanical architectural enforcement via custom linters and structural tests 10. Recurring background garbage collection agents 11. Observability wired into agent runtime (logs, metrics, traces) 12. Agent-to-agent review loops 13. Progressive documentation architecture (structured `docs/` directory)

---

_Sources used:_

- https://www.anthropic.com/engineering/harness-design-long-running-apps
- https://www.anthropic.com/engineering/effective-harnesses-for-long-running-agents
- https://openai.com/index/harness-engineering/ (reconstructed via InfoQ, Jay Taylor's notes, Tecyfy, agent-engineering.dev)
- https://ghuntley.com/ralph/
- https://www.humanlayer.dev/blog/skill-issue-harness-engineering-for-coding-agents
- https://martinfowler.com/articles/exploring-gen-ai/harness-engineering.html
- https://jaytaylor.com/notes/node/1770842156000.html
- https://www.infoq.com/news/2026/02/openai-harness-engineering-codex/
- https://tecyfy.com/blog/engineering-for-agents-building-a-million-line-codebase-with-zero-manual-code
- https://www.agent-engineering.dev/article/harness-engineering-in-2026-the-discipline-that-makes-ai-agents-production-ready
