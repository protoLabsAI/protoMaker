# Memory System

The memory system manages how Automaker agents learn and retain knowledge across sessions. It consists of two components: the **file-based memory** (`.automaker/memory/`) and the **knowledge store** (`.automaker/knowledge.db`).

This guide covers the write pipeline, deduplication, compaction, pruning, and debugging.

## Architecture Overview

```
Agent completes task
        ↓
Extract learnings (via prompt)
        ↓
Check for duplicates (BM25 search)
        ↓
Append to category file (.automaker/memory/*.md)
        ↓
Index to knowledge store (background)
        ↓
Generate embeddings (background)
        ↓
Generate HyPE queries (background, rate-limited)
```

The memory system has two layers:

1. **File-based memory** — Human-readable markdown files in `.automaker/memory/`
2. **Knowledge store** — SQLite database for fast retrieval (`.automaker/knowledge.db`)

Files are the source of truth. The knowledge store is derived and can be rebuilt at any time.

## Memory Categories

Memory is organized into categories, each with its own file:

| File              | Category     | Purpose                                   | Importance |
| ----------------- | ------------ | ----------------------------------------- | ---------- |
| `MEMORY.md`       | Core         | Always loaded, high-impact patterns       | 1.0        |
| `patterns.md`     | Patterns     | Code patterns, conventions, anti-patterns | 0.9        |
| `debugging.md`    | Debugging    | Common errors, fixes, troubleshooting     | 0.8        |
| `architecture.md` | Architecture | System design decisions, component roles  | 0.9        |
| `api.md`          | API          | API usage, endpoint patterns              | 0.7        |
| `testing.md`      | Testing      | Test patterns, coverage strategies        | 0.7        |
| `deployment.md`   | Deployment   | Build, release, Docker, CI/CD             | 0.6        |
| `gotchas.md`      | Gotchas      | Surprising behavior, footguns, edge cases | 0.8        |

**Importance scores** influence retrieval ranking. Higher importance → more likely to be retrieved.

## File Format

Memory files use markdown with YAML frontmatter:

````markdown
---
category: patterns
importance: 0.9
tags: [feature-loading, error-handling]
last_updated: 2026-02-24T10:30:00Z
---

# Memory: Patterns

## Feature Loader Initialization

**Context:** Features must be loaded before accessing feature data.

**Pattern:**

\```typescript
const featureLoader = new FeatureLoader(projectPath);
await featureLoader.initialize();
const features = featureLoader.listFeatures();
\```

**Why:** FeatureLoader scans `.automaker/features/` on initialization. Calling methods before initialization throws errors.

**When to use:** At server startup, before any feature routes are registered.

## Error Classification

**Context:** Errors should be classified for better UX.

**Pattern:**

\```typescript
import { classifyError } from '@protolabs-ai/utils';

try {
// ... operation
} catch (err) {
const classified = classifyError(err);
logger.error(\`\${classified.category}: \${classified.message}\`);
}
\```

**Why:** `classifyError` maps technical errors to user-friendly categories (auth, network, validation, etc.).

**When to use:** Catch blocks that surface errors to users.
````

### Frontmatter Fields

| Field          | Type     | Required | Description                           |
| -------------- | -------- | -------- | ------------------------------------- |
| `category`     | string   | Yes      | Category name (matches filename stem) |
| `importance`   | number   | No       | 0.0-1.0, affects retrieval ranking    |
| `tags`         | string[] | No       | Keywords for filtering                |
| `last_updated` | ISO 8601 | No       | Timestamp of last append              |

## Write Pipeline

### 1. Learning Extraction

After an agent completes a task, it extracts learnings via a structured prompt:

```markdown
Based on your work, identify learnings worth preserving:

1. **Patterns** — Reusable code patterns you discovered
2. **Gotchas** — Surprising behavior, footguns, edge cases
3. **Debugging** — Errors you encountered and how you fixed them
4. **Architecture** — Design decisions you made and why

For each learning:

- **Context:** When does this apply?
- **Pattern/Fix:** What's the solution?
- **Why:** What's the rationale?
- **When to use:** When should future agents apply this?

