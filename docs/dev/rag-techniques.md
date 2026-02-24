# RAG Techniques

This document records every RAG (Retrieval-Augmented Generation) technique we evaluated, what we chose, and why. It serves as the permanent philosophical record of our retrieval architecture decisions.

## Overview

RAG systems have five key decision points:

1. **Chunking Strategy** — How to split documents into searchable units
2. **Indexing Method** — How to make chunks searchable
3. **Embedding Model** — Which model to use for semantic vectors
4. **Retrieval Algorithm** — How to rank and select relevant chunks
5. **Query Enhancement** — How to improve query quality

For each decision, we document what we evaluated, what we chose, and the rationale.

## 1. Chunking Strategy

### What We Evaluated

| Strategy              | Description                                   | Pros                         | Cons                                |
| --------------------- | --------------------------------------------- | ---------------------------- | ----------------------------------- |
| Fixed-size            | Split every N tokens                          | Simple, predictable          | Breaks semantic boundaries          |
| Paragraph-based       | Split on `\n\n`                               | Respects structure           | Variable size, can be too small     |
| Sentence-based        | Split on `.` boundaries                       | Natural units                | Too granular, loses context         |
| Header-based          | Split on `##` headings                        | Semantic boundaries          | Assumes well-structured markdown    |
| Recursive             | Try headers, fallback to paragraphs/sentences | Best of both worlds          | Complex implementation              |
| Semantic              | Use embeddings to find optimal split points   | Perfect semantic units       | Requires embeddings before chunking |
| Token-overlap sliding | Fixed-size with N-token overlap               | Preserves context boundaries | Redundancy, larger corpus           |

### What We Chose

**Header-based with paragraph fallback** (`MemoryChunker`):

1. Parse frontmatter (tags, importance)
2. Split on `##` headings if present
3. Each chunk = heading + content up to 500 tokens
4. If no `##` headings, fall back to paragraph-based splitting
5. If a paragraph exceeds 500 tokens, split by sentences

### Why

**Semantic boundaries matter more than size uniformity.** In documentation and code comments, headings represent topic transitions. A chunk that spans multiple topics performs poorly in semantic search.

**500 tokens is the sweet spot** for our use case:

- Large enough to contain a complete thought
- Small enough to fit multiple chunks in an agent's context
- Matches typical markdown section length

**Paragraph fallback handles unstructured content.** Not all files have `##` headings (e.g., `README.md` often uses `#` only). Paragraph splitting ensures we still get reasonable chunks.

**No token overlap.** We chose not to use sliding windows because:

- Overlap creates redundancy (larger corpus, more storage)
- Hybrid retrieval (BM25 + embeddings) already handles boundary issues
- Headers naturally provide context across chunk boundaries

**Why not semantic chunking?** It requires embeddings before chunking, creating a chicken-and-egg problem. Header-based is fast, deterministic, and "good enough."

## 2. Indexing Method

### What We Evaluated

| Method            | Description                   | Pros                          | Cons                             |
| ----------------- | ----------------------------- | ----------------------------- | -------------------------------- |
| BM25 (FTS5)       | SQLite full-text search       | Fast, built-in, keyword-aware | No semantic understanding        |
| Vector-only       | Pure cosine similarity        | Semantic search               | Misses exact term matches        |
| Hybrid (BM25+Vec) | Combine keyword and semantic  | Best of both worlds           | More complex, requires both      |
| Elastic/Solr      | Dedicated search engine       | Production-grade              | External dependency, overkill    |
| MeiliSearch       | Fast typo-tolerant search     | Great UX                      | No vector support (yet)          |
| Tantivy           | Rust-based Lucene alternative | Fast, embeddable              | Requires native bindings         |
| Typesense         | Instant search with vectors   | Fast, vector support          | External service, not embeddable |

### What We Chose

**Hybrid retrieval with SQLite FTS5 + embeddings.**

```sql
-- FTS5 for keyword search
CREATE VIRTUAL TABLE chunks_fts USING fts5(heading, content);

-- Separate table for embeddings
CREATE TABLE embeddings (
  chunk_id TEXT PRIMARY KEY,
  embedding BLOB NOT NULL
);
```

