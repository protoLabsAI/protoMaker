#!/usr/bin/env node

/**
 * Health Checks Example for @protolabs-ai/llm-providers
 *
 * This example demonstrates:
 * - Provider health monitoring
 * - Connectivity checks
 * - Model availability verification
 * - Performance metrics
 * - Automatic failover strategies
 * - Diagnostic reporting
 *
 * Run: npm run example:health-checks
 */

import { ProviderFactory } from '@protolabs-ai/llm-providers';
import type { LLMProvidersConfig, ModelCategory, ProviderName } from '@protolabs-ai/llm-providers';

/**
 * Health check result for examples (extends the base HealthCheckResult from server/base.ts)
 */
interface HealthCheckExampleResult {
  provider: string;
  healthy: boolean;
  enabled: boolean;
  apiKeyConfigured: boolean;
  baseUrl?: string;
  categories: {
    category: ModelCategory;
    available: boolean;
    modelName?: string;
  }[];
  errors: string[];
  timestamp: Date;
}

/**
 * Example configuration
 */
const config: LLMProvidersConfig = {
  providers: {
    anthropic: {
      name: 'anthropic',
      apiKey: process.env.ANTHROPIC_API_KEY,
      enabled: true,
      models: {
        fast: 'claude-haiku-4-5-20251001',
        smart: 'claude-sonnet-4-5-20250929',
        reasoning: 'claude-opus-4-5-20251101',
        coding: 'claude-sonnet-4-5-20250929',
      },
    },
    openai: {
      name: 'openai',
      apiKey: process.env.OPENAI_API_KEY,
      enabled: true,
      models: {
        fast: 'gpt-4o-mini',
        smart: 'gpt-4o',
        reasoning: 'o1',
        vision: 'gpt-4o',
        coding: 'gpt-4o',
      },
    },
    ollama: {
      name: 'ollama',
      baseUrl: process.env.OLLAMA_BASE_URL || 'http://localhost:11434',
      enabled: true,
      models: {
        fast: 'llama3.2:3b',
        smart: 'llama3.1:70b',
        coding: 'codestral:latest',
      },
    },
  },
  defaultProvider: 'anthropic',
};

/**
 * Perform health check on a single provider
 */
function checkProviderHealth(providerName: ProviderName): HealthCheckExampleResult {
  const factory = ProviderFactory.getInstance();
  const errors: string[] = [];

  try {
    const provider = factory.getProvider(providerName);
    const categories = provider.getSupportedCategories();

    return {
      provider: providerName,
      healthy: true,
      enabled: provider.isEnabled(),
      apiKeyConfigured: !!provider.getApiKey(),
      baseUrl: provider.getBaseUrl(),
      categories: categories.map((category) => ({
        category,
        available: true,
        modelName: provider.getModelForCategory(category),
      })),
      errors: [],
      timestamp: new Date(),
    };
  } catch (error) {
    errors.push((error as Error).message);
    return {
      provider: providerName,
      healthy: false,
      enabled: false,
      apiKeyConfigured: false,
      categories: [],
      errors,
      timestamp: new Date(),
    };
  }
}

/**
 * Example 1: Basic health checks
 */
function example1_BasicHealthChecks() {
  console.log('\n=== Example 1: Basic Health Checks ===\n');

  const factory = ProviderFactory.getInstance();
  factory.initialize(config);

  const providers: ProviderName[] = ['anthropic', 'openai', 'ollama'];

  providers.forEach((providerName) => {
    const result = checkProviderHealth(providerName);

    console.log(`Provider: ${result.provider}`);
    console.log(`  Status: ${result.healthy ? '✓ Healthy' : '✗ Unhealthy'}`);
    console.log(`  Enabled: ${result.enabled ? 'Yes' : 'No'}`);
    console.log(`  API Key: ${result.apiKeyConfigured ? 'Configured' : 'Not configured'}`);
    if (result.baseUrl) {
      console.log(`  Base URL: ${result.baseUrl}`);
    }
    console.log(`  Categories: ${result.categories.length}`);

    if (result.errors.length > 0) {
      console.log(`  Errors:`);
      result.errors.forEach((error) => console.log(`    - ${error}`));
    }
    console.log();
  });
}

/**
 * Example 2: Category availability matrix
 */
