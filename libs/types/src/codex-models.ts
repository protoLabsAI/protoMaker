/**
 * Codex CLI Model IDs
 * Based on OpenAI Codex CLI official models
 * Reference: https://developers.openai.com/codex/models/
 *
 * IMPORTANT: All Codex models use 'codex-' prefix to distinguish from Cursor CLI models
 */
export type CodexModelId =
  | 'codex-gpt-5.5'
  | 'codex-gpt-5.4'
  | 'codex-gpt-5.4-mini'
  | 'codex-gpt-5.3-codex'
  | 'codex-gpt-5.3-codex-spark'
  | 'codex-gpt-5.2';

/**
 * Codex model metadata
 */
export interface CodexModelConfig {
  id: CodexModelId;
  label: string;
  description: string;
  hasThinking: boolean;
  /** Whether the model supports vision/image inputs */
  supportsVision: boolean;
}

/**
 * Complete model map for Codex CLI
 * All keys use 'codex-' prefix to distinguish from Cursor CLI models
 */
export const CODEX_MODEL_CONFIG_MAP: Record<CodexModelId, CodexModelConfig> = {
  'codex-gpt-5.5': {
    id: 'codex-gpt-5.5',
    label: 'GPT-5.5',
    description: 'Flagship for complex coding, computer use, knowledge work, and research',
    hasThinking: true,
    supportsVision: true,
  },
  'codex-gpt-5.4': {
    id: 'codex-gpt-5.4',
    label: 'GPT-5.4',
    description: 'Professional coding with stronger reasoning and agentic capabilities',
    hasThinking: true,
    supportsVision: true,
  },
  'codex-gpt-5.4-mini': {
    id: 'codex-gpt-5.4-mini',
    label: 'GPT-5.4-mini',
    description: 'Fast, lightweight tasks and subagent operations',
    hasThinking: false,
    supportsVision: false,
  },
  'codex-gpt-5.3-codex': {
    id: 'codex-gpt-5.3-codex',
    label: 'GPT-5.3-Codex',
    description:
      'Codex-tuned: industry-leading coding performance for complex software engineering',
    hasThinking: false,
    supportsVision: false,
  },
  'codex-gpt-5.3-codex-spark': {
    id: 'codex-gpt-5.3-codex-spark',
    label: 'GPT-5.3-Codex-Spark',
    description: 'Near-instant real-time iteration (ChatGPT Pro research preview)',
    hasThinking: false,
    supportsVision: false,
  },
  'codex-gpt-5.2': {
    id: 'codex-gpt-5.2',
    label: 'GPT-5.2 (legacy)',
    description: 'Legacy general-purpose model for debugging tasks requiring deeper analysis',
    hasThinking: false,
    supportsVision: false,
  },
};

/**
 * Helper: Check if model has thinking capability
 */
export function codexModelHasThinking(modelId: CodexModelId): boolean {
  return CODEX_MODEL_CONFIG_MAP[modelId]?.hasThinking ?? false;
}

/**
 * Helper: Get display name for model
 */
export function getCodexModelLabel(modelId: CodexModelId): string {
  return CODEX_MODEL_CONFIG_MAP[modelId]?.label ?? modelId;
}

/**
 * Helper: Get all Codex model IDs
 */
export function getAllCodexModelIds(): CodexModelId[] {
  return Object.keys(CODEX_MODEL_CONFIG_MAP) as CodexModelId[];
}

/**
 * Helper: Check if Codex model supports vision
 */
export function codexModelSupportsVision(modelId: CodexModelId): boolean {
  return CODEX_MODEL_CONFIG_MAP[modelId]?.supportsVision ?? true;
}
