// Type definitions for Electron IPC API
import type { SessionListItem, Message } from '@/types/electron';
import type { ClaudeUsageResponse, CodexUsageResponse } from '@/store/types';
import type {
  IssueValidationVerdict,
  IssueValidationConfidence,
  IssueComplexity,
  IssueValidationInput,
  IssueValidationResult,
  IssueValidationResponse,
  IssueValidationEvent,
  StoredValidation,
  ModelId,
  ThinkingLevel,
  ReasoningEffort,
  GitHubComment,
  IssueCommentsResult,
  RepoResearchResult,
  GapAnalysisReport,
  AlignmentProposal,
} from '@automaker/types';

import { getJSON, setJSON, removeItem } from './storage';

// Re-export issue validation types for use in components
export type {
  IssueValidationVerdict,
  IssueValidationConfidence,
  IssueComplexity,
  IssueValidationInput,
  IssueValidationResult,
  IssueValidationResponse,
  IssueValidationEvent,
  StoredValidation,
  GitHubComment,
  IssueCommentsResult,
};

export interface FileEntry {
  name: string;
  isDirectory: boolean;
  isFile: boolean;
}

export interface FileStats {
  isDirectory: boolean;
  isFile: boolean;
  size: number;
  mtime: Date;
}

export interface DialogResult {
  canceled: boolean;
  filePaths: string[];
}

export interface FileResult {
  success: boolean;
  content?: string;
  error?: string;
}

export interface WriteResult {
  success: boolean;
  error?: string;
}

export interface ReaddirResult {
  success: boolean;
  entries?: FileEntry[];
  error?: string;
}

export interface StatResult {
  success: boolean;
  stats?: FileStats;
  error?: string;
}

// Re-export types from electron.d.ts for external use
export type {
  AutoModeEvent,
  ModelDefinition,
  ProviderStatus,
  WorktreeAPI,
  GitAPI,
  WorktreeInfo,
  WorktreeStatus,
  FileDiffsResult,
  FileDiffResult,
  FileStatus,
} from '@/types/electron';

// Import types for internal use in this file
import type {
  AutoModeEvent,
  WorktreeAPI,
  GitAPI,
  ModelDefinition,
  ProviderStatus,
} from '@/types/electron';

// Import HTTP API client (ES module)
import { getHttpApiClient, getServerUrlSync } from './http-api-client';

// Feature type - Import from app-store
import type { Feature } from '@/store/types';

// Running Agent type
export interface RunningAgent {
  featureId: string;
  projectPath: string;
  projectName: string;
  isAutoMode: boolean;
  startTime: number;
  model?: string;
  provider?: string;
  title?: string;
  description?: string;
  branchName?: string;
  costUsd?: number;
}

export interface RunningAgentsResult {
  success: boolean;
  runningAgents?: RunningAgent[];
  totalCount?: number;
  error?: string;
}

export interface RunningAgentsAPI {
  getAll: () => Promise<RunningAgentsResult>;
}

// GitHub types
export interface GitHubLabel {
  name: string;
  color: string;
}

export interface GitHubAuthor {
  login: string;
  avatarUrl?: string;
}

export interface GitHubAssignee {
  login: string;
  avatarUrl?: string;
}

export interface LinkedPullRequest {
  number: number;
  title: string;
  state: string;
  url: string;
}

export interface GitHubIssue {
  number: number;
  title: string;
  state: string;
  author: GitHubAuthor;
  createdAt: string;
  labels: GitHubLabel[];
  url: string;
  body: string;
  assignees: GitHubAssignee[];
  linkedPRs?: LinkedPullRequest[];
}

export interface GitHubPR {
  number: number;
  title: string;
  state: string;
  author: GitHubAuthor;
  createdAt: string;
  labels: GitHubLabel[];
  url: string;
  isDraft: boolean;
  headRefName: string;
  reviewDecision: string | null;
  mergeable: string;
  body: string;
}

export interface GitHubRemoteStatus {
  hasGitHubRemote: boolean;
  remoteUrl: string | null;
  owner: string | null;
  repo: string | null;
}

