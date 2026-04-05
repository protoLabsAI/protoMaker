# AI Providers

Connect protoLabs Studio to AI models from any provider. Three provider systems are available, each serving a different integration pattern. All provider models appear in every model dropdown once configured.

## Provider Types

| Type                                              | Use Case                                                              | Format                  |
| ------------------------------------------------- | --------------------------------------------------------------------- | ----------------------- |
| [Claude Compatible](#claude-compatible-providers) | Alternative Claude API endpoints (OpenRouter, cost-optimized proxies) | Anthropic SDK           |
| [OpenAI Compatible](#openai-compatible-providers) | Local models (Ollama, LM Studio) and OpenAI-format APIs               | OpenAI Chat Completions |
| [LiteLLM Gateway](#litellm-gateway)               | Single proxy for 30+ providers — Claude, OpenAI, Gemini, local models | OpenAI Chat Completions |

---

## Claude Compatible Providers

Use any endpoint that implements the Anthropic Claude API. Models appear in dropdowns alongside native Claude models and support the same thinking level controls.

### Setup

1. Go to **Settings → AI Models → Claude Compatible Providers**
2. Click **Add Provider** or select a template
3. Set the base URL and API key
4. Add models and configure which Claude tier each maps to

### Templates

| Template         | Base URL                           | Description                   |
| ---------------- | ---------------------------------- | ----------------------------- |
| Direct Anthropic | `https://api.anthropic.com`        | Standard Anthropic API        |
| OpenRouter       | `https://openrouter.ai/api`        | Access Claude and 300+ models |
| z.AI GLM         | `https://api.z.ai/api/anthropic`   | GLM models at lower cost      |
| MiniMax          | `https://api.minimax.io/anthropic` | MiniMax M2.1 model            |

### Model Mapping

Each model specifies which Claude tier it replaces via `mapsToClaudeModel`. This controls which phase model slots the model appears in:

| Value    | Used for                                                |
| -------- | ------------------------------------------------------- |
| `haiku`  | Quick, cheap tasks (file descriptions, commit messages) |
| `sonnet` | Standard work (feature implementation, validation)      |
| `opus`   | Architectural and high-quality generation tasks         |

### API Key Sources

| Source        | When to use                                        |
| ------------- | -------------------------------------------------- |
| `inline`      | Store the key directly in settings                 |
| `env`         | Read from `ANTHROPIC_API_KEY` environment variable |
| `credentials` | Use the key stored in the credentials store        |

---

## OpenAI Compatible Providers

Use any endpoint that implements the OpenAI Chat Completions API (`POST /v1/chat/completions`). Best for local models and self-hosted LLM servers.

### Setup

1. Go to **Settings → AI Models → OpenAI Compatible Providers**
2. Click **Add Provider** or select a template
3. Set the base URL and optionally an API key
4. Add models — enter the model ID exactly as the endpoint expects it

### Templates

| Template    | Base URL                      | Description                          |
| ----------- | ----------------------------- | ------------------------------------ |
| Ollama      | `http://localhost:11434/v1`   | Run open-source LLMs locally         |
| LM Studio   | `http://localhost:1234/v1`    | Local LLM inference with GUI         |
| Together AI | `https://api.together.xyz/v1` | 200+ open-source models in the cloud |

### Models

Unlike Claude Compatible providers, OpenAI Compatible models don't need a `mapsToClaudeModel`. Add them manually with the exact model ID the endpoint expects:

```
Provider: Ollama
Base URL: http://localhost:11434/v1
Models:
  - ID: llama3.2      Display: Llama 3.2
  - ID: codellama     Display: Code Llama
```

Once added and enabled, these models appear in all phase model dropdowns.

---

## LiteLLM Gateway

LiteLLM is a unified proxy that routes requests to 100+ LLM providers through a single OpenAI-compatible endpoint. Configure it once and all gateway models appear in every dropdown automatically — no manual model entry required.

### Setup

1. Deploy a LiteLLM Gateway (self-hosted or cloud)
2. Go to **Settings → AI Models → LiteLLM Gateway**
3. Enable the gateway and set the base URL
4. Configure authentication
5. Click **Test Connection** — if successful, models sync immediately

### Configuration

| Setting                  | Description                                      | Default                 |
| ------------------------ | ------------------------------------------------ | ----------------------- |
| **Base URL**             | Gateway endpoint (e.g., `http://localhost:4000`) | `http://localhost:4000` |
| **API Key Source**       | How to supply the master key                     | `inline`                |
| **API Key**              | Master key value (when source = `inline`)        | —                       |
| **Env Var**              | Environment variable name (when source = `env`)  | —                       |
| **Auto-discover models** | Fetch model list from `/models` on startup       | `true`                  |
| **Model prefix**         | Prefix added to model IDs in UI                  | `litellm/`              |

### API Key Sources

| Source   | Behavior                                                      |
| -------- | ------------------------------------------------------------- |
| `inline` | Key stored in settings, sent as `Authorization: Bearer <key>` |
| `env`    | Key read from the specified environment variable at startup   |

> For containerized deployments, inject the key via the environment variable (e.g., `LITELLM_MASTER_KEY`) rather than storing it inline. The gateway module resolves the env var once at startup and stores the result internally.

### Startup Sync

When the gateway is enabled, protoLabs automatically syncs the gateway's full model list to the OpenAI Compatible Providers registry on every server start. This means:

- All gateway models appear in dropdowns immediately after startup
- The model list stays current across gateway configuration changes (restart to refresh)
- If the gateway is unreachable at startup, a warning is logged and models are absent until the next restart

### Networking

In Docker deployments, the server container must be able to reach the gateway host. If the gateway runs on the host machine (not in the same Docker network), add the host alias in `docker-compose.yml`:

```yaml
services:
  server:
    extra_hosts:
      - 'litellm-host:host-gateway' # resolves to Docker host IP on Linux
```

Then use `http://litellm-host:4000` as the gateway base URL.

### Example: protoLabs Homelab Setup

```
Base URL: http://ava:4000
API Key Source: env
Env Var: LITELLM_MASTER_KEY
Auto-discover: true
```

The `ava` hostname resolves via `extra_hosts: ava:host-gateway` in the staging Docker Compose.

---

## Model Routing & Complexity Tiers

Once providers are configured, use the model routing settings to control which model runs for each task.

### Complexity Tiers

Features are assigned a complexity level (`small`, `medium`, `large`, `architectural`). The complexity tier settings map each level to a model:

| Tier              | Default | Typical Use                                                   |
| ----------------- | ------- | ------------------------------------------------------------- |
| **Small**         | Haiku   | Trivial tasks, quick fixes, one-file changes                  |
| **Medium**        | Sonnet  | Standard feature work                                         |
| **Large**         | Sonnet  | Complex multi-file changes, refactors                         |
| **Architectural** | Opus    | System design, core infrastructure, performance-critical work |

Configure in **Settings → AI Models → Model Defaults → Complexity Tiers**.

Any provider model can be assigned to any tier — for example, route small features to a local Ollama model and architectural features to Opus.

### Agent Execution (catch-all)

The **Agent Execution** model applies when a feature has no complexity set. This is the fallback for manually-created features that haven't been assigned a complexity level.

### Priority Chain

When auto-mode selects a model for a feature, it follows this priority order:

1. Explicit `model` field set on the feature itself
2. 2+ failures → Opus escalation
3. Agent role manifest or `roleModelOverrides` settings
4. **Complexity tier setting** (small/medium/large/architectural)
5. **Agent Execution** catch-all setting
6. Built-in default (Sonnet)

### Per-Phase Task Models

Beyond agent execution, individual application tasks have their own model settings:

| Task                | Default | Location         |
| ------------------- | ------- | ---------------- |
| Feature Enhancement | Sonnet  | Quick Tasks      |
| Commit Messages     | Haiku   | Quick Tasks      |
| App Specification   | Opus    | Generation Tasks |
| Feature Generation  | Sonnet  | Generation Tasks |
| Memory Extraction   | Haiku   | Memory Tasks     |

All configurable in **Settings → AI Models → Model Defaults**.

---

## Related

- [Model Defaults Reference](../reference/api-key-profiles) — Full PhaseModelConfig type reference
- [Workflow Settings](../reference/workflow-settings) — Per-project model overrides
