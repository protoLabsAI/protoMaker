# PRD: Chat Render Pipeline — Rich Tool Result Cards

## Situation
The Ask Ava chat overlay has a mature tool result card system — a ToolResultRegistry maps tool names to React components, with 22 cards already registered. However, 43+ tools still fall back to raw JSON preview. High-frequency tools like get_sitrep, list_projects, list_running_agents, merge_pr, and auto-mode controls render as unformatted data, making Ava's responses hard to scan.

## Problem
When users ask Ava about system status, projects, running agents, or PR pipeline, the responses render as markdown tables or JSON blobs instead of structured cards. This makes the chat overlay feel like a terminal rather than a dashboard. The tool result card pattern already exists and is proven — we just need more cards.

## Approach
Add custom tool result cards in 4 milestones: (1) Sitrep and status overview cards for the most-asked questions, (2) Project and lifecycle cards for project management, (3) PR pipeline and promotion cards for shipping workflow, (4) Auto-mode and agent operation cards. Each card follows the existing pattern: ToolResultRendererProps interface, data extraction from ToolResult envelope, loading state handling, and registration in tool-invocation-part.tsx.

## Results
All high-frequency Ava tools render rich, scannable cards instead of JSON. Users can quickly assess system status, project health, agent activity, and PR pipeline at a glance within the chat overlay.

## Constraints
Follow existing ToolResultRendererProps interface — no changes to the registry system,All cards go in libs/ui/src/ai/tool-results/ following naming convention,Register in libs/ui/src/ai/tool-invocation-part.tsx alongside existing registrations,Each card must handle loading states (input-streaming, input-available, approval-responded),Each card must handle the ToolResult envelope pattern ({ success, data }) and direct output,Use lucide-react icons and Tailwind CSS consistent with existing cards,No changes to server-side tools — only UI rendering
