# Proto Agent SDK Architecture

How the Proto Agent SDK (`@qwen-code/sdk`) works under the hood: the subprocess model, control plane protocol, message routing, hook lifecycle, MCP bridging, and session management. This document is for contributors building on top of the SDK or debugging agent behavior at the protocol level.

## Subprocess model

The SDK does not embed an agent runtime. It spawns the Proto CLI as a child process and communicates over stdin/stdout using newline-delimited JSON (JSON-Lines).

```
┌──────────────────────┐         stdin (JSON-Lines)         ┌──────────────────────┐
│                      │ ──────────────────────────────────> │                      │
│   Your Application   │                                     │    Proto CLI         │
│   (SDK host)         │ <────────────────────────────────── │    (child process)   │
│                      │        stdout (JSON-Lines)          │                      │
└──────────────────────┘                                     └──────────────────────┘
```

This design exists for one reason: feature parity. The CLI already implements tool execution, file operations, git integration, shell access, MCP client support, model routing, and session persistence. Wrapping it as a subprocess means the SDK inherits all of that without reimplementing any of it. When the CLI gains a new tool or capability, every SDK consumer gets it for free on upgrade.

The child process runs with the same filesystem permissions and environment variables as the host process. There is no sandboxing boundary between the SDK and the CLI -- they share the same user context. This is intentional. Agents need direct access to the file system, git repositories, and shell to do useful work.

Stderr from the CLI subprocess is captured separately and forwarded to the SDK's diagnostic logging. It is not part of the protocol.

## The control plane

The SDK and CLI communicate through a bidirectional control protocol layered on top of the JSON-Lines stream. Every message has a `type` field that determines how it is handled. Control messages fall into three categories.

### SDK-to-CLI messages

These messages flow from your application (via the SDK) to the CLI subprocess.

**`initialize`** -- sent once at startup. Carries the full configuration: prompt, model, permission mode, allowed tools, MCP server descriptors, extension flags, and session ID. The CLI uses this to set up its internal state before processing the first query.

**`interrupt`** -- signals the CLI to stop the current operation. The CLI finishes the active tool call (if any), discards pending work, and sends back whatever results it has accumulated. This is what fires when you call `abort()` on an AbortController.

**`set_model`** -- changes the model mid-session. The CLI applies the new model to the next API call. Useful for escalation patterns where you start with a fast model and switch to a stronger one after a failure.

**`set_permission_mode`** -- changes the permission mode mid-session. You can start in `acceptAll` for trusted phases and switch to `byTool` when the agent enters a sensitive section of the codebase.

### CLI-to-SDK messages

These messages flow from the CLI subprocess back to your application.

**`can_use_tool`** -- a permission request. The CLI is about to execute a tool and needs approval. The SDK evaluates this against your `permissionMode` and `canUseTool` callback, then sends back a `control_response` with the decision. The CLI blocks until it receives the response.

**`hook_callback`** -- a hook event. The CLI has reached a hook point (PreToolUse or PostToolUse) and is notifying your registered callbacks. Like `can_use_tool`, the CLI blocks until the SDK sends a `control_response` with the hook result.

**`mcp_message`** -- a tool call routed to an SDK-hosted MCP server. The CLI has determined that a tool belongs to one of your in-process MCP servers and is forwarding the invocation. The SDK executes the tool handler and sends the result back as a `control_response`.

### Lifecycle messages

**`control_response`** -- the SDK's reply to any CLI-to-SDK message. Contains the result (permission decision, hook outcome, or MCP tool output) keyed by a correlation ID from the original request.

**`control_cancel_request`** -- sent by the SDK to cancel a pending CLI-to-SDK request. If the SDK's AbortController fires while the CLI is waiting on a `can_use_tool` response, the SDK sends this to unblock the CLI.

The correlation ID in each message pair ensures that responses are matched to requests even when multiple control messages are in flight. The CLI assigns monotonically increasing IDs; the SDK echoes them back.

## Message routing

Not every line on stdout is a control message. The CLI also emits assistant text, tool results, system messages, and partial streaming chunks. The SDK's `Query.routeMessage()` method discriminates between these types and routes them to the appropriate handler.

```
stdout line arrives
    │
    ├── type: "system"      → update internal state (model, session, config)
    │
    ├── type: "assistant"   → append to result, fire onPartialMessage if streaming
    │
    ├── type: "result"      → tool execution result, append to conversation
    │
    ├── type: "control"     → route to control plane handler
    │   ├── can_use_tool    → evaluate permission, send control_response
    │   ├── hook_callback   → invoke registered hook, send control_response
    │   └── mcp_message     → forward to MCP server, send control_response
    │
    └── type: "error"       → surface as SDK error or diagnostic log
```

Each message is a self-contained JSON object on a single line. The SDK parses lines eagerly -- it does not buffer across newlines. This means partial JSON (from a flush mid-write) never reaches the router. The CLI guarantees atomic line writes.

