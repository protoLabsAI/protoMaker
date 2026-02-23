/**
 * Overlay Board - Compact board view for stream overlay
 *
 * Shows feature cards in columns with minimal styling.
 * Optimized for 1920x1080 OBS browser source.
 */

import type { Feature } from '@/store/types';

interface OverlayBoardProps {
  features: Feature[];
}

const COLUMNS = [
  { id: 'backlog', label: 'Backlog', status: 'backlog' as const },
  { id: 'in_progress', label: 'Building', status: 'in_progress' as const },
  { id: 'waiting_approval', label: 'Review', status: 'waiting_approval' as const },
  { id: 'verified', label: 'Done', status: 'verified' as const },
];

export function OverlayBoard({ features }: OverlayBoardProps) {
  return (
    <div className="h-full flex gap-3">
      {COLUMNS.map((column) => {
        const columnFeatures = features.filter((f) => f.status === column.status);

        return (
          <div key={column.id} className="flex-1 flex flex-col min-w-0">
            {/* Column Header */}
            <div className="bg-gray-800/80 rounded-lg px-4 py-2 mb-2 border border-gray-700/50">
              <div className="text-lg font-bold text-gray-200">
                {column.label}
                <span className="ml-2 text-sm text-gray-400">({columnFeatures.length})</span>
              </div>
            </div>

            {/* Column Cards */}
            <div className="flex-1 space-y-2 overflow-y-auto scrollbar-hide">
              {columnFeatures.slice(0, 5).map((feature) => (
                <div
                  key={feature.id}
                  className="bg-gray-900/60 rounded-lg p-3 border border-gray-700/30 hover:border-gray-600/50 transition-colors"
                >
                  <div className="text-sm font-medium text-white truncate">
                    {feature.description}
                  </div>
                  {feature.category && (
                    <div className="text-xs text-gray-400 mt-1 truncate">{feature.category}</div>
                  )}
                  {typeof feature.priority === 'number' && feature.priority > 0 && (
                    <div className="mt-1 flex items-center gap-1">
                      <span className="text-xs text-yellow-500">
                        {'★'.repeat(Math.min(feature.priority as number, 3))}
                      </span>
                    </div>
                  )}
                </div>
              ))}

              {columnFeatures.length > 5 && (
                <div className="text-center text-xs text-gray-500 py-2">
                  +{columnFeatures.length - 5} more
                </div>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
