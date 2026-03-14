# Project Service

Manages project orchestration data: CRUD operations for projects, milestones, and phases.

## Overview

`ProjectService` is the persistence and coordination layer for protoLabs project documents. Projects are stored as Markdown and JSON files under `.automaker/projects/{slug}/`. An in-memory cache (`Map<string, Project>`) accelerates reads; all writes go to disk first.

Key responsibilities:

- **Project CRUD** — create, read, update, delete projects and their sub-structure
- **Milestone and phase management** — full lifecycle for milestones and phases within a project
- **In-memory cache** — lazy-loaded read cache backed by disk as source of truth
- **Event broadcasting** — emits project events via EventBus for multi-instance sync
- **Human-readable output** — generates Markdown files alongside JSON for git history

## Storage Layout

```text
.automaker/
  projects/
    {slug}/
      project.json          # Serialized Project record
      project.md            # Human-readable Markdown
      milestones/
        {milestone-slug}/
          milestone.md
          {phase-slug}.md
```

The `projects.json` Automerge document is keyed by `projectPath` and holds all projects for that repo root in a single Automerge `Doc<{ projects: Record<string, Project> }>`.

## CRDT Enablement

CRDT is enabled per `projectPath` when `proto.config.yaml` exists at that path:

```typescript
private _isCrdtEnabled(projectPath: string): boolean {
  return existsSync(path.join(projectPath, 'proto.config.yaml'));
}
```

When CRDT is enabled:

- All mutations go through Automerge `change()` for conflict-free merging
- Events are emitted on `_crdtEvents` for the sync mesh to broadcast
- Remote changes arrive via `applyRemoteChange(projectPath, change)`

When CRDT is disabled (single-instance mode), the service reads/writes plain JSON/Markdown directly.

## Key APIs

### Projects

```typescript
// List all projects for a project root
getProjects(projectPath: string): Promise<Project[]>

// Get a single project by slug
getProject(projectPath: string, slug: string): Promise<Project | null>

// Create a new project (generates slug, creates directories, writes Markdown)
createProject(projectPath: string, input: CreateProjectInput): Promise<Project>

// Update project metadata
updateProject(projectPath: string, slug: string, update: UpdateProjectInput): Promise<Project>

// Delete a project and all its files
deleteProject(projectPath: string, slug: string): Promise<void>

// Get aggregate stats across all projects
getProjectStats(projectPath: string): Promise<ProjectStats>
```

### Milestones and Phases

```typescript
// Update a milestone's status
updateMilestone(projectPath: string, projectSlug: string, milestoneSlug: string, update): Promise<void>

// Update a phase (including claim state for work intake)
updatePhase(projectPath: string, projectSlug: string, milestoneSlug: string, phaseName: string, update: Partial<Phase>): Promise<void>

// Read a single phase (used by WorkIntakeService to verify claim survived merge)
getPhase(projectPath: string, projectSlug: string, milestoneSlug: string, phaseName: string): Promise<Phase | null>
```

### Feature Generation

```typescript
// Create features from all claimable phases in a project
createFeaturesFromProject(
  projectPath: string,
  projectSlug: string,
  options: CreateFeaturesFromProjectOptions
): Promise<CreateFeaturesResult>
```

Uses `phaseToFeatureDescription()` and `phaseToBranchName()` from `@protolabsai/utils` to materialize phases into feature records.

## Automerge Document Management

The service maintains one Automerge doc per `projectPath`, lazy-initialized on first access:

```typescript
type ProjectsDoc = { projects: Record<string, Project> };

private readonly _docs = new Map<string, Automerge.Doc<ProjectsDoc>>();
private readonly _initPromises = new Map<string, Promise<void>>();
```

`_ensureDoc(projectPath)` initializes the doc from disk the first time it is accessed. Subsequent calls return the cached doc. Init is deduplicated via `_initPromises`.

## Markdown Generation

Every mutation triggers regeneration of the human-readable Markdown files via `@protolabsai/utils`:

| Function                    | Output file                                              |
| --------------------------- | -------------------------------------------------------- |
| `generateProjectMarkdown`   | `.automaker/projects/{slug}/project.md`                  |
| `generateMilestoneMarkdown` | `.automaker/projects/{slug}/milestones/{m}/milestone.md` |
| `generatePhaseMarkdown`     | `.automaker/projects/{slug}/milestones/{m}/{phase}.md`   |

These files are git-tracked and provide human-readable context for agents and reviewers.

## Project Stats

`getProjectStats(projectPath)` returns aggregate counts across all projects:

```typescript
interface ProjectStats {
  totalProjects: number;
  totalMilestones: number;
  totalPhases: number;
  completedPhases: number;
  inProgressPhases: number;
  claimedPhases: number;
}
```

Stats are written to `.automaker/projects/stats.json` and used by the dashboard.

## Calendar Integration

When `CalendarService` is wired in via `setCalendarService()`, project milestone dates can be synced to calendar events. This is optional; the service functions normally without it.

## Key Files

| File                                                 | Role                                                 |
| ---------------------------------------------------- | ---------------------------------------------------- |
| `apps/server/src/services/project-service.ts`        | Core service — CRUD, Automerge, Markdown generation  |
| `apps/server/src/services/project-service.module.ts` | NestJS module wiring                                 |
| `libs/platform/src/paths.ts`                         | Path helpers (`getProjectDir`, `getMilestoneDir`, …) |
| `libs/utils/src/project-utils.ts`                    | `createProject`, Markdown generators, phase utils    |
| `libs/types/src/project.ts`                          | `Project`, `Milestone`, `Phase`, input types         |

## See Also

- [Work Intake Service](./work-intake-service) — reads phase state and updates claim status
- [CRDT Sync Service](./crdt-sync-service) — broadcasts project change events to peer instances
- [Ava Channel Reactor](./ava-channel-reactor) — triggers work intake on capacity heartbeats