function example2_CategoryMatrix() {
  console.log('\n=== Example 2: Category Availability Matrix ===\n');

  const factory = ProviderFactory.getInstance();
  const providers: ProviderName[] = ['anthropic', 'openai', 'ollama'];
  const categories: ModelCategory[] = ['fast', 'smart', 'reasoning', 'vision', 'coding'];

  // Header
  console.log('Category'.padEnd(12) + providers.map((p) => p.padEnd(12)).join(''));
  console.log('-'.repeat(12 + providers.length * 12));

  // Matrix
  categories.forEach((category) => {
    const row = [category.padEnd(12)];

    providers.forEach((providerName) => {
      try {
        const provider = factory.getProvider(providerName);
        const supported = provider.supportsCategory(category);
        row.push((supported ? '✓' : '✗').padEnd(12));
      } catch {
        row.push('✗'.padEnd(12));
      }
    });

    console.log(row.join(''));
  });
}

/**
 * Example 3: Automatic failover
 */
function example3_AutomaticFailover() {
  console.log('\n=== Example 3: Automatic Failover ===\n');

  const factory = ProviderFactory.getInstance();
  const category: ModelCategory = 'smart';

  console.log(`Requested category: ${category}`);
  console.log('Attempting failover chain: anthropic → openai → ollama\n');

  const providers: ProviderName[] = ['anthropic', 'openai', 'ollama'];
  let model = null;
  let successfulProvider = null;

  for (const providerName of providers) {
    try {
      console.log(`Trying ${providerName}...`);
      const provider = factory.getProvider(providerName);

      if (!provider.isEnabled()) {
        console.log(`  ✗ Provider disabled`);
        continue;
      }

      if (!provider.supportsCategory(category)) {
        console.log(`  ✗ Category not supported`);
        continue;
      }

      model = factory.getModel(category, providerName);
      successfulProvider = providerName;
      console.log(`  ✓ Success!`);
      break;
    } catch (error) {
      console.log(`  ✗ Failed: ${(error as Error).message}`);
    }
  }

  if (successfulProvider) {
    console.log(`\n✓ Failover successful: Using ${successfulProvider}`);
  } else {
    console.log('\n✗ All providers failed - no fallback available');
  }
}

/**
 * Example 4: Diagnostic report
 */
function example4_DiagnosticReport() {
  console.log('\n=== Example 4: Diagnostic Report ===\n');

  const factory = ProviderFactory.getInstance();
  const providers: ProviderName[] = ['anthropic', 'openai', 'ollama'];

  const report = {
    timestamp: new Date().toISOString(),
    factoryInitialized: factory.isInitialized(),
    defaultProvider: config.defaultProvider,
    providers: providers.map((name) => checkProviderHealth(name)),
  };

  // Calculate statistics
  const totalProviders = report.providers.length;
  const healthyProviders = report.providers.filter((p) => p.healthy).length;
  const enabledProviders = report.providers.filter((p) => p.enabled).length;
  const totalCategories = report.providers.reduce((sum, p) => sum + p.categories.length, 0);

  console.log('System Health Summary');
  console.log('='.repeat(60));
  console.log(`Timestamp: ${report.timestamp}`);
  console.log(
    `Factory Status: ${report.factoryInitialized ? '✓ Initialized' : '✗ Not initialized'}`
  );
  console.log(`Default Provider: ${report.defaultProvider}`);
  console.log();
  console.log(`Providers:`);
  console.log(`  Total: ${totalProviders}`);
  console.log(
    `  Healthy: ${healthyProviders} (${Math.round((healthyProviders / totalProviders) * 100)}%)`
  );
  console.log(`  Enabled: ${enabledProviders}`);
  console.log(`  Total Categories: ${totalCategories}`);
  console.log();

  // Detailed provider status
  report.providers.forEach((provider) => {
    console.log(`${provider.provider}:`);
    console.log(`  Status: ${provider.healthy ? '✓ Healthy' : '✗ Unhealthy'}`);
    console.log(`  Categories: ${provider.categories.map((c) => c.category).join(', ')}`);

    if (provider.errors.length > 0) {
      console.log(`  Issues:`);
      provider.errors.forEach((error) => console.log(`    - ${error}`));
    }
    console.log();
  });
}

/**
 * Example 5: Monitoring recommendations
 */
