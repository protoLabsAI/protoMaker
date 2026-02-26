#!/usr/bin/env node
/**
 * evaluate-session.js — Claude Code Stop hook
 *
 * Reads session data from stdin, extracts actionable patterns from the
 * transcript (tools used, files modified, errors, insights), and creates
 * Automaker board features (which sync to Linear via syncOnFeatureCreate)
 * for patterns above the confidence threshold.
 *
 * Pattern types:
 *   bug         — Defects discovered or worked around during the session
 *   improvement — Code quality / performance / UX opportunities observed
 *   gotcha      — Non-obvious behaviours that tripped up the agent
 *   automation  — Repetitive manual steps worth automating
 *
 * Configuration (env vars):
 *   AUTOMAKER_API_URL  — Server base URL (default: http://localhost:3008)
 *   AUTOMAKER_API_KEY  — API key for authenticating with the server
 *
 * Issues are created only when:
 *   1. Pattern confidence >= 0.6
 *   2. No existing open feature has a sufficiently similar title (de-dup)
 *   3. Linear integration is enabled in .automaker/settings.json
 *
 * Always exits 0 — never blocks the session from stopping.
 */

'use strict';

const fs = require('fs');
const path = require('path');
const http = require('http');
const https = require('https');

// ─── Constants ───────────────────────────────────────────────────────────────

const CONFIDENCE_THRESHOLD = 0.6;
const SESSION_EVAL_SOURCE = 'session-eval';
const REQUEST_TIMEOUT_MS = 8000;

// ─── Settings ────────────────────────────────────────────────────────────────

function readAutomakerSettings(cwd) {
  try {
    const settingsPath = path.join(cwd, '.automaker', 'settings.json');
    return JSON.parse(fs.readFileSync(settingsPath, 'utf8'));
  } catch {
    return {};
  }
}

// ─── Pattern extraction ───────────────────────────────────────────────────────

/**
 * Walk the transcript and collect tool names, modified files, error text,
 * and all assistant prose into a single analysis object.
 */
function parseTranscript(transcript) {
  const toolsUsed = new Set();
  const filesModified = new Set();
  const errorSnippets = [];
  const assistantLines = [];

  for (const msg of transcript) {
    if (!msg || typeof msg !== 'object') continue;

    if (msg.role === 'assistant') {
      const content = msg.content;
      if (typeof content === 'string') {
        assistantLines.push(content);
      } else if (Array.isArray(content)) {
        for (const block of content) {
          if (!block || typeof block !== 'object') continue;
          if (block.type === 'text') {
            assistantLines.push(block.text || '');
          } else if (block.type === 'tool_use') {
            const name = block.name || '';
            toolsUsed.add(name);
            if ((name === 'Edit' || name === 'Write') && block.input?.file_path) {
              filesModified.add(block.input.file_path);
            }
          }
        }
      }
    }

    // Capture tool error results
    if (msg.role === 'user' && Array.isArray(msg.content)) {
      for (const block of msg.content) {
        if (block?.type === 'tool_result' && block.is_error) {
          const text =
            typeof block.content === 'string'
              ? block.content
              : Array.isArray(block.content)
                ? block.content.map((c) => c?.text || '').join(' ')
                : '';
          if (text) errorSnippets.push(text.slice(0, 300));
        }
      }
    }
  }

  return {
    toolsUsed: [...toolsUsed],
    filesModified: [...filesModified],
    errorSnippets,
    fullText: assistantLines.join('\n').toLowerCase(),
  };
}

/**
 * Score a set of regex patterns against text.
 * Returns a confidence value between 0 and 1.
 */
function scoreText(patternDefs, text) {
  if (!text) return 0;
  let total = 0;
  for (const { regex, weight } of patternDefs) {
    const matches = text.match(regex);
    if (matches) {
      // Diminishing returns: each additional match adds less
      total += weight * Math.min(matches.length / 3, 1.0);
    }
  }
  return Math.min(total / patternDefs.length, 1.0);
}

/** First line of assistant prose that matches a regex */
function findSnippet(regex, text, maxLen = 200) {
  for (const line of text.split('\n')) {
    if (regex.test(line.toLowerCase())) {
      return line.trim().slice(0, maxLen);
    }
  }
  return '';
}

/**
 * Extract actionable patterns from the parsed session context.
 * Returns an array of pattern objects ready for issue creation.
 */
