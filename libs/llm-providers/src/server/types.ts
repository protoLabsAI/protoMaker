export type ModelCategory = 'fast' | 'balanced' | 'quality' | 'reasoning';

export interface ModelCapabilities {
  streaming: boolean;
  functionCalling: boolean;
  vision: boolean;
}

export interface ModelPricing {
  input: number; // per million tokens
  output: number; // per million tokens
}

export interface ModelDefinition {
  id: string;
  name: string;
  provider: string;
  category: ModelCategory;
  contextWindow: number;
  maxOutput: number;
  pricing: ModelPricing;
  capabilities: ModelCapabilities;
}

export interface ProviderHealthStatus {
  provider: string;
  healthy: boolean;
  latency: number;
  error?: string;
  timestamp: Date;
}

export interface LLMProvider {
  name: string;
  supportedCategories: ModelCategory[];
  initialize(config: ProviderConfig): Promise<void>;
  checkHealth(): Promise<ProviderHealthStatus>;
  getModel(alias: string): ModelDefinition | undefined;
  listModels(category?: ModelCategory): ModelDefinition[];
  getSupportedCategories(): ModelCategory[];
}

export interface ProviderConfig {
  apiKey?: string;
  baseURL?: string;
  organization?: string;
  timeout?: number;
  maxRetries?: number;
}

export interface ProviderMetrics {
  requestCount: number;
  errorCount: number;
  lastRequestTime?: Date;
  lastErrorTime?: Date;
  averageLatency?: number;
}

export abstract class BaseProvider implements LLMProvider {
  public readonly name: string;
  public readonly supportedCategories: ModelCategory[];
  protected models: Map<string, ModelDefinition>;
  protected metrics: ProviderMetrics;

  constructor(name: string, supportedCategories: ModelCategory[]) {
    this.name = name;
    this.supportedCategories = supportedCategories;
    this.models = new Map();
    this.metrics = {
      requestCount: 0,
      errorCount: 0,
    };
  }

  abstract initialize(config: ProviderConfig): Promise<void>;
  abstract checkHealth(): Promise<ProviderHealthStatus>;

  getModel(alias: string): ModelDefinition | undefined {
    return this.models.get(alias);
  }

  listModels(category?: ModelCategory): ModelDefinition[] {
    const allModels = Array.from(this.models.values());
    if (!category) {
      return allModels;
    }
    return allModels.filter((model) => model.category === category);
  }

  getSupportedCategories(): ModelCategory[] {
    return this.supportedCategories;
  }

  protected registerModel(alias: string, model: ModelDefinition): void {
    this.models.set(alias, model);
  }

  protected updateMetrics(success: boolean, latency?: number): void {
    this.metrics.requestCount++;
    this.metrics.lastRequestTime = new Date();

    if (!success) {
      this.metrics.errorCount++;
      this.metrics.lastErrorTime = new Date();
    }

    if (latency !== undefined) {
      const currentAvg = this.metrics.averageLatency || 0;
      const count = this.metrics.requestCount;
      this.metrics.averageLatency = (currentAvg * (count - 1) + latency) / count;
    }
  }

  getMetrics(): ProviderMetrics {
    return { ...this.metrics };
  }
}
