# Linear deeplink to AI coding tools

Linear released a feature (February 2026) that lets users launch AI coding tools directly from any issue, with the issue context automatically pre-filled into the tool's prompt.

## What the feature does

From any Linear issue, a user can:

- Press `Cmd+Option+.` (Mac) or `Ctrl+Alt+.` (Win/Linux) to launch the most recently used tool
- Press `W` then `O` to choose from their enabled tools
- Click a button adjacent to the issue identifier in the UI

Linear pre-fills the tool's prompt with: issue ID, description, comments, updates, linked references, and attached images. Teams can also configure custom prompt templates with variable interpolation (`{{issue.identifier}}`, `{{context}}`, etc.) to add standing instructions (e.g., "write a test spec before coding").

Supported tools at launch: Claude Code, Codex, Conductor, Cursor, GitHub Copilot, OpenCode, Replit, v0, Zed.

## Relationship to our existing Linear integration

Our current integration is **webhook-based** (AgentSession events). When a user @mentions the protoLabs agent on an issue, Linear fires a webhook to our server, and our `LinearAgentRouter` responds with activities visible in Linear's agent sidebar.

The deeplink feature is **entirely separate** from this flow. It is a client-side action in the Linear app — Linear opens the user's chosen tool directly (e.g., launches Claude Code CLI) with a pre-built prompt string. There is no webhook or server-side call to our infrastructure.

| Mechanism               | Trigger                                 | Data path                             | Our role                                           |
| ----------------------- | --------------------------------------- | ------------------------------------- | -------------------------------------------------- |
| @mention / AgentSession | User @mentions agent in comment         | Linear → our webhook → agent responds | Active — we receive and handle                     |
| Deeplink                | User presses keyboard shortcut / button | Linear → opens tool directly          | Passive — Claude Code CLI receives, not our server |

## Implications for protoLabs Studio

**No immediate code changes required.** The deeplink feature operates on Linear's client side and opens Claude Code (or other tools) directly. Our server is not in the path.

**Opportunity — custom prompt template for protoLabs context:**
Users who have protoLabs running can configure a Linear prompt template that includes instructions to use our MCP tools or reference the board. For example:

```
Issue: {{issue.identifier}} — {{issue.title}}

{{context}}

Use the protoLabs MCP tools to check the board status for this issue and continue implementation from where the agent left off.
```

This requires no code changes — it is a user-configurable template in Linear settings.

**Opportunity — protoLabs as a registered deeplink target:**
Linear's tool list is curated (9 tools at launch). To appear as a first-class option in the Linear deeplink menu, protoLabs would need to be accepted into Linear's tool registry. This is a partnership/distribution question, not an engineering one at this stage.

**Potential future work — URL scheme handler:**
If Linear exposes a URL scheme for custom tools (e.g., `protolabs://open?issue=XXX&context=...`), we could implement an Electron or server-side URL handler that receives the issue context and auto-creates a feature on the board. This is speculative until Linear documents the integration API for custom tools.

## Action items from this investigation

| Item                                                      | Priority | Notes                                           |
| --------------------------------------------------------- | -------- | ----------------------------------------------- |
| Document custom prompt template guidance                  | Low      | Add to `linear.md` usage tips                   |
| Monitor Linear changelog for custom tool registration API | Low      | Required before we can appear in deeplink menu  |
| Evaluate URL scheme handler (Electron)                    | Backlog  | Only relevant if Linear opens its tool registry |

## References

- [Linear changelog: Deeplink to AI coding tools (2026-02-26)](https://linear.app/changelog/2026-02-26-deeplink-to-ai-coding-tools)
- [Linear integration](./linear.md)
