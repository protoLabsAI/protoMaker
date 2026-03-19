import { useMemo } from 'react';

export type OperatingSystem = 'mac' | 'windows' | 'linux' | 'unknown';

export interface OSDetectionResult {
  readonly os: OperatingSystem;
  readonly isMac: boolean;
  readonly isWindows: boolean;
  readonly isLinux: boolean;
}

function detectOS(): OperatingSystem {
  if (typeof navigator === 'undefined') {
    return 'unknown';
  }

  const nav = navigator as Navigator & { userAgentData?: { platform: string } };
  const platform = (nav.userAgentData?.platform ?? navigator.platform ?? '').toLowerCase();

  if (platform.includes('mac')) return 'mac';
  if (platform.includes('win')) return 'windows';
  if (platform.includes('linux') || platform.includes('x11')) return 'linux';
  return 'unknown';
}

/**
 * Hook to detect the user's operating system.
 * Returns OS information and convenience boolean flags.
 */
export function useOSDetection(): OSDetectionResult {
  return useMemo(() => {
    const os = detectOS();
    return {
      os,
      isMac: os === 'mac',
      isWindows: os === 'windows',
      isLinux: os === 'linux',
    };
  }, []);
}