export interface GitHubAPI {
  checkRemote: (projectPath: string) => Promise<{
    success: boolean;
    hasGitHubRemote?: boolean;
    remoteUrl?: string | null;
    owner?: string | null;
    repo?: string | null;
    error?: string;
  }>;
  listIssues: (projectPath: string) => Promise<{
    success: boolean;
    openIssues?: GitHubIssue[];
    closedIssues?: GitHubIssue[];
    error?: string;
  }>;
  listPRs: (projectPath: string) => Promise<{
    success: boolean;
    openPRs?: GitHubPR[];
    mergedPRs?: GitHubPR[];
    error?: string;
  }>;
  /** Start async validation of a GitHub issue */
  validateIssue: (
    projectPath: string,
    issue: IssueValidationInput,
    model?: ModelId,
    thinkingLevel?: ThinkingLevel,
    reasoningEffort?: ReasoningEffort
  ) => Promise<{ success: boolean; message?: string; issueNumber?: number; error?: string }>;
  /** Check validation status for an issue or all issues */
  getValidationStatus: (
    projectPath: string,
    issueNumber?: number
  ) => Promise<{
    success: boolean;
    isRunning?: boolean;
    startedAt?: string;
    runningIssues?: number[];
    error?: string;
  }>;
  /** Stop a running validation */
  stopValidation: (
    projectPath: string,
    issueNumber: number
  ) => Promise<{ success: boolean; message?: string; error?: string }>;
  /** Get stored validations for a project */
  getValidations: (
    projectPath: string,
    issueNumber?: number
  ) => Promise<{
    success: boolean;
    validation?: StoredValidation | null;
    validations?: StoredValidation[];
    isStale?: boolean;
    error?: string;
  }>;
  /** Mark a validation as viewed by the user */
  markValidationViewed: (
    projectPath: string,
    issueNumber: number
  ) => Promise<{ success: boolean; error?: string }>;
  /** Subscribe to validation events */
  onValidationEvent: (callback: (event: IssueValidationEvent) => void) => () => void;
  /** Fetch comments for a specific issue */
  getIssueComments: (
    projectPath: string,
    issueNumber: number,
    cursor?: string
  ) => Promise<{
    success: boolean;
    comments?: GitHubComment[];
    totalCount?: number;
    hasNextPage?: boolean;
    endCursor?: string;
    error?: string;
  }>;
}

// Feature Suggestions types
export interface FeatureSuggestion {
  id: string;
  category: string;
  description: string;
  priority: number;
  reasoning: string;
}

export interface SuggestionsEvent {
  type: 'suggestions_progress' | 'suggestions_tool' | 'suggestions_complete' | 'suggestions_error';
  content?: string;
  tool?: string;
  input?: unknown;
  suggestions?: FeatureSuggestion[];
  error?: string;
}

export type SuggestionType = 'features' | 'refactoring' | 'security' | 'performance';

export interface SuggestionsAPI {
  generate: (
    projectPath: string,
    suggestionType?: SuggestionType
  ) => Promise<{ success: boolean; error?: string }>;
  stop: () => Promise<{ success: boolean; error?: string }>;
  status: () => Promise<{
    success: boolean;
    isRunning?: boolean;
    error?: string;
  }>;
  onEvent: (callback: (event: SuggestionsEvent) => void) => () => void;
}

// Spec Regeneration types
export type SpecRegenerationEvent =
  | { type: 'spec_regeneration_progress'; content: string; projectPath: string }
  | {
      type: 'spec_regeneration_tool';
      tool: string;
      input: unknown;
      projectPath: string;
    }
  | { type: 'spec_regeneration_complete'; message: string; projectPath: string }
  | { type: 'spec_regeneration_error'; error: string; projectPath: string };

export interface SpecRegenerationAPI {
  create: (
    projectPath: string,
    projectOverview: string,
    generateFeatures?: boolean,
    analyzeProject?: boolean,
    maxFeatures?: number
  ) => Promise<{ success: boolean; error?: string }>;
  generate: (
    projectPath: string,
    projectDefinition: string,
    generateFeatures?: boolean,
    analyzeProject?: boolean,
    maxFeatures?: number
  ) => Promise<{ success: boolean; error?: string }>;
  generateFeatures: (
    projectPath: string,
    maxFeatures?: number
  ) => Promise<{
    success: boolean;
    error?: string;
  }>;
  sync: (projectPath: string) => Promise<{
    success: boolean;
    error?: string;
  }>;
  stop: (projectPath?: string) => Promise<{ success: boolean; error?: string }>;
  status: (projectPath?: string) => Promise<{
    success: boolean;
    isRunning?: boolean;
    currentPhase?: string;
    projectPath?: string;
    error?: string;
  }>;
  onEvent: (callback: (event: SpecRegenerationEvent) => void) => () => void;
}

