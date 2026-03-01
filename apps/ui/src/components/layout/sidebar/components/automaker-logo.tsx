import type { NavigateOptions } from '@tanstack/react-router';
import { cn } from '@/lib/utils';
import { useOSDetection } from '@/hooks/use-os-detection';
import { useDemoMode } from '@/hooks/use-demo-mode';

interface AutomakerLogoProps {
  sidebarOpen: boolean;
  navigate: (opts: NavigateOptions) => void;
}

function getOSAbbreviation(os: string): string {
  switch (os) {
    case 'mac':
      return 'M';
    case 'windows':
      return 'W';
    case 'linux':
      return 'L';
    default:
      return '?';
  }
}

export function AutomakerLogo({ sidebarOpen, navigate }: AutomakerLogoProps) {
  const appVersion = typeof __APP_VERSION__ !== 'undefined' ? __APP_VERSION__ : '0.0.0';
  const { os } = useOSDetection();
  const appMode = import.meta.env.VITE_APP_MODE || '?';
  const versionSuffix = `${getOSAbbreviation(os)}${appMode}`;
  const demoMode = useDemoMode();

  return (
    <div
      className={cn(
        'flex items-center gap-3 titlebar-no-drag cursor-pointer group',
        !sidebarOpen && 'flex-col gap-1'
      )}
      onClick={() => navigate({ to: '/dashboard' })}
      data-testid="logo-button"
    >
      {/* Collapsed logo - only shown when sidebar is closed */}
      <div
        className={cn(
          'relative flex flex-col items-center justify-center rounded-lg gap-0.5',
          sidebarOpen ? 'hidden' : 'flex'
        )}
      >
        <svg
          xmlns="http://www.w3.org/2000/svg"
          viewBox="0 0 256 256"
          role="img"
          aria-label="protoLabs Logo"
          className="size-8 group-hover:rotate-12 transition-transform duration-300 ease-out"
        >
          <defs>
            <linearGradient
              id="bg-collapsed"
              x1="0"
              y1="0"
              x2="256"
              y2="256"
              gradientUnits="userSpaceOnUse"
            >
              <stop offset="0%" style={{ stopColor: 'var(--brand-400)' }} />
              <stop offset="100%" style={{ stopColor: 'var(--brand-600)' }} />
            </linearGradient>
            <filter id="iconShadow-collapsed" x="-20%" y="-20%" width="140%" height="140%">
              <feDropShadow
                dx="0"
                dy="4"
                stdDeviation="4"
                floodColor="#000000"
                floodOpacity="0.25"
              />
            </filter>
          </defs>
          <rect x="16" y="16" width="224" height="224" rx="56" fill="url(#bg-collapsed)" />
          <path
            d="M128 52 L196 128 L128 204 L60 128 Z"
            fill="#FFFFFF"
            filter="url(#iconShadow-collapsed)"
          />
        </svg>
        <span className="text-[0.625rem] text-muted-foreground leading-none font-medium">
          v{appVersion} {versionSuffix}
        </span>
        {demoMode && (
          <span className="text-[0.5rem] font-bold uppercase tracking-wider text-brand-400 bg-brand-400/10 px-1.5 py-0.5 rounded">
            Demo
          </span>
        )}
      </div>

      {/* Expanded logo - shown when sidebar is open */}
      {sidebarOpen && (
        <div className="flex flex-col">
          <div className="flex items-center gap-1">
            <svg
              xmlns="http://www.w3.org/2000/svg"
              viewBox="0 0 256 256"
              role="img"
              aria-label="protoLabs"
              className="h-8 w-8 lg:h-[36.8px] lg:w-[36.8px] shrink-0 group-hover:rotate-12 transition-transform duration-300 ease-out"
            >
              <defs>
                <linearGradient
                  id="bg-expanded"
                  x1="0"
                  y1="0"
                  x2="256"
                  y2="256"
                  gradientUnits="userSpaceOnUse"
                >
                  <stop offset="0%" style={{ stopColor: 'var(--brand-400)' }} />
                  <stop offset="100%" style={{ stopColor: 'var(--brand-600)' }} />
                </linearGradient>
                <filter id="iconShadow-expanded" x="-20%" y="-20%" width="140%" height="140%">
                  <feDropShadow
                    dx="0"
                    dy="4"
                    stdDeviation="4"
                    floodColor="#000000"
                    floodOpacity="0.25"
                  />
                </filter>
              </defs>
              <rect x="16" y="16" width="224" height="224" rx="56" fill="url(#bg-expanded)" />
              <path
                d="M128 52 L196 128 L128 204 L60 128 Z"
                fill="#FFFFFF"
                filter="url(#iconShadow-expanded)"
              />
            </svg>
            <span className="font-bold text-foreground text-xl lg:text-[1.7rem] tracking-tight leading-none translate-y-[-2px]">
              proto<span className="text-brand-400">Labs</span>
            </span>
          </div>
          <div className="flex items-center gap-1.5 ml-9 lg:ml-[38.8px]">
            <span className="text-[0.625rem] text-muted-foreground leading-none font-medium">
              v{appVersion} {versionSuffix}
            </span>
            {demoMode && (
              <span className="text-[0.5rem] font-bold uppercase tracking-wider text-brand-400 bg-brand-400/10 px-1.5 py-0.5 rounded leading-none">
                Demo
              </span>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
