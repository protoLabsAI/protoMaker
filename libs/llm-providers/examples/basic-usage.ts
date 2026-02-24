#!/usr/bin/env node

/**
 * Basic Usage Example for @protolabs-ai/llm-providers
 *
 * This example demonstrates:
 * - Provider initialization and configuration
 * - Switching between providers
 * - Using model categories (fast, smart, reasoning, vision, coding)
 * - Error handling and fallback behavior
 * - Working without API keys (mock/fallback mode)
 *
 * Run: npm run example:basic-usage
 */

import { ProviderFactory } from '@protolabs-ai/llm-providers';
import type { LLMProvidersConfig, ModelCategory } from '@protolabs-ai/llm-providers';

/**
 * Example configuration with multiple providers
 * In production, load API keys from environment variables
 */
const config: LLMProvidersConfig = {
  providers: {
    anthropic: {
      name: 'anthropic',
      apiKey: process.env.ANTHROPIC_API_KEY, // Optional - works without it
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
      apiKey: process.env.OPENAI_API_KEY, // Optional - works without it
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
 * Example 1: Basic provider initialization
 */
function example1_BasicInitialization() {
  console.log('\n=== Example 1: Basic Initialization ===\n');

  const factory = ProviderFactory.getInstance();
  factory.initialize(config);

  console.log('✓ Factory initialized successfully');
  console.log(`Default provider: ${config.defaultProvider}`);
}

/**
 * Example 2: Using model categories
 */
function example2_ModelCategories() {
  console.log('\n=== Example 2: Using Model Categories ===\n');

  const factory = ProviderFactory.getInstance();

  // Available categories: fast, smart, reasoning, vision, coding
  const categories: ModelCategory[] = ['fast', 'smart', 'reasoning', 'coding'];

  categories.forEach((category) => {
    try {
      const model = factory.getModel(category);
      console.log(`✓ ${category.padEnd(10)} model created successfully`);
    } catch (error) {
      console.log(`✗ ${category.padEnd(10)} not available: ${(error as Error).message}`);
    }
  });
}

/**
 * Example 3: Switching providers
 */
function example3_SwitchingProviders() {
  console.log('\n=== Example 3: Switching Providers ===\n');

  const factory = ProviderFactory.getInstance();

  const providers: Array<'anthropic' | 'openai' | 'ollama'> = ['anthropic', 'openai', 'ollama'];

  providers.forEach((providerName) => {
    try {
      const provider = factory.getProvider(providerName);
      console.log(`\nProvider: ${providerName}`);
      console.log(`  Status: ${provider.isEnabled() ? 'enabled' : 'disabled'}`);
      console.log(`  Supported categories: ${provider.getSupportedCategories().join(', ')}`);

      // Try to get a fast model from this provider
      const model = factory.getModel('fast', providerName);
      console.log(`  ✓ Created fast model`);
    } catch (error) {
      console.log(`  ✗ Error: ${(error as Error).message}`);
    }
  });
}

/**
 * Example 4: Error handling and fallbacks
 */
function example4_ErrorHandling() {
  console.log('\n=== Example 4: Error Handling ===\n');

  const factory = ProviderFactory.getInstance();

  // Try to use a category that might not be supported
  console.log('Attempting to use vision model with fallback logic:');

  const preferredProviders: Array<'openai' | 'anthropic' | 'ollama'> = [
    'openai',
    'anthropic',
    'ollama',
  ];

  let model = null;
  for (const providerName of preferredProviders) {
    try {
      const provider = factory.getProvider(providerName);
      if (provider.supportsCategory('vision')) {
        model = factory.getModel('vision', providerName);
        console.log(`✓ Successfully created vision model with ${providerName}`);
        break;
      } else {
        console.log(`  ${providerName} doesn't support vision, trying next...`);
      }
    } catch (error) {
      console.log(`  ${providerName} failed: ${(error as Error).message}`);
    }
  }

  if (!model) {
    console.log('✗ No provider supports vision category - falling back to smart model');
    model = factory.getModel('smart');
    console.log('✓ Fallback successful');
  }
}

/**
 * Example 5: Provider introspection
 */
function example5_Introspection() {
  console.log('\n=== Example 5: Provider Introspection ===\n');

  const factory = ProviderFactory.getInstance();

  // Get default provider
  const provider = factory.getProvider();
  console.log(`Default Provider: ${provider.getName()}`);
  console.log(`API Key configured: ${provider.getApiKey() ? 'Yes (hidden)' : 'No'}`);
  console.log(`Base URL: ${provider.getBaseUrl() || 'default'}`);

  // Check each category
  console.log('\nCategory Support:');
  const allCategories: ModelCategory[] = ['fast', 'smart', 'reasoning', 'vision', 'coding'];

  allCategories.forEach((category) => {
    const supported = provider.supportsCategory(category);
    const modelName = supported ? provider.getModelForCategory(category) : 'N/A';
    console.log(`  ${category.padEnd(10)}: ${supported ? '✓' : '✗'} ${modelName || ''}`);
  });
}

/**
 * Example 6: Configuration validation
 */
function example6_ConfigValidation() {
  console.log('\n=== Example 6: Configuration Validation ===\n');

  // Example of invalid configuration
  const invalidConfig = {
    providers: {
      anthropic: {
        name: 'anthropic',
        enabled: true,
        models: {}, // Missing required model mappings
      },
    },
    // Missing defaultProvider
  };

  try {
    const factory = ProviderFactory.getInstance();
    ProviderFactory.resetInstance(); // Reset for clean test
    const newFactory = ProviderFactory.getInstance();
    newFactory.initialize(invalidConfig);
    console.log('✗ Should have thrown validation error');
  } catch (error) {
    console.log('✓ Configuration validation caught invalid config:');
    console.log(`  ${(error as Error).message}`);
  }

  // Reinitialize with valid config
  ProviderFactory.resetInstance();
  const factory = ProviderFactory.getInstance();
  factory.initialize(config);
  console.log('✓ Valid configuration restored');
}

/**
 * Main function to run all examples
 */
function main() {
  console.log('='.repeat(60));
  console.log('LLM Providers - Basic Usage Examples');
  console.log('='.repeat(60));

  try {
    // Run all examples in sequence
    example1_BasicInitialization();
    example2_ModelCategories();
    example3_SwitchingProviders();
    example4_ErrorHandling();
    example5_Introspection();
    example6_ConfigValidation();

    console.log('\n' + '='.repeat(60));
    console.log('✓ All examples completed successfully!');
    console.log('='.repeat(60));
    console.log('\nNote: These examples work without API keys using fallback behavior.');
    console.log('For production use, set ANTHROPIC_API_KEY, OPENAI_API_KEY, etc.\n');
  } catch (error) {
    console.error('\n✗ Error running examples:', error);
    process.exit(1);
  }
}

// Run examples
main();