// Features API types
export interface FeaturesAPI {
  getAll: (
    projectPath: string
  ) => Promise<{ success: boolean; features?: Feature[]; error?: string }>;
  get: (
    projectPath: string,
    featureId: string
  ) => Promise<{ success: boolean; feature?: Feature; error?: string }>;
  create: (
    projectPath: string,
    feature: Feature
  ) => Promise<{ success: boolean; feature?: Feature; error?: string }>;
  update: (
    projectPath: string,
    featureId: string,
    updates: Partial<Feature>,
    descriptionHistorySource?: 'enhance' | 'edit',
    enhancementMode?: 'improve' | 'technical' | 'simplify' | 'acceptance' | 'ux-reviewer',
    preEnhancementDescription?: string
  ) => Promise<{ success: boolean; feature?: Feature; error?: string }>;
  delete: (projectPath: string, featureId: string) => Promise<{ success: boolean; error?: string }>;
  getAgentOutput: (
    projectPath: string,
    featureId: string
  ) => Promise<{ success: boolean; content?: string | null; error?: string }>;
  generateTitle: (
    description: string,
    projectPath?: string
  ) => Promise<{ success: boolean; title?: string; error?: string }>;
}

export interface AutoModeAPI {
  start: (
    projectPath: string,
    branchName?: string | null,
    maxConcurrency?: number
  ) => Promise<{ success: boolean; error?: string }>;
  stop: (
    projectPath: string,
    branchName?: string | null
  ) => Promise<{ success: boolean; error?: string; runningFeatures?: number }>;
  stopFeature: (featureId: string) => Promise<{ success: boolean; error?: string }>;
  status: (
    projectPath?: string,
    branchName?: string | null
  ) => Promise<{
    success: boolean;
    isRunning?: boolean;
    isAutoLoopRunning?: boolean;
    currentFeatureId?: string | null;
    runningFeatures?: string[];
    runningProjects?: string[];
    runningCount?: number;
    maxConcurrency?: number;
    error?: string;
  }>;
  runFeature: (
    projectPath: string,
    featureId: string,
    useWorktrees?: boolean,
    worktreePath?: string
  ) => Promise<{ success: boolean; passes?: boolean; error?: string }>;
  verifyFeature: (
    projectPath: string,
    featureId: string
  ) => Promise<{ success: boolean; passes?: boolean; error?: string }>;
  resumeFeature: (
    projectPath: string,
    featureId: string,
    useWorktrees?: boolean
  ) => Promise<{ success: boolean; passes?: boolean; error?: string }>;
  contextExists: (
    projectPath: string,
    featureId: string
  ) => Promise<{ success: boolean; exists?: boolean; error?: string }>;
  analyzeProject: (
    projectPath: string
  ) => Promise<{ success: boolean; message?: string; error?: string }>;
  followUpFeature: (
    projectPath: string,
    featureId: string,
    prompt: string,
    imagePaths?: string[],
    useWorktrees?: boolean
  ) => Promise<{ success: boolean; passes?: boolean; error?: string }>;
  commitFeature: (
    projectPath: string,
    featureId: string,
    worktreePath?: string
  ) => Promise<{ success: boolean; error?: string }>;
  approvePlan: (
    projectPath: string,
    featureId: string,
    approved: boolean,
    editedPlan?: string,
    feedback?: string
  ) => Promise<{ success: boolean; error?: string }>;
  resumeInterrupted: (
    projectPath: string
  ) => Promise<{ success: boolean; message?: string; error?: string }>;
  onEvent: (callback: (event: AutoModeEvent) => void) => () => void;
}

export interface SaveImageResult {
  success: boolean;
  path?: string;
  error?: string;
}

// Notifications API interface
import type {
  Notification,
  StoredEvent,
  StoredEventSummary,
  EventHistoryFilter,
  EventReplayResult,
} from '@automaker/types';

export interface NotificationsAPI {
  list: (projectPath: string) => Promise<{
    success: boolean;
    notifications?: Notification[];
    error?: string;
  }>;
  getUnreadCount: (projectPath: string) => Promise<{
    success: boolean;
    count?: number;
    error?: string;
  }>;
  markAsRead: (
    projectPath: string,
    notificationId?: string
  ) => Promise<{
    success: boolean;
    notification?: Notification;
    count?: number;
    error?: string;
  }>;
  dismiss: (
    projectPath: string,
    notificationId?: string
  ) => Promise<{
    success: boolean;
    dismissed?: boolean;
    count?: number;
    error?: string;
  }>;
}