System messages carry metadata updates: the current model, token usage, session ID confirmations, and capability flags. The SDK uses these to keep its internal state synchronized with the CLI.

## Hook callback lifecycle

Hooks are registered during initialization. The SDK includes hook descriptors in the `initialize` message, telling the CLI which events it cares about. The CLI does not send hook callbacks for events with no registered handlers.

The lifecycle for a single hook event:

1. The CLI reaches a hook point (about to call a tool, or just received a tool result).
2. The CLI serializes the event context (tool name, input or output, session ID) and sends a `hook_callback` message to the SDK.
3. The CLI blocks on stdin, waiting for the response.
4. The SDK receives the message via `Query.routeMessage()`, identifies the registered callbacks for that event, and invokes them sequentially in registration order.
5. The SDK aggregates the callback results. If any callback returns `{ shouldSkip: true }`, the aggregate result is skip. If any returns `{ shouldInterrupt: true }`, the aggregate is interrupt. Skip takes precedence over interrupt.
6. The SDK sends a `control_response` with the aggregated result.
7. The CLI receives the response and acts on it: skip the tool, interrupt the query, or proceed normally.

Multiple callbacks for the same event are called in order. A callback that returns early with `shouldSkip` does not prevent subsequent callbacks from executing -- all callbacks run, and the results are merged. This ensures audit loggers always see every event regardless of what other callbacks decide.

## MCP server bridging

When you pass MCP servers to `query()`, the SDK does not start separate MCP server processes. Instead, it registers tool descriptors with the CLI during initialization. The CLI sees these tools alongside its built-in tools and any external MCP servers.

When the agent calls a tool that belongs to an SDK-hosted MCP server:

1. The CLI recognizes the tool as SDK-hosted (from the initialization descriptor) and sends an `mcp_message` instead of executing locally.
2. The SDK receives the message, looks up the target server by name, and invokes the tool handler directly in the host process.
3. The handler runs as a normal async function. It has full access to your application's state, database connections, and imported modules.
4. The SDK serializes the handler's return value and sends it back as a `control_response`.
5. The CLI receives the result and presents it to the agent as if the tool had executed locally.

This in-process execution model eliminates serialization overhead for custom tools. Your tool handler receives native JavaScript objects and returns native JavaScript objects. There is no JSON-RPC framing, no stdio piping to a separate process, and no network round-trip.

The tradeoff is isolation. A bug in your tool handler (an unhandled exception, a memory leak, an infinite loop) affects the SDK host process directly. The CLI subprocess is unaffected -- it is simply waiting for a response. If the SDK host crashes, the CLI detects the broken pipe and exits.

External MCP servers (those not created via `createSdkMcpServer()`) still run as separate processes managed by the CLI. The SDK does not intercept their traffic.

## Session management

Every `query()` call produces a session. The session ID is a stable identifier that ties together the conversation history, tool results, and agent state for that interaction.

Sessions are persisted by the CLI, not the SDK. The CLI writes session data to its standard session storage location (typically `~/.proto/sessions/` or the configured data directory). The SDK only holds the session ID in memory.

When you pass `resume: true` with a `sessionId`, the SDK includes both in the `initialize` message. The CLI loads the previous session's conversation history and resumes from where it left off. The agent sees the full prior context -- every message, every tool call, every result -- as if the conversation never stopped.

Session resume works across process restarts because the session data lives on disk. You can store session IDs in a database, associate them with users or features, and resume them from a completely different host process. The only requirement is that the CLI has access to the same session storage directory.

The relationship between SDK sessions and CLI sessions is one-to-one. Each `query()` call maps to exactly one CLI session. Resuming creates a continuation of the same CLI session, not a new one. The CLI appends new messages to the existing session file.

If you call `query()` without `resume` or `sessionId`, the CLI creates a fresh session. The SDK receives the new session ID in a system message and exposes it on the result object.

## Why not a REST API?

A REST API would require the server to re-expose every capability that the CLI already provides: file reads, file writes, glob searches, grep, shell execution, git operations, MCP client management, model routing, session persistence, and tool permission handling.

Each of these capabilities interacts with the local filesystem and user environment. A REST API would need to either run on the same machine (making the network layer pure overhead) or run remotely (requiring a file synchronization protocol, remote shell execution, and credential forwarding).

The subprocess model sidesteps all of this. The CLI runs locally with direct filesystem access. There is no network serialization. There are no authentication headers. There is no API versioning problem -- the SDK and CLI are released together, and the JSON-Lines protocol is internal.

The tradeoff is that the SDK is a local-only interface. You cannot call it from a different machine without wrapping it in your own network layer. For the primary use case -- building agents that operate on local codebases -- this is the right constraint. Agents need to read files, run tests, execute git commands, and write code. All of these operations are inherently local.

If you need remote agent execution, the correct approach is to run the SDK on the remote machine and expose your own API surface (REST, gRPC, WebSocket) that delegates to `query()`. This keeps the filesystem access local to the agent and lets you design the remote API for your specific needs rather than inheriting a generic one.
