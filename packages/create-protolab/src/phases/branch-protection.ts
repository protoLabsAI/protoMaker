import { execSync } from 'child_process';
import { readFileSync, writeFileSync, unlinkSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';

interface BranchProtectionStatus {
  success: boolean;
  rulesetId?: number;
  error?: string;
}

interface BranchProtectionOptions {
  defaultBranch?: string;
  owner?: string;
  repo?: string;
}

/**
 * Checks if gh CLI is available and authenticated
 */
function checkGhCli(): { available: boolean; authenticated: boolean; error?: string } {
  try {
    // Check if gh CLI is installed
    execSync('which gh', { stdio: 'pipe' });
  } catch {
    return { available: false, authenticated: false, error: 'gh CLI not found in PATH' };
  }

  try {
    // Check if gh CLI is authenticated
    execSync('gh auth status', { stdio: 'pipe' });
    return { available: true, authenticated: true };
  } catch {
    return { available: true, authenticated: false, error: 'gh CLI not authenticated' };
  }
}

/**
 * Gets the current repository owner and name
 */
function getRepoInfo(): { owner: string; repo: string } | null {
  try {
    const remoteUrl = execSync('git config --get remote.origin.url', {
      encoding: 'utf-8',
      stdio: 'pipe',
    }).trim();

    // Parse GitHub URL (supports both HTTPS and SSH)
    // HTTPS: https://github.com/owner/repo.git
    // SSH: git@github.com:owner/repo.git
    const httpsMatch = remoteUrl.match(/github\.com[/:]([\w-]+)\/([\w-]+?)(\.git)?$/);
    if (httpsMatch) {
      return { owner: httpsMatch[1], repo: httpsMatch[2] };
    }

    return null;
  } catch {
    return null;
  }
}

/**
 * Interpolates template variables in the ruleset JSON
 */
function interpolateTemplate(templateContent: string, variables: Record<string, string>): string {
  let result = templateContent;
  for (const [key, value] of Object.entries(variables)) {
    const regex = new RegExp(`{{${key}}}`, 'g');
    result = result.replace(regex, value);
  }
  return result;
}

/**
 * Creates a GitHub branch protection ruleset using gh CLI
 */
export async function createBranchProtectionRuleset(
  options: BranchProtectionOptions = {}
): Promise<BranchProtectionStatus> {
  // Step 1: Check gh CLI availability
  const ghStatus = checkGhCli();

  if (!ghStatus.available) {
    console.warn('⚠️  gh CLI not available, skipping branch protection setup');
    console.warn(`   Reason: ${ghStatus.error}`);
    return { success: false, error: ghStatus.error };
  }

  if (!ghStatus.authenticated) {
    console.warn('⚠️  gh CLI not authenticated, skipping branch protection setup');
    console.warn('   Run: gh auth login');
    return { success: false, error: ghStatus.error };
  }

  // Step 2: Get repository information
  const repoInfo =
    options.owner && options.repo ? { owner: options.owner, repo: options.repo } : getRepoInfo();

  if (!repoInfo) {
    const error = 'Could not determine repository owner and name';
    console.warn(`⚠️  ${error}`);
    return { success: false, error };
  }

  // Step 3: Determine default branch
  let defaultBranch = options.defaultBranch || 'main';

  try {
    // Try to get the actual default branch from git
    const branch = execSync('git symbolic-ref refs/remotes/origin/HEAD', {
      encoding: 'utf-8',
      stdio: 'pipe',
    })
      .trim()
      .replace('refs/remotes/origin/', '');

    if (branch) {
      defaultBranch = branch;
    }
  } catch {
    // Fall back to 'main' if we can't determine it
    console.log(`   Using default branch: ${defaultBranch}`);
  }

  // Step 4: Load and interpolate template
  const templatePath = join(process.cwd(), 'templates/cicd/branch-protection/main.json');

  let templateContent: string;
  try {
    templateContent = readFileSync(templatePath, 'utf-8');
  } catch (error) {
    const errorMsg = `Could not read template file: ${templatePath}`;
    console.error(`❌ ${errorMsg}`);
    return { success: false, error: errorMsg };
  }

  const interpolatedContent = interpolateTemplate(templateContent, { defaultBranch });

  // Step 5: Create temporary file for the ruleset
  const tempFile = join(tmpdir(), `ruleset-${Date.now()}.json`);

  try {
    writeFileSync(tempFile, interpolatedContent, 'utf-8');

    // Step 6: Create ruleset via gh CLI
    console.log(`📋 Creating branch protection ruleset for ${repoInfo.owner}/${repoInfo.repo}...`);

    const result = execSync(
      `gh api repos/${repoInfo.owner}/${repoInfo.repo}/rulesets --method POST --input "${tempFile}"`,
      { encoding: 'utf-8', stdio: 'pipe' }
    );

    // Parse the response to get the ruleset ID
    const response = JSON.parse(result);
    const rulesetId = response.id;

    console.log(`✅ Branch protection ruleset created successfully (ID: ${rulesetId})`);

    return { success: true, rulesetId };
  } catch (error: any) {
    // Handle errors gracefully
    const errorMessage = error.stderr?.toString() || error.message || 'Unknown error';

    if (errorMessage.includes('404') || errorMessage.includes('Not Found')) {
      console.warn('⚠️  Repository not found or insufficient permissions');
      return { success: false, error: 'Repository not found or insufficient permissions' };
    }

    if (errorMessage.includes('already exists')) {
      console.log('ℹ️  Branch protection ruleset already exists');
      return { success: false, error: 'Ruleset already exists' };
    }

    console.error('❌ Failed to create branch protection ruleset');
    console.error(`   ${errorMessage}`);
    return { success: false, error: errorMessage };
  } finally {
    // Clean up temporary file
    try {
      unlinkSync(tempFile);
    } catch {
      // Ignore cleanup errors
    }
  }
}

/**
 * Main export for the phase
 */
export default createBranchProtectionRuleset;
