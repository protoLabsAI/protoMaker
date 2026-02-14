/**
 * Content Creation Flow
 *
 * Multi-format output pipeline with 7 phases:
 * Research(parallel) → HITL → Outline → HITL → Generation(parallel) → Assembly → Review(parallel) → HITL → Output(parallel)
 *
 * Features:
 * - 3 HITL interrupts for human oversight
 * - Send() for parallel research, generation, review, and output phases
 * - MemorySaver checkpointer for resume after interrupts
 * - Configurable via ContentConfig
 */
import { MemorySaver } from '@langchain/langgraph';
import type { BaseChatModel } from '@langchain/core/language_models/chat_models';
import { LangfuseClient } from '@automaker/observability';
import { type ResearchFindings } from './subgraphs/section-writer.js';
/**
 * Content configuration
 */
export interface ContentConfig {
  topic: string;
  format: 'tutorial' | 'reference' | 'guide';
  tone: 'technical' | 'conversational' | 'formal';
  audience: 'beginner' | 'intermediate' | 'expert';
  outputFormats: Array<'markdown' | 'html' | 'pdf'>;
  smartModel: BaseChatModel;
  fastModel: BaseChatModel;
  langfuseClient?: LangfuseClient;
}
/**
 * Outline structure
 */
export interface Outline {
  title: string;
  sections: Array<{
    id: string;
    title: string;
    description: string;
    includeCodeExamples?: boolean;
    targetLength?: number;
  }>;
}
/**
 * Research result for a single query
 */
export interface ResearchResult {
  query: string;
  findings: ResearchFindings;
}
/**
 * Review feedback for a section
 */
export interface ReviewFeedback {
  sectionId: string;
  approved: boolean;
  feedback?: string;
}
/**
 * Output result for a single format
 */
export interface OutputResult {
  format: 'markdown' | 'html' | 'pdf';
  content: string;
  success: boolean;
  error?: string;
}
/**
 * Content Creation Flow state
 */
