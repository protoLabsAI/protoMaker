import { useId } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import type { LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';

interface Tab {
  id: string;
  label: string;
  icon?: LucideIcon;
}

interface AnimatedTabsProps {
  tabs: Tab[];
  activeTab: string;
  onTabChange: (id: string) => void;
  children: React.ReactNode;
}

export function AnimatedTabs({ tabs, activeTab, onTabChange, children }: AnimatedTabsProps) {
  const layoutId = useId();
  return (
    <div>
      {/* Tab bar */}
      <div className="flex items-center gap-1 p-1 bg-muted/30 rounded-lg backdrop-blur-sm border border-border w-fit mb-6">
        {tabs.map((tab) => {
          const isActive = tab.id === activeTab;
          const Icon = tab.icon;

          return (
            <button
              key={tab.id}
              onClick={() => onTabChange(tab.id)}
              className={cn(
                'relative flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-md transition-colors',
                isActive ? 'text-foreground' : 'text-muted-foreground hover:text-foreground/80'
              )}
            >
              {isActive && (
                <motion.div
                  layoutId={`activeTabBg-${layoutId}`}
                  className="absolute inset-0 bg-background/80 rounded-md border border-border shadow-sm"
                  style={{ zIndex: 0 }}
                  transition={{ type: 'spring', stiffness: 400, damping: 30 }}
                />
              )}
              <span className="relative z-10 flex items-center gap-2">
                {Icon && <Icon className="h-4 w-4" />}
                {tab.label}
              </span>
            </button>
          );
        })}
      </div>

      {/* Tab content with crossfade */}
      <AnimatePresence mode="wait">
        <motion.div
          key={activeTab}
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -8 }}
          transition={{ duration: 0.2 }}
        >
          {children}
        </motion.div>
      </AnimatePresence>
    </div>
  );
}
