# Knowledge store

The Knowledge Store is a persistent SQLite-based full-text search engine that indexes project documentation, agent reflections, and execution outputs. It enables agents to retrieve relevant context from previous work before executing features.

## Overview

Each project gets its own SQLite database at `.automaker/knowledge.db`. The store uses FTS5 (Full-Text Search 5) with BM25 ranking to provide fast, relevance-scored search across all indexed content.

**Key characteristics:**

- **Per-project isolation** — Each project has its own database
- **WAL mode** — Write-Ahead Logging for safe concurrent reads during agent execution
- **Automatic FTS5 sync** — Triggers keep the search index in sync with source data
- **Token-budgeted results** — Search results are trimmed to fit within configurable token limits
- **Usage tracking** — Retrieval counts and timestamps enable future pruning

## API endpoints

All endpoints use `POST` with JSON bodies. Base path: `/api/knowledge`.

### POST /api/knowledge/search

Search the knowledge store using FTS5 BM25 ranking.

**Request:**

| Field         | Type                | Default  | Description              |
| ------------- | ------------------- | -------- | ------------------------ |
| `projectPath` | `string`            | required | Absolute path to project |
| `query`       | `string`            | required | FTS5 search query        |
| `maxResults`  | `number`            | `20`     | Maximum chunks to return |
| `maxTokens`   | `number`            | `8000`   | Token budget for results |
| `sourceTypes` | `string[] \| 'all'` | `'all'`  | Filter by source type    |

**Response:**

```typescript
{
  success: boolean;
  results: Array<{
    chunk: KnowledgeChunk;
    score: number; // BM25 score (lower = more relevant)
  }>;
}
```

**FTS5 query syntax:**

```
"exact phrase"         // Phrase search
word1 AND word2        // Boolean AND
word1 OR word2         // Boolean OR
NOT word1              // Negation
word*                  // Prefix matching
```

### POST /api/knowledge/stats

Get knowledge store statistics.

**Request:**

| Field         | Type     | Description              |
| ------------- | -------- | ------------------------ |
| `projectPath` | `string` | Absolute path to project |

**Response:**

```typescript
{
  success: boolean;
  stats: {
    totalChunks: number;
    totalSizeBytes: number;     // Database file size
    uniqueSources: number;
    sourceTypeBreakdown: Record<KnowledgeSourceType, number>;
    lastUpdated?: string;       // ISO 8601
    dbPath: string;
  };
}
```

### POST /api/knowledge/rebuild

Rebuild the FTS5 index from source data.

**Request:**

| Field         | Type     | Description              |
| ------------- | -------- | ------------------------ |
| `projectPath` | `string` | Absolute path to project |

**Response:** Same shape as `/stats`.

## Source types

The store indexes 6 types of knowledge chunks:

| Source Type    | Importance | Status  | Description                          |
| -------------- | ---------- | ------- | ------------------------------------ |
| `reflection`   | 0.8        | Active  | Feature `reflection.md` files        |
| `agent_output` | 0.6        | Active  | Last 2000 chars of `agent-output.md` |
| `file`         | 0.5        | Planned | Project documentation files          |
| `url`          | 0.5        | Planned | External documentation links         |
| `manual`       | 0.5        | Planned | Manually added knowledge             |
| `generated`    | 0.5        | Planned | LLM-generated summaries              |

## SQLite schema

### chunks table

```sql
CREATE TABLE chunks (
  id TEXT PRIMARY KEY,
  source_type TEXT NOT NULL,
  source_file TEXT NOT NULL,
  project_path TEXT NOT NULL,
  chunk_index INTEGER NOT NULL,
  heading TEXT,
  content TEXT NOT NULL,
  tags TEXT,                     -- JSON array
  importance REAL NOT NULL DEFAULT 0.5,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  last_retrieved_at TEXT,
  retrieval_count INTEGER NOT NULL DEFAULT 0
)
```

### FTS5 virtual table

```sql
CREATE VIRTUAL TABLE chunks_fts USING fts5(
  heading,
  content,
  content=chunks,
  content_rowid=rowid
)
```

Three automatic triggers (`chunks_ai`, `chunks_au`, `chunks_ad`) keep the FTS5 index in sync on every INSERT, UPDATE, and DELETE.

## Service methods

### Initialization

```typescript
initialize(projectPath: string): void
```

Creates `.automaker/knowledge.db` if missing, opens connection, creates schema on first run. Called automatically by search and stats operations.

### Search

**`search(projectPath, query, options?)`** — General FTS5 search with token budget.

```typescript
search(
  projectPath: string,
  query: string,
  opts?: {
    maxResults?: number;               // Default: 20
    maxTokens?: number;                // Default: 8000
    sourceTypes?: KnowledgeSourceType[] | 'all';
  }
): KnowledgeSearchResult[]
```

