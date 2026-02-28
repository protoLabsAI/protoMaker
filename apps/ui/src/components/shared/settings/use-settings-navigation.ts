import { useState, useEffect } from 'react';

const LG_BREAKPOINT = 1024;

export function useSettingsNavigation(activeView: string) {
  const [showNavigation, setShowNavigation] = useState(() => {
    if (typeof window !== 'undefined') {
      return window.innerWidth >= LG_BREAKPOINT;
    }
    return true;
  });

  // Auto-close navigation on mobile when a section is selected
  useEffect(() => {
    if (typeof window !== 'undefined' && window.innerWidth < LG_BREAKPOINT) {
      setShowNavigation(false);
    }
  }, [activeView]);

  // Handle window resize to show/hide navigation appropriately
  useEffect(() => {
    const handleResize = () => {
      if (window.innerWidth >= LG_BREAKPOINT) {
        setShowNavigation(true);
      }
    };

    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  const toggleNavigation = () => setShowNavigation((prev) => !prev);

  return { showNavigation, setShowNavigation, toggleNavigation };
}