function extractPatterns(ctx, sessionId) {
  const { toolsUsed, filesModified, errorSnippets, fullText } = ctx;
  const patterns = [];

  // Label context for the issue title (key file names)
  const mainFiles = filesModified
    .slice(0, 3)
    .map((f) => path.basename(f))
    .join(', ');
  const fileCtx = mainFiles ? ` (${mainFiles})` : '';

  // ─ Bug ──────────────────────────────────────────────────────────────────
  const bugDefs = [
    {
      regex:
        /\b(bug|broken|crash(?:es|ed)?|fail(?:s|ed|ing)?|exception|race condition|memory leak)\b/gi,
      weight: 1.0,
    },
    { regex: /\b(fix(?:ed|ing)?|patch(?:ed|ing)?|workaround|hotfix)\b/gi, weight: 0.8 },
    { regex: /\b(unexpected|incorrect|wrong(?:ly)?|shouldn'?t)\b/gi, weight: 0.7 },
  ];
  const bugConf = Math.min(
    scoreText(bugDefs, fullText) + (errorSnippets.length > 0 ? 0.25 : 0),
    1.0
  );
  if (bugConf >= CONFIDENCE_THRESHOLD) {
    const snippet = findSnippet(/\b(bug|error|broken|fix|crash)\b/, fullText);
    patterns.push({
      type: 'bug',
      title: `[session-eval] Bug pattern detected${fileCtx}`,
      description: buildDescription('bug', snippet, errorSnippets, sessionId, ctx),
      confidence: bugConf,
      priority: 3,
    });
  }

  // ─ Improvement ──────────────────────────────────────────────────────────
  const improveDefs = [
    {
      regex: /\b(improve|optimiz(?:e|ed|ing)|refactor(?:ed|ing)?|enhance|performance)\b/gi,
      weight: 1.0,
    },
    { regex: /\b(technical debt|code smell|duplicate|repetit(?:ive|ion))\b/gi, weight: 0.9 },
    { regex: /\b(could be|should be|better if|consider|opportunity)\b/gi, weight: 0.6 },
  ];
  const improveConf = scoreText(improveDefs, fullText);
  if (improveConf >= CONFIDENCE_THRESHOLD) {
    const snippet = findSnippet(/\b(improve|optimiz|refactor|enhance)\b/, fullText);
    patterns.push({
      type: 'improvement',
      title: `[session-eval] Improvement opportunity${fileCtx}`,
      description: buildDescription('improvement', snippet, [], sessionId, ctx),
      confidence: improveConf,
      priority: 4,
    });
  }

  // ─ Gotcha ────────────────────────────────────────────────────────────────
  const gotchaDefs = [
    { regex: /\b(gotcha|caveat|be aware|watch out|tricky|non.?obvious)\b/gi, weight: 1.0 },
    { regex: /\b(surprising|edge case|corner case|special case|undocumented)\b/gi, weight: 0.85 },
    { regex: /\b(important|note that|careful|don'?t forget)\b/gi, weight: 0.6 },
  ];
  const gotchaConf = scoreText(gotchaDefs, fullText);
  if (gotchaConf >= CONFIDENCE_THRESHOLD) {
    const snippet = findSnippet(/\b(gotcha|caveat|careful|important)\b/, fullText);
    patterns.push({
      type: 'gotcha',
      title: `[session-eval] Gotcha noted${fileCtx}`,
      description: buildDescription('gotcha', snippet, [], sessionId, ctx),
      confidence: gotchaConf,
      priority: 3,
    });
  }

  // ─ Automation ───────────────────────────────────────────────────────────
  const automationDefs = [
    { regex: /\b(automat(?:e|ed|ing)|scripted?|workflow)\b/gi, weight: 1.0 },
    { regex: /\b(manual(?:ly)?|repetitive|every time|always need to)\b/gi, weight: 0.85 },
    { regex: /\b(should be automated|worth automating|streamline)\b/gi, weight: 0.9 },
  ];
  const automationConf = scoreText(automationDefs, fullText);
  if (automationConf >= CONFIDENCE_THRESHOLD) {
    const snippet = findSnippet(/\b(automat|manual|workflow)\b/, fullText);
    patterns.push({
      type: 'automation',
      title: `[session-eval] Automation opportunity${fileCtx}`,
      description: buildDescription('automation', snippet, [], sessionId, ctx),
      confidence: automationConf,
      priority: 4,
    });
  }

  return patterns;
}

function buildDescription(type, snippet, errors, sessionId, ctx) {
  const typeLabel = type.charAt(0).toUpperCase() + type.slice(1);
  const lines = [
    `## ${typeLabel} Pattern (Session Eval)`,
    '',
    `**Session ID:** \`${sessionId}\``,
    `**Session length:** ${ctx.sessionLength} turns`,
    `**Tools used:** ${ctx.toolsUsed.length > 0 ? ctx.toolsUsed.join(', ') : 'none'}`,
    `**Files modified:** ${ctx.filesModified.length > 0 ? ctx.filesModified.join(', ') : 'none'}`,
    '',
    `**Source:** \`${SESSION_EVAL_SOURCE}\` — auto-detected from agent session transcript`,
    '',
  ];

  if (snippet) {
    lines.push('**Pattern context:**');
    lines.push(`> ${snippet}`);
    lines.push('');
  }

  if (errors.length > 0) {
    lines.push('**Errors encountered:**');
    for (const err of errors.slice(0, 3)) {
      lines.push(`- \`${err.slice(0, 120)}\``);
    }
    lines.push('');
  }

  lines.push('---');
  lines.push(
    '*Auto-created by `evaluate-session.js` hook. Review, adjust title, and assign as needed.*'
  );

  return lines.join('\n');
}

// ─── De-duplication ──────────────────────────────────────────────────────────

function normalise(title) {
  return title
    .toLowerCase()
    .replace(/\[session-eval\]\s*/g, '')
    .replace(/[^a-z0-9\s]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function isDuplicate(candidateTitle, existingTitles) {
  const candidate = normalise(candidateTitle);
  for (const existing of existingTitles) {
    const norm = normalise(existing);
    if (!norm) continue;
    // Exact normalised match
    if (candidate === norm) return true;
    // Jaccard similarity >= 0.7
    const words1 = new Set(candidate.split(' '));
    const words2 = new Set(norm.split(' '));
    const intersection = [...words1].filter((w) => words2.has(w)).length;
    const union = new Set([...words1, ...words2]).size;
    if (union > 0 && intersection / union >= 0.7) return true;
  }
  return false;
}

// ─── HTTP helpers ─────────────────────────────────────────────────────────────

function postJSON(url, body, headers) {
  return new Promise((resolve, reject) => {
    const parsed = new URL(url);
    const lib = parsed.protocol === 'https:' ? https : http;
    const raw = JSON.stringify(body);

    const req = lib.request(
      {
        hostname: parsed.hostname,
        port: parsed.port || (parsed.protocol === 'https:' ? 443 : 80),
        path: parsed.pathname + parsed.search,
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(raw),
          ...headers,
        },
      },
      (res) => {
        let data = '';
        res.on('data', (chunk) => (data += chunk));
        res.on('end', () => {
          try {
            resolve({ status: res.statusCode, body: JSON.parse(data) });
          } catch {
            resolve({ status: res.statusCode, body: data });
          }
        });
      }
    );

    req.setTimeout(REQUEST_TIMEOUT_MS, () => req.destroy(new Error('timeout')));
    req.on('error', reject);
    req.write(raw);
    req.end();
  });
}

async function listFeatures(apiUrl, apiKey, projectPath) {
  try {
    const res = await postJSON(
      `${apiUrl}/api/features/list`,
      { projectPath },
      { 'X-API-Key': apiKey }
    );
    return Array.isArray(res.body?.features) ? res.body.features : [];
  } catch {
    return [];
  }
}

async function createFeature(apiUrl, apiKey, projectPath, pattern) {
  try {
    const res = await postJSON(
      `${apiUrl}/api/features/create`,
      {
        projectPath,
        feature: {
          title: pattern.title,
          description: pattern.description,
          status: 'backlog',
          complexity: 'small',
          source: 'api',
        },
      },
      { 'X-API-Key': apiKey }
    );
    return res.status === 200 || res.status === 201 ? res.body : null;
  } catch {
    return null;
  }
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  // Read stdin (non-blocking — if nothing arrives in time, we just exit)
  let raw = '';
  try {
    process.stdin.setEncoding('utf8');
    for await (const chunk of process.stdin) {
      raw += chunk;
    }
  } catch {
    process.exit(0);
  }

  if (!raw.trim()) process.exit(0);

  let hookInput;
  try {
    hookInput = JSON.parse(raw);
  } catch {
    process.exit(0);
  }

  const cwd = process.cwd();
  const settings = readAutomakerSettings(cwd);

  // Skip entirely if Linear integration is disabled
  if (!settings?.integrations?.linear?.enabled) {
    process.exit(0);
  }

  const apiUrl = process.env.AUTOMAKER_API_URL || 'http://localhost:3008';
  const apiKey = process.env.AUTOMAKER_API_KEY || '';
  const projectPath = cwd;

  // Build session context
  const transcript = hookInput.transcript || hookInput.messages || [];
  const sessionId = hookInput.session_id || 'unknown';
  const ctx = {
    ...parseTranscript(transcript),
    sessionLength: Array.isArray(transcript) ? transcript.length : 0,
  };

  const patterns = extractPatterns(ctx, sessionId);
  if (patterns.length === 0) process.exit(0);

  // Load existing open features for de-duplication
  const existing = await listFeatures(apiUrl, apiKey, projectPath);
  const openTitles = existing
    .filter((f) => f.status !== 'done' && f.status !== 'verified')
    .map((f) => f.title || '');

  // Create issues for confident, non-duplicate patterns
  for (const pattern of patterns) {
    if (pattern.confidence < CONFIDENCE_THRESHOLD) continue;

    if (isDuplicate(pattern.title, openTitles)) {
      process.stderr.write(`[session-eval] Skipping duplicate: ${pattern.title}\n`);
      continue;
    }

    const result = await createFeature(apiUrl, apiKey, projectPath, pattern);
    if (result) {
      process.stdout.write(
        `[session-eval] Created: ${pattern.title} (${pattern.type}, confidence=${pattern.confidence.toFixed(2)})\n`
      );
    }
  }

  process.exit(0);
}

main().catch(() => process.exit(0));
