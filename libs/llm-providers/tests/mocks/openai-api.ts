import type OpenAI from 'openai';

export interface MockOpenAIResponse {
  id: string;
  object: string;
  created: number;
  model: string;
  choices: Array<{
    index: number;
    message: {
      role: string;
      content: string;
    };
    finish_reason: string;
  }>;
  usage: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
}

export class MockOpenAIClient {
  public models: {
    list: () => Promise<{ data: Array<{ id: string; object: string }> }>;
  };

  public chat: {
    completions: {
      create: (params: unknown) => Promise<MockOpenAIResponse>;
    };
  };

  private shouldFail: boolean;
  private failureError: Error;

  constructor(options?: { shouldFail?: boolean; failureError?: Error }) {
    this.shouldFail = options?.shouldFail || false;
    this.failureError = options?.failureError || new Error('Mock API error');

    this.models = {
      list: async () => {
        if (this.shouldFail) {
          throw this.failureError;
        }
        return {
          data: [
            { id: 'gpt-4o', object: 'model' },
            { id: 'gpt-4o-mini', object: 'model' },
            { id: 'gpt-4-turbo-preview', object: 'model' },
            { id: 'o1', object: 'model' },
            { id: 'o1-mini', object: 'model' },
          ],
        };
      },
    };

    this.chat = {
      completions: {
        create: async (params: unknown) => {
          if (this.shouldFail) {
            throw this.failureError;
          }
          return {
            id: 'chatcmpl-mock-123',
            object: 'chat.completion',
            created: Date.now(),
            model: 'gpt-4o',
            choices: [
              {
                index: 0,
                message: {
                  role: 'assistant',
                  content: 'This is a mock response',
                },
                finish_reason: 'stop',
              },
            ],
            usage: {
              prompt_tokens: 10,
              completion_tokens: 20,
              total_tokens: 30,
            },
          };
        },
      },
    };
  }

  setFailure(shouldFail: boolean, error?: Error): void {
    this.shouldFail = shouldFail;
    if (error) {
      this.failureError = error;
    }
  }
}

export function createMockOpenAIClient(options?: {
  shouldFail?: boolean;
  failureError?: Error;
}): OpenAI {
  return new MockOpenAIClient(options) as unknown as OpenAI;
}
