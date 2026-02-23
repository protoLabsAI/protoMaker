/**
 * Type declarations for langfuse SDK
 * These are minimal declarations to allow compilation
 */

declare module 'langfuse' {
  export interface LangfuseOptions {
    publicKey: string;
    secretKey: string;
    baseUrl?: string;
    flushAt?: number;
    flushInterval?: number;
  }

  export interface LangfusePromptResponse {
    name: string;
    prompt: string;
    version: number;
    config?: Record<string, any>;
  }

  export interface LangfuseTraceBody {
    id?: string;
    name?: string;
    userId?: string;
    sessionId?: string;
    metadata?: Record<string, any>;
    tags?: string[];
    input?: any;
    output?: any;
  }

  export interface LangfuseTraceObject {
    id: string;
    update(body: Partial<LangfuseTraceBody>): void;
    generation(body: Omit<LangfuseGenerationBody, 'traceId'> & { traceId?: string }): any;
    span(body: any): any;
  }

  export interface LangfuseGenerationBody {
    id?: string;
    traceId: string;
    name?: string;
    model?: string;
    modelParameters?: Record<string, any>;
    input?: any;
    output?: any;
    usage?: {
      promptTokens?: number;
      completionTokens?: number;
      totalTokens?: number;
    };
    metadata?: Record<string, any>;
    startTime?: Date;
    endTime?: Date;
  }

  export class Langfuse {
    constructor(options: LangfuseOptions);
    getPrompt(name: string, version?: number): Promise<LangfusePromptResponse | null>;
    trace(body: LangfuseTraceBody): LangfuseTraceObject;
    generation(body: LangfuseGenerationBody): any;
    flush(): Promise<void>;
    flushAsync(): Promise<void>;
    shutdown(): Promise<void>;
    shutdownAsync(): Promise<void>;
  }
}
