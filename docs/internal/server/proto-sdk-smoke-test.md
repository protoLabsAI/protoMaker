# Test the Proto SDK ↔ protoMaker path

A one-command smoke test that confirms `@protolabsai/sdk`'s agentic loop actually executes tools against the live gateway — the path protoMaker's `ProtoProvider` drives for every feature execution. Use it after bumping the SDK, when agent runs come back empty, or to sanity-check gateway connectivity. You'll have a PASS/FAIL verdict in well under a minute.

## When to run it

- **After an SDK bump** (`@protolabsai/sdk` version change in `apps/server/package.json`) — verify the new version didn't regress the loop before merging.
- **When feature executions come back empty** — agents that emit intent then stop without running tools are the signature of [protoCLI#307](https://github.com/protoLabsAI/protoCLI/issues/307). This test reproduces that scenario in isolation, so you can tell an SDK problem apart from a protoMaker pipeline problem.
- **To check the gateway path** — confirms `OPENAI_API_KEY` / `OPENAI_BASE_URL` reach the SDK and `api.proto-labs.ai` answers.

## Run it

From the repo root:

```bash
node scripts/smoke/proto-sdk-smoke.mjs                  # protolabs/smart, 1 iteration
node scripts/smoke/proto-sdk-smoke.mjs protolabs/fast   # choose a model tier
node scripts/smoke/proto-sdk-smoke.mjs protolabs/smart 5 # 5 iterations (the bug was intermittent)
```

Credentials are read from `GATEWAY_API_KEY` / `GATEWAY_BASE_URL`. If they aren't already exported, the script auto-loads the repo-root `.env` — the same file the prod LaunchAgent sources. No secrets are printed.

## What it does

The script calls `query()` from `@protolabsai/sdk` with the **same option shape `ProtoProvider.executeQuery` uses** (`model`, `cwd`, `env`, `maxSessionTurns`, `permissionMode: 'yolo'`, `abortController`). It runs a two-step task that _cannot_ be completed by planning alone:

> Create `result.txt` containing exactly `PROTO_OK`, then read it back to confirm.

It streams the SDK messages, counts assistant turns and `tool_use` blocks, and then checks the filesystem. **PASS requires the file to actually exist with the right contents and at least one tool call** — proof the loop continued past the planning turn and executed tools.

```
[1/1] PASS — turns=8 toolUses=2 [write_file, read_file] result=success file=true content="PROTO_OK"

=== 1/1 PASS ===
```

Exit code is `0` only if every iteration passed (`1` on any failure, `2` if misconfigured), so it drops straight into CI or a pre-merge check.

## Interpreting a FAIL

| Symptom                                                                    | Likely cause                                                                                                                                                                                                                                                                                                     |
| -------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `toolUses=0`, `file=false`, low `turns`                                    | Loop stopped after planning — the protoCLI#307 regression. Check the SDK version.                                                                                                                                                                                                                                |
| `CLI process exited with code 1` on every run / `No auth type is selected` | proto has no auth-type configured. Seed `~/.proto/settings.json` with `{"security":{"auth":{"selectedType":"openai"}}}` — done automatically by `docker-entrypoint.sh` (#4042); standalone, run `proto qwen setup`. proto **0.55.3+** requires this even with the gateway env set (0.37.x inferred it from env). |
| `400 Invalid model name model=qwen3.5-plus`                                | proto's default model isn't on the gateway. Pass a gateway model (`-m protolabs/fast`); protoMaker supplies the `protolabs/*` tier per-run, so this only bites bare `proto -p` calls.                                                                                                                            |
| `error=...` mentioning 401 / auth                                          | Gateway key not reaching the SDK. Confirm `GATEWAY_API_KEY` in `.env`.                                                                                                                                                                                                                                           |
| `error=...` 529 / overloaded                                               | Transient gateway load — re-run; intermittent, not an SDK regression.                                                                                                                                                                                                                                            |
| `result=error_*` with tools fired                                          | Task-level failure, not a loop failure — inspect the run.                                                                                                                                                                                                                                                        |

## How this maps to protoMaker

`ProtoProvider` (`apps/server/src/providers/proto-provider.ts`) is the production driver: it builds the gateway env (`buildEnv()` sets `OPENAI_API_KEY`/`OPENAI_BASE_URL`), maps `ExecuteOptions` → `QueryOptions`, and yields the SDK's `AsyncIterable` straight through as `ProviderMessage`s. The smoke test mirrors that invocation deliberately, so a PASS here means the same path the Lead Engineer pipeline relies on is healthy. See [Provider Architecture](./providers.md) for the full abstraction.

## Files

- `scripts/smoke/proto-sdk-smoke.mjs` — the test
- `apps/server/src/providers/proto-provider.ts` — the production invocation it mirrors
