/**
 * Demo mode detection.
 *
 * Returns true when the server is running inside a demo container
 * (started via `npm run demo` / docker-compose.demo.yml).
 */

export function isDemoMode(): boolean {
  return process.env.DEMO_MODE === 'true';
}
