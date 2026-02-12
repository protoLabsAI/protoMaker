# PRD: Agent Runner UI + Dashboard Event Feed

## Situation
The Agent Runner UI currently has a model dropdown (haiku/sonnet/opus) as its primary control, with the role selector buried 2 clicks deep in a config popover. The agentConfig (role, maxTurns, systemPromptOverride) is dead state - selecting a role has zero effect on execution. The dashboard is purely a project picker with no event feed or health metrics.

## Problem
Users think in agents, not models. The current UI doesn't reflect the agent-first architecture we've built (Role Registry, Agent Factory, Dynamic Executor). The dashboard provides no visibility into what agents are doing or project health. This blocks the path to full autonomy because humans can't see what's happening.

## Approach
1) Replace the model dropdown with an agent selector powered by the Role Registry API. 2) Wire agentConfig to useElectronAgent so role selection actually affects execution. 3) Server-side: AgentService resolves templates from RoleRegistryService, applies system prompt + tools + model. 4) Add an event feed to the dashboard consuming the existing WebSocket event stream. 5) Add a project health card showing board state and agent status.

## Results
Users can select any registered agent from the primary dropdown, chat with that agent's personality and tools, and see a live feed of agent activity and project health on the dashboard.

## Constraints
Keep PRs under 200 lines each,Don't break existing model selection for non-agent use cases,Dashboard event feed must not overwhelm - clean and minimal,Use existing WebSocket event stream, don't add new endpoints,Preserve backward compatibility with existing sessions