// Event History API interface
export interface EventHistoryAPI {
  list: (
    projectPath: string,
    filter?: EventHistoryFilter
  ) => Promise<{
    success: boolean;
    events?: StoredEventSummary[];
    total?: number;
    error?: string;
  }>;
  get: (
    projectPath: string,
    eventId: string
  ) => Promise<{
    success: boolean;
    event?: StoredEvent;
    error?: string;
  }>;
  delete: (
    projectPath: string,
    eventId: string
  ) => Promise<{
    success: boolean;
    error?: string;
  }>;
  clear: (projectPath: string) => Promise<{
    success: boolean;
    cleared?: number;
    error?: string;
  }>;
  replay: (
    projectPath: string,
    eventId: string,
    hookIds?: string[]
  ) => Promise<{
    success: boolean;
    result?: EventReplayResult;
    error?: string;
  }>;
}

export interface ElectronAPI {
  ping: () => Promise<string>;
  getApiKey?: () => Promise<string | null>;
  quit?: () => Promise<void>;

  // Ava Anywhere overlay
  toggleOverlay?: () => Promise<void>;
  hideOverlay?: () => Promise<void>;
  showOverlay?: () => Promise<void>;

  openExternalLink: (url: string) => Promise<{ success: boolean; error?: string }>;
  openDirectory: () => Promise<DialogResult>;
  openFile: (options?: object) => Promise<DialogResult>;
  readFile: (filePath: string) => Promise<FileResult>;
  writeFile: (filePath: string, content: string) => Promise<WriteResult>;
  mkdir: (dirPath: string) => Promise<WriteResult>;
  readdir: (dirPath: string) => Promise<ReaddirResult>;
  exists: (filePath: string) => Promise<boolean>;
  stat: (filePath: string) => Promise<StatResult>;
  deleteFile: (filePath: string) => Promise<WriteResult>;
  trashItem: (filePath: string) => Promise<WriteResult>;
  getPath: (name: string) => Promise<string>;
  openInEditor: (
    filePath: string,
    line?: number,
    column?: number
  ) => Promise<{ success: boolean; error?: string }>;
  saveImageToTemp: (
    data: string,
    filename: string,
    mimeType: string,
    projectPath?: string
  ) => Promise<SaveImageResult>;
  isElectron?: boolean;
  checkClaudeCli: () => Promise<{
    success: boolean;
    status?: string;
    method?: string;
    version?: string;
    path?: string;
    recommendation?: string;
    installCommands?: {
      macos?: string;
      windows?: string;
      linux?: string;
      npm?: string;
    };
    error?: string;
  }>;
  model: {
    getAvailable: () => Promise<{
      success: boolean;
      models?: ModelDefinition[];
      error?: string;
    }>;
    checkProviders: () => Promise<{
      success: boolean;
      providers?: Record<string, ProviderStatus>;
      error?: string;
    }>;
  };
  worktree: WorktreeAPI;
  git: GitAPI;
  suggestions: SuggestionsAPI;
  specRegeneration: SpecRegenerationAPI;
  autoMode: AutoModeAPI;
  features: FeaturesAPI;
  runningAgents: RunningAgentsAPI;
  github: GitHubAPI;
  enhancePrompt: {
    enhance: (
      originalText: string,
      enhancementMode: string,
      model?: string,
      thinkingLevel?: string,
      projectPath?: string
    ) => Promise<{
      success: boolean;
      enhancedText?: string;
      error?: string;
    }>;
  };
  templates: {
    clone: (
      repoUrl: string,
      projectName: string,
      parentDir: string
    ) => Promise<{ success: boolean; projectPath?: string; error?: string }>;
  };
  backlogPlan: {
    generate: (
      projectPath: string,
      prompt: string,
      model?: string
    ) => Promise<{ success: boolean; error?: string }>;
    stop: () => Promise<{ success: boolean; error?: string }>;
    status: (projectPath: string) => Promise<{
      success: boolean;
      isRunning?: boolean;
      savedPlan?: {
        savedAt: string;
        prompt: string;
        model?: string;
        result: {
          changes: Array<{
            type: 'add' | 'update' | 'delete';
            featureId?: string;
            feature?: Record<string, unknown>;
            reason: string;
          }>;
          summary: string;
          dependencyUpdates: Array<{
            featureId: string;
            removedDependencies: string[];
            addedDependencies: string[];
          }>;
        };
      } | null;
      error?: string;
    }>;
    apply: (
      projectPath: string,
      plan: {
        changes: Array<{
          type: 'add' | 'update' | 'delete';
          featureId?: string;
          feature?: Record<string, unknown>;
          reason: string;
        }>;
        summary: string;
        dependencyUpdates: Array<{
          featureId: string;
          removedDependencies: string[];
          addedDependencies: string[];
        }>;
      },
      branchName?: string
    ) => Promise<{ success: boolean; appliedChanges?: string[]; error?: string }>;
    clear: (projectPath: string) => Promise<{ success: boolean; error?: string }>;
    onEvent: (callback: (data: unknown) => void) => () => void;
  };
  // Setup API surface is implemented by the main process and mirrored by HttpApiClient.
  // Keep this intentionally loose to avoid tight coupling between front-end and server types.
  setup: any;
  // SetupLab pipeline (repo research, gap analysis, report generation, alignment proposals)
  setupLab: {
    research: (projectPath: string) => Promise<{
      success: boolean;
      research?: RepoResearchResult;
      error?: string;
    }>;
    gapAnalysis: (
      projectPath: string,
      research: RepoResearchResult,
      skipChecks?: string[]
    ) => Promise<{
      success: boolean;
      report?: GapAnalysisReport;
      error?: string;
    }>;
    report: (
      projectPath: string,
      research: RepoResearchResult,
      report: GapAnalysisReport
    ) => Promise<{
      success: boolean;
      outputPath?: string;
      error?: string;
    }>;
    openReport: (reportPath: string) => Promise<{
      success: boolean;
      error?: string;
    }>;
    propose: (
      projectPath: string,
      gapAnalysis: GapAnalysisReport,
      autoCreate?: boolean
    ) => Promise<{
      success: boolean;
      proposal?: AlignmentProposal;
      featuresCreated?: number;
      error?: string;
    }>;
  };
  agent: {
    start: (
      sessionId: string,
      workingDirectory?: string
    ) => Promise<{
      success: boolean;
      messages?: Message[];
      error?: string;
    }>;
    send: (
      sessionId: string,
      message: string,
      workingDirectory?: string,
      imagePaths?: string[],
      model?: string,
      thinkingLevel?: string,
      role?: string,
      maxTurns?: number,
      systemPromptOverride?: string
    ) => Promise<{ success: boolean; error?: string }>;
    getHistory: (sessionId: string) => Promise<{
      success: boolean;
      messages?: Message[];
      isRunning?: boolean;
      error?: string;
    }>;
    stop: (sessionId: string) => Promise<{ success: boolean; error?: string }>;
    clear: (sessionId: string) => Promise<{ success: boolean; error?: string }>;
    onStream: (callback: (data: unknown) => void) => () => void;
    queueAdd?: (
      sessionId: string,
      message: string,
      imagePaths?: string[],
      model?: string,
      thinkingLevel?: string,
      role?: string,
      maxTurns?: number,
      systemPromptOverride?: string
    ) => Promise<{ success: boolean; error?: string }>;
  };
  sessions: {
    list: (includeArchived?: boolean) => Promise<{
      success: boolean;
      sessions?: SessionListItem[];
      error?: string;
    }>;
    create: (
      name: string,
      projectPath: string,
      workingDirectory?: string
    ) => Promise<{
      success: boolean;
      session?: {
        id: string;
        name: string;
        projectPath: string;
        workingDirectory?: string;
        createdAt: string;
        updatedAt: string;
      };
      error?: string;
    }>;
    update: (
      sessionId: string,
      name?: string,
      tags?: string[]
    ) => Promise<{ success: boolean; error?: string }>;
    archive: (sessionId: string) => Promise<{ success: boolean; error?: string }>;
    unarchive: (sessionId: string) => Promise<{ success: boolean; error?: string }>;
    delete: (sessionId: string) => Promise<{ success: boolean; error?: string }>;
  };
  claude: {
    getUsage: () => Promise<ClaudeUsageResponse>;
  };
  context: {
    describeImage: (imagePath: string) => Promise<{
      success: boolean;
      description?: string;
      error?: string;
    }>;
    describeFile: (filePath: string) => Promise<{
      success: boolean;
      description?: string;
      error?: string;
    }>;
  };
  notifications: NotificationsAPI;
  eventHistory: EventHistoryAPI;
  codex: {
    getUsage: () => Promise<CodexUsageResponse>;
    getModels: (refresh?: boolean) => Promise<{
      success: boolean;
      models?: Array<{
        id: string;
        label: string;
        description: string;
        hasThinking: boolean;
        supportsVision: boolean;
        tier: 'premium' | 'standard' | 'basic';
        isDefault: boolean;
      }>;
      cachedAt?: number;
      error?: string;
    }>;
  };
  settings: {
    getStatus: () => Promise<{
      success: boolean;
      hasGlobalSettings: boolean;
      hasCredentials: boolean;
      dataDir: string;
      needsMigration: boolean;
    }>;
    getGlobal: () => Promise<{
      success: boolean;
      settings?: Record<string, unknown>;
      error?: string;
    }>;
    updateGlobal: (updates: Record<string, unknown>) => Promise<{
      success: boolean;
      settings?: Record<string, unknown>;
      error?: string;
    }>;
    getCredentials: () => Promise<{
      success: boolean;
      credentials?: {
        anthropic: { configured: boolean; masked: string };
        google: { configured: boolean; masked: string };
        openai: { configured: boolean; masked: string };
      };
      error?: string;
    }>;
    updateCredentials: (updates: {
      apiKeys?: { anthropic?: string; google?: string; openai?: string };
    }) => Promise<{
      success: boolean;
      credentials?: {
        anthropic: { configured: boolean; masked: string };
        google: { configured: boolean; masked: string };
        openai: { configured: boolean; masked: string };
      };
      error?: string;
    }>;
    getProject: (projectPath: string) => Promise<{
      success: boolean;
      settings?: Record<string, unknown>;
      error?: string;
    }>;
    updateProject: (
      projectPath: string,
      updates: Record<string, unknown>
    ) => Promise<{
      success: boolean;
      settings?: Record<string, unknown>;
      error?: string;
    }>;
    migrate: (data: Record<string, string>) => Promise<{
      success: boolean;
      migratedGlobalSettings: boolean;
      migratedCredentials: boolean;
      migratedProjectCount: number;
      errors: string[];
    }>;
    discoverAgents: (
      projectPath?: string,
      sources?: Array<'user' | 'project'>
    ) => Promise<{
      success: boolean;
      agents?: Array<{
        name: string;
        definition: {
          description: string;
          prompt: string;
          tools?: string[];
          model?: 'sonnet' | 'opus' | 'haiku' | 'inherit';
        };
        source: 'user' | 'project';
        filePath: string;
      }>;
      error?: string;
    }>;
  };
}

