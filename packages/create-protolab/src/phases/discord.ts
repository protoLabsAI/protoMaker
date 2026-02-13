import * as fs from 'fs';
import * as path from 'path';
import * as readline from 'readline';

interface DiscordChannel {
  id: string;
  name: string;
  type: number;
  parent_id?: string;
}

interface DiscordWebhook {
  id: string;
  token: string;
  name: string;
  channel_id: string;
}

interface DiscordPhaseStatus {
  success: boolean;
  categoryId?: string;
  channels?: {
    general?: string;
    updates?: string;
    dev?: string;
  };
  webhookId?: string;
  error?: string;
}

interface ProtolabConfig {
  name?: string;
  version?: string;
  protolab?: {
    enabled?: boolean;
  };
  discord?: {
    categoryId?: string;
    channels?: {
      general?: string;
      updates?: string;
      dev?: string;
    };
    webhookId?: string;
  };
  settings?: any;
}

// Rate limit handling with exponential backoff
async function fetchWithRetry(
  url: string,
  options: RequestInit,
  maxRetries: number = 5
): Promise<Response> {
  let attempt = 0;

  while (attempt < maxRetries) {
    const response = await fetch(url, options);

    if (response.status === 429) {
      // Rate limited - extract retry-after header
      const retryAfter = response.headers.get('retry-after');
      const waitTime = retryAfter ? parseInt(retryAfter) * 1000 : Math.pow(2, attempt) * 1000; // Exponential backoff

      console.warn(`Rate limited. Retrying after ${waitTime}ms...`);
      await new Promise((resolve) => setTimeout(resolve, waitTime));
      attempt++;
      continue;
    }

    return response;
  }

  throw new Error('Max retries exceeded due to rate limiting');
}

// Prompt for user input
function prompt(question: string): Promise<string> {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      rl.close();
      resolve(answer.trim());
    });
  });
}

// Create Discord category channel
async function createCategory(
  botToken: string,
  guildId: string,
  categoryName: string = 'Protolab'
): Promise<string> {
  const url = `https://discord.com/api/v10/guilds/${guildId}/channels`;

  const response = await fetchWithRetry(url, {
    method: 'POST',
    headers: {
      Authorization: `Bot ${botToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      name: categoryName,
      type: 4, // Category channel type
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Failed to create category: ${response.status} ${error}`);
  }

  const category = (await response.json()) as DiscordChannel;
  return category.id;
}

// Create text channel under category
async function createTextChannel(
  botToken: string,
  guildId: string,
  channelName: string,
  categoryId: string
): Promise<string> {
  const url = `https://discord.com/api/v10/guilds/${guildId}/channels`;

  const response = await fetchWithRetry(url, {
    method: 'POST',
    headers: {
      Authorization: `Bot ${botToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      name: channelName,
      type: 0, // Text channel type
      parent_id: categoryId,
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Failed to create channel ${channelName}: ${response.status} ${error}`);
  }

  const channel = (await response.json()) as DiscordChannel;
  return channel.id;
}

// Create webhook for a channel
async function createWebhook(
  botToken: string,
  channelId: string,
  webhookName: string = 'Protolab Updates'
): Promise<string> {
  const url = `https://discord.com/api/v10/channels/${channelId}/webhooks`;

  const response = await fetchWithRetry(url, {
    method: 'POST',
    headers: {
      Authorization: `Bot ${botToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      name: webhookName,
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Failed to create webhook: ${response.status} ${error}`);
  }

  const webhook = (await response.json()) as DiscordWebhook;
  return webhook.id;
}

// Read protolab.config file
function readProtolabConfig(configPath: string = './protolab.config'): ProtolabConfig {
  try {
    const configContent = fs.readFileSync(configPath, 'utf-8');
    return JSON.parse(configContent);
  } catch (error) {
    console.warn('Could not read protolab.config, using empty config');
    return {};
  }
}

// Write to protolab.config file
function writeProtolabConfig(
  config: ProtolabConfig,
  configPath: string = './protolab.config'
): void {
  fs.writeFileSync(configPath, JSON.stringify(config, null, 2), 'utf-8');
}

// Main Discord phase execution
export async function executeDiscordPhase(guildIdFlag?: string): Promise<DiscordPhaseStatus> {
  try {
    // Check for DISCORD_BOT_TOKEN environment variable
    const botToken = process.env.DISCORD_BOT_TOKEN;

    if (!botToken) {
      console.warn('⚠️  DISCORD_BOT_TOKEN environment variable not found. Skipping Discord setup.');
      return {
        success: false,
        error: 'DISCORD_BOT_TOKEN not found',
      };
    }

    // Get guild ID from flag or prompt
    let guildId = guildIdFlag;
    if (!guildId) {
      guildId = await prompt('Enter Discord Guild (Server) ID: ');
    }

    if (!guildId) {
      return {
        success: false,
        error: 'Guild ID is required',
      };
    }

    console.log('🚀 Creating Discord channels...');

    // Step 1: Create category
    console.log('Creating category...');
    const categoryId = await createCategory(botToken, guildId);
    console.log(`✅ Category created: ${categoryId}`);

    // Step 2: Create three text channels
    console.log('Creating text channels...');
    const generalId = await createTextChannel(botToken, guildId, 'general', categoryId);
    console.log(`✅ General channel created: ${generalId}`);

    const updatesId = await createTextChannel(botToken, guildId, 'updates', categoryId);
    console.log(`✅ Updates channel created: ${updatesId}`);

    const devId = await createTextChannel(botToken, guildId, 'dev', categoryId);
    console.log(`✅ Dev channel created: ${devId}`);

    // Step 3: Create webhook for updates channel
    console.log('Creating webhook...');
    const webhookId = await createWebhook(botToken, updatesId);
    console.log(`✅ Webhook created: ${webhookId}`);

    // Step 4: Write to protolab.config
    console.log('Updating protolab.config...');
    const config = readProtolabConfig();
    config.discord = {
      categoryId,
      channels: {
        general: generalId,
        updates: updatesId,
        dev: devId,
      },
      webhookId,
    };
    writeProtolabConfig(config);
    console.log('✅ Configuration updated');

    return {
      success: true,
      categoryId,
      channels: {
        general: generalId,
        updates: updatesId,
        dev: devId,
      },
      webhookId,
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error('❌ Discord setup failed:', errorMessage);

    return {
      success: false,
      error: errorMessage,
    };
  }
}

// Export for CLI usage
export default executeDiscordPhase;
