#!/usr/bin/env node
/**
 * Rewrite raw release commits into polished user-facing release notes via Claude API.
 *
 * Requires: ANTHROPIC_API_KEY environment variable
 *
 * Usage:
 *   node scripts/rewrite-release-notes.mjs [version] [previous-version]
 *
 * Examples:
 *   node scripts/rewrite-release-notes.mjs v0.30.1 v0.29.0
 *   node scripts/rewrite-release-notes.mjs          # auto-detects latest + previous tag
 *
 * Flags:
 *   --post-discord   Post the result to #dev via DISCORD_DEV_WEBHOOK
 *   --dry-run        Print the prompt without calling Claude (debug)
 */

import { execSync } from 'node:child_process';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function run(cmd) {
  return execSync(cmd, { encoding: 'utf-8' }).trim();
}

function getTags() {
  const tags = run('git tag --sort=-v:refname').split('\n').filter(Boolean);
  if (tags.length < 2) {
    console.error('Need at least 2 tags to compare. Found:', tags.length);
    process.exit(1);
  }
  return { latest: tags[0], previous: tags[1] };
}

function getCommitsBetween(fromTag, toTag) {
  const log = run(`git log ${fromTag}..${toTag} --pretty=format:"%s"`);
  if (!log) return [];
  return log
    .split('\n')
    .map((line) => line.replace(/^"|"$/g, ''))
    .filter(Boolean);
}

// ---------------------------------------------------------------------------
// Prompt (mirrors libs/prompts/src/release-notes.ts)
// ---------------------------------------------------------------------------

const SYSTEM_PROMPT = `You are a release notes writer for protoLabs Studio, an autonomous AI development platform.

Voice: Technical, direct, pragmatic. Speak to builders. No marketing fluff, no AI hype words ("revolutionizing", "game-changing"), no filler.

Rules:
- Write a short intro sentence (what this release is about in one line)
- Group changes into 2-4 themed sections with bold headers (not raw commit categories — group by what the user cares about)
- Each item: one sentence, present tense, explains the user-facing impact
- Skip internal-only changes (CI config, version bumps, merge commits, chore commits) unless they fix a user-visible problem
- Skip "promote" / "Merge" / "chore: release" commits entirely
- If a commit message is unclear, infer the impact from context or omit it
- End with a one-liner on what's next if the commit history suggests ongoing work
- Keep the total output under 300 words
- Use plain markdown: **bold** for section headers, - for bullets
- No emojis
- Do NOT wrap output in code fences — output the markdown directly`;

function buildPrompt(version, previousVersion, commits) {
  const filtered = commits.filter((c) => {
    const lower = c.toLowerCase();
    return (
      !lower.startsWith('merge ') &&
      !lower.startsWith('chore: release') &&
      !lower.startsWith('promote')
    );
  });

  const commitList = filtered.map((c) => `- ${c}`).join('\n');

  return `Rewrite these raw commit messages into user-facing release notes for ${version} (previous: ${previousVersion}).

Raw commits:
${commitList || '(no meaningful commits — write a brief maintenance release note)'}`;
}

// ---------------------------------------------------------------------------
// Claude API call
// ---------------------------------------------------------------------------

async function callClaude(systemPrompt, userPrompt) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    console.error('ANTHROPIC_API_KEY not set.');
    process.exit(1);
  }

  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 1024,
      system: systemPrompt,
      messages: [{ role: 'user', content: userPrompt }],
    }),
  });

  if (!res.ok) {
    const body = await res.text();
    console.error(`Claude API error: ${res.status} ${body}`);
    process.exit(1);
  }

  const data = await res.json();
  return data.content[0].text;
}

// ---------------------------------------------------------------------------
// Discord posting
// ---------------------------------------------------------------------------

async function postToDiscord(version, notes) {
  const webhook = process.env.DISCORD_DEV_WEBHOOK;
  if (!webhook) {
    console.error('DISCORD_DEV_WEBHOOK not set. Skipping Discord post.');
    return false;
  }

  const releaseUrl = `https://github.com/proto-labs-ai/protoMaker/releases/tag/${version}`;

  // Truncate to Discord embed limit
  const truncated = notes.length > 3900 ? notes.slice(0, 3900) + '\n...' : notes;

  const payload = {
    embeds: [
      {
        title: `${version} Alpha`,
        url: releaseUrl,
        description: truncated,
        color: 5763719,
      },
    ],
  };

  const res = await fetch(webhook, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    console.error(`Discord webhook failed: ${res.status} ${res.statusText}`);
    return false;
  }

  console.log('Posted to Discord');
  return true;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

const args = process.argv.slice(2);
const flags = args.filter((a) => a.startsWith('--'));
const positional = args.filter((a) => !a.startsWith('--'));

const dryRun = flags.includes('--dry-run');
const postDiscord = flags.includes('--post-discord');

// Resolve versions
let version, previousVersion;
if (positional.length >= 2) {
  version = positional[0];
  previousVersion = positional[1];
} else {
  const tags = getTags();
  version = positional[0] || tags.latest;
  previousVersion = positional[1] || tags.previous;
}

console.log(`Generating release notes: ${previousVersion} -> ${version}`);

const commits = getCommitsBetween(previousVersion, version);
console.log(`Found ${commits.length} commits\n`);

const userPrompt = buildPrompt(version, previousVersion, commits);

if (dryRun) {
  console.log('=== SYSTEM PROMPT ===');
  console.log(SYSTEM_PROMPT);
  console.log('\n=== USER PROMPT ===');
  console.log(userPrompt);
  process.exit(0);
}

console.log('Calling Claude API (haiku)...\n');
const notes = await callClaude(SYSTEM_PROMPT, userPrompt);

console.log('=== RELEASE NOTES ===');
console.log(notes);
console.log('=====================\n');

if (postDiscord) {
  await postToDiscord(version, notes);
}