export declare const ContentCreationState: import('@langchain/langgraph').AnnotationRoot<{
  config: {
    (): import('@langchain/langgraph').LastValue<ContentConfig>;
    (
      annotation: import('@langchain/langgraph').SingleReducer<ContentConfig, ContentConfig>
    ): import('@langchain/langgraph').BinaryOperatorAggregate<ContentConfig, ContentConfig>;
    Root: <S extends import('@langchain/langgraph').StateDefinition>(
      sd: S
    ) => import('@langchain/langgraph').AnnotationRoot<S>;
  };
  researchQueries: {
    (): import('@langchain/langgraph').LastValue<string[]>;
    (
      annotation: import('@langchain/langgraph').SingleReducer<string[], string[]>
    ): import('@langchain/langgraph').BinaryOperatorAggregate<string[], string[]>;
    Root: <S extends import('@langchain/langgraph').StateDefinition>(
      sd: S
    ) => import('@langchain/langgraph').AnnotationRoot<S>;
  };
  researchResults: import('@langchain/langgraph').BinaryOperatorAggregate<
    ResearchResult[],
    ResearchResult[]
  >;
  researchApproved: {
    (): import('@langchain/langgraph').LastValue<boolean>;
    (
      annotation: import('@langchain/langgraph').SingleReducer<boolean, boolean>
    ): import('@langchain/langgraph').BinaryOperatorAggregate<boolean, boolean>;
    Root: <S extends import('@langchain/langgraph').StateDefinition>(
      sd: S
    ) => import('@langchain/langgraph').AnnotationRoot<S>;
  };
  researchFeedback: {
    (): import('@langchain/langgraph').LastValue<string | undefined>;
    (
      annotation: import('@langchain/langgraph').SingleReducer<
        string | undefined,
        string | undefined
      >
    ): import('@langchain/langgraph').BinaryOperatorAggregate<
      string | undefined,
      string | undefined
    >;
    Root: <S extends import('@langchain/langgraph').StateDefinition>(
      sd: S
    ) => import('@langchain/langgraph').AnnotationRoot<S>;
  };
  outline: {
    (): import('@langchain/langgraph').LastValue<Outline | undefined>;
    (
      annotation: import('@langchain/langgraph').SingleReducer<
        Outline | undefined,
        Outline | undefined
      >
    ): import('@langchain/langgraph').BinaryOperatorAggregate<
      Outline | undefined,
      Outline | undefined
    >;
    Root: <S extends import('@langchain/langgraph').StateDefinition>(
      sd: S
    ) => import('@langchain/langgraph').AnnotationRoot<S>;
  };
  outlineApproved: {
    (): import('@langchain/langgraph').LastValue<boolean>;
    (
      annotation: import('@langchain/langgraph').SingleReducer<boolean, boolean>
    ): import('@langchain/langgraph').BinaryOperatorAggregate<boolean, boolean>;
    Root: <S extends import('@langchain/langgraph').StateDefinition>(
      sd: S
    ) => import('@langchain/langgraph').AnnotationRoot<S>;
  };
  outlineFeedback: {
    (): import('@langchain/langgraph').LastValue<string | undefined>;
    (
      annotation: import('@langchain/langgraph').SingleReducer<
        string | undefined,
        string | undefined
      >
    ): import('@langchain/langgraph').BinaryOperatorAggregate<
      string | undefined,
      string | undefined
    >;
    Root: <S extends import('@langchain/langgraph').StateDefinition>(
      sd: S
    ) => import('@langchain/langgraph').AnnotationRoot<S>;
  };
  sections: import('@langchain/langgraph').BinaryOperatorAggregate<
    {
      id: string;
      title: string;
      content: string;
      codeExamples?:
        | {
            language: string;
            code: string;
            explanation?: string | undefined;
          }[]
        | undefined;
      references?: string[] | undefined;
    }[],
    {
      id: string;
      title: string;
      content: string;
      codeExamples?:
        | {
            language: string;
            code: string;
            explanation?: string | undefined;
          }[]
        | undefined;
      references?: string[] | undefined;
    }[]
  >;
  assembledContent: {
    (): import('@langchain/langgraph').LastValue<string | undefined>;
    (
      annotation: import('@langchain/langgraph').SingleReducer<
        string | undefined,
        string | undefined
      >
    ): import('@langchain/langgraph').BinaryOperatorAggregate<
      string | undefined,
      string | undefined
    >;
    Root: <S extends import('@langchain/langgraph').StateDefinition>(
      sd: S
    ) => import('@langchain/langgraph').AnnotationRoot<S>;
  };
  reviewFeedback: import('@langchain/langgraph').BinaryOperatorAggregate<
    ReviewFeedback[],
    ReviewFeedback[]
  >;
  reviewApproved: {
    (): import('@langchain/langgraph').LastValue<boolean>;
    (
      annotation: import('@langchain/langgraph').SingleReducer<boolean, boolean>
    ): import('@langchain/langgraph').BinaryOperatorAggregate<boolean, boolean>;
    Root: <S extends import('@langchain/langgraph').StateDefinition>(
      sd: S
    ) => import('@langchain/langgraph').AnnotationRoot<S>;
  };
  finalReviewFeedback: {
    (): import('@langchain/langgraph').LastValue<string | undefined>;
    (
      annotation: import('@langchain/langgraph').SingleReducer<
        string | undefined,
        string | undefined
      >
    ): import('@langchain/langgraph').BinaryOperatorAggregate<
      string | undefined,
      string | undefined
    >;
    Root: <S extends import('@langchain/langgraph').StateDefinition>(
      sd: S
    ) => import('@langchain/langgraph').AnnotationRoot<S>;
  };
  outputs: import('@langchain/langgraph').BinaryOperatorAggregate<OutputResult[], OutputResult[]>;
  traceId: {
    (): import('@langchain/langgraph').LastValue<string | undefined>;
    (
      annotation: import('@langchain/langgraph').SingleReducer<
        string | undefined,
        string | undefined
      >
    ): import('@langchain/langgraph').BinaryOperatorAggregate<
      string | undefined,
      string | undefined
    >;
    Root: <S extends import('@langchain/langgraph').StateDefinition>(
      sd: S
    ) => import('@langchain/langgraph').AnnotationRoot<S>;
  };
  error: {
    (): import('@langchain/langgraph').LastValue<string | undefined>;
    (
      annotation: import('@langchain/langgraph').SingleReducer<
        string | undefined,
        string | undefined
      >
    ): import('@langchain/langgraph').BinaryOperatorAggregate<
      string | undefined,
      string | undefined
    >;
    Root: <S extends import('@langchain/langgraph').StateDefinition>(
      sd: S
    ) => import('@langchain/langgraph').AnnotationRoot<S>;
  };
}>;
export type ContentCreationStateType = typeof ContentCreationState.State;
/**
 * Creates the Content Creation Flow graph
 */
