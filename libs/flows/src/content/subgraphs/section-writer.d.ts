/**
 * SectionWriter Subgraph
 *
 * Generates a single content section with isolated message state.
 * Features:
 * - Model fallback chain (smart → fast)
 * - Retry loop with Zod validation (max 2 retries)
 * - Langfuse tracing per generation
 * - Returns typed ContentSection
 */
import { StateGraph } from '@langchain/langgraph';
import { z } from 'zod';
import type { BaseChatModel } from '@langchain/core/language_models/chat_models';
import { LangfuseClient } from '@automaker/observability';
/**
 * Code example schema
 */
declare const CodeExampleSchema: z.ZodObject<
  {
    language: z.ZodString;
    code: z.ZodString;
    explanation: z.ZodOptional<z.ZodString>;
  },
  z.core.$strip
>;
/**
 * Content section schema for validation
 */
declare const ContentSectionSchema: z.ZodObject<
  {
    id: z.ZodString;
    title: z.ZodString;
    content: z.ZodString;
    codeExamples: z.ZodOptional<
      z.ZodArray<
        z.ZodObject<
          {
            language: z.ZodString;
            code: z.ZodString;
            explanation: z.ZodOptional<z.ZodString>;
          },
          z.core.$strip
        >
      >
    >;
    references: z.ZodOptional<z.ZodArray<z.ZodString>>;
  },
  z.core.$strip
>;
export type ContentSection = z.infer<typeof ContentSectionSchema>;
export type CodeExample = z.infer<typeof CodeExampleSchema>;
/**
 * Section specification input
 */
export interface SectionSpec {
  id: string;
  title: string;
  description: string;
  includeCodeExamples?: boolean;
  targetLength?: number;
}
/**
 * Research findings relevant to section
 */
export interface ResearchFindings {
  facts: string[];
  examples: string[];
  references: string[];
}
/**
 * Content style configuration
 */
export interface ContentStyleConfig {
  tone: 'technical' | 'conversational' | 'formal';
  audience: 'beginner' | 'intermediate' | 'expert';
  format: 'tutorial' | 'reference' | 'guide';
}
/**
 * SectionWriter state with message isolation
 */