Format as markdown sections under the appropriate category.
```

The agent returns structured markdown:

````markdown
## Learnings

### Patterns

#### Service Initialization Order

**Context:** Services with dependencies must initialize in the correct order.

**Pattern:**

\```typescript
// Initialize dependencies first
const embeddingService = new EmbeddingService();
await embeddingService.loadModel();

// Then initialize dependent service
const knowledgeStore = new KnowledgeStoreService(embeddingService);
knowledgeStore.initialize(projectPath);
\```

**Why:** If KnowledgeStoreService needs embeddings immediately, it will fail if EmbeddingService isn't ready.

**When to use:** When services depend on async initialization of other services.
````

### 2. Deduplication Check

Before appending, we check if the learning already exists using `findSimilarChunks`:

```typescript
const similarChunks = knowledgeStore.findSimilarChunks(
  projectPath,
  learningText,
  'memory/patterns.md', // Optional: filter by file
  5 // Max results
);

const isDuplicate = similarChunks.some((result) => {
  // BM25 score < -5 indicates high similarity (lower = more similar)
  return result.score < -5;
});

if (isDuplicate) {
  logger.info('Learning already exists, skipping append');
  return;
}
```

**Deduplication threshold:** BM25 score < -5

- BM25 scores are negative (lower = more relevant)
- Score of -10 = very similar (likely duplicate)
- Score of -3 = somewhat similar (keep as separate entry)
- Score of 0 = no match

**Why check for duplicates?** Without deduplication, the same patterns get appended repeatedly, bloating memory files and wasting tokens during retrieval.

### 3. Append to File

If not a duplicate, append to the appropriate category file:

```typescript
import * as fs from 'node:fs';
import * as path from 'node:path';

const memoryDir = path.join(projectPath, '.automaker', 'memory');
const categoryFile = path.join(memoryDir, 'patterns.md');

// Ensure memory directory exists
if (!fs.existsSync(memoryDir)) {
  fs.mkdirSync(memoryDir, { recursive: true });
}

// Append learning (with markdown header separator)
const separator = '\n\n---\n\n';
fs.appendFileSync(categoryFile, separator + learningMarkdown, 'utf-8');

// Update frontmatter last_updated timestamp
updateFrontmatter(categoryFile, {
  last_updated: new Date().toISOString(),
});
```

**File creation:** If the category file doesn't exist, create it with frontmatter:

```typescript
const frontmatter = `---
category: patterns
importance: 0.9
tags: []
last_updated: ${new Date().toISOString()}
---

# Memory: Patterns

`;

fs.writeFileSync(categoryFile, frontmatter + learningMarkdown, 'utf-8');
```

### 4. Index to Knowledge Store

After appending, trigger a rebuild of the knowledge store index:

```typescript
knowledgeStore.rebuildIndex(projectPath);
```

This:

1. Re-scans the memory file
2. Chunks the new content (via `MemoryChunker`)
3. Inserts new chunks into the `chunks` table
4. Updates the FTS5 index
5. Starts background embedding worker

**Background embedding** generates embeddings for chunks without them, then triggers **background HyPE** to generate hypothetical questions.

## Deduplication Deep Dive

### Why BM25 for Deduplication?

We use BM25 (keyword-based) instead of embeddings (semantic) for deduplication because:

1. **Speed** — BM25 is instant (5-10ms), embeddings require inference (50ms)
2. **Exact matches** — If a learning uses identical terminology, BM25 catches it
3. **Conservative** — BM25 has fewer false positives than cosine similarity

**Edge case:** If two learnings are semantically identical but use different wording, BM25 might miss them. In practice, this rarely happens because agents reuse terminology from existing memory.

### Deduplication Threshold Tuning

The threshold of **-5** was chosen empirically:

- **-10 or lower:** Near-exact duplicates (same terms, same order)
- **-5 to -8:** High overlap (likely duplicate, should skip)
- **-3 to -5:** Moderate overlap (might be a variation, keep separate)
- **0 to -3:** Low overlap (different content, definitely keep)

**How to tune:** If you notice duplicates getting through, lower the threshold (e.g., `-3`). If unique learnings are being rejected, raise it (e.g., `-7`).

### Example: Duplicate Detection

**Existing learning:**

```markdown
## Service Initialization Order

Services with dependencies must initialize in the correct order. Initialize dependencies first, then dependent services.
```

**New learning:**

```markdown
## Dependency Initialization

When services depend on each other, initialize them in dependency order. Initialize the base service before the dependent service.
```

**BM25 score:** -6.2 (high overlap: "initialize", "dependencies", "order", "service")

**Outcome:** Rejected as duplicate.

**False positive?** Maybe. The wording is different, but the core concept is identical. This is a **conservative choice** — we'd rather skip a near-duplicate than append 10 variations of the same concept.

## Compaction

Over time, memory files grow large as agents append learnings. **Compaction** summarizes oversized files while preserving critical information.

### Compaction Trigger

Compaction runs automatically when a category file exceeds **50,000 tokens** (~200KB).

```typescript
const threshold = 50000; // tokens
await knowledgeStore.compactCategory(projectPath, 'patterns.md', threshold);
```

Token estimation: `content.length / 4` (approximate 4 chars per token).

### Compaction Process

1. Load the full content of the category file
2. Send to Haiku with this prompt:

```markdown
You are summarizing a category memory file that has grown too large. Your task is to compress the content while preserving the most important patterns, decisions, and lessons.

