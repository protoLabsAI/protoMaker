/**
 * Component library panel
 * Displays all reusable components from the current .pen file, grouped by category
 */

import { useMemo } from 'react';
import type { PenNode, PenDocument as PenDocumentParsed } from '@protolabs-ai/types';
import type { PenDocument } from '@/store/designs-store';
import { useDesignsStore } from '@/store/designs-store';
import { ComponentThumbnail } from './component-thumbnail';
import { Search, ChevronDown, ChevronRight, Package } from 'lucide-react';

interface ComponentGroup {
  name: string;
  components: PenNode[];
}

/**
 * Recursively find all reusable nodes in the document tree
 */
function findReusableNodes(nodes: PenNode[]): PenNode[] {
  const reusable: PenNode[] = [];

  for (const node of nodes) {
    if (node.reusable === true) {
      reusable.push(node);
    }
    // Recursively search children
    if ('children' in node && Array.isArray(node.children)) {
      reusable.push(...findReusableNodes(node.children));
    }
  }

  return reusable;
}

/**
 * Group components by name prefix (e.g., "Button/Default" → "Button")
 */
function groupComponents(components: PenNode[]): ComponentGroup[] {
  const groups = new Map<string, PenNode[]>();

  for (const component of components) {
    const name = component.name || 'Unnamed';
    const slashIndex = name.indexOf('/');
    const groupName = slashIndex !== -1 ? name.slice(0, slashIndex) : 'Other';

    if (!groups.has(groupName)) {
      groups.set(groupName, []);
    }
    groups.get(groupName)!.push(component);
  }

  return Array.from(groups.entries())
    .map(([name, components]) => ({ name, components }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

interface ComponentLibraryProps {
  penFile: PenDocument | null;
}

export function ComponentLibrary({ penFile }: ComponentLibraryProps) {
  const {
    librarySearchFilter,
    expandedLibraryGroups,
    setLibrarySearchFilter,
    toggleLibraryGroup,
    setSelectedNode,
  } = useDesignsStore();

  // Parse the document
  const parsedDoc = useMemo<PenDocumentParsed | null>(() => {
    if (!penFile?.content) return null;
    try {
      const parsed = JSON.parse(penFile.content);
      if (parsed.version && Array.isArray(parsed.children)) {
        return parsed as PenDocumentParsed;
      }
      return null;
    } catch {
      return null;
    }
  }, [penFile]);

  // Extract reusable components
  const reusableComponents = useMemo(() => {
    if (!parsedDoc?.children) return [];
    return findReusableNodes(parsedDoc.children);
  }, [parsedDoc]);

  // Group components
  const groups = useMemo(() => {
    return groupComponents(reusableComponents);
  }, [reusableComponents]);

  // Filter groups by search
  const filteredGroups = useMemo(() => {
    if (!librarySearchFilter) return groups;

    const lowerFilter = librarySearchFilter.toLowerCase();
    return groups
      .map((group) => ({
        ...group,
        components: group.components.filter((component) => {
          const name = component.name || '';
          return name.toLowerCase().includes(lowerFilter);
        }),
      }))
      .filter((group) => group.components.length > 0);
  }, [groups, librarySearchFilter]);

  // Handle component click
  const handleComponentClick = (component: PenNode) => {
    setSelectedNode(component.id);
  };

  // Show empty state if no file loaded
  if (!penFile) {
    return (
      <div className="flex h-full flex-col">
        <div className="border-b border-border bg-muted/30 px-4 py-3">
          <h2 className="text-sm font-medium">Components</h2>
        </div>
        <div className="flex flex-1 items-center justify-center p-4">
          <div className="text-center text-sm text-muted-foreground">
            <Package className="mx-auto h-8 w-8 mb-2 opacity-50" />
            <p>No file loaded</p>
          </div>
        </div>
      </div>
    );
  }

  // Show empty state if no reusable components
  if (reusableComponents.length === 0) {
    return (
      <div className="flex h-full flex-col">
        <div className="border-b border-border bg-muted/30 px-4 py-3">
          <h2 className="text-sm font-medium">Components</h2>
        </div>
        <div className="flex flex-1 items-center justify-center p-4">
          <div className="text-center text-sm text-muted-foreground">
            <Package className="mx-auto h-8 w-8 mb-2 opacity-50" />
            <p>No reusable components</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <div className="border-b border-border bg-muted/30 px-4 py-3">
        <h2 className="text-sm font-medium">Components</h2>
      </div>

      {/* Search input */}
      <div className="border-b border-border p-3">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <input
            type="text"
            placeholder="Search components..."
            aria-label="Search components"
            value={librarySearchFilter}
            onChange={(e) => setLibrarySearchFilter(e.target.value)}
            className="w-full rounded-md border border-input bg-background pl-9 pr-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
          />
        </div>
      </div>

      {/* Component groups */}
      <div className="flex-1 overflow-y-auto">
        {filteredGroups.length === 0 ? (
          <div className="flex items-center justify-center p-8">
            <p className="text-sm text-muted-foreground">No components match your search</p>
          </div>
        ) : (
          <div className="space-y-2 p-3">
            {filteredGroups.map((group) => {
              const isExpanded = expandedLibraryGroups.has(group.name);

              return (
                <div key={group.name} className="space-y-2">
                  {/* Group header */}
                  <button
                    onClick={() => toggleLibraryGroup(group.name)}
                    className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-sm font-medium hover:bg-muted/50 transition-colors"
                  >
                    {isExpanded ? (
                      <ChevronDown className="h-4 w-4 text-muted-foreground" />
                    ) : (
                      <ChevronRight className="h-4 w-4 text-muted-foreground" />
                    )}
                    <span className="flex-1 text-left">{group.name}</span>
                    <span className="text-xs text-muted-foreground">{group.components.length}</span>
                  </button>

                  {/* Group components */}
                  {isExpanded && (
                    <div className="space-y-2 pl-6">
                      {group.components.map((component) => (
                        <div key={component.id} className="space-y-1">
                          <ComponentThumbnail
                            node={component}
                            document={parsedDoc}
                            onClick={() => handleComponentClick(component)}
                          />
                          <p className="text-xs text-muted-foreground truncate px-1">
                            {component.name || component.id}
                          </p>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
