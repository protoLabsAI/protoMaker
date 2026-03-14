/**
 * Welcome Note Template
 *
 * Initial notes workspace content for new protoLabs installations.
 */

import type { WelcomeNoteOptions } from './types.js';

/**
 * Get the welcome note content for a new project.
 */
export function getWelcomeNote({ projectName }: WelcomeNoteOptions): string {
  return `# Welcome to ${projectName}

This project is managed with protoLabs Studio.

## Quick Start

1. Review the board to see your backlog
2. Create features for work you want to accomplish
3. Start auto-mode to let agents process your backlog

## Useful Commands

- \`/board\` — View and manage the Kanban board
- \`/auto-mode\` — Start/stop autonomous feature processing
- \`/setuplab\` — Onboard a new project
- \`/ava\` — Activate your autonomous operator

## Resources

- [protoLabs Documentation](https://docs.protolabs.studio)
- [GitHub Repository](https://github.com/protoLabsAI/protoMaker)
`;
}
