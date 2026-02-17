/**
 * Global setup for all e2e tests
 * This runs once before all tests start
 *
 * Resets server-side settings to prevent state leakage between CI runs.
 * The settings sync hook persists `localStorageMigrated: true` to the server,
 * which causes subsequent tests to ignore their localStorage-based project
 * setup and use stale server settings instead.
 */

const API_PORT = process.env.TEST_SERVER_PORT || '3008';
const API_BASE_URL = `http://localhost:${API_PORT}`;

async function globalSetup() {
  const apiKey = process.env.AUTOMAKER_API_KEY || 'test-api-key-for-e2e-tests';

  try {
    // Login to get a session token
    const loginRes = await fetch(`${API_BASE_URL}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ apiKey }),
    });

    if (!loginRes.ok) {
      console.warn('[GlobalSetup] Login failed, skipping settings reset');
      return;
    }

    const loginData = (await loginRes.json()) as { success: boolean; token?: string };
    if (!loginData.success || !loginData.token) {
      console.warn('[GlobalSetup] Login response missing token, skipping settings reset');
      return;
    }

    // Reset server settings to prevent cross-test contamination
    const resetRes = await fetch(`${API_BASE_URL}/api/settings/global`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        Cookie: `automaker_session=${loginData.token}`,
      },
      body: JSON.stringify({
        localStorageMigrated: false,
        projects: [],
        currentProjectId: null,
      }),
    });

    if (resetRes.ok) {
      console.log('[GlobalSetup] Server settings reset for clean test run');
    } else {
      console.warn(`[GlobalSetup] Settings reset failed: ${resetRes.status}`);
    }
  } catch (error) {
    console.warn('[GlobalSetup] Could not reset server settings:', error);
  }

  console.log('[GlobalSetup] Setup complete');
}

export default globalSetup;