// Note: Window interface is declared in @/types/electron.d.ts
// Do not redeclare here to avoid type conflicts

// Mock data for web development
const mockFeatures = [
  {
    category: 'Core',
    description: 'Sample Feature',
    steps: ['Step 1', 'Step 2'],
    passes: false,
  },
];

// Local storage keys
const STORAGE_KEYS = {
  PROJECTS: 'automaker_projects',
  CURRENT_PROJECT: 'automaker_current_project',
  TRASHED_PROJECTS: 'automaker_trashed_projects',
} as const;

// Mock file system using localStorage
const mockFileSystem: Record<string, string> = {};

// Check if we're in Electron (for UI indicators only)
export const isElectron = (): boolean => {
  if (typeof window === 'undefined') {
    return false;
  }

  const w = window as any;

  if (w.isElectron === true) {
    return true;
  }

  return !!w.electronAPI?.isElectron;
};

// Check if backend server is available
let serverAvailable: boolean | null = null;
let serverCheckPromise: Promise<boolean> | null = null;

export const checkServerAvailable = async (): Promise<boolean> => {
  if (serverAvailable !== null) return serverAvailable;
  if (serverCheckPromise) return serverCheckPromise;

  serverCheckPromise = (async () => {
    try {
      const serverUrl = import.meta.env.VITE_SERVER_URL || getServerUrlSync();
      const response = await fetch(`${serverUrl}/api/health`, {
        method: 'GET',
        signal: AbortSignal.timeout(2000),
      });
      serverAvailable = response.ok;
    } catch {
      serverAvailable = false;
    }
    return serverAvailable;
  })();

  return serverCheckPromise;
};