### Why

**SQLite FTS5 is "good enough" for BM25.** We don't need Elasticsearch for a single-user desktop app. FTS5 provides:

- Fast full-text search (BM25 ranking built-in)
- Zero external dependencies
- WAL mode for concurrent reads
- Triggers to keep index in sync

**Hybrid retrieval beats either alone.** Research shows that combining keyword and semantic search outperforms either method in isolation:

- BM25 catches exact term matches ("KnowledgeStoreService")
- Embeddings catch semantic similarity ("persistent memory" → "knowledge store")
- RRF merge balances both signals

**Why not pure vector search?** Keyword search is essential for technical documentation:

- Code identifiers (class names, function names) must match exactly
- Acronyms and jargon are common
- Users often search for specific terms they saw in error messages

**Why not Elasticsearch?** It's overkill for our use case:

- Requires Java runtime
- Memory-hungry (500MB+ for small corpora)
- Deployment complexity (Docker, cluster management)
- We don't need distributed search or multi-tenancy

**Why not Typesense/MeiliSearch?** They require external services. SQLite is embedded and requires no setup.

## 3. Embedding Model

### What We Evaluated

| Model               | Dims | Size  | Provider        | Pros                       | Cons                      |
| ------------------- | ---- | ----- | --------------- | -------------------------- | ------------------------- |
| OpenAI text-embed-3 | 1536 | API   | OpenAI          | High quality               | API cost, vendor lock-in  |
| Cohere embed-v3     | 1024 | API   | Cohere          | Multilingual               | API cost                  |
| Voyage AI           | 1024 | API   | Voyage          | SOTA performance           | API cost, niche provider  |
| all-MiniLM-L6-v2    | 384  | 90MB  | Sentence-BERT   | Fast, CPU-friendly         | Lower quality than large  |
| all-mpnet-base-v2   | 768  | 420MB | Sentence-BERT   | Better quality than MiniLM | Slower, larger            |
| bge-small-en-v1.5   | 384  | 130MB | BAAI            | Strong for retrieval       | Requires normalization    |
| gte-small           | 384  | 120MB | Alibaba         | Good balance               | Less popular, fewer evals |
| OpenAI Ada-002      | 1536 | API   | OpenAI (legacy) | Reliable                   | Deprecated, expensive     |

### What We Chose

**`Xenova/all-MiniLM-L6-v2`** via `@xenova/transformers`.

### Why

**No API costs.** Local embeddings are free and have zero runtime latency (beyond compute). At 20 chunks/second, we can embed thousands of chunks for the cost of electricity, not API calls.

**Portability.** `@xenova/transformers` is pure JavaScript with no native bindings. It works in:

- Node.js (server)
- Electron (desktop app)
- Docker containers (Linux, macOS, Windows)
- Web Workers (future PWA support)

**Model caching.** The model downloads once to `DATA_DIR/models/` and persists across restarts. No network dependency after first load.

**384 dimensions is the sweet spot.** Larger models (768, 1536 dims) provide marginal quality gains but:

- Slower inference (2-3x slower)
- Larger storage (2-4x larger BLOBs)
- Harder to load into RAM (for batch operations)

**CPU inference is fast enough.** On modern CPUs, `all-MiniLM-L6-v2` generates embeddings at ~50ms each. This is acceptable for:

- Background workers (20 chunks/second)
- On-demand search (query embedding adds ~50ms)

**Quality is "good enough."** We're not building a search engine for millions of users. For developer documentation and code, `all-MiniLM-L6-v2` provides sufficient semantic understanding.

**Why not gte-small or bge-small?** They're slightly better on benchmarks but:

- Less popular (fewer tutorials, less community support)
- `all-MiniLM-L6-v2` is the de-facto standard for local embeddings
- Easier to find help and troubleshoot issues

**Why not larger models?** Diminishing returns. In our testing:

- `all-mpnet-base-v2` (768 dims) was 2x slower with ~5% better recall
- For a 5k-chunk corpus, the difference is negligible
- The storage cost (2x BLOB size) isn't worth it

**Why @xenova/transformers instead of native bindings?** Native bindings (ONNX, TensorFlow.js with tfjs-node) are faster (~30ms) but:

- Require platform-specific builds (x64, ARM, macOS, Windows)
- Deployment complexity (need to bundle native libraries)
- Electron packaging issues (need to rebuild native modules for Electron)
- `@xenova/transformers` is pure JS, works everywhere

## 4. Retrieval Algorithm

### What We Evaluated

| Algorithm             | Description                     | Pros                   | Cons                       |
| --------------------- | ------------------------------- | ---------------------- | -------------------------- |
| BM25-only             | FTS5 ranking                    | Fast, simple           | No semantic understanding  |
| Vector-only           | Cosine similarity on embeddings | Semantic search        | Misses exact matches       |
| Weighted sum          | `α * BM25 + β * cosine`         | Flexible               | Requires tuning α, β       |
| RRF (Reciprocal Rank) | Merge based on rank, not score  | No hyperparameters     | Assumes rank quality       |
| Cross-encoder rerank  | BERT-style reranker on top-K    | SOTA accuracy          | Slow, requires large model |
| ColBERT               | Token-level matching            | High recall            | Large index, complex       |
| Dense retrieval       | Pure ANN search                 | Fast for large corpora | Misses keyword matches     |

### What We Chose

**Hybrid retrieval with RRF merge (k=60).**

**Pipeline:**

1. BM25 search returns top 50 candidates
2. Load embeddings for candidates
3. Compute cosine similarity with query embedding
4. Rank by BM25 score (ascending)
5. Rank by cosine similarity (descending)
6. Merge with RRF: `score = 1/(k + rank_bm25) + 1/(k + rank_cosine)`
7. Return top N results sorted by RRF score

### Why

**RRF beats weighted sum.** No hyperparameters to tune. Weighted sum requires finding optimal α and β, which varies by corpus and query type. RRF works well across the board.

**k=60 is standard.** Elasticsearch, Pinecone, and research papers use k=60. It balances the contribution of both rankings.

**Top-50 candidates is the right size.** Too few and we lose recall. Too many and we waste compute on embeddings for irrelevant chunks. 50 is the sweet spot.

**Why not cross-encoder reranking?** It's too slow for interactive search:

- Requires running BERT inference on every (query, chunk) pair
- For 50 candidates, that's 50 BERT calls (~2s total)
- Adds significant latency for marginal quality gain

**Why not pure ANN (Approximate Nearest Neighbor)?** We're not operating at Google scale:

- Our corpora are small (<100k chunks per project)
- Brute-force cosine similarity on 50 candidates is fast (~5ms)
- ANN libraries (FAISS, Annoy, HNSWlib) add complexity

**BM25 first, embeddings second.** We run BM25 before embeddings because:

- FTS5 is extremely fast (5-10ms for any query)
- Embeddings are slower (~50ms query + ~5ms cosine per candidate)
- BM25 filters the corpus to a manageable size

**Fallback to BM25-only.** If embeddings aren't ready (model loading, not yet generated), the system falls back to pure BM25. This ensures search always works, even during initial indexing.

## 5. Query Enhancement

### What We Evaluated

| Technique        | Description                                   | Pros                       | Cons                               |
| ---------------- | --------------------------------------------- | -------------------------- | ---------------------------------- |
| Raw query        | Use user query as-is                          | Fast, simple               | Misses synonyms, context           |
| Query expansion  | Add synonyms via WordNet/thesaurus            | Better recall              | Noisy, requires dictionary         |
| HyDE             | Generate hypothetical answer, embed that      | Much better semantic match | Requires LLM call per query        |
| HyPE             | Pre-generate questions per chunk, embed those | Same benefit, zero runtime | Requires Haiku calls at index      |
| Pseudo-relevance | Use top-K results to expand query             | Improves iterative search  | Only helps if initial results good |
| Multi-query      | Generate 3 variations, retrieve for all       | Better coverage            | 3x retrieval cost                  |
| Query rewriting  | Use LLM to reformulate query                  | Better structured queries  | LLM latency + cost                 |