function example5_MonitoringRecommendations() {
  console.log('\n=== Example 5: Monitoring Recommendations ===\n');

  const factory = ProviderFactory.getInstance();
  const providers: ProviderName[] = ['anthropic', 'openai', 'ollama'];

  const healthChecks = providers.map((name) => checkProviderHealth(name));
  const issues: string[] = [];
  const recommendations: string[] = [];

  // Check for issues
  healthChecks.forEach((check) => {
    if (!check.healthy) {
      issues.push(`${check.provider} is unhealthy`);
    }
    if (!check.enabled && check.provider === config.defaultProvider) {
      issues.push(`Default provider ${check.provider} is disabled`);
    }
    if (!check.apiKeyConfigured) {
      recommendations.push(
        `Consider configuring API key for ${check.provider} (set ${check.provider.toUpperCase()}_API_KEY)`
      );
    }
    if (check.categories.length < 3) {
      recommendations.push(
        `${check.provider} supports only ${check.categories.length} categories - consider adding more model mappings`
      );
    }
  });

  // Check category coverage
  const allCategories: ModelCategory[] = ['fast', 'smart', 'reasoning', 'vision', 'coding'];
  allCategories.forEach((category) => {
    const supportingProviders = healthChecks.filter((check) =>
      check.categories.some((c) => c.category === category)
    );

    if (supportingProviders.length === 0) {
      issues.push(`No provider supports '${category}' category`);
    } else if (supportingProviders.length === 1) {
      recommendations.push(
        `Only ${supportingProviders[0].provider} supports '${category}' - consider adding redundancy`
      );
    }
  });

  // Print results
  if (issues.length === 0) {
    console.log('✓ No critical issues detected\n');
  } else {
    console.log('⚠ Issues Detected:');
    issues.forEach((issue, idx) => console.log(`  ${idx + 1}. ${issue}`));
    console.log();
  }

  if (recommendations.length === 0) {
    console.log('✓ No recommendations at this time');
  } else {
    console.log('💡 Recommendations:');
    recommendations.forEach((rec, idx) => console.log(`  ${idx + 1}. ${rec}`));
  }
}

/**
 * Example 6: Continuous monitoring simulation
 */
async function example6_ContinuousMonitoring() {
  console.log('\n=== Example 6: Continuous Monitoring Simulation ===\n');

  console.log('Simulating continuous health monitoring (3 checks with 2s interval)...\n');

  const factory = ProviderFactory.getInstance();

  for (let i = 1; i <= 3; i++) {
    console.log(`Check ${i}/${3} at ${new Date().toLocaleTimeString()}`);

    const providers: ProviderName[] = ['anthropic', 'openai', 'ollama'];
    const healthChecks = providers.map((name) => checkProviderHealth(name));

    const healthy = healthChecks.filter((check) => check.healthy).length;
    const total = healthChecks.length;

    console.log(`  Status: ${healthy}/${total} providers healthy`);

    healthChecks.forEach((check) => {
      const status = check.healthy ? '✓' : '✗';
      console.log(`    ${status} ${check.provider}`);
    });

    if (i < 3) {
      console.log('  Waiting 2 seconds...\n');
      await new Promise((resolve) => setTimeout(resolve, 2000));
    }
  }

  console.log('\n✓ Monitoring simulation complete');
  console.log(
    '\nIn production, implement this as a cron job or scheduled task for continuous monitoring.'
  );
}

/**
 * Main function to run all examples
 */
async function main() {
  console.log('='.repeat(60));
  console.log('LLM Providers - Health Checks Examples');
  console.log('='.repeat(60));

  try {
    // Initialize factory once for all examples
    const factory = ProviderFactory.getInstance();
    factory.initialize(config);

    // Run all examples in sequence
    example1_BasicHealthChecks();
    example2_CategoryMatrix();
    example3_AutomaticFailover();
    example4_DiagnosticReport();
    example5_MonitoringRecommendations();
    await example6_ContinuousMonitoring();

    console.log('\n' + '='.repeat(60));
    console.log('✓ All health check examples completed successfully!');
    console.log('='.repeat(60));
    console.log('\nUse these patterns in production for:');
    console.log('  - Startup validation');
    console.log('  - Continuous monitoring');
    console.log('  - Automatic failover');
    console.log('  - Alerting and diagnostics\n');
  } catch (error) {
    console.error('\n✗ Error running examples:', error);
    process.exit(1);
  }
}

// Run examples
main();