export declare const SectionWriterState: import('@langchain/langgraph').AnnotationRoot<{
  sectionSpec: {
    (): import('@langchain/langgraph').LastValue<SectionSpec>;
    (
      annotation: import('@langchain/langgraph').SingleReducer<SectionSpec, SectionSpec>
    ): import('@langchain/langgraph').BinaryOperatorAggregate<SectionSpec, SectionSpec>;
    Root: <S extends import('@langchain/langgraph').StateDefinition>(
      sd: S
    ) => import('@langchain/langgraph').AnnotationRoot<S>;
  };
  researchFindings: {
    (): import('@langchain/langgraph').LastValue<ResearchFindings>;
    (
      annotation: import('@langchain/langgraph').SingleReducer<ResearchFindings, ResearchFindings>
    ): import('@langchain/langgraph').BinaryOperatorAggregate<ResearchFindings, ResearchFindings>;
    Root: <S extends import('@langchain/langgraph').StateDefinition>(
      sd: S
    ) => import('@langchain/langgraph').AnnotationRoot<S>;
  };
  styleConfig: {
    (): import('@langchain/langgraph').LastValue<ContentStyleConfig>;
    (
      annotation: import('@langchain/langgraph').SingleReducer<
        ContentStyleConfig,
        ContentStyleConfig
      >
    ): import('@langchain/langgraph').BinaryOperatorAggregate<
      ContentStyleConfig,
      ContentStyleConfig
    >;
    Root: <S extends import('@langchain/langgraph').StateDefinition>(
      sd: S
    ) => import('@langchain/langgraph').AnnotationRoot<S>;
  };
  smartModel: {
    (): import('@langchain/langgraph').LastValue<
      BaseChatModel<
        import('@langchain/core/language_models/chat_models').BaseChatModelCallOptions,
        import('@langchain/core/messages').AIMessageChunk
      >
    >;
    (
      annotation: import('@langchain/langgraph').SingleReducer<
        BaseChatModel<
          import('@langchain/core/language_models/chat_models').BaseChatModelCallOptions,
          import('@langchain/core/messages').AIMessageChunk
        >,
        BaseChatModel<
          import('@langchain/core/language_models/chat_models').BaseChatModelCallOptions,
          import('@langchain/core/messages').AIMessageChunk
        >
      >
    ): import('@langchain/langgraph').BinaryOperatorAggregate<
      BaseChatModel<
        import('@langchain/core/language_models/chat_models').BaseChatModelCallOptions,
        import('@langchain/core/messages').AIMessageChunk
      >,
      BaseChatModel<
        import('@langchain/core/language_models/chat_models').BaseChatModelCallOptions,
        import('@langchain/core/messages').AIMessageChunk
      >
    >;
    Root: <S extends import('@langchain/langgraph').StateDefinition>(
      sd: S
    ) => import('@langchain/langgraph').AnnotationRoot<S>;
  };
  fastModel: {
    (): import('@langchain/langgraph').LastValue<
      BaseChatModel<
        import('@langchain/core/language_models/chat_models').BaseChatModelCallOptions,
        import('@langchain/core/messages').AIMessageChunk
      >
    >;
    (
      annotation: import('@langchain/langgraph').SingleReducer<
        BaseChatModel<
          import('@langchain/core/language_models/chat_models').BaseChatModelCallOptions,
          import('@langchain/core/messages').AIMessageChunk
        >,
        BaseChatModel<
          import('@langchain/core/language_models/chat_models').BaseChatModelCallOptions,
          import('@langchain/core/messages').AIMessageChunk
        >
      >
    ): import('@langchain/langgraph').BinaryOperatorAggregate<
      BaseChatModel<
        import('@langchain/core/language_models/chat_models').BaseChatModelCallOptions,
        import('@langchain/core/messages').AIMessageChunk
      >,
      BaseChatModel<
        import('@langchain/core/language_models/chat_models').BaseChatModelCallOptions,
        import('@langchain/core/messages').AIMessageChunk
      >
    >;
    Root: <S extends import('@langchain/langgraph').StateDefinition>(
      sd: S
    ) => import('@langchain/langgraph').AnnotationRoot<S>;
  };
  langfuseClient: {
    (): import('@langchain/langgraph').LastValue<LangfuseClient | undefined>;
    (
      annotation: import('@langchain/langgraph').SingleReducer<
        LangfuseClient | undefined,
        LangfuseClient | undefined
      >
    ): import('@langchain/langgraph').BinaryOperatorAggregate<
      LangfuseClient | undefined,
      LangfuseClient | undefined
    >;
    Root: <S extends import('@langchain/langgraph').StateDefinition>(
      sd: S
    ) => import('@langchain/langgraph').AnnotationRoot<S>;
  };
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
  messages: {
    (): import('@langchain/langgraph').LastValue<
      {
        role: string;
        content: string;
      }[]
    >;
    (
      annotation: import('@langchain/langgraph').SingleReducer<
        {
          role: string;
          content: string;
        }[],
        {
          role: string;
          content: string;
        }[]
      >
    ): import('@langchain/langgraph').BinaryOperatorAggregate<
      {
        role: string;
        content: string;
      }[],
      {
        role: string;
        content: string;
      }[]
    >;
    Root: <S extends import('@langchain/langgraph').StateDefinition>(
      sd: S
    ) => import('@langchain/langgraph').AnnotationRoot<S>;
  };
  currentModel: {
    (): import('@langchain/langgraph').LastValue<'smart' | 'fast'>;
    (
      annotation: import('@langchain/langgraph').SingleReducer<'smart' | 'fast', 'smart' | 'fast'>
    ): import('@langchain/langgraph').BinaryOperatorAggregate<'smart' | 'fast', 'smart' | 'fast'>;
    Root: <S extends import('@langchain/langgraph').StateDefinition>(
      sd: S
    ) => import('@langchain/langgraph').AnnotationRoot<S>;
  };
  retryCount: {
    (): import('@langchain/langgraph').LastValue<number>;
    (
      annotation: import('@langchain/langgraph').SingleReducer<number, number>
    ): import('@langchain/langgraph').BinaryOperatorAggregate<number, number>;
    Root: <S extends import('@langchain/langgraph').StateDefinition>(
      sd: S
    ) => import('@langchain/langgraph').AnnotationRoot<S>;
  };
  validationError: {
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
  section: {
    (): import('@langchain/langgraph').LastValue<
      | {
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
        }
      | undefined
    >;
    (
      annotation: import('@langchain/langgraph').SingleReducer<
        | {
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
          }
        | undefined,
        | {
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
          }
        | undefined
      >
    ): import('@langchain/langgraph').BinaryOperatorAggregate<
      | {
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
        }
      | undefined,
      | {
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
        }
      | undefined
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
export type SectionWriterStateType = typeof SectionWriterState.State;
/**
 * Creates the SectionWriter subgraph
 */
export declare function createSectionWriterGraph(): StateGraph<
  {
    sectionSpec: {
      (): import('@langchain/langgraph').LastValue<SectionSpec>;
      (
        annotation: import('@langchain/langgraph').SingleReducer<SectionSpec, SectionSpec>
      ): import('@langchain/langgraph').BinaryOperatorAggregate<SectionSpec, SectionSpec>;
      Root: <S extends import('@langchain/langgraph').StateDefinition>(
        sd: S
      ) => import('@langchain/langgraph').AnnotationRoot<S>;
    };
    researchFindings: {
      (): import('@langchain/langgraph').LastValue<ResearchFindings>;
      (
        annotation: import('@langchain/langgraph').SingleReducer<ResearchFindings, ResearchFindings>
      ): import('@langchain/langgraph').BinaryOperatorAggregate<ResearchFindings, ResearchFindings>;
      Root: <S extends import('@langchain/langgraph').StateDefinition>(
        sd: S
      ) => import('@langchain/langgraph').AnnotationRoot<S>;
    };
    styleConfig: {
      (): import('@langchain/langgraph').LastValue<ContentStyleConfig>;
      (
        annotation: import('@langchain/langgraph').SingleReducer<
          ContentStyleConfig,
          ContentStyleConfig
        >
      ): import('@langchain/langgraph').BinaryOperatorAggregate<
        ContentStyleConfig,
        ContentStyleConfig
      >;
      Root: <S extends import('@langchain/langgraph').StateDefinition>(
        sd: S
      ) => import('@langchain/langgraph').AnnotationRoot<S>;
    };
    smartModel: {
      (): import('@langchain/langgraph').LastValue<
        BaseChatModel<
          import('@langchain/core/language_models/chat_models').BaseChatModelCallOptions,
          import('@langchain/core/messages').AIMessageChunk
        >
      >;
      (
        annotation: import('@langchain/langgraph').SingleReducer<
          BaseChatModel<
            import('@langchain/core/language_models/chat_models').BaseChatModelCallOptions,
            import('@langchain/core/messages').AIMessageChunk
          >,
          BaseChatModel<
            import('@langchain/core/language_models/chat_models').BaseChatModelCallOptions,
            import('@langchain/core/messages').AIMessageChunk
          >
        >
      ): import('@langchain/langgraph').BinaryOperatorAggregate<
        BaseChatModel<
          import('@langchain/core/language_models/chat_models').BaseChatModelCallOptions,
          import('@langchain/core/messages').AIMessageChunk
        >,
        BaseChatModel<
          import('@langchain/core/language_models/chat_models').BaseChatModelCallOptions,
          import('@langchain/core/messages').AIMessageChunk
        >
      >;
      Root: <S extends import('@langchain/langgraph').StateDefinition>(
        sd: S
      ) => import('@langchain/langgraph').AnnotationRoot<S>;
    };
    fastModel: {
      (): import('@langchain/langgraph').LastValue<
        BaseChatModel<
          import('@langchain/core/language_models/chat_models').BaseChatModelCallOptions,
          import('@langchain/core/messages').AIMessageChunk
        >
      >;
      (
        annotation: import('@langchain/langgraph').SingleReducer<
          BaseChatModel<
            import('@langchain/core/language_models/chat_models').BaseChatModelCallOptions,
            import('@langchain/core/messages').AIMessageChunk
          >,
          BaseChatModel<
            import('@langchain/core/language_models/chat_models').BaseChatModelCallOptions,
            import('@langchain/core/messages').AIMessageChunk
          >
        >
      ): import('@langchain/langgraph').BinaryOperatorAggregate<
        BaseChatModel<
          import('@langchain/core/language_models/chat_models').BaseChatModelCallOptions,
          import('@langchain/core/messages').AIMessageChunk
        >,
        BaseChatModel<
          import('@langchain/core/language_models/chat_models').BaseChatModelCallOptions,
          import('@langchain/core/messages').AIMessageChunk
        >
      >;
      Root: <S extends import('@langchain/langgraph').StateDefinition>(
        sd: S
      ) => import('@langchain/langgraph').AnnotationRoot<S>;
    };
    langfuseClient: {
      (): import('@langchain/langgraph').LastValue<LangfuseClient | undefined>;
      (
        annotation: import('@langchain/langgraph').SingleReducer<
          LangfuseClient | undefined,
          LangfuseClient | undefined
        >
      ): import('@langchain/langgraph').BinaryOperatorAggregate<
        LangfuseClient | undefined,
        LangfuseClient | undefined
      >;
      Root: <S extends import('@langchain/langgraph').StateDefinition>(
        sd: S
      ) => import('@langchain/langgraph').AnnotationRoot<S>;
    };
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
    messages: {
      (): import('@langchain/langgraph').LastValue<
        {
          role: string;
          content: string;
        }[]
      >;
      (
        annotation: import('@langchain/langgraph').SingleReducer<
          {
            role: string;
            content: string;
          }[],
          {
            role: string;
            content: string;
          }[]
        >
      ): import('@langchain/langgraph').BinaryOperatorAggregate<
        {
          role: string;
          content: string;
        }[],
        {
          role: string;
          content: string;
        }[]
      >;
      Root: <S extends import('@langchain/langgraph').StateDefinition>(
        sd: S
      ) => import('@langchain/langgraph').AnnotationRoot<S>;
    };
    currentModel: {
      (): import('@langchain/langgraph').LastValue<'smart' | 'fast'>;
      (
        annotation: import('@langchain/langgraph').SingleReducer<'smart' | 'fast', 'smart' | 'fast'>
      ): import('@langchain/langgraph').BinaryOperatorAggregate<'smart' | 'fast', 'smart' | 'fast'>;
      Root: <S extends import('@langchain/langgraph').StateDefinition>(
        sd: S
      ) => import('@langchain/langgraph').AnnotationRoot<S>;
    };
    retryCount: {
      (): import('@langchain/langgraph').LastValue<number>;
      (
        annotation: import('@langchain/langgraph').SingleReducer<number, number>
      ): import('@langchain/langgraph').BinaryOperatorAggregate<number, number>;
      Root: <S extends import('@langchain/langgraph').StateDefinition>(
        sd: S
      ) => import('@langchain/langgraph').AnnotationRoot<S>;
    };
    validationError: {
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
    section: {
      (): import('@langchain/langgraph').LastValue<
        | {
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
          }
        | undefined
      >;
      (
        annotation: import('@langchain/langgraph').SingleReducer<
          | {
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
            }
          | undefined,
          | {
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
            }
          | undefined
        >
      ): import('@langchain/langgraph').BinaryOperatorAggregate<
        | {
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
          }
        | undefined,
        | {
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
          }
        | undefined
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
  import('@langchain/langgraph').StateType<{
    sectionSpec: {
      (): import('@langchain/langgraph').LastValue<SectionSpec>;
      (
        annotation: import('@langchain/langgraph').SingleReducer<SectionSpec, SectionSpec>
      ): import('@langchain/langgraph').BinaryOperatorAggregate<SectionSpec, SectionSpec>;
      Root: <S extends import('@langchain/langgraph').StateDefinition>(
        sd: S
      ) => import('@langchain/langgraph').AnnotationRoot<S>;
    };
    researchFindings: {
      (): import('@langchain/langgraph').LastValue<ResearchFindings>;
      (
        annotation: import('@langchain/langgraph').SingleReducer<ResearchFindings, ResearchFindings>
      ): import('@langchain/langgraph').BinaryOperatorAggregate<ResearchFindings, ResearchFindings>;
      Root: <S extends import('@langchain/langgraph').StateDefinition>(
        sd: S
      ) => import('@langchain/langgraph').AnnotationRoot<S>;
    };
    styleConfig: {
      (): import('@langchain/langgraph').LastValue<ContentStyleConfig>;
      (
        annotation: import('@langchain/langgraph').SingleReducer<
          ContentStyleConfig,
          ContentStyleConfig
        >
      ): import('@langchain/langgraph').BinaryOperatorAggregate<
        ContentStyleConfig,
        ContentStyleConfig
      >;
      Root: <S extends import('@langchain/langgraph').StateDefinition>(
        sd: S
      ) => import('@langchain/langgraph').AnnotationRoot<S>;
    };
    smartModel: {
      (): import('@langchain/langgraph').LastValue<
        BaseChatModel<
          import('@langchain/core/language_models/chat_models').BaseChatModelCallOptions,
          import('@langchain/core/messages').AIMessageChunk
        >
      >;
      (
        annotation: import('@langchain/langgraph').SingleReducer<
          BaseChatModel<
            import('@langchain/core/language_models/chat_models').BaseChatModelCallOptions,
            import('@langchain/core/messages').AIMessageChunk
          >,
          BaseChatModel<
            import('@langchain/core/language_models/chat_models').BaseChatModelCallOptions,
            import('@langchain/core/messages').AIMessageChunk
          >
        >
      ): import('@langchain/langgraph').BinaryOperatorAggregate<
        BaseChatModel<
          import('@langchain/core/language_models/chat_models').BaseChatModelCallOptions,
          import('@langchain/core/messages').AIMessageChunk
        >,
        BaseChatModel<
          import('@langchain/core/language_models/chat_models').BaseChatModelCallOptions,
          import('@langchain/core/messages').AIMessageChunk
        >
      >;
      Root: <S extends import('@langchain/langgraph').StateDefinition>(
        sd: S
      ) => import('@langchain/langgraph').AnnotationRoot<S>;
    };
    fastModel: {
      (): import('@langchain/langgraph').LastValue<
        BaseChatModel<
          import('@langchain/core/language_models/chat_models').BaseChatModelCallOptions,
          import('@langchain/core/messages').AIMessageChunk
        >
      >;
      (
        annotation: import('@langchain/langgraph').SingleReducer<
          BaseChatModel<
            import('@langchain/core/language_models/chat_models').BaseChatModelCallOptions,
            import('@langchain/core/messages').AIMessageChunk
          >,
          BaseChatModel<
            import('@langchain/core/language_models/chat_models').BaseChatModelCallOptions,
            import('@langchain/core/messages').AIMessageChunk
          >
        >
      ): import('@langchain/langgraph').BinaryOperatorAggregate<
        BaseChatModel<
          import('@langchain/core/language_models/chat_models').BaseChatModelCallOptions,
          import('@langchain/core/messages').AIMessageChunk
        >,
        BaseChatModel<
          import('@langchain/core/language_models/chat_models').BaseChatModelCallOptions,
          import('@langchain/core/messages').AIMessageChunk
        >
      >;
      Root: <S extends import('@langchain/langgraph').StateDefinition>(
        sd: S
      ) => import('@langchain/langgraph').AnnotationRoot<S>;
    };
    langfuseClient: {
      (): import('@langchain/langgraph').LastValue<LangfuseClient | undefined>;
      (
        annotation: import('@langchain/langgraph').SingleReducer<
          LangfuseClient | undefined,
          LangfuseClient | undefined
        >
      ): import('@langchain/langgraph').BinaryOperatorAggregate<
        LangfuseClient | undefined,
        LangfuseClient | undefined
      >;
      Root: <S extends import('@langchain/langgraph').StateDefinition>(
        sd: S
      ) => import('@langchain/langgraph').AnnotationRoot<S>;
    };
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
    messages: {
      (): import('@langchain/langgraph').LastValue<
        {
          role: string;
          content: string;
        }[]
      >;
      (
        annotation: import('@langchain/langgraph').SingleReducer<
          {
            role: string;
            content: string;
          }[],
          {
            role: string;
            content: string;
          }[]
        >
      ): import('@langchain/langgraph').BinaryOperatorAggregate<
        {
          role: string;
          content: string;
        }[],
        {
          role: string;
          content: string;
        }[]
      >;
      Root: <S extends import('@langchain/langgraph').StateDefinition>(
        sd: S
      ) => import('@langchain/langgraph').AnnotationRoot<S>;
    };
    currentModel: {
      (): import('@langchain/langgraph').LastValue<'smart' | 'fast'>;
      (
        annotation: import('@langchain/langgraph').SingleReducer<'smart' | 'fast', 'smart' | 'fast'>
      ): import('@langchain/langgraph').BinaryOperatorAggregate<'smart' | 'fast', 'smart' | 'fast'>;
      Root: <S extends import('@langchain/langgraph').StateDefinition>(
        sd: S
      ) => import('@langchain/langgraph').AnnotationRoot<S>;
    };
    retryCount: {
      (): import('@langchain/langgraph').LastValue<number>;
      (
        annotation: import('@langchain/langgraph').SingleReducer<number, number>
      ): import('@langchain/langgraph').BinaryOperatorAggregate<number, number>;
      Root: <S extends import('@langchain/langgraph').StateDefinition>(
        sd: S
      ) => import('@langchain/langgraph').AnnotationRoot<S>;
    };
    validationError: {
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
    section: {
      (): import('@langchain/langgraph').LastValue<
        | {
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
          }
        | undefined
      >;
      (
        annotation: import('@langchain/langgraph').SingleReducer<
          | {
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
            }
          | undefined,
          | {
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
            }
          | undefined
        >
      ): import('@langchain/langgraph').BinaryOperatorAggregate<
        | {
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
          }
        | undefined,
        | {
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
          }
        | undefined
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
    sectionSpec: {
      (): import('@langchain/langgraph').LastValue<SectionSpec>;
      (
        annotation: import('@langchain/langgraph').SingleReducer<SectionSpec, SectionSpec>
      ): import('@langchain/langgraph').BinaryOperatorAggregate<SectionSpec, SectionSpec>;
      Root: <S extends import('@langchain/langgraph').StateDefinition>(
        sd: S
      ) => import('@langchain/langgraph').AnnotationRoot<S>;
    };
    researchFindings: {
      (): import('@langchain/langgraph').LastValue<ResearchFindings>;
      (
        annotation: import('@langchain/langgraph').SingleReducer<ResearchFindings, ResearchFindings>
      ): import('@langchain/langgraph').BinaryOperatorAggregate<ResearchFindings, ResearchFindings>;
      Root: <S extends import('@langchain/langgraph').StateDefinition>(
        sd: S
      ) => import('@langchain/langgraph').AnnotationRoot<S>;
    };
    styleConfig: {
      (): import('@langchain/langgraph').LastValue<ContentStyleConfig>;
      (
        annotation: import('@langchain/langgraph').SingleReducer<
          ContentStyleConfig,
          ContentStyleConfig
        >
      ): import('@langchain/langgraph').BinaryOperatorAggregate<
        ContentStyleConfig,
        ContentStyleConfig
      >;
      Root: <S extends import('@langchain/langgraph').StateDefinition>(
        sd: S
      ) => import('@langchain/langgraph').AnnotationRoot<S>;
    };
    smartModel: {
      (): import('@langchain/langgraph').LastValue<
        BaseChatModel<
          import('@langchain/core/language_models/chat_models').BaseChatModelCallOptions,
          import('@langchain/core/messages').AIMessageChunk
        >
      >;
      (
        annotation: import('@langchain/langgraph').SingleReducer<
          BaseChatModel<
            import('@langchain/core/language_models/chat_models').BaseChatModelCallOptions,
            import('@langchain/core/messages').AIMessageChunk
          >,
          BaseChatModel<
            import('@langchain/core/language_models/chat_models').BaseChatModelCallOptions,
            import('@langchain/core/messages').AIMessageChunk
          >
        >
      ): import('@langchain/langgraph').BinaryOperatorAggregate<
        BaseChatModel<
          import('@langchain/core/language_models/chat_models').BaseChatModelCallOptions,
          import('@langchain/core/messages').AIMessageChunk
        >,
        BaseChatModel<
          import('@langchain/core/language_models/chat_models').BaseChatModelCallOptions,
          import('@langchain/core/messages').AIMessageChunk
        >
      >;
      Root: <S extends import('@langchain/langgraph').StateDefinition>(
        sd: S
      ) => import('@langchain/langgraph').AnnotationRoot<S>;
    };
    fastModel: {
      (): import('@langchain/langgraph').LastValue<
        BaseChatModel<
          import('@langchain/core/language_models/chat_models').BaseChatModelCallOptions,
          import('@langchain/core/messages').AIMessageChunk
        >
      >;
      (
        annotation: import('@langchain/langgraph').SingleReducer<
          BaseChatModel<
            import('@langchain/core/language_models/chat_models').BaseChatModelCallOptions,
            import('@langchain/core/messages').AIMessageChunk
          >,
          BaseChatModel<
            import('@langchain/core/language_models/chat_models').BaseChatModelCallOptions,
            import('@langchain/core/messages').AIMessageChunk
          >
        >
      ): import('@langchain/langgraph').BinaryOperatorAggregate<
        BaseChatModel<
          import('@langchain/core/language_models/chat_models').BaseChatModelCallOptions,
          import('@langchain/core/messages').AIMessageChunk
        >,
        BaseChatModel<
          import('@langchain/core/language_models/chat_models').BaseChatModelCallOptions,
          import('@langchain/core/messages').AIMessageChunk
        >
      >;
      Root: <S extends import('@langchain/langgraph').StateDefinition>(
        sd: S
      ) => import('@langchain/langgraph').AnnotationRoot<S>;
    };
    langfuseClient: {
      (): import('@langchain/langgraph').LastValue<LangfuseClient | undefined>;
      (
        annotation: import('@langchain/langgraph').SingleReducer<
          LangfuseClient | undefined,
          LangfuseClient | undefined
        >
      ): import('@langchain/langgraph').BinaryOperatorAggregate<
        LangfuseClient | undefined,
        LangfuseClient | undefined
      >;
      Root: <S extends import('@langchain/langgraph').StateDefinition>(
        sd: S
      ) => import('@langchain/langgraph').AnnotationRoot<S>;
    };
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
    messages: {
      (): import('@langchain/langgraph').LastValue<
        {
          role: string;
          content: string;
        }[]
      >;
      (
        annotation: import('@langchain/langgraph').SingleReducer<
          {
            role: string;
            content: string;
          }[],
          {
            role: string;
            content: string;
          }[]
        >
      ): import('@langchain/langgraph').BinaryOperatorAggregate<
        {
          role: string;
          content: string;
        }[],
        {
          role: string;
          content: string;
        }[]
      >;
      Root: <S extends import('@langchain/langgraph').StateDefinition>(
        sd: S
      ) => import('@langchain/langgraph').AnnotationRoot<S>;
    };
    currentModel: {
      (): import('@langchain/langgraph').LastValue<'smart' | 'fast'>;
      (
        annotation: import('@langchain/langgraph').SingleReducer<'smart' | 'fast', 'smart' | 'fast'>
      ): import('@langchain/langgraph').BinaryOperatorAggregate<'smart' | 'fast', 'smart' | 'fast'>;
      Root: <S extends import('@langchain/langgraph').StateDefinition>(
        sd: S
      ) => import('@langchain/langgraph').AnnotationRoot<S>;
    };
    retryCount: {
      (): import('@langchain/langgraph').LastValue<number>;
      (
        annotation: import('@langchain/langgraph').SingleReducer<number, number>
      ): import('@langchain/langgraph').BinaryOperatorAggregate<number, number>;
      Root: <S extends import('@langchain/langgraph').StateDefinition>(
        sd: S
      ) => import('@langchain/langgraph').AnnotationRoot<S>;
    };
    validationError: {
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
    section: {
      (): import('@langchain/langgraph').LastValue<
        | {
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
          }
        | undefined
      >;
      (
        annotation: import('@langchain/langgraph').SingleReducer<
          | {
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
            }
          | undefined,
          | {
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
            }
          | undefined
        >
      ): import('@langchain/langgraph').BinaryOperatorAggregate<
        | {
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
          }
        | undefined,
        | {
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
          }
        | undefined
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
    sectionSpec: {
      (): import('@langchain/langgraph').LastValue<SectionSpec>;
      (
        annotation: import('@langchain/langgraph').SingleReducer<SectionSpec, SectionSpec>
      ): import('@langchain/langgraph').BinaryOperatorAggregate<SectionSpec, SectionSpec>;
      Root: <S extends import('@langchain/langgraph').StateDefinition>(
        sd: S
      ) => import('@langchain/langgraph').AnnotationRoot<S>;
    };
    researchFindings: {
      (): import('@langchain/langgraph').LastValue<ResearchFindings>;
      (
        annotation: import('@langchain/langgraph').SingleReducer<ResearchFindings, ResearchFindings>
      ): import('@langchain/langgraph').BinaryOperatorAggregate<ResearchFindings, ResearchFindings>;
      Root: <S extends import('@langchain/langgraph').StateDefinition>(
        sd: S
      ) => import('@langchain/langgraph').AnnotationRoot<S>;
    };
    styleConfig: {
      (): import('@langchain/langgraph').LastValue<ContentStyleConfig>;
      (
        annotation: import('@langchain/langgraph').SingleReducer<
          ContentStyleConfig,
          ContentStyleConfig
        >
      ): import('@langchain/langgraph').BinaryOperatorAggregate<
        ContentStyleConfig,
        ContentStyleConfig
      >;
      Root: <S extends import('@langchain/langgraph').StateDefinition>(
        sd: S
      ) => import('@langchain/langgraph').AnnotationRoot<S>;
    };
    smartModel: {
      (): import('@langchain/langgraph').LastValue<
        BaseChatModel<
          import('@langchain/core/language_models/chat_models').BaseChatModelCallOptions,
          import('@langchain/core/messages').AIMessageChunk
        >
      >;
      (
        annotation: import('@langchain/langgraph').SingleReducer<
          BaseChatModel<
            import('@langchain/core/language_models/chat_models').BaseChatModelCallOptions,
            import('@langchain/core/messages').AIMessageChunk
          >,
          BaseChatModel<
            import('@langchain/core/language_models/chat_models').BaseChatModelCallOptions,
            import('@langchain/core/messages').AIMessageChunk
          >
        >
      ): import('@langchain/langgraph').BinaryOperatorAggregate<
        BaseChatModel<
          import('@langchain/core/language_models/chat_models').BaseChatModelCallOptions,
          import('@langchain/core/messages').AIMessageChunk
        >,
        BaseChatModel<
          import('@langchain/core/language_models/chat_models').BaseChatModelCallOptions,
          import('@langchain/core/messages').AIMessageChunk
        >
      >;
      Root: <S extends import('@langchain/langgraph').StateDefinition>(
        sd: S
      ) => import('@langchain/langgraph').AnnotationRoot<S>;
    };
    fastModel: {
      (): import('@langchain/langgraph').LastValue<
        BaseChatModel<
          import('@langchain/core/language_models/chat_models').BaseChatModelCallOptions,
          import('@langchain/core/messages').AIMessageChunk
        >
      >;
      (
        annotation: import('@langchain/langgraph').SingleReducer<
          BaseChatModel<
            import('@langchain/core/language_models/chat_models').BaseChatModelCallOptions,
            import('@langchain/core/messages').AIMessageChunk
          >,
          BaseChatModel<
            import('@langchain/core/language_models/chat_models').BaseChatModelCallOptions,
            import('@langchain/core/messages').AIMessageChunk
          >
        >
      ): import('@langchain/langgraph').BinaryOperatorAggregate<
        BaseChatModel<
          import('@langchain/core/language_models/chat_models').BaseChatModelCallOptions,
          import('@langchain/core/messages').AIMessageChunk
        >,
        BaseChatModel<
          import('@langchain/core/language_models/chat_models').BaseChatModelCallOptions,
          import('@langchain/core/messages').AIMessageChunk
        >
      >;
      Root: <S extends import('@langchain/langgraph').StateDefinition>(
        sd: S
      ) => import('@langchain/langgraph').AnnotationRoot<S>;
    };
    langfuseClient: {
      (): import('@langchain/langgraph').LastValue<LangfuseClient | undefined>;
      (
        annotation: import('@langchain/langgraph').SingleReducer<
          LangfuseClient | undefined,
          LangfuseClient | undefined
        >
      ): import('@langchain/langgraph').BinaryOperatorAggregate<
        LangfuseClient | undefined,
        LangfuseClient | undefined
      >;
      Root: <S extends import('@langchain/langgraph').StateDefinition>(
        sd: S
      ) => import('@langchain/langgraph').AnnotationRoot<S>;
    };
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
    messages: {
      (): import('@langchain/langgraph').LastValue<
        {
          role: string;
          content: string;
        }[]
      >;
      (
        annotation: import('@langchain/langgraph').SingleReducer<
          {
            role: string;
            content: string;
          }[],
          {
            role: string;
            content: string;
          }[]
        >
      ): import('@langchain/langgraph').BinaryOperatorAggregate<
        {
          role: string;
          content: string;
        }[],
        {
          role: string;
          content: string;
        }[]
      >;
      Root: <S extends import('@langchain/langgraph').StateDefinition>(
        sd: S
      ) => import('@langchain/langgraph').AnnotationRoot<S>;
    };
    currentModel: {
      (): import('@langchain/langgraph').LastValue<'smart' | 'fast'>;
      (
        annotation: import('@langchain/langgraph').SingleReducer<'smart' | 'fast', 'smart' | 'fast'>
      ): import('@langchain/langgraph').BinaryOperatorAggregate<'smart' | 'fast', 'smart' | 'fast'>;
      Root: <S extends import('@langchain/langgraph').StateDefinition>(
        sd: S
      ) => import('@langchain/langgraph').AnnotationRoot<S>;
    };
    retryCount: {
      (): import('@langchain/langgraph').LastValue<number>;
      (
        annotation: import('@langchain/langgraph').SingleReducer<number, number>
      ): import('@langchain/langgraph').BinaryOperatorAggregate<number, number>;
      Root: <S extends import('@langchain/langgraph').StateDefinition>(
        sd: S
      ) => import('@langchain/langgraph').AnnotationRoot<S>;
    };
    validationError: {
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
    section: {
      (): import('@langchain/langgraph').LastValue<
        | {
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
          }
        | undefined
      >;
      (
        annotation: import('@langchain/langgraph').SingleReducer<
          | {
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
            }
          | undefined,
          | {
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
            }
          | undefined
        >
      ): import('@langchain/langgraph').BinaryOperatorAggregate<
        | {
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
          }
        | undefined,
        | {
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
          }
        | undefined
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
    sectionSpec: {
      (): import('@langchain/langgraph').LastValue<SectionSpec>;
      (
        annotation: import('@langchain/langgraph').SingleReducer<SectionSpec, SectionSpec>
      ): import('@langchain/langgraph').BinaryOperatorAggregate<SectionSpec, SectionSpec>;
      Root: <S extends import('@langchain/langgraph').StateDefinition>(
        sd: S
      ) => import('@langchain/langgraph').AnnotationRoot<S>;
    };
    researchFindings: {
      (): import('@langchain/langgraph').LastValue<ResearchFindings>;
      (
        annotation: import('@langchain/langgraph').SingleReducer<ResearchFindings, ResearchFindings>
      ): import('@langchain/langgraph').BinaryOperatorAggregate<ResearchFindings, ResearchFindings>;
      Root: <S extends import('@langchain/langgraph').StateDefinition>(
        sd: S
      ) => import('@langchain/langgraph').AnnotationRoot<S>;
    };
    styleConfig: {
      (): import('@langchain/langgraph').LastValue<ContentStyleConfig>;
      (
        annotation: import('@langchain/langgraph').SingleReducer<
          ContentStyleConfig,
          ContentStyleConfig
        >
      ): import('@langchain/langgraph').BinaryOperatorAggregate<
        ContentStyleConfig,
        ContentStyleConfig
      >;
      Root: <S extends import('@langchain/langgraph').StateDefinition>(
        sd: S
      ) => import('@langchain/langgraph').AnnotationRoot<S>;
    };
    smartModel: {
      (): import('@langchain/langgraph').LastValue<
        BaseChatModel<
          import('@langchain/core/language_models/chat_models').BaseChatModelCallOptions,
          import('@langchain/core/messages').AIMessageChunk
        >
      >;
      (
        annotation: import('@langchain/langgraph').SingleReducer<
          BaseChatModel<
            import('@langchain/core/language_models/chat_models').BaseChatModelCallOptions,
            import('@langchain/core/messages').AIMessageChunk
          >,
          BaseChatModel<
            import('@langchain/core/language_models/chat_models').BaseChatModelCallOptions,
            import('@langchain/core/messages').AIMessageChunk
          >
        >
      ): import('@langchain/langgraph').BinaryOperatorAggregate<
        BaseChatModel<
          import('@langchain/core/language_models/chat_models').BaseChatModelCallOptions,
          import('@langchain/core/messages').AIMessageChunk
        >,
        BaseChatModel<
          import('@langchain/core/language_models/chat_models').BaseChatModelCallOptions,
          import('@langchain/core/messages').AIMessageChunk
        >
      >;
      Root: <S extends import('@langchain/langgraph').StateDefinition>(
        sd: S
      ) => import('@langchain/langgraph').AnnotationRoot<S>;
    };
    fastModel: {
      (): import('@langchain/langgraph').LastValue<
        BaseChatModel<
          import('@langchain/core/language_models/chat_models').BaseChatModelCallOptions,
          import('@langchain/core/messages').AIMessageChunk
        >
      >;
      (
        annotation: import('@langchain/langgraph').SingleReducer<
          BaseChatModel<
            import('@langchain/core/language_models/chat_models').BaseChatModelCallOptions,
            import('@langchain/core/messages').AIMessageChunk
          >,
          BaseChatModel<
            import('@langchain/core/language_models/chat_models').BaseChatModelCallOptions,
            import('@langchain/core/messages').AIMessageChunk
          >
        >
      ): import('@langchain/langgraph').BinaryOperatorAggregate<
        BaseChatModel<
          import('@langchain/core/language_models/chat_models').BaseChatModelCallOptions,
          import('@langchain/core/messages').AIMessageChunk
        >,
        BaseChatModel<
          import('@langchain/core/language_models/chat_models').BaseChatModelCallOptions,
          import('@langchain/core/messages').AIMessageChunk
        >
      >;
      Root: <S extends import('@langchain/langgraph').StateDefinition>(
        sd: S
      ) => import('@langchain/langgraph').AnnotationRoot<S>;
    };
    langfuseClient: {
      (): import('@langchain/langgraph').LastValue<LangfuseClient | undefined>;
      (
        annotation: import('@langchain/langgraph').SingleReducer<
          LangfuseClient | undefined,
          LangfuseClient | undefined
        >
      ): import('@langchain/langgraph').BinaryOperatorAggregate<
        LangfuseClient | undefined,
        LangfuseClient | undefined
      >;
      Root: <S extends import('@langchain/langgraph').StateDefinition>(
        sd: S
      ) => import('@langchain/langgraph').AnnotationRoot<S>;
    };
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
    messages: {
      (): import('@langchain/langgraph').LastValue<
        {
          role: string;
          content: string;
        }[]
      >;
      (
        annotation: import('@langchain/langgraph').SingleReducer<
          {
            role: string;
            content: string;
          }[],
          {
            role: string;
            content: string;
          }[]
        >
      ): import('@langchain/langgraph').BinaryOperatorAggregate<
        {
          role: string;
          content: string;
        }[],
        {
          role: string;
          content: string;
        }[]
      >;
      Root: <S extends import('@langchain/langgraph').StateDefinition>(
        sd: S
      ) => import('@langchain/langgraph').AnnotationRoot<S>;
    };
    currentModel: {
      (): import('@langchain/langgraph').LastValue<'smart' | 'fast'>;
      (
        annotation: import('@langchain/langgraph').SingleReducer<'smart' | 'fast', 'smart' | 'fast'>
      ): import('@langchain/langgraph').BinaryOperatorAggregate<'smart' | 'fast', 'smart' | 'fast'>;
      Root: <S extends import('@langchain/langgraph').StateDefinition>(
        sd: S
      ) => import('@langchain/langgraph').AnnotationRoot<S>;
    };
    retryCount: {
      (): import('@langchain/langgraph').LastValue<number>;
      (
        annotation: import('@langchain/langgraph').SingleReducer<number, number>
      ): import('@langchain/langgraph').BinaryOperatorAggregate<number, number>;
      Root: <S extends import('@langchain/langgraph').StateDefinition>(
        sd: S
      ) => import('@langchain/langgraph').AnnotationRoot<S>;
    };
    validationError: {
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
    section: {
      (): import('@langchain/langgraph').LastValue<
        | {
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
          }
        | undefined
      >;
      (
        annotation: import('@langchain/langgraph').SingleReducer<
          | {
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
            }
          | undefined,
          | {
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
            }
          | undefined
        >
      ): import('@langchain/langgraph').BinaryOperatorAggregate<
        | {
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
          }
        | undefined,
        | {
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
          }
        | undefined
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
/**
 * Convenience function to execute section generation
 */
export declare function executeSectionWriter(
  spec: SectionSpec,
  findings: ResearchFindings,
  style: ContentStyleConfig,
  smartModel: BaseChatModel,
  fastModel: BaseChatModel,
  langfuseClient?: LangfuseClient,
  traceId?: string
): Promise<ContentSection | undefined>;
export {};
//# sourceMappingURL=section-writer.d.ts.map