### What We Chose

**HyPE (Hypothetical Phrase Embeddings)** for semantic search, with **raw query** for keyword search.

**HyPE Indexing Pipeline:**

1. For each chunk, use Haiku to generate 3 short questions it answers
2. Embed all 3 questions
3. Average the embeddings → single representative query embedding
4. Store in `chunks.hype_embeddings`

**HyPE Retrieval:**

1. Embed the user's query
2. Compare to `hype_embeddings` instead of `embeddings`
3. Chunks that answer similar questions rank higher

### Why

**HyDE is too expensive at runtime.** Every search would require:

- 1 Haiku call to generate hypothetical answer (~300 tokens)
- ~500ms latency
- ~$0.0001 per search (adds up fast)

**HyPE moves the cost to indexing time.** We pay once per chunk:

- 3 questions × $0.0001 = $0.0003 per chunk
- For 10k chunks, that's $3 total (one-time cost)
- Amortized over months of searches, it's negligible

**HyPE is as effective as HyDE.** Research shows that:

- HyDE: "What would the answer to this query look like?" → embed answer
- HyPE: "What questions does this chunk answer?" → embed questions
- Both align query and document in embedding space
- Performance is nearly identical

**Rate-limiting prevents API abuse.** Background HyPE worker processes 10 chunks/minute (6s delay between Haiku calls) to avoid rate limits.

**Why not multi-query?** It triples retrieval cost (3 BM25 queries, 3 sets of embeddings). The quality gain isn't worth 3x latency.

**Why not query rewriting?** Adds latency and cost to every search. For developer documentation, raw queries are usually good enough (developers know what terms to search for).

**Why not pseudo-relevance feedback?** It only helps if the initial results are already decent. If the first retrieval fails, expanding based on poor results makes it worse.

## Design Decisions Summary

| Component     | Choice                     | Rationale                                     |
| ------------- | -------------------------- | --------------------------------------------- |
| Chunking      | Header-based (500 tokens)  | Semantic boundaries, structured markdown      |
| Indexing      | SQLite FTS5 + embeddings   | Zero dependencies, good enough, hybrid wins   |
| Embedding     | all-MiniLM-L6-v2 (local)   | No API cost, portable, fast enough            |
| Retrieval     | BM25 + cosine + RRF (k=60) | No hyperparameters, balanced keyword/semantic |
| Query Enhance | HyPE (index-time)          | Zero runtime cost, same benefit as HyDE       |

## Why Not Cloud Vector Databases?

| Service  | Why Not?                                                    |
| -------- | ----------------------------------------------------------- |
| Pinecone | Monthly cost, network latency, requires account/credit card |
| Weaviate | Self-hosted complexity, memory-hungry (1GB+)                |
| Qdrant   | Self-hosted, Docker required, overkill for local-first app  |
| Milvus   | Heavy (Java/Go), distributed system, not embeddable         |
| Chroma   | Better than others, but still requires external service     |

**Core Philosophy:** Automaker is a **local-first** desktop app. Adding external dependencies (cloud services, Docker containers) breaks the "install and run" experience.

**SQLite is sufficient.** For corpora under 100k chunks:

- FTS5 handles keyword search at scale
- Brute-force cosine similarity on 50 candidates is fast
- No need for approximate nearest neighbor (ANN) indexes

**Offline-first.** SQLite works without internet. Cloud vector databases fail offline.

## SQLite-Native vs External Vector Store

| Approach      | Pros                                    | Cons                                  |
| ------------- | --------------------------------------- | ------------------------------------- |
| SQLite-native | Zero dependencies, single database file | No ANN index, slower at 100k+ scale   |
| pgvector      | Postgres extension, HNSW index          | Requires PostgreSQL, heavyweight      |
| Chroma        | Fast, modern, Python/TS SDKs            | External service, setup complexity    |
| FAISS         | Fast ANN, from Meta                     | Requires Python bindings, complex API |

