# Feature Flags

Feature flags control the visibility and behavior of in-development functionality. They are toggled per-installation via **Settings > Developer > Feature Flags**.

## Overview

Feature flags live in a single source of truth: `DEFAULT_FEATURE_FLAGS` in `libs/types/src/global-settings.ts`. All fields default to `false` — new features are opt-in per environment.

```typescript
// libs/types/src/global-settings.ts
export interface FeatureFlags {
  avaChat: boolean;
  designs: boolean;
  docs: boolean;
  pipeline: boolean;
  specEditor: boolean;
  systemView: boolean;
  userPresenceDetection: boolean;
}

export const DEFAULT_FEATURE_FLAGS: FeatureFlags = {
  avaChat: false,
  designs: false,
  docs: false,
  pipeline: false,
  specEditor: false,
  systemView: false,
  userPresenceDetection: false,
};
```

`GlobalSettings.featureFlags` is persisted to `data/settings.json`. The UI merges server settings into `DEFAULT_FEATURE_FLAGS` on load — existing installs automatically pick up new flag fields without requiring a migration.

## Current Flags

| Flag                    | Default | What it gates                                                          |
| ----------------------- | ------- | ---------------------------------------------------------------------- |
| `avaChat`               | off     | Ava Anywhere -- chat overlay, Cmd+K modal, /chat route, mobile tab     |
| `designs`               | off     | Designs/pen file viewer in the project sidebar                         |
| `docs`                  | off     | Docs viewer in the project sidebar                                     |
| `pipeline`              | off     | HITL interrupt forms and pipeline gate cycling (TRIAGE, SPEC, PUBLISH) |
| `specEditor`            | off     | Spec editor in the sidebar Tools section                               |
| `systemView`            | off     | Network/dependency graph view in the project sidebar                   |
| `userPresenceDetection` | off     | Sensor-driven presence awareness (tab visibility, idle/afk)            |

### Graduated Flags (GA -- always enabled)

These flags were removed from `FeatureFlags` after reaching general availability:

| Former Flag | Graduated | Notes                            |
| ----------- | --------- | -------------------------------- |
| `calendar`  | v0.17     | Calendar view in project sidebar |
| `notes`     | v0.17     | Notes tabs in project sidebar    |

## How to Add a New Flag

Follow these 5 steps in order. TypeScript will fail to compile after step 1 until step 2 is complete — this is intentional.

**Step 1 — Define the field** in `libs/types/src/global-settings.ts`:

```typescript
// Add to FeatureFlags interface
myFeature: boolean;

// Add to DEFAULT_FEATURE_FLAGS
export const DEFAULT_FEATURE_FLAGS: FeatureFlags = {
  // ...existing flags
  myFeature: false,
};
```

**Step 2 — Add a UI label** in `apps/ui/src/components/views/settings-view/developer/developer-section.tsx`:

```typescript
// FEATURE_FLAG_LABELS is typed as Record<keyof FeatureFlags, ...>
// TypeScript will error here if you forget this step
const FEATURE_FLAG_LABELS: Record<keyof FeatureFlags, { label: string; description: string }> = {
  // ...existing entries
  myFeature: {
    label: 'My Feature',
    description: 'What this flag enables and any caveats.',
  },
};
```

**Step 3 — Do NOT add hardcoded defaults elsewhere.** `DEFAULT_FEATURE_FLAGS` is the single source of truth. The spread pattern in `use-settings-sync.ts` ensures new flags propagate automatically:

```typescript
featureFlags: { ...DEFAULT_FEATURE_FLAGS, ...(serverSettings.featureFlags ?? {}) }
```

**Step 4 — Add a server-side guard** wherever your new feature creates side effects:

```typescript
const featureFlags = this.serviceContext.settingsService
  ? (await this.serviceContext.settingsService.getGlobalSettings()).featureFlags
  : null;
const myFeatureEnabled = featureFlags?.myFeature ?? false;

if (myFeatureEnabled) {
  // do the guarded work
}
```

**Step 5 — Add unit tests** covering both flag states:

```typescript
it('does nothing when myFeature flag is false (default)', async () => { ... });
it('runs when myFeature flag is true', async () => { ... });
```

## Graduating a Flag

When a feature is stable and ready for GA:

1. Remove the field from `FeatureFlags` interface and `DEFAULT_FEATURE_FLAGS`
2. Remove the entry from `FEATURE_FLAG_LABELS` in `developer-section.tsx`
3. Remove any server-side guards that check the flag — the feature is now always on
4. Add the flag to the "Graduated Flags" table in this document

## Server-Side Consumption Pattern

Access feature flags via `settingsService.getGlobalSettings()`:

```typescript
// In a StateProcessor or service method (async context)
const featureFlags = this.serviceContext.settingsService
  ? (await this.serviceContext.settingsService.getGlobalSettings()).featureFlags
  : null;

const enabled = featureFlags?.myFlag ?? false;
```

Always treat `settingsService` as optional and default to `false` when absent — it may not be wired in all test contexts.

## FeatureFlags vs WorkflowSettings

These are frequently confused:

|               | `FeatureFlags`                      | `WorkflowSettings`                                     |
| ------------- | ----------------------------------- | ------------------------------------------------------ |
| **Scope**     | Global, per installation            | Per project                                            |
| **Purpose**   | UI/feature on/off toggles           | Agent pipeline tuning (model tier, retry counts, etc.) |
| **Location**  | `data/settings.json`                | `.automaker/settings.json`                             |
| **Interface** | `libs/types/src/global-settings.ts` | `libs/types/src/global-settings.ts`                    |
| **Default**   | `DEFAULT_FEATURE_FLAGS`             | `DEFAULT_WORKFLOW_SETTINGS`                            |

Use `FeatureFlags` to gate entire product features. Use `WorkflowSettings` to tune pipeline parameters like max retries and model tier.

## UI Rendering

The Developer settings section auto-renders all `FeatureFlags` keys as toggle rows. No manual wiring is required — the component loops over `Object.keys(featureFlags)` and looks up each key in `FEATURE_FLAG_LABELS`. If a key is missing from `FEATURE_FLAG_LABELS`, it is silently skipped (guarded by the `if (!meta) return null` check in the loop).

Because `FEATURE_FLAG_LABELS` is typed as `Record<keyof FeatureFlags, ...>`, TypeScript will produce a compile error if any key is missing from the labels map, catching the omission before it reaches production.
