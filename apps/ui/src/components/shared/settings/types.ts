import type { LucideIcon } from 'lucide-react';
import type React from 'react';

export interface SettingsNavigationItem {
  id: string;
  label: string;
  icon: LucideIcon | React.ComponentType<{ className?: string }>;
  subItems?: SettingsNavigationItem[];
  colorScheme?: 'brand' | 'danger';
}
