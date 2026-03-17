/**
 * Starter Features
 *
 * Pre-written feature descriptions for each starter kit type.
 * These provide immediate backlog items for new projects.
 */

import type { StarterFeature, StarterKitType } from './types.js';

const UNIVERSAL_FEATURES: StarterFeature[] = [
  {
    title: 'Configure CI pipeline',
    description:
      'Set up GitHub Actions workflows for build, test, format check, and security audit. Ensure all checks run on pull requests and pushes to main.',
    complexity: 'medium',
  },
  {
    title: 'Set up branch protection',
    description:
      'Configure branch protection rules on the main branch. Require status checks (build, test, format), require PR reviews, and prevent force pushes.',
    complexity: 'small',
  },
  {
    title: 'Write project README',
    description:
      'Create a comprehensive README.md with project overview, setup instructions, development workflow, and contribution guidelines.',
    complexity: 'small',
  },
];

const DOCS_FEATURES: StarterFeature[] = [
  {
    title: 'Write your first tutorial',
    description:
      'Create a step-by-step tutorial in getting-started/ that walks a new user through the core workflow. Follow Diataxis tutorial guidelines: linear, guided, guaranteed success.',
    complexity: 'medium',
  },
  {
    title: 'Add a how-to guide',
    description:
      'Write a task-focused how-to guide in guides/. Pick the most common user task and document the steps. No explanation — just actionable steps.',
    complexity: 'small',
  },
  {
    title: 'Configure custom domain',
    description:
      'Set up a custom domain for the documentation site. Update .vitepress/config.mts with the sitemap hostname and configure DNS records.',
    complexity: 'small',
  },
  {
    title: 'Create API reference page',
    description:
      'Add a reference page in reference/ documenting the project API or configuration options. Follow Diataxis reference guidelines: complete, accurate, organized for scanning.',
    complexity: 'medium',
  },
];

const PORTFOLIO_FEATURES: StarterFeature[] = [
  {
    title: 'Customize site identity',
    description:
      'Update src/content/siteConfig/ with your name, bio, social links, and profile photo. Replace the placeholder content throughout the site with real information.',
    complexity: 'small',
  },
  {
    title: 'Add portfolio projects',
    description:
      'Populate src/content/projects/ with your real projects. Each project gets a title, description, tech stack tags, links, and an optional cover image.',
    complexity: 'small',
  },
  {
    title: 'Write blog posts',
    description:
      'Create your first blog posts in src/content/blog/. Posts are MDX and support syntax highlighting, images, and custom components.',
    complexity: 'medium',
  },
  {
    title: 'Configure custom domain',
    description:
      'Set up a custom domain for the portfolio. Update astro.config.mjs with the site URL, configure DNS records, and deploy to Cloudflare Pages.',
    complexity: 'small',
  },
  {
    title: 'Add testimonials',
    description:
      'Collect and add testimonials to src/content/testimonials/. Each testimonial includes a quote, author name, role, and optional avatar.',
    complexity: 'small',
  },
];

const AI_AGENT_APP_FEATURES: StarterFeature[] = [
  {
    title: 'Connect your first tool',
    description:
      'Define a custom tool using `defineSharedTool` in `packages/tools/src/`. Wire it into the server agentic loop and verify it appears in chat. Add a progress label so the UI shows live tool execution status.',
    complexity: 'medium',
  },
  {
    title: 'Add a LangGraph flow',
    description:
      'Create a multi-step LangGraph flow in `packages/flows/src/flows/`. Use `createLinearGraph` or `createBranchingGraph` from the flows package. Add a server route that invokes the flow and streams results back to the UI.',
    complexity: 'large',
  },
  {
    title: 'Add Langfuse tracing',
    description:
      'Configure Langfuse observability by setting `LANGFUSE_PUBLIC_KEY`, `LANGFUSE_SECRET_KEY`, and `LANGFUSE_HOST` environment variables. Verify traces appear in the Langfuse dashboard after sending a chat message.',
    complexity: 'small',
  },
  {
    title: 'Customize the system prompt',
    description:
      'Edit `packages/prompts/src/` to add a role-specific system prompt. Register it in the prompt registry. Wire it to the chat route so the agent responds with the custom persona.',
    complexity: 'medium',
  },
  {
    title: 'Deploy to production',
    description:
      'Containerize the server with a Dockerfile. Set up environment variables for API keys and Langfuse. Deploy the UI as a static build (Vite `npm run build`) and the server as a Node.js container. Configure CORS for the production domain.',
    complexity: 'large',
  },
];

