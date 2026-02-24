/**
 * Knowledge Store Types
 *
 * Types for the persistent knowledge store that indexes project documentation,
 * code, and context for semantic search and retrieval.
 */

/**
 * Source type for a knowledge chunk
 */
export type KnowledgeSourceType =
  | 'file'
  | 'url'
  | 'manual'
  | 'generated'
  | 'reflection'
  | 'agent_output';

/**
 * A single indexed chunk of knowledge
 */
export interface KnowledgeChunk {
  /** Unique identifier for this chunk */
  id: string;

  /** Source type */
  sourceType: KnowledgeSourceType;

  /** Source file path (relative to project root) or URL */
  sourceFile: string;

  /** Project path this chunk belongs to */
  projectPath: string;

  /** Index of this chunk within the source (for multi-chunk sources) */
  chunkIndex: number;

  /** Optional heading/title for this chunk */
  heading?: string;

  /** The actual content of the chunk */
  content: string;

  /** Optional tags for categorization */
  tags?: string[];

  /** Importance score (0-1) for ranking results */
  importance: number;

  /** ISO timestamp when this chunk was created */
  createdAt: string;

  /** ISO timestamp when this chunk was last updated */
  updatedAt: string;
}

/**
 * A search result from the knowledge store
 */
export interface KnowledgeSearchResult {
  /** The matching chunk */
  chunk: KnowledgeChunk;

  /** Relevance score from FTS5 (higher is more relevant) */
  score: number;

  /** Matching text snippet with highlights */
  snippet?: string;
}

/**
 * Statistics about the knowledge store
 */
export interface KnowledgeStoreStats {
  /** Total number of chunks in the store */
  totalChunks: number;

  /** Total size in bytes */
  totalSizeBytes: number;

  /** Number of unique source files */
  uniqueSources: number;

  /** Breakdown by source type */
  sourceTypeBreakdown: Record<KnowledgeSourceType, number>;

  /** Timestamp of last update */
  lastUpdated?: string;

  /** Database file path */
  dbPath: string;

  /** Whether hybrid retrieval is enabled */
  enabledHybridRetrieval: boolean;
}

/**
 * Configuration settings for the knowledge store
 */
export interface KnowledgeStoreSettings {
  /** Maximum chunk size in characters */
  maxChunkSize: number;

  /** Overlap between chunks in characters */
  chunkOverlap: number;

  /** Default importance score for new chunks */
  defaultImportance: number;

  /** Enable automatic reindexing on file changes */
  autoReindex: boolean;

  /** File patterns to exclude from indexing (glob patterns) */
  excludePatterns: string[];

  /** File patterns to include for indexing (glob patterns) */
  includePatterns: string[];

  /** Enable hybrid retrieval (BM25 + cosine similarity with RRF) */
  hybridRetrieval: boolean;

  /** Enable HyPE (Hypothetical Phrase Embeddings) pre-computed query embeddings */
  hypeEnabled?: boolean;
}

/**
 * Options for searching the knowledge store
 */
export interface KnowledgeSearchOptions {
  /** Maximum number of results to return (default: 20) */
  maxResults?: number;

  /** Maximum total tokens to return (default: 8000, ~4 chars per token) */
  maxTokens?: number;

  /** Filter by source types (default: 'all') */
  sourceTypes?: KnowledgeSourceType[] | 'all';
}