// Reset server check (useful for retrying connection)
export const resetServerCheck = (): void => {
  serverAvailable = null;
  serverCheckPromise = null;
};

// Cached HTTP client instance
let httpClientInstance: ElectronAPI | null = null;

/**
 * Get the HTTP API client
 *
 * All API calls go through HTTP to the backend server.
 * This is the only transport mode supported.
 */
export const getElectronAPI = (): ElectronAPI => {
  if (typeof window === 'undefined') {
    throw new Error('Cannot get API during SSR');
  }

  if (!httpClientInstance) {
    httpClientInstance = getHttpApiClient();
  }
  return httpClientInstance!;
};

// Async version (same as sync since HTTP client is synchronously instantiated)
export const getElectronAPIAsync = async (): Promise<ElectronAPI> => {
  return getElectronAPI();
};

// Check if backend is connected (for showing connection status in UI)
export const isBackendConnected = async (): Promise<boolean> => {
  return await checkServerAvailable();
};

/**
 * Get the current API mode being used
 * Always returns "http" since that's the only mode now
 */
export const getCurrentApiMode = (): 'http' => {
  return 'http';
};

// Debug helpers
if (typeof window !== 'undefined') {
  (window as any).__checkApiMode = () => {
    console.log('Current API mode:', getCurrentApiMode());
    console.log('isElectron():', isElectron());
  };
}