export declare function createContentCreationFlow(config?: {
  checkpointer?: MemorySaver;
}): import('@langchain/langgraph').CompiledStateGraph<
  import('@langchain/langgraph').StateType<{
    config: {
      (): import('@langchain/langgraph').LastValue<ContentConfig>;
      (
        annotation: import('@langchain/langgraph').SingleReducer<ContentConfig, ContentConfig>
      ): import('@langchain/langgraph').BinaryOperatorAggregate<ContentConfig, ContentConfig>;
      Root: <S extends import('@langchain/langgraph').StateDefinition>(
        sd: S
      ) => import('@langchain/langgraph').AnnotationRoot<S>;
    };
    researchQueries: {
      (): import('@langchain/langgraph').LastValue<string[]>;
      (
        annotation: import('@langchain/langgraph').SingleReducer<string[], string[]>
      ): import('@langchain/langgraph').BinaryOperatorAggregate<string[], string[]>;
      Root: <S extends import('@langchain/langgraph').StateDefinition>(
        sd: S
      ) => import('@langchain/langgraph').AnnotationRoot<S>;
    };
    researchResults: import('@langchain/langgraph').BinaryOperatorAggregate<
      ResearchResult[],
      ResearchResult[]
    >;
    researchApproved: {
      (): import('@langchain/langgraph').LastValue<boolean>;
      (
        annotation: import('@langchain/langgraph').SingleReducer<boolean, boolean>
      ): import('@langchain/langgraph').BinaryOperatorAggregate<boolean, boolean>;
      Root: <S extends import('@langchain/langgraph').StateDefinition>(
        sd: S
      ) => import('@langchain/langgraph').AnnotationRoot<S>;
    };
    researchFeedback: {
      (): import('@langchain/langgraph').LastValue<string | undefined>;
      (
        annotation: import('@langchain/langgraph').SingleReducer<
          string | undefined,
          string | undefined
        >
      ): import('@langchain/langgraph').BinaryOperatorAggregate<
        string | undefined,
        string | undefined
      >;
      Root: <S extends import('@langchain/langgraph').StateDefinition>(
        sd: S
      ) => import('@langchain/langgraph').AnnotationRoot<S>;
    };
    outline: {
      (): import('@langchain/langgraph').LastValue<Outline | undefined>;
      (
        annotation: import('@langchain/langgraph').SingleReducer<
          Outline | undefined,
          Outline | undefined
        >
      ): import('@langchain/langgraph').BinaryOperatorAggregate<
        Outline | undefined,
        Outline | undefined
      >;
      Root: <S extends import('@langchain/langgraph').StateDefinition>(
        sd: S
      ) => import('@langchain/langgraph').AnnotationRoot<S>;
    };
    outlineApproved: {
      (): import('@langchain/langgraph').LastValue<boolean>;
      (
        annotation: import('@langchain/langgraph').SingleReducer<boolean, boolean>
      ): import('@langchain/langgraph').BinaryOperatorAggregate<boolean, boolean>;
      Root: <S extends import('@langchain/langgraph').StateDefinition>(
        sd: S
      ) => import('@langchain/langgraph').AnnotationRoot<S>;
    };
    outlineFeedback: {
      (): import('@langchain/langgraph').LastValue<string | undefined>;
      (
        annotation: import('@langchain/langgraph').SingleReducer<
          string | undefined,
          string | undefined
        >
      ): import('@langchain/langgraph').BinaryOperatorAggregate<
        string | undefined,
        string | undefined
      >;
      Root: <S extends import('@langchain/langgraph').StateDefinition>(
        sd: S
      ) => import('@langchain/langgraph').AnnotationRoot<S>;
    };
    sections: import('@langchain/langgraph').BinaryOperatorAggregate<
      {
        id: string;
        title: string;
        content: string;
        codeExamples?:
          | {
              language: string;
              code: string;
              explanation?: string | undefined;
            }[]
          | undefined;
        references?: string[] | undefined;
      }[],
      {
        id: string;
        title: string;
        content: string;
        codeExamples?:
          | {
              language: string;
              code: string;
              explanation?: string | undefined;
            }[]
          | undefined;
        references?: string[] | undefined;
      }[]
    >;
    assembledContent: {
      (): import('@langchain/langgraph').LastValue<string | undefined>;
      (
        annotation: import('@langchain/langgraph').SingleReducer<
          string | undefined,
          string | undefined
        >
      ): import('@langchain/langgraph').BinaryOperatorAggregate<
        string | undefined,
        string | undefined
      >;
      Root: <S extends import('@langchain/langgraph').StateDefinition>(
        sd: S
      ) => import('@langchain/langgraph').AnnotationRoot<S>;
    };
    reviewFeedback: import('@langchain/langgraph').BinaryOperatorAggregate<
      ReviewFeedback[],
      ReviewFeedback[]
    >;
    reviewApproved: {
      (): import('@langchain/langgraph').LastValue<boolean>;
      (
        annotation: import('@langchain/langgraph').SingleReducer<boolean, boolean>
      ): import('@langchain/langgraph').BinaryOperatorAggregate<boolean, boolean>;
      Root: <S extends import('@langchain/langgraph').StateDefinition>(
        sd: S
      ) => import('@langchain/langgraph').AnnotationRoot<S>;
    };
    finalReviewFeedback: {
      (): import('@langchain/langgraph').LastValue<string | undefined>;
      (
        annotation: import('@langchain/langgraph').SingleReducer<
          string | undefined,
          string | undefined
        >
      ): import('@langchain/langgraph').BinaryOperatorAggregate<
        string | undefined,
        string | undefined
      >;
      Root: <S extends import('@langchain/langgraph').StateDefinition>(
        sd: S
      ) => import('@langchain/langgraph').AnnotationRoot<S>;
    };
    outputs: import('@langchain/langgraph').BinaryOperatorAggregate<OutputResult[], OutputResult[]>;
    traceId: {
      (): import('@langchain/langgraph').LastValue<string | undefined>;
      (
        annotation: import('@langchain/langgraph').SingleReducer<
          string | undefined,
          string | undefined
        >
      ): import('@langchain/langgraph').BinaryOperatorAggregate<
        string | undefined,
        string | undefined
      >;
      Root: <S extends import('@langchain/langgraph').StateDefinition>(
        sd: S
      ) => import('@langchain/langgraph').AnnotationRoot<S>;
    };
    error: {
      (): import('@langchain/langgraph').LastValue<string | undefined>;
      (
        annotation: import('@langchain/langgraph').SingleReducer<
          string | undefined,
          string | undefined
        >
      ): import('@langchain/langgraph').BinaryOperatorAggregate<
        string | undefined,
        string | undefined
      >;
      Root: <S extends import('@langchain/langgraph').StateDefinition>(
        sd: S
      ) => import('@langchain/langgraph').AnnotationRoot<S>;
    };
  }>,
  import('@langchain/langgraph').UpdateType<{
    config: {
      (): import('@langchain/langgraph').LastValue<ContentConfig>;
      (
        annotation: import('@langchain/langgraph').SingleReducer<ContentConfig, ContentConfig>
      ): import('@langchain/langgraph').BinaryOperatorAggregate<ContentConfig, ContentConfig>;
      Root: <S extends import('@langchain/langgraph').StateDefinition>(
        sd: S
      ) => import('@langchain/langgraph').AnnotationRoot<S>;
    };
    researchQueries: {
      (): import('@langchain/langgraph').LastValue<string[]>;
      (
        annotation: import('@langchain/langgraph').SingleReducer<string[], string[]>
      ): import('@langchain/langgraph').BinaryOperatorAggregate<string[], string[]>;
      Root: <S extends import('@langchain/langgraph').StateDefinition>(
        sd: S
      ) => import('@langchain/langgraph').AnnotationRoot<S>;
    };
    researchResults: import('@langchain/langgraph').BinaryOperatorAggregate<
      ResearchResult[],
      ResearchResult[]
    >;
    researchApproved: {
      (): import('@langchain/langgraph').LastValue<boolean>;
      (
        annotation: import('@langchain/langgraph').SingleReducer<boolean, boolean>
      ): import('@langchain/langgraph').BinaryOperatorAggregate<boolean, boolean>;
      Root: <S extends import('@langchain/langgraph').StateDefinition>(
        sd: S
      ) => import('@langchain/langgraph').AnnotationRoot<S>;
    };
    researchFeedback: {
      (): import('@langchain/langgraph').LastValue<string | undefined>;
      (
        annotation: import('@langchain/langgraph').SingleReducer<
          string | undefined,
          string | undefined
        >
      ): import('@langchain/langgraph').BinaryOperatorAggregate<
        string | undefined,
        string | undefined
      >;
      Root: <S extends import('@langchain/langgraph').StateDefinition>(
        sd: S
      ) => import('@langchain/langgraph').AnnotationRoot<S>;
    };
    outline: {
      (): import('@langchain/langgraph').LastValue<Outline | undefined>;
      (
        annotation: import('@langchain/langgraph').SingleReducer<
          Outline | undefined,
          Outline | undefined
        >
      ): import('@langchain/langgraph').BinaryOperatorAggregate<
        Outline | undefined,
        Outline | undefined
      >;
      Root: <S extends import('@langchain/langgraph').StateDefinition>(
        sd: S
      ) => import('@langchain/langgraph').AnnotationRoot<S>;
    };
    outlineApproved: {
      (): import('@langchain/langgraph').LastValue<boolean>;
      (
        annotation: import('@langchain/langgraph').SingleReducer<boolean, boolean>
      ): import('@langchain/langgraph').BinaryOperatorAggregate<boolean, boolean>;
      Root: <S extends import('@langchain/langgraph').StateDefinition>(
        sd: S
      ) => import('@langchain/langgraph').AnnotationRoot<S>;
    };
    outlineFeedback: {
      (): import('@langchain/langgraph').LastValue<string | undefined>;
      (
        annotation: import('@langchain/langgraph').SingleReducer<
          string | undefined,
          string | undefined
        >
      ): import('@langchain/langgraph').BinaryOperatorAggregate<
        string | undefined,
        string | undefined
      >;
      Root: <S extends import('@langchain/langgraph').StateDefinition>(
        sd: S
      ) => import('@langchain/langgraph').AnnotationRoot<S>;
    };
    sections: import('@langchain/langgraph').BinaryOperatorAggregate<
      {
        id: string;
        title: string;
        content: string;
        codeExamples?:
          | {
              language: string;
              code: string;
              explanation?: string | undefined;
            }[]
          | undefined;
        references?: string[] | undefined;
      }[],
      {
        id: string;
        title: string;
        content: string;
        codeExamples?:
          | {
              language: string;
              code: string;
              explanation?: string | undefined;
            }[]
          | undefined;
        references?: string[] | undefined;
      }[]
    >;
    assembledContent: {
      (): import('@langchain/langgraph').LastValue<string | undefined>;
      (
        annotation: import('@langchain/langgraph').SingleReducer<
          string | undefined,
          string | undefined
        >
      ): import('@langchain/langgraph').BinaryOperatorAggregate<
        string | undefined,
        string | undefined
      >;
      Root: <S extends import('@langchain/langgraph').StateDefinition>(
        sd: S
      ) => import('@langchain/langgraph').AnnotationRoot<S>;
    };
    reviewFeedback: import('@langchain/langgraph').BinaryOperatorAggregate<
      ReviewFeedback[],
      ReviewFeedback[]
    >;
    reviewApproved: {
      (): import('@langchain/langgraph').LastValue<boolean>;
      (
        annotation: import('@langchain/langgraph').SingleReducer<boolean, boolean>
      ): import('@langchain/langgraph').BinaryOperatorAggregate<boolean, boolean>;
      Root: <S extends import('@langchain/langgraph').StateDefinition>(
        sd: S
      ) => import('@langchain/langgraph').AnnotationRoot<S>;
    };
    finalReviewFeedback: {
      (): import('@langchain/langgraph').LastValue<string | undefined>;
      (
        annotation: import('@langchain/langgraph').SingleReducer<
          string | undefined,
          string | undefined
        >
      ): import('@langchain/langgraph').BinaryOperatorAggregate<
        string | undefined,
        string | undefined
      >;
      Root: <S extends import('@langchain/langgraph').StateDefinition>(
        sd: S
      ) => import('@langchain/langgraph').AnnotationRoot<S>;
    };
    outputs: import('@langchain/langgraph').BinaryOperatorAggregate<OutputResult[], OutputResult[]>;
    traceId: {
      (): import('@langchain/langgraph').LastValue<string | undefined>;
      (
        annotation: import('@langchain/langgraph').SingleReducer<
          string | undefined,
          string | undefined
        >
      ): import('@langchain/langgraph').BinaryOperatorAggregate<
        string | undefined,
        string | undefined
      >;
      Root: <S extends import('@langchain/langgraph').StateDefinition>(
        sd: S
      ) => import('@langchain/langgraph').AnnotationRoot<S>;
    };
    error: {
      (): import('@langchain/langgraph').LastValue<string | undefined>;
      (
        annotation: import('@langchain/langgraph').SingleReducer<
          string | undefined,
          string | undefined
        >
      ): import('@langchain/langgraph').BinaryOperatorAggregate<
        string | undefined,
        string | undefined
      >;
      Root: <S extends import('@langchain/langgraph').StateDefinition>(
        sd: S
      ) => import('@langchain/langgraph').AnnotationRoot<S>;
    };
  }>,
  '__start__',
  {
    config: {
      (): import('@langchain/langgraph').LastValue<ContentConfig>;
      (
        annotation: import('@langchain/langgraph').SingleReducer<ContentConfig, ContentConfig>
      ): import('@langchain/langgraph').BinaryOperatorAggregate<ContentConfig, ContentConfig>;
      Root: <S extends import('@langchain/langgraph').StateDefinition>(
        sd: S
      ) => import('@langchain/langgraph').AnnotationRoot<S>;
    };
    researchQueries: {
      (): import('@langchain/langgraph').LastValue<string[]>;
      (
        annotation: import('@langchain/langgraph').SingleReducer<string[], string[]>
      ): import('@langchain/langgraph').BinaryOperatorAggregate<string[], string[]>;
      Root: <S extends import('@langchain/langgraph').StateDefinition>(
        sd: S
      ) => import('@langchain/langgraph').AnnotationRoot<S>;
    };
    researchResults: import('@langchain/langgraph').BinaryOperatorAggregate<
      ResearchResult[],
      ResearchResult[]
    >;
    researchApproved: {
      (): import('@langchain/langgraph').LastValue<boolean>;
      (
        annotation: import('@langchain/langgraph').SingleReducer<boolean, boolean>
      ): import('@langchain/langgraph').BinaryOperatorAggregate<boolean, boolean>;
      Root: <S extends import('@langchain/langgraph').StateDefinition>(
        sd: S
      ) => import('@langchain/langgraph').AnnotationRoot<S>;
    };
    researchFeedback: {
      (): import('@langchain/langgraph').LastValue<string | undefined>;
      (
        annotation: import('@langchain/langgraph').SingleReducer<
          string | undefined,
          string | undefined
        >
      ): import('@langchain/langgraph').BinaryOperatorAggregate<
        string | undefined,
        string | undefined
      >;
      Root: <S extends import('@langchain/langgraph').StateDefinition>(
        sd: S
      ) => import('@langchain/langgraph').AnnotationRoot<S>;
    };
    outline: {
      (): import('@langchain/langgraph').LastValue<Outline | undefined>;
      (
        annotation: import('@langchain/langgraph').SingleReducer<
          Outline | undefined,
          Outline | undefined
        >
      ): import('@langchain/langgraph').BinaryOperatorAggregate<
        Outline | undefined,
        Outline | undefined
      >;
      Root: <S extends import('@langchain/langgraph').StateDefinition>(
        sd: S
      ) => import('@langchain/langgraph').AnnotationRoot<S>;
    };
    outlineApproved: {
      (): import('@langchain/langgraph').LastValue<boolean>;
      (
        annotation: import('@langchain/langgraph').SingleReducer<boolean, boolean>
      ): import('@langchain/langgraph').BinaryOperatorAggregate<boolean, boolean>;
      Root: <S extends import('@langchain/langgraph').StateDefinition>(
        sd: S
      ) => import('@langchain/langgraph').AnnotationRoot<S>;
    };
    outlineFeedback: {
      (): import('@langchain/langgraph').LastValue<string | undefined>;
      (
        annotation: import('@langchain/langgraph').SingleReducer<
          string | undefined,
          string | undefined
        >
      ): import('@langchain/langgraph').BinaryOperatorAggregate<
        string | undefined,
        string | undefined
      >;
      Root: <S extends import('@langchain/langgraph').StateDefinition>(
        sd: S
      ) => import('@langchain/langgraph').AnnotationRoot<S>;
    };
    sections: import('@langchain/langgraph').BinaryOperatorAggregate<
      {
        id: string;
        title: string;
        content: string;
        codeExamples?:
          | {
              language: string;
              code: string;
              explanation?: string | undefined;
            }[]
          | undefined;
        references?: string[] | undefined;
      }[],
      {
        id: string;
        title: string;
        content: string;
        codeExamples?:
          | {
              language: string;
              code: string;
              explanation?: string | undefined;
            }[]
          | undefined;
        references?: string[] | undefined;
      }[]
    >;
    assembledContent: {
      (): import('@langchain/langgraph').LastValue<string | undefined>;
      (
        annotation: import('@langchain/langgraph').SingleReducer<
          string | undefined,
          string | undefined
        >
      ): import('@langchain/langgraph').BinaryOperatorAggregate<
        string | undefined,
        string | undefined
      >;
      Root: <S extends import('@langchain/langgraph').StateDefinition>(
        sd: S
      ) => import('@langchain/langgraph').AnnotationRoot<S>;
    };
    reviewFeedback: import('@langchain/langgraph').BinaryOperatorAggregate<
      ReviewFeedback[],
      ReviewFeedback[]
    >;
    reviewApproved: {
      (): import('@langchain/langgraph').LastValue<boolean>;
      (
        annotation: import('@langchain/langgraph').SingleReducer<boolean, boolean>
      ): import('@langchain/langgraph').BinaryOperatorAggregate<boolean, boolean>;
      Root: <S extends import('@langchain/langgraph').StateDefinition>(
        sd: S
      ) => import('@langchain/langgraph').AnnotationRoot<S>;
    };
    finalReviewFeedback: {
      (): import('@langchain/langgraph').LastValue<string | undefined>;
      (
        annotation: import('@langchain/langgraph').SingleReducer<
          string | undefined,
          string | undefined
        >
      ): import('@langchain/langgraph').BinaryOperatorAggregate<
        string | undefined,
        string | undefined
      >;
      Root: <S extends import('@langchain/langgraph').StateDefinition>(
        sd: S
      ) => import('@langchain/langgraph').AnnotationRoot<S>;
    };
    outputs: import('@langchain/langgraph').BinaryOperatorAggregate<OutputResult[], OutputResult[]>;
    traceId: {
      (): import('@langchain/langgraph').LastValue<string | undefined>;
      (
        annotation: import('@langchain/langgraph').SingleReducer<
          string | undefined,
          string | undefined
        >
      ): import('@langchain/langgraph').BinaryOperatorAggregate<
        string | undefined,
        string | undefined
      >;
      Root: <S extends import('@langchain/langgraph').StateDefinition>(
        sd: S
      ) => import('@langchain/langgraph').AnnotationRoot<S>;
    };
    error: {
      (): import('@langchain/langgraph').LastValue<string | undefined>;
      (
        annotation: import('@langchain/langgraph').SingleReducer<
          string | undefined,
          string | undefined
        >
      ): import('@langchain/langgraph').BinaryOperatorAggregate<
        string | undefined,
        string | undefined
      >;
      Root: <S extends import('@langchain/langgraph').StateDefinition>(
        sd: S
      ) => import('@langchain/langgraph').AnnotationRoot<S>;
    };
  },
  {
    config: {
      (): import('@langchain/langgraph').LastValue<ContentConfig>;
      (
        annotation: import('@langchain/langgraph').SingleReducer<ContentConfig, ContentConfig>
      ): import('@langchain/langgraph').BinaryOperatorAggregate<ContentConfig, ContentConfig>;
      Root: <S extends import('@langchain/langgraph').StateDefinition>(
        sd: S
      ) => import('@langchain/langgraph').AnnotationRoot<S>;
    };
    researchQueries: {
      (): import('@langchain/langgraph').LastValue<string[]>;
      (
        annotation: import('@langchain/langgraph').SingleReducer<string[], string[]>
      ): import('@langchain/langgraph').BinaryOperatorAggregate<string[], string[]>;
      Root: <S extends import('@langchain/langgraph').StateDefinition>(
        sd: S
      ) => import('@langchain/langgraph').AnnotationRoot<S>;
    };
    researchResults: import('@langchain/langgraph').BinaryOperatorAggregate<
      ResearchResult[],
      ResearchResult[]
    >;
    researchApproved: {
      (): import('@langchain/langgraph').LastValue<boolean>;
      (
        annotation: import('@langchain/langgraph').SingleReducer<boolean, boolean>
      ): import('@langchain/langgraph').BinaryOperatorAggregate<boolean, boolean>;
      Root: <S extends import('@langchain/langgraph').StateDefinition>(
        sd: S
      ) => import('@langchain/langgraph').AnnotationRoot<S>;
    };
    researchFeedback: {
      (): import('@langchain/langgraph').LastValue<string | undefined>;
      (
        annotation: import('@langchain/langgraph').SingleReducer<
          string | undefined,
          string | undefined
        >
      ): import('@langchain/langgraph').BinaryOperatorAggregate<
        string | undefined,
        string | undefined
      >;
      Root: <S extends import('@langchain/langgraph').StateDefinition>(
        sd: S
      ) => import('@langchain/langgraph').AnnotationRoot<S>;
    };
    outline: {
      (): import('@langchain/langgraph').LastValue<Outline | undefined>;
      (
        annotation: import('@langchain/langgraph').SingleReducer<
          Outline | undefined,
          Outline | undefined
        >
      ): import('@langchain/langgraph').BinaryOperatorAggregate<
        Outline | undefined,
        Outline | undefined
      >;
      Root: <S extends import('@langchain/langgraph').StateDefinition>(
        sd: S
      ) => import('@langchain/langgraph').AnnotationRoot<S>;
    };
    outlineApproved: {
      (): import('@langchain/langgraph').LastValue<boolean>;
      (
        annotation: import('@langchain/langgraph').SingleReducer<boolean, boolean>
      ): import('@langchain/langgraph').BinaryOperatorAggregate<boolean, boolean>;
      Root: <S extends import('@langchain/langgraph').StateDefinition>(
        sd: S
      ) => import('@langchain/langgraph').AnnotationRoot<S>;
    };
    outlineFeedback: {
      (): import('@langchain/langgraph').LastValue<string | undefined>;
      (
        annotation: import('@langchain/langgraph').SingleReducer<
          string | undefined,
          string | undefined
        >
      ): import('@langchain/langgraph').BinaryOperatorAggregate<
        string | undefined,
        string | undefined
      >;
      Root: <S extends import('@langchain/langgraph').StateDefinition>(
        sd: S
      ) => import('@langchain/langgraph').AnnotationRoot<S>;
    };
    sections: import('@langchain/langgraph').BinaryOperatorAggregate<
      {
        id: string;
        title: string;
        content: string;
        codeExamples?:
          | {
              language: string;
              code: string;
              explanation?: string | undefined;
            }[]
          | undefined;
        references?: string[] | undefined;
      }[],
      {
        id: string;
        title: string;
        content: string;
        codeExamples?:
          | {
              language: string;
              code: string;
              explanation?: string | undefined;
            }[]
          | undefined;
        references?: string[] | undefined;
      }[]
    >;
    assembledContent: {
      (): import('@langchain/langgraph').LastValue<string | undefined>;
      (
        annotation: import('@langchain/langgraph').SingleReducer<
          string | undefined,
          string | undefined
        >
      ): import('@langchain/langgraph').BinaryOperatorAggregate<
        string | undefined,
        string | undefined
      >;
      Root: <S extends import('@langchain/langgraph').StateDefinition>(
        sd: S
      ) => import('@langchain/langgraph').AnnotationRoot<S>;
    };
    reviewFeedback: import('@langchain/langgraph').BinaryOperatorAggregate<
      ReviewFeedback[],
      ReviewFeedback[]
    >;
    reviewApproved: {
      (): import('@langchain/langgraph').LastValue<boolean>;
      (
        annotation: import('@langchain/langgraph').SingleReducer<boolean, boolean>
      ): import('@langchain/langgraph').BinaryOperatorAggregate<boolean, boolean>;
      Root: <S extends import('@langchain/langgraph').StateDefinition>(
        sd: S
      ) => import('@langchain/langgraph').AnnotationRoot<S>;
    };
    finalReviewFeedback: {
      (): import('@langchain/langgraph').LastValue<string | undefined>;
      (
        annotation: import('@langchain/langgraph').SingleReducer<
          string | undefined,
          string | undefined
        >
      ): import('@langchain/langgraph').BinaryOperatorAggregate<
        string | undefined,
        string | undefined
      >;
      Root: <S extends import('@langchain/langgraph').StateDefinition>(
        sd: S
      ) => import('@langchain/langgraph').AnnotationRoot<S>;
    };
    outputs: import('@langchain/langgraph').BinaryOperatorAggregate<OutputResult[], OutputResult[]>;
    traceId: {
      (): import('@langchain/langgraph').LastValue<string | undefined>;
      (
        annotation: import('@langchain/langgraph').SingleReducer<
          string | undefined,
          string | undefined
        >
      ): import('@langchain/langgraph').BinaryOperatorAggregate<
        string | undefined,
        string | undefined
      >;
      Root: <S extends import('@langchain/langgraph').StateDefinition>(
        sd: S
      ) => import('@langchain/langgraph').AnnotationRoot<S>;
    };
    error: {
      (): import('@langchain/langgraph').LastValue<string | undefined>;
      (
        annotation: import('@langchain/langgraph').SingleReducer<
          string | undefined,
          string | undefined
        >
      ): import('@langchain/langgraph').BinaryOperatorAggregate<
        string | undefined,
        string | undefined
      >;
      Root: <S extends import('@langchain/langgraph').StateDefinition>(
        sd: S
      ) => import('@langchain/langgraph').AnnotationRoot<S>;
    };
  },
  import('@langchain/langgraph').StateDefinition
>;
//# sourceMappingURL=content-creation-flow.d.ts.map