const EXTENSION_FEATURES: StarterFeature[] = [
  {
    title: 'Add options page settings',
    description:
      'Build the options page UI with React. Add settings controls using the storage wrapper. Persist user preferences to browser.storage.local.',
    complexity: 'medium',
  },
  {
    title: 'Create content script UI',
    description:
      'Build an injected UI component that renders on target web pages. Use Shadow DOM for style isolation. Communicate with background via sendMessage().',
    complexity: 'medium',
  },
  {
    title: 'Set up web store listing',
    description:
      'Prepare store listing assets: icons (16/48/128px), screenshots, description text, and privacy policy. Validate with web-ext lint.',
    complexity: 'small',
  },
  {
    title: 'Add keyboard shortcuts',
    description:
      'Define keyboard shortcuts in the manifest commands section. Add a handler in the background service worker. Document shortcuts on the options page.',
    complexity: 'small',
  },
  {
    title: 'Implement popup dashboard',
    description:
      'Build the main popup UI with React. Display key status information, quick actions, and navigation to the options page.',
    complexity: 'medium',
  },
];

const DESIGN_SYSTEM_FEATURES: StarterFeature[] = [
  {
    title: 'Design Token Pipeline',
    description: 'DTCG-format design tokens with build-time CSS variable generation.',
    complexity: 'small',
  },
  {
    title: 'XCL Codec',
    description: 'Bidirectional ComponentDef ↔ XCL XML ↔ TSX code generation pipeline.',
    complexity: 'medium',
  },
  {
    title: 'Component Registry',
    description: 'In-memory component registry for storing and querying design system components.',
    complexity: 'small',
  },
  {
    title: 'AI Component Generation',
    description: 'AI agents that generate and refine React components from .pen design files.',
    complexity: 'large',
  },
  {
    title: 'MCP Server',
    description:
      'Model Context Protocol server exposing design system tools to AI coding assistants.',
    complexity: 'medium',
  },
  {
    title: 'Component Playground',
    description: 'Vite-powered playground app for previewing and testing components.',
    complexity: 'medium',
  },
  {
    title: 'Accessibility Checking',
    description: 'Automated a11y checks using axe-core integrated into the component pipeline.',
    complexity: 'small',
  },
];

/**
 * Get starter features for a given kit type.
 * Returns universal features plus type-specific features.
 */
export function getStarterFeatures(type: StarterKitType): StarterFeature[] {
  switch (type) {
    case 'docs':
      return [...UNIVERSAL_FEATURES, ...DOCS_FEATURES];
    case 'portfolio':
      return [...UNIVERSAL_FEATURES, ...PORTFOLIO_FEATURES];
    case 'extension':
      return [...UNIVERSAL_FEATURES, ...EXTENSION_FEATURES];
    case 'landing-page':
      return [...UNIVERSAL_FEATURES];
    case 'general':
      return [...UNIVERSAL_FEATURES];
    case 'ai-agent-app':
      return [...UNIVERSAL_FEATURES, ...AI_AGENT_APP_FEATURES];
    case 'design-system':
      return [...UNIVERSAL_FEATURES, ...DESIGN_SYSTEM_FEATURES];
  }
}

/**
 * Get only the universal features (shared across all kit types).
 */
export function getUniversalFeatures(): StarterFeature[] {
  return [...UNIVERSAL_FEATURES];
}
