/**
 * Mock Langfuse API for testing
 */

export interface MockPrompt {
  name: string;
  version: number;
  prompt: string;
  config?: Record<string, any>;
}

export interface MockTrace {
  id: string;
  name: string;
  userId?: string;
  sessionId?: string;
  metadata?: Record<string, any>;
  tags?: string[];
}

export interface MockGeneration {
  id: string;
  traceId: string;
  name: string;
  model?: string;
  modelParameters?: Record<string, any>;
  input: any;
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

export interface MockSpan {
  id: string;
  traceId: string;
  name: string;
  input?: any;
  output?: any;
  metadata?: Record<string, any>;
  startTime?: Date;
  endTime?: Date;
}

export class MockLangfuseAPI {
  private prompts: Map<string, MockPrompt[]> = new Map();
  private traces: Map<string, MockTrace> = new Map();
  private generations: Map<string, MockGeneration> = new Map();
  private spans: Map<string, MockSpan> = new Map();
  private shouldFail = false;

  /**
   * Register a prompt in the mock API
   */
  registerPrompt(prompt: MockPrompt): void {
    const key = prompt.name;
    const existing = this.prompts.get(key) ?? [];
    existing.push(prompt);
    this.prompts.set(key, existing);
  }

  /**
   * Get a prompt by name and optional version
   */
  getPrompt(name: string, version?: number): MockPrompt | null {
    if (this.shouldFail) {
      throw new Error('Mock API failure');
    }

    const versions = this.prompts.get(name);
    if (!versions || versions.length === 0) {
      return null;
    }

    if (version !== undefined) {
      return versions.find((p) => p.version === version) ?? null;
    }

    // Return latest version
    return versions[versions.length - 1];
  }

  /**
   * Record a trace
   */
  recordTrace(trace: MockTrace): void {
    if (this.shouldFail) {
      throw new Error('Mock API failure');
    }
    this.traces.set(trace.id, trace);
  }

  /**
   * Record a generation
   */
  recordGeneration(generation: MockGeneration): void {
    if (this.shouldFail) {
      throw new Error('Mock API failure');
    }
    this.generations.set(generation.id, generation);
  }

  /**
   * Record a span
   */
  recordSpan(span: MockSpan): void {
    if (this.shouldFail) {
      throw new Error('Mock API failure');
    }
    this.spans.set(span.id, span);
  }

  /**
   * Get recorded trace by ID
   */
  getTrace(id: string): MockTrace | undefined {
    return this.traces.get(id);
  }

  /**
   * Get recorded generation by ID
   */
  getGeneration(id: string): MockGeneration | undefined {
    return this.generations.get(id);
  }

  /**
   * Get all recorded traces
   */
  getAllTraces(): MockTrace[] {
    return Array.from(this.traces.values());
  }

  /**
   * Get all recorded generations
   */
  getAllGenerations(): MockGeneration[] {
    return Array.from(this.generations.values());
  }

  /**
   * Get all recorded spans
   */
  getAllSpans(): MockSpan[] {
    return Array.from(this.spans.values());
  }

  /**
   * Clear all recorded data
   */
  clear(): void {
    this.prompts.clear();
    this.traces.clear();
    this.generations.clear();
    this.spans.clear();
    this.shouldFail = false;
  }

  /**
   * Set whether the API should fail
   */
  setShouldFail(fail: boolean): void {
    this.shouldFail = fail;
  }
}

/**
 * Create a mock Langfuse client that uses the mock API
 */
export function createMockLangfuseClient(api: MockLangfuseAPI) {
  return {
    getPrompt: async (name: string, version?: number) => {
      const prompt = api.getPrompt(name, version);
      return prompt;
    },
    trace: (options: any) => ({
      id: options.id,
      generation: (genOptions: any) => {
        api.recordGeneration({
          id: genOptions.id,
          traceId: options.id,
          name: genOptions.name,
          model: genOptions.model,
          modelParameters: genOptions.modelParameters,
          input: genOptions.input,
          output: genOptions.output,
          usage: genOptions.usage,
          metadata: genOptions.metadata,
          startTime: genOptions.startTime,
          endTime: genOptions.endTime,
        });
        return genOptions;
      },
      span: (spanOptions: any) => {
        api.recordSpan({
          id: spanOptions.id ?? Math.random().toString(36).slice(2),
          traceId: options.id,
          name: spanOptions.name,
          input: spanOptions.input,
          output: spanOptions.output,
          metadata: spanOptions.metadata,
          startTime: spanOptions.startTime,
          endTime: spanOptions.endTime,
        });
        return spanOptions;
      },
      update: (_data: any) => {},
    }),
    flushAsync: async () => {
      // No-op for mock
    },
    shutdownAsync: async () => {
      // No-op for mock
    },
  };
}
