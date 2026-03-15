/**
 * TinaCMS configuration — self-hosted mode (no TinaCloud required).
 *
 * Self-hosted setup:
 *   1. Install dependencies:
 *        npm install tinacms @tinacms/auth
 *   2. Start the CMS in dev mode:
 *        npx tinacms dev -c "vite --port 5174"
 *   3. Open the admin panel:
 *        http://localhost:4001/admin
 *   4. Content edits are saved as markdown/JSON in the content/ directory.
 *
 * Production build:
 *   npx tinacms build && vite build
 *   The compiled admin panel lands in public/admin/.
 *
 * Content structure (all git-tracked):
 *   content/pages/       → Site pages
 *   content/components/  → Component documentation
 *   content/guidelines/  → Design guidelines
 *   content/changelog/   → Release notes
 */

import { defineConfig } from 'tinacms';
import { collections } from './schema';

export default defineConfig({
  // Branch used for content edits — override via GITHUB_BRANCH env var
  branch: process.env.GITHUB_BRANCH ?? process.env.HEAD ?? 'main',

  // Self-hosted: clientId and token are intentionally omitted.
  // Uncomment and set these only if you opt into TinaCloud hosting:
  // clientId: process.env.NEXT_PUBLIC_TINA_CLIENT_ID,
  // token: process.env.TINA_TOKEN,

  build: {
    // Admin panel is compiled into public/admin/
    outputFolder: 'admin',
    publicFolder: 'public',
  },

  media: {
    // Media files are stored in public/images/
    tina: {
      mediaRoot: 'images',
      publicFolder: 'public',
    },
  },

  schema: {
    collections,
  },
});
