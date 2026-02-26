#!/usr/bin/env node
// Hook: evaluate-session.js
// Event: SessionEnd
// Purpose: Read session transcript, count exchanges, and if >= 10, prompt Claude
//          to evaluate for extractable patterns (tools used, files modified, insights).

import { readFileSync } from 'fs';

async function main() {
  // Read stdin to get hook input JSON
  let stdinData = '';
  try {
    for await (const chunk of process.stdin) {
      stdinData += chunk;
    }
  } catch {
    process.exit(0);
  }

  // Parse hook input — must contain transcript_path
  let hookInput;
  try {
    hookInput = JSON.parse(stdinData);
  } catch {
    process.exit(0);
  }

  const transcriptPath = hookInput?.transcript_path;
  if (!transcriptPath) {
    process.exit(0);
  }

  // Gracefully handle missing or unreadable transcript
  let lines;
  try {
    const content = readFileSync(transcriptPath, 'utf8');
    lines = content.split('\n').filter((l) => l.trim().length > 0);
  } catch {
    process.exit(0);
  }

  let userMessageCount = 0;
  const toolsUsed = new Set();
  const filesModified = new Set();

  for (const line of lines) {
    let entry;
    try {
      entry = JSON.parse(line);
    } catch {
      continue; // skip malformed lines
    }

    // Handle both JSONL formats:
    //   Format A: entry.role / entry.content[]
    //   Format B: entry.message.role / entry.message.content[]
    const role = entry.role ?? entry.message?.role;
    const contentArray = entry.content ?? entry.message?.content;

    if (role === 'user') {
      userMessageCount++;
    }

    // Extract tool usage from assistant content blocks
    if (Array.isArray(contentArray)) {
      for (const block of contentArray) {
        if (!block || block.type !== 'tool_use') continue;

        if (block.name) {
          toolsUsed.add(block.name);
        }

        // Capture files modified via Edit or Write tool calls
        if (block.name === 'Edit' || block.name === 'Write') {
          const filePath = block.input?.file_path;
          if (filePath) {
            filesModified.add(filePath);
          }
        }
      }
    }
  }

  // Only emit signal when the session had enough exchanges to be worth evaluating
  if (userMessageCount >= 10) {
    const toolsList = toolsUsed.size > 0 ? [...toolsUsed].join(', ') : 'none recorded';
    const filesList = filesModified.size > 0 ? [...filesModified].join(', ') : 'none recorded';

    process.stdout.write(
      `Session had ${userMessageCount} exchanges. Consider evaluating for extractable patterns: what worked, what failed, edge cases found. Save insights to .automaker/memory/patterns.md or gotchas.md.\n` +
        `Tools used: ${toolsList}\n` +
        `Files modified: ${filesList}\n`
    );
  }

  process.exit(0);
}

main().catch(() => process.exit(0));
