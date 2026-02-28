/**
 * Stub implementation of Langfuse for testing
 * This allows tests to run without actually installing the langfuse package
 */

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

/**
 * Stub Langfuse class that does nothing
 * Used for testing when langfuse is not installed
 */
export class Langfuse {
  constructor(_options: LangfuseOptions) {
    // Stub - do nothing
  }

  async getPrompt(_name: string, _version?: number): Promise<LangfusePromptResponse | null> {
    return null;
  }

  trace(_body: LangfuseTraceBody): any {
    return {
      span: (_spanBody: any) => ({}),
      update: (_data: any) => {},
      generation: (_genBody: any) => ({}),
    };
  }

  generation(_body: LangfuseGenerationBody): any {
    return {};
  }

  async flush(): Promise<void> {
    // Stub - do nothing
  }

  async flushAsync(): Promise<void> {
    // Stub - do nothing
  }

  async shutdown(): Promise<void> {
    // Stub - do nothing
  }

  async shutdownAsync(): Promise<void> {
    // Stub - do nothing
  }
}
