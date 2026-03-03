/**
 * Release Notes Rewriter
 *
 * Prompt template for transforming raw conventional commit messages into
 * polished, user-facing release notes suitable for GitHub Releases and
 * Discord announcements.
 *
 * Usage:
 *   import { buildReleaseNotesPrompt } from '@protolabs-ai/prompts';
 *   const prompt = buildReleaseNotesPrompt({ version, previousVersion, commits });
 *   // Feed `systemPrompt` and `prompt` to Claude
 */

export interface ReleaseNotesInput {
  /** Release version tag (e.g. "v0.30.1") */
  version: string;
  /** Previous release tag (e.g. "v0.29.0") */
  previousVersion: string;
  /** Raw conventional commit subject lines between the two tags */
  commits: string[];
}

export const RELEASE_NOTES_SYSTEM_PROMPT = `You are a release notes writer for protoLabs Studio, an autonomous AI development platform.

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

Output format:
\`\`\`
<one-line intro>

**<Section Name>**
- <change description>
- <change description>

**<Section Name>**
- <change description>

<optional: one-line "what's next" note>
\`\`\``;

export function buildReleaseNotesPrompt(input: ReleaseNotesInput): string {
  const commitList = input.commits
    .filter((c) => {
      const lower = c.toLowerCase();
      return (
        !lower.startsWith('merge ') &&
        !lower.startsWith('chore: release') &&
        !lower.startsWith('promote')
      );
    })
    .map((c) => `- ${c}`)
    .join('\n');

  return `Rewrite these raw commit messages into user-facing release notes for ${input.version} (previous: ${input.previousVersion}).

Raw commits:
${commitList || '(no meaningful commits — write a brief maintenance release note)'}`;
}
