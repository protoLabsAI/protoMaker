## Monorepo Structure

This is a {{monorepoTool}} monorepo using {{packageManager}}.

### Workspace Layout

```
{{projectName}}/
{{#workspaceLayout}}
{{.}}
{{/workspaceLayout}}
```

### Build Order

Packages can only depend on packages above them in the dependency chain. Always build shared packages before apps:

```bash
{{buildCommand}}
```

### Import Conventions

Always import from workspace packages using their package name:

```typescript
// Correct
import { something } from '@{{namespace}}/shared';

// Wrong - never import across packages using relative paths
import { something } from '../../packages/shared/src';
```
