/**
 * Generate TanStack Router route tree for typecheck.
 *
 * The Vite plugin normally handles this during dev/build,
 * but tsc --noEmit runs outside Vite so we generate it here.
 * Called by the `typecheck` npm script before `tsc --noEmit`.
 */
import { Generator, getConfig } from '@tanstack/router-generator';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = dirname(__dirname); // apps/ui/

const config = await getConfig(
  {
    target: 'react',
    autoCodeSplitting: true,
    routesDirectory: './src/routes',
    generatedRouteTree: './src/routeTree.gen.ts',
    quoteStyle: 'single',
  },
  ROOT
);

const generator = new Generator({ config, root: ROOT });
await generator.run();