### Why SQLite-Native?

**Corpus size doesn't justify ANN.** We're not indexing Wikipedia. Most projects have:

- 1k-10k chunks (< 40MB database)
- Brute-force cosine on 50 candidates: ~5ms
- ANN libraries shine at 100k-1M+ vectors (not our scale)

**Single database file is a huge win.** No separate services, no data sync, no schema drift. Everything is in `.automaker/knowledge.db`.

**WAL mode enables concurrent reads.** Multiple agents can search simultaneously without locking issues.

**Easy backup and transfer.** Copy `.automaker/knowledge.db` to back up all knowledge. No separate vector store to manage.

**When would we switch?** If a single project exceeds 100k chunks (~400MB), we'd revisit. Likely candidates:

- Large monorepos (> 1M lines of code)
- Documentation sites (10k+ pages)
- Multi-year agent memory (years of reflections and learnings)

At that scale, we'd consider:

- `pgvector` if we're already using PostgreSQL
- `hnswlib` via Node.js bindings (small C++ library, embeddable)
- Staying with SQLite but adding a VIRTUAL TABLE extension for ANN

## Chunking Strategies: The Long Debate

### Why We Rejected Fixed-Size Chunking

**Example Failure Case:**

```markdown
## Authentication Flow

The authentication system uses JWT tokens with a 7-day expiry. Tokens are stored in httpOnly cookies to prevent XSS attacks.

## Database Schema

The users table stores...
```

**Fixed-size (300 tokens)** would split mid-paragraph, separating "JWT tokens" from "httpOnly cookies." A search for "XSS prevention" might miss this chunk because the context is broken.

**Header-based chunking** keeps the entire "Authentication Flow" section together, preserving semantic context.

### Why We Rejected Sentence-Based Chunking

Sentences are too granular:

- "The authentication system uses JWT tokens."
- "Tokens are stored in httpOnly cookies."
- "This prevents XSS attacks."

Each sentence becomes a separate chunk. Search for "JWT token storage" returns 3 fragments that are hard to understand in isolation. Header-based chunking gives the full context.

### Why We Rejected Semantic Chunking (For Now)

**Semantic chunking** uses embeddings to find optimal split points:

1. Embed every sentence
2. Compute similarity between adjacent sentences
3. Split where similarity drops (topic change)

**Problems:**

- **Chicken-and-egg:** Requires embeddings before chunking, but chunking should come first
- **Expensive:** Embedding every sentence is slow (100s of chunks → 1000s of sentences)
- **Complex:** Hard to debug when it goes wrong

**Header-based is "good enough."** Markdown headings already mark topic boundaries. No need for ML-based detection.

## BM25 vs TF-IDF vs Keyword Matching

| Method  | Description                              | When It's Good                 | When It Fails                  |
| ------- | ---------------------------------------- | ------------------------------ | ------------------------------ |
| Keyword | Exact string match                       | Searching for code identifiers | Synonyms, typos, related terms |
| TF-IDF  | Term frequency × inverse doc frequency   | Finds rare terms               | Ignores term proximity         |
| BM25    | TF-IDF with saturation + doc length norm | Best for text search           | No semantic understanding      |

### Why BM25?

**BM25 is the industry standard** for keyword search. It's better than TF-IDF because:

- **Saturation:** Multiple occurrences of a term have diminishing returns (avoids keyword stuffing)
- **Document length normalization:** Longer docs don't dominate results
- **Tunable:** Parameters k1 (term saturation) and b (length normalization) can be adjusted

**FTS5 implements BM25** by default. No configuration needed.

**Why not just keyword matching?** It's too strict:

- Search "authentication" → miss chunks with "auth", "login", "identity"
- BM25 handles this via IDF (rare terms score higher)

**Why not TF-IDF?** BM25 is strictly better. It's TF-IDF with improvements that matter.

## Related

- **[Knowledge Hive](./knowledge-hive)** — Full architecture overview
- **[Memory System](./memory-system)** — How learnings are written and retrieved
