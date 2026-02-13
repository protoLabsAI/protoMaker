import type { GoogleGenerativeAI, GenerativeModel } from '@google/generative-ai';

export interface MockGoogleResponse {
  response: {
    text: () => string;
    candidates?: Array<{
      content: {
        parts: Array<{ text: string }>;
        role: string;
      };
      finishReason: string;
      index: number;
    }>;
  };
}

export class MockGenerativeModel {
  private shouldFail: boolean;
  private failureError: Error;

  constructor(options?: { shouldFail?: boolean; failureError?: Error }) {
    this.shouldFail = options?.shouldFail || false;
    this.failureError = options?.failureError || new Error('Mock API error');
  }

  async generateContent(prompt: string): Promise<MockGoogleResponse> {
    if (this.shouldFail) {
      throw this.failureError;
    }

    return {
      response: {
        text: () => 'This is a mock response from Gemini',
        candidates: [
          {
            content: {
              parts: [{ text: 'This is a mock response from Gemini' }],
              role: 'model',
            },
            finishReason: 'STOP',
            index: 0,
          },
        ],
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

export class MockGoogleGenerativeAI {
  private shouldFail: boolean;
  private failureError: Error;
  private modelInstance: MockGenerativeModel;

  constructor(apiKey: string, options?: { shouldFail?: boolean; failureError?: Error }) {
    this.shouldFail = options?.shouldFail || false;
    this.failureError = options?.failureError || new Error('Mock API error');
    this.modelInstance = new MockGenerativeModel({
      shouldFail: this.shouldFail,
      failureError: this.failureError,
    });
  }

  getGenerativeModel(params: { model: string }): GenerativeModel {
    return this.modelInstance as unknown as GenerativeModel;
  }

  setFailure(shouldFail: boolean, error?: Error): void {
    this.shouldFail = shouldFail;
    if (error) {
      this.failureError = error;
    }
    this.modelInstance.setFailure(shouldFail, error);
  }
}

export function createMockGoogleClient(
  apiKey: string = 'mock-api-key',
  options?: { shouldFail?: boolean; failureError?: Error }
): GoogleGenerativeAI {
  return new MockGoogleGenerativeAI(apiKey, options) as unknown as GoogleGenerativeAI;
}