# Original Content:

{content}

# Instructions:

1. Preserve all critical information (architectural decisions, gotchas, patterns)
2. Remove redundant or less important details
3. Keep the YAML frontmatter intact
4. Maintain the markdown structure
5. Aim to reduce size by at least 30% while preserving value

Output the compressed memory file:
```

3. Replace the file content with Haiku's response
4. Rebuild the knowledge store index

**Cost:** ~$0.001 per compaction (4096 output tokens @ $0.25/M)

**Frequency:** Compaction only runs when the file exceeds the threshold. For most projects, this happens every few months.

### What Gets Removed?

Haiku removes:

- Redundant examples (if 5 examples show the same pattern, keep 2)
- Verbose explanations (condense multi-paragraph explanations to key points)
- Outdated information (if a pattern was replaced, remove the old version)
- Low-importance details (edge cases that rarely apply)

**What stays:**

- Architectural decisions and rationale
- Gotchas and footguns (surprising behavior)
- Critical error fixes
- High-importance patterns (importance > 0.8)

### Manual Compaction

You can trigger compaction manually via the API:

```bash
curl -X POST http://localhost:3008/api/knowledge/compact \
  -H 'Content-Type: application/json' \
  -d '{
    "projectPath": "/path/to/project",
    "categoryFile": "patterns.md",
    "threshold": 50000
  }'
```

Or via MCP:

```typescript
mcp__automaker__compact_memory({
  projectPath: '/path/to/project',
  categoryFile: 'patterns.md',
  threshold: 30000, // Custom threshold
});
```

## Pruning

**Pruning** removes stale chunks that haven't been retrieved in 90+ days **and** have zero retrieval count.

### Pruning Trigger

Pruning runs automatically during knowledge store maintenance (nightly background task).

```typescript
const deleted = knowledgeStore.pruneStaleChunks(projectPath);
logger.info(`Pruned ${deleted} stale chunks`);
```

### Pruning Criteria

A chunk is pruned if **both** conditions are true:

1. `retrieval_count = 0` (never retrieved)
2. `last_retrieved_at IS NULL` OR `last_retrieved_at < NOW() - 90 days`

**Why 90 days?** It balances two concerns:

- Too short (30 days) → might prune chunks that are relevant but not yet retrieved
- Too long (180 days) → stale chunks bloat the corpus

**Why retrieval_count = 0?** If a chunk was retrieved at least once, it might be useful. Even if it hasn't been retrieved in 90 days, keep it.

### Manual Pruning

```bash
curl -X POST http://localhost:3008/api/knowledge/prune \
  -H 'Content-Type: application/json' \
  -d '{
    "projectPath": "/path/to/project"
  }'
```

Or via MCP:

```typescript
mcp__automaker__prune_knowledge({
  projectPath: '/path/to/project',
});
```

## Adding New Memory Categories

To add a new memory category (e.g., `performance.md`):

### 1. Create the File

```bash
cd /path/to/project/.automaker/memory
touch performance.md
```

### 2. Add Frontmatter

```markdown
---
category: performance
importance: 0.7
tags: [performance, optimization, profiling]
last_updated: 2026-02-24T10:30:00Z
---

# Memory: Performance

## Optimization Patterns

(Add learnings here...)
```

### 3. Update Agent Prompts

Add the new category to the learning extraction prompt:

```markdown
Based on your work, identify learnings worth preserving:

1. **Patterns** — Reusable code patterns
2. **Debugging** — Errors and fixes
3. **Performance** — Optimization techniques, profiling results (NEW)
4. ...
```

### 4. Index to Knowledge Store

```typescript
knowledgeStore.rebuildIndex(projectPath);
```

The knowledge store will automatically discover the new file and index it.

### 5. Optional: Set Importance

Higher importance → more likely to be retrieved.

| Category        | Importance | Rationale                                   |
| --------------- | ---------- | ------------------------------------------- |
| MEMORY.md       | 1.0        | Core patterns, always relevant              |
| patterns.md     | 0.9        | High-value reusable patterns                |
| architecture.md | 0.9        | Design decisions affect all future work     |
| debugging.md    | 0.8        | Common errors save time                     |
| gotchas.md      | 0.8        | Surprising behavior is critical             |
| api.md          | 0.7        | API usage is important but project-specific |
| testing.md      | 0.7        | Testing patterns are valuable but optional  |
| deployment.md   | 0.6        | Deployment is infrequent                    |
| performance.md  | 0.7        | Optimization is important but not urgent    |

Importance is a **multiplier** in the retrieval scoring function. A chunk with `importance=0.9` and BM25 score of -5 effectively gets a boosted score.

## Debugging Retrieval

### Quick Diagnostics

Use `/api/knowledge/search` to test queries:

```bash
curl -X POST http://localhost:3008/api/knowledge/search \
  -d '{"projectPath": "/path/to/project", "query": "service initialization"}'