**`searchReflections(projectPath, query, maxResults?)`** — Convenience wrapper filtering to `reflection` and `agent_output` types with 3000 token budget. Sanitizes FTS5 special characters automatically.

**`findSimilarChunks(projectPath, text, sourceFile?, maxResults?)`** — Deduplication search. Sanitizes input, truncates to first 20 words, does not update retrieval metrics.

### Ingestion

**`ingestReflections(projectPath)`** — Scans `.automaker/features/{id}/reflection.md`, creates chunks with importance 0.8. Returns count indexed.

**`ingestAgentOutputs(projectPath)`** — Scans `.automaker/features/{id}/agent-output.md`, indexes last 2000 characters with importance 0.6. Returns count indexed.

### Maintenance

**`rebuildIndex(projectPath)`** — Executes FTS5 rebuild command. Makes newly ingested content searchable.

**`compactCategory(projectPath, categoryFile, threshold?)`** — Reads `.automaker/memory/{categoryFile}.md`, summarizes with Haiku if over 50,000 tokens. Used by auto-mode after learning extraction.

**`pruneStaleChunks(projectPath)`** — Deletes chunks with zero retrievals older than 90 days. Returns count deleted.

## Integration with agents

### LeadEngineerService (EXECUTE state)

When a feature enters the EXECUTE state, the Lead Engineer searches for relevant prior work:

```
Feature enters EXECUTE state
  → Build query from feature title + description
  → searchReflections(projectPath, query, 5)
  → Inject results as "Lessons from Similar Features" in agent prompt
  → Fallback: legacy same-epic sibling search if FTS5 returns empty
```

This gives agents context from previous solutions across the entire project, not just the current epic.

### AutoModeService (post-execution)

After feature completion, auto-mode extracts learnings and checks memory file sizes:

```
Feature completes
  → Extract learnings into .automaker/memory/{category}.md
  → compactCategory() if category exceeds 50,000 tokens
  → Haiku summarizes while preserving key patterns
```

### Server wiring

In `apps/server/src/index.ts`:

```typescript
const knowledgeStoreService = new KnowledgeStoreService();
app.use('/api/knowledge', createKnowledgeRoutes(knowledgeStoreService));
leadEngineerService.setKnowledgeStoreService(knowledgeStoreService);
```

## Types

All types are defined in `libs/types/src/knowledge.ts`:

```typescript
type KnowledgeSourceType = 'file' | 'url' | 'manual' | 'generated' | 'reflection' | 'agent_output';

interface KnowledgeChunk {
  id: string;
  sourceType: KnowledgeSourceType;
  sourceFile: string;
  projectPath: string;
  chunkIndex: number;
  heading?: string;
  content: string;
  tags?: string[];
  importance: number;
  createdAt: string;
  updatedAt: string;
}

interface KnowledgeSearchResult {
  chunk: KnowledgeChunk;
  score: number;
}

interface KnowledgeStoreStats {
  totalChunks: number;
  totalSizeBytes: number;
  uniqueSources: number;
  sourceTypeBreakdown: Record<KnowledgeSourceType, number>;
  lastUpdated?: string;
  dbPath: string;
}
```

## Database files

```
{projectPath}/.automaker/knowledge.db       # Main database
{projectPath}/.automaker/knowledge.db-wal   # Write-ahead log
{projectPath}/.automaker/knowledge.db-shm   # Shared memory
```

The WAL and SHM files are created automatically when WAL mode is enabled. They are safe to delete when the database is not in use — SQLite recreates them on next open.

## Configuration

All settings are currently hard-coded:

| Setting                 | Default                   | Location                     |
| ----------------------- | ------------------------- | ---------------------------- |
| Database path           | `.automaker/knowledge.db` | `knowledge-store-service.ts` |
| WAL mode                | Enabled                   | `knowledge-store-service.ts` |
| Compaction threshold    | 50,000 tokens             | `knowledge-store-service.ts` |
| Prune window            | 90 days                   | `knowledge-store-service.ts` |
| Default max results     | 20                        | `knowledge-store-service.ts` |
| Default max tokens      | 8,000                     | `knowledge-store-service.ts` |
| Reflection importance   | 0.8                       | `knowledge-store-service.ts` |
| Agent output importance | 0.6                       | `knowledge-store-service.ts` |

## Key files

| File                                                  | Purpose            |
| ----------------------------------------------------- | ------------------ |
| `apps/server/src/services/knowledge-store-service.ts` | Main service       |
| `libs/types/src/knowledge.ts`                         | Type definitions   |
| `apps/server/src/routes/knowledge/index.ts`           | Route registration |
| `apps/server/src/routes/knowledge/routes/search.ts`   | Search endpoint    |
| `apps/server/src/routes/knowledge/routes/stats.ts`    | Stats endpoint     |
| `apps/server/src/routes/knowledge/routes/rebuild.ts`  | Rebuild endpoint   |
