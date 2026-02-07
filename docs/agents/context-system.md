# Context System Deep Dive

This guide provides a comprehensive overview of Automaker's context loading system - how project-specific rules, conventions, and learnings flow into agent prompts.

## Table of Contents

- [Overview](#overview)
- [Context Sources](#context-sources)
- [Context Loading Flow](#context-loading-flow)
- [Memory System](#memory-system)
- [Smart Memory Selection](#smart-memory-selection)
- [Usage Tracking](#usage-tracking)
- [Creating Context Files](#creating-context-files)
- [Best Practices](#best-practices)

## Overview

**Goal:** Ensure all agents (interactive, feature execution, authority agents) have project-specific context and past learnings.

**Key Components:**

1. **Context Files** (`.automaker/context/`) - Project rules and conventions
2. **Memory Files** (`.automaker/memory/`) - Learnings from past work
3. **Context Loader** (`libs/utils/src/context-loader.ts`) - Unified loading utility
4. **Smart Selection** - Relevance-based memory ranking

## Context Sources

### 1. Context Files (`.automaker/context/`)

**Purpose:** Project-specific rules that ALL agents must follow
**Examples:**

- `CODE_QUALITY.md` - Coding standards
- `TESTING_GUIDE.md` - How to write tests
- `SECURITY_POLICY.md` - Security requirements
- `DEPLOYMENT_PROCESS.md` - Release procedures

**When to Use:** Rules that apply to ALL work on this project

**Creation:**

```bash
# Via MCP tool
mcp__automaker__create_context_file({
  projectPath: '/path/to/project',
  filename: 'code-quality.md',
  content: '# Code Quality Standards\n\n...'
});

# Or manually
echo "# Code Quality\n..." > .automaker/context/code-quality.md
```

**Frontmatter (Optional):**

```markdown
---
description: Coding standards for TypeScript
priority: high
category: standards
---

# Code Quality Standards

- Always use TypeScript strict mode
- Write tests for new features
- Follow existing patterns
```

### 2. Memory Files (`.automaker/memory/`)

**Purpose:** Learnings from past agent work
**Examples:**

- `authentication-patterns.md` - "We tried X, it didn't work, use Y instead"
- `api-gotchas.md` - "Rate limits on endpoint Z"
- `build-troubleshooting.md` - "If build fails with error X, do Y"

**When to Use:** Domain-specific knowledge that helps with specific tasks

**Creation:**

```bash
# Agents automatically create memory files after significant work
# Or manually:
echo "# Authentication Patterns\n..." > .automaker/memory/authentication-patterns.md
```

**Frontmatter (Required):**

```markdown
---
category: patterns
tags: [auth, oauth, jwt]
importance: high
keywords: authentication, login, oauth2, jwt, tokens
---

# Authentication Patterns

We previously implemented OAuth2 for the admin panel.

## Key Learnings

- Use Passport.js for OAuth strategies
- Store JWT secret in environment variables
- Refresh tokens every 15 minutes

## Gotchas

- Remember to set CORS headers for auth endpoints
- Don't expose refresh tokens in client-side code
```

**Metadata Fields:**

- `category` - Topic grouping (patterns, gotchas, decisions, etc.)
- `tags` - Keywords for matching
- `importance` - `high`, `medium`, `low` (affects ranking)
- `keywords` - Additional search terms

### 3. Project Root CLAUDE.md

**Purpose:** High-level project overview and guidelines
**Location:** Project root (`/path/to/project/CLAUDE.md`)
**Managed By:** Claude SDK (auto-loaded when `autoLoadClaudeMd: true`)

**Example:**

```markdown
# My Project

This is a Next.js app with TypeScript and Tailwind CSS.

## Architecture

- Frontend: React 19, Next.js 15
- Backend: API routes
- Database: PostgreSQL with Prisma

## Conventions

- Use functional components
- Prefer server components over client components
- Name test files `*.test.ts`
```

**Note:** Context loader automatically filters out CLAUDE.md from `.automaker/context/` to avoid duplication when SDK auto-loads it.

## Context Loading Flow

### High-Level Flow

```
Agent execution starts
    ↓
Load feature/task data
    ↓
Call loadContextFiles({
  projectPath,
  taskContext: { title, description }
})
    ↓
┌────────────────────────────────────────────┐
│  1. Read .automaker/context/*.md files     │
│     - All files loaded unconditionally     │
│     - Metadata parsed from frontmatter     │
└────────────────┬───────────────────────────┘
                 ↓
┌────────────────────────────────────────────┐
│  2. Read .automaker/memory/*.md files      │
│     - Smart selection based on task        │
│     - Relevance ranking algorithm          │
│     - Top N files selected (default: 5)   │
└────────────────┬───────────────────────────┘
                 ↓
┌────────────────────────────────────────────┐
│  3. Format as system prompt section        │
│     - Headers for each file                │
│     - Metadata (path, purpose)             │
│     - Full content                         │
└────────────────┬───────────────────────────┘
                 ↓
┌────────────────────────────────────────────┐
│  4. Return ContextFilesResult              │
│     - files: ContextFileInfo[]             │
│     - memoryFiles: MemoryFileInfo[]        │
│     - formattedPrompt: string              │
└────────────────────────────────────────────┘
                 ↓
Inject into agent system prompt
```

### Code Example

```typescript
import { loadContextFiles } from '@automaker/utils';
import { secureFs } from '@automaker/platform';

const contextResult = await loadContextFiles({
  projectPath: '/path/to/project',
  fsModule: secureFs, // Optional, defaults to secureFs
  includeMemory: true, // Default: true
  initializeMemory: true, // Default: true (creates .automaker/memory/ if missing)
  taskContext: {
    title: 'Add authentication system',
    description: 'Implement OAuth2 with JWT tokens for API endpoints',
  },
  maxMemoryFiles: 5, // Default: 5
});

// Returns:
// {
//   files: ContextFileInfo[],        // All context files
//   memoryFiles: MemoryFileInfo[],   // Top N memory files (relevance-ranked)
//   formattedPrompt: string          // Ready to inject into system prompt
// }

const systemPrompt = `
You are an AI software engineer.

${contextResult.formattedPrompt}

[Rest of system prompt...]
`;
```

## Memory System

### Memory Initialization

When `.automaker/memory/` doesn't exist, context loader auto-creates:

```
.automaker/memory/
├── MEMORY.md           # Main memory file (high importance)
└── .usage-stats.json   # Usage tracking metadata
```

**MEMORY.md Template:**

```markdown
---
category: general
importance: high
tags: [project, overview]
---

# Project Memory

## High-Level Learnings

[Agents will add learnings here as they work]

## Common Patterns

[Patterns that work well]

## Gotchas

[Things to avoid]
```

### Memory File Structure

**Frontmatter (Required):**

```yaml
---
category: patterns # Topic grouping
tags: [auth, security] # Keywords for matching
importance: high # Ranking factor
keywords: authentication, login, oauth # Search terms
---
```

**Content:**

- Markdown formatted
- Use headings for organization
- Include code examples
- Reference specific files/line numbers when relevant

**Example:**

````markdown
---
category: gotchas
tags: [api, rate-limiting]
importance: high
keywords: rate limit, throttle, api
---

# API Rate Limiting

## The Problem

Our external API has aggressive rate limits (10 req/min).

## Solution

Implement client-side caching with 5-minute TTL.

**Implementation:**

```typescript
// libs/api-client/src/cache.ts
const cache = new Map<string, { data: any; expires: number }>();

export async function cachedFetch(url: string) {
  const cached = cache.get(url);
  if (cached && Date.now() < cached.expires) {
    return cached.data;
  }

  const data = await fetch(url).then((r) => r.json());
  cache.set(url, { data, expires: Date.now() + 5 * 60 * 1000 });
  return data;
}
```
````

## Gotcha

Don't cache authentication endpoints - tokens change frequently!

## Smart Memory Selection

### Relevance Ranking Algorithm

**Inputs:**
- Task title + description
- Memory file frontmatter (tags, keywords, category)
- Usage statistics (frequency, recency)

**Algorithm:**
```typescript
// 1. Extract search terms from task
const taskTerms = extractTerms(taskContext.title + ' ' + taskContext.description);
// Returns: ['authentication', 'oauth2', 'jwt', 'tokens', 'api', 'endpoints']

// 2. For each memory file, calculate score
for (const memoryFile of memoryFiles) {
  const metadata = parseFrontmatter(memoryFile.content);

  // Term matches (category, tags, keywords)
  const categoryMatch = taskTerms.includes(metadata.category);
  const tagMatches = countMatches(taskTerms, metadata.tags);
  const keywordMatches = countMatches(taskTerms, metadata.keywords);

  // Usage frequency (from .usage-stats.json)
  const usageScore = getUsageScore(memoryFile.name);

  // Importance level
  const importanceMultiplier = {
    high: 2.0,
    medium: 1.0,
    low: 0.5,
  }[metadata.importance || 'medium'];

  // Combined score
  const score = (
    (categoryMatch ? 10 : 0) +
    (tagMatches * 5) +
    (keywordMatches * 3) +
    (usageScore * 2)
  ) * importanceMultiplier;

  memoryFile.score = score;
}

// 3. Sort by score (descending) and take top N
const topMemoryFiles = memoryFiles
  .sort((a, b) => b.score - a.score)
  .slice(0, maxMemoryFiles);

return topMemoryFiles;
```

**Example Scoring:**

Task: "Add authentication system with OAuth2"

```
authentication-patterns.md
  category: patterns (match) = 10
  tags: [auth, oauth, jwt] (3 matches) = 15
  keywords: [authentication, oauth2] (2 matches) = 6
  usage: 5 times = 10
  importance: high = x2
  SCORE: (10 + 15 + 6 + 10) * 2 = 82

api-rate-limiting.md
  category: gotchas (no match) = 0
  tags: [api, rate-limiting] (1 match: api) = 5
  keywords: [rate, limit] (no matches) = 0
  usage: 2 times = 4
  importance: medium = x1
  SCORE: (0 + 5 + 0 + 4) * 1 = 9

database-migrations.md
  category: patterns (no match) = 0
  tags: [database, prisma] (no matches) = 0
  keywords: [] (no matches) = 0
  usage: 8 times = 16
  importance: high = x2
  SCORE: (0 + 0 + 0 + 16) * 2 = 32
```

**Result:** Load `authentication-patterns.md` (score: 82), `database-migrations.md` (score: 32), ...

## Usage Tracking

### Tracking Mechanism

**Storage:** `.automaker/memory/.usage-stats.json`

**Structure:**

```json
{
  "authentication-patterns.md": {
    "count": 5,
    "lastUsed": "2026-02-07T10:30:00Z",
    "contexts": ["Add OAuth login", "Fix JWT expiration", "Implement refresh tokens"]
  },
  "api-rate-limiting.md": {
    "count": 2,
    "lastUsed": "2026-02-05T14:20:00Z",
    "contexts": ["Add API caching", "Fix rate limit errors"]
  }
}
```

**Update on Load:**

```typescript
// After selecting memory files
for (const file of selectedMemoryFiles) {
  await incrementUsageStat(projectPath, file.name, taskContext.title);
}
```

**Benefits:**

- Popular files rank higher (frequently useful)
- Recency bonus (recently used = probably relevant)
- Context history (see what tasks used this memory)

## Creating Context Files

### Via MCP Tool (Recommended for Automation)

```typescript
await use_mcp_tool({
  server_name: 'automaker',
  tool_name: 'create_context_file',
  arguments: {
    projectPath: '/path/to/project',
    filename: 'testing-guide.md',
    content: `---
description: Guidelines for writing tests
priority: high
---

# Testing Guide

- Use Vitest for unit tests
- Use Playwright for E2E tests
- Aim for 80% coverage
`,
  },
});
```

### Via Server API

```bash
curl -X POST http://localhost:3008/api/context/create \
  -H "Content-Type: application/json" \
  -d '{
    "projectPath": "/path/to/project",
    "filename": "testing-guide.md",
    "content": "# Testing Guide\n\n..."
  }'
```

### Manually

```bash
cd /path/to/project
mkdir -p .automaker/context
cat > .automaker/context/testing-guide.md << 'EOF'
---
description: Guidelines for writing tests
priority: high
---

# Testing Guide

- Use Vitest for unit tests
- Use Playwright for E2E tests
- Aim for 80% coverage
EOF
```

## Best Practices

### 1. Context Files vs Memory Files

**Use Context Files for:**

- Universal rules (ALL agents must follow)
- Project conventions (naming, structure, style)
- Security policies
- Deployment procedures

**Use Memory Files for:**

- Domain-specific learnings
- Patterns that worked/didn't work
- Gotchas and workarounds
- Task-specific knowledge

### 2. Write Actionable Content

**Good:**

````markdown
## Authentication Pattern

Use Passport.js with JWT strategy:

```typescript
import passport from 'passport';
import { Strategy as JwtStrategy } from 'passport-jwt';

passport.use(
  new JwtStrategy(
    {
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      secretOrKey: process.env.JWT_SECRET,
    },
    (payload, done) => {
      // Verify user
    }
  )
);
```
````

**Bad:**

```markdown
## Authentication

We use authentication.
```

### 3. Keep Memory Files Focused

**Good:** One file per topic (authentication, caching, deployment)
**Bad:** One giant file with everything

### 4. Update Memory After Significant Work

```typescript
// After agent completes feature
if (feature.wasSignificantLearning) {
  await createMemoryFile({
    projectPath,
    filename: `${feature.topic}-learnings.md`,
    content: `
# ${feature.topic} Learnings

## What Worked
${feature.successes}

## What Didn't Work
${feature.failures}

## Recommendations
${feature.recommendations}
    `,
    metadata: {
      category: 'patterns',
      tags: feature.tags,
      importance: 'high',
    },
  });
}
```

### 5. Use Descriptive Frontmatter

**Good:**

```yaml
---
category: patterns
tags: [performance, optimization, caching]
importance: high
keywords: cache, redis, performance, speed, optimization, latency
---
```

**Bad:**

```yaml
---
category: misc
tags: [stuff]
importance: medium
---
```

### 6. Prune Outdated Memory

```bash
# Review memory files periodically
ls -la .automaker/memory/

# Remove obsolete files
rm .automaker/memory/old-api-v1-patterns.md
```

### 7. Use Headings for Structure

**Good:**

```markdown
# Topic

## Problem

[What was the issue?]

## Solution

[How did we solve it?]

## Implementation

[Code example]

## Gotchas

[Things to watch out for]
```

---

**Related Docs:**

- [Architecture Overview](./architecture.md)
- [Adding Agent Teammates](./adding-teammates.md)
- [MCP Integration](./mcp-integration.md)