```

Check `retrieval_mode` in response — should be `"hybrid"` if embeddings are working.

### Common Issues

| Issue                    | Diagnosis                           | Fix                                  |
| ------------------------ | ----------------------------------- | ------------------------------------ |
| No results returned      | `totalChunks: 0` in `/stats`        | Run `/rebuild` to reindex            |
| `retrieval_mode: "bm25"` | Embeddings not ready                | Check `/embedding-status`, wait      |
| Poor ranking             | BM25 scores near 0                  | Query too broad or corpus incomplete |
| Slow search (> 500ms)    | Too many candidates or large corpus | Lower candidate limit or use ANN     |

### Force Rebuild

```bash
curl -X POST http://localhost:3008/api/knowledge/rebuild \
  -d '{"projectPath": "/path/to/project"}'
```

### Inspect Database

```bash
sqlite3 .automaker/knowledge.db

-- Check counts
SELECT COUNT(*) FROM chunks;
SELECT COUNT(*) FROM embeddings;

-- Test FTS5
SELECT * FROM chunks_fts WHERE chunks_fts MATCH 'your term';
```

## Common Patterns

### Pattern: Append Learning After Task

```typescript
import { KnowledgeStoreService } from '@protolabs-ai/server';

async function completeTask(feature: Feature) {
  // ... execute task

  // Extract learnings
  const learnings = await extractLearnings(feature, agentOutput);

  // Check for duplicates
  for (const learning of learnings) {
    const isDuplicate = await checkDuplicate(projectPath, learning.text, learning.category);

    if (!isDuplicate) {
      appendToMemory(projectPath, learning.category, learning.text);
    }
  }

  // Rebuild index
  knowledgeStore.rebuildIndex(projectPath);
}
```

### Pattern: Search Before Starting Work

```typescript
async function startTask(feature: Feature) {
  // Search for relevant patterns
  const query = `${feature.title} ${feature.description}`;
  const { results } = await knowledgeStore.search(projectPath, query, {
    maxResults: 5,
    maxTokens: 3000,
  });

  // Include results in agent prompt
  const context = results
    .map((r) => `## ${r.chunk.heading}\n\n${r.chunk.content}`)
    .join('\n\n---\n\n');

  const systemPrompt = `
# Context from Previous Work

${context}

# Task

${feature.description}
  `;

  // ... execute task with context
}
```

### Pattern: Deduplication Helper

```typescript
async function checkDuplicate(
  projectPath: string,
  text: string,
  category: string
): Promise<boolean> {
  const knowledgeStore = getKnowledgeStore();

  const similarChunks = knowledgeStore.findSimilarChunks(
    projectPath,
    text,
    `.automaker/memory/${category}.md`,
    5
  );

  // BM25 score < -5 indicates high similarity
  return similarChunks.some((result) => result.score < -5);
}
```

## Memory File Maintenance

**Do edit:**

- Fix typos, update outdated info, merge near-duplicates, add clarifications

**Don't edit:**

- Extensive rewrites (breaks chunk IDs), delete frontmatter (breaks indexing)

**After editing:** Rebuild index with `POST /api/knowledge/rebuild`

**Version control:** Commit `.automaker/memory/` alongside code. Learnings evolve with the codebase.

## API Quick Reference

See [Knowledge Hive](./knowledge-hive#api-endpoints) for full API documentation.

**Key endpoints:**

- `POST /api/knowledge/search` — Search knowledge store
- `POST /api/knowledge/rebuild` — Reindex after edits
- `POST /api/knowledge/compact` — Compact oversized files
- `POST /api/knowledge/prune` — Remove stale chunks
- `GET /api/knowledge/stats` — Corpus statistics

## Related

- **[Knowledge Hive](./knowledge-hive)** — Full architecture overview
- **[RAG Techniques](./rag-techniques)** — RAG technique decisions and rationale