// Utility functions for project management

export interface Project {
  id: string;
  name: string;
  path: string;
  lastOpened?: string;
  theme?: string; // Per-project theme override (uses ThemeMode from app-store)
  fontFamilySans?: string; // Per-project UI/sans font override
  fontFamilyMono?: string; // Per-project code/mono font override
  isFavorite?: boolean; // Pin project to top of dashboard
  icon?: string; // Lucide icon name for project identification
  customIconPath?: string; // Path to custom uploaded icon image in .automaker/images/
  /**
   * Override the active Claude API profile for this project.
   * - undefined: Use global setting (activeClaudeApiProfileId)
   * - null: Explicitly use Direct Anthropic API (no profile)
   * - string: Use specific profile by ID
   * @deprecated Use phaseModelOverrides instead for per-phase model selection
   */
  activeClaudeApiProfileId?: string | null;
  /**
   * Per-phase model overrides for this project.
   * Keys are phase names (e.g., 'enhancementModel'), values are PhaseModelEntry.
   * If a phase is not present, the global setting is used.
   */
  phaseModelOverrides?: Partial<import('@automaker/types').PhaseModelConfig>;
}

export interface TrashedProject extends Project {
  trashedAt: string;
  deletedFromDisk?: boolean;
}

export const getStoredProjects = (): Project[] => {
  return getJSON<Project[]>(STORAGE_KEYS.PROJECTS) ?? [];
};

export const saveProjects = (projects: Project[]): void => {
  setJSON(STORAGE_KEYS.PROJECTS, projects);
};

export const getCurrentProject = (): Project | null => {
  return getJSON<Project>(STORAGE_KEYS.CURRENT_PROJECT);
};

export const setCurrentProject = (project: Project | null): void => {
  if (project) {
    setJSON(STORAGE_KEYS.CURRENT_PROJECT, project);
  } else {
    removeItem(STORAGE_KEYS.CURRENT_PROJECT);
  }
};

export const addProject = (project: Project): void => {
  const projects = getStoredProjects();
  const existing = projects.findIndex((p) => p.path === project.path);
  if (existing >= 0) {
    projects[existing] = { ...project, lastOpened: new Date().toISOString() };
  } else {
    projects.push({ ...project, lastOpened: new Date().toISOString() });
  }
  saveProjects(projects);
};

export const removeProject = (projectId: string): void => {
  const projects = getStoredProjects().filter((p) => p.id !== projectId);
  saveProjects(projects);
};

export const getStoredTrashedProjects = (): TrashedProject[] => {
  return getJSON<TrashedProject[]>(STORAGE_KEYS.TRASHED_PROJECTS) ?? [];
};

export const saveTrashedProjects = (projects: TrashedProject[]): void => {
  setJSON(STORAGE_KEYS.TRASHED_PROJECTS, projects);
};
