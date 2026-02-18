import { useState } from 'react';
import { ChevronRight, ChevronDown, File } from 'lucide-react';
import type { DesignFileEntry } from '@/hooks/queries/use-design-files';

interface FileBrowserProps {
  files: DesignFileEntry[];
  selectedPath: string | null;
  onSelect: (filePath: string) => void;
}

function FileTreeNode({
  entry,
  depth,
  selectedPath,
  onSelect,
}: {
  entry: DesignFileEntry;
  depth: number;
  selectedPath: string | null;
  onSelect: (filePath: string) => void;
}) {
  const [expanded, setExpanded] = useState(true);
  const isSelected = selectedPath === entry.path;

  if (entry.isDirectory) {
    return (
      <div>
        <button
          onClick={() => setExpanded(!expanded)}
          className="flex w-full items-center gap-1.5 rounded px-2 py-1 text-sm text-muted-foreground hover:bg-accent hover:text-accent-foreground"
          style={{ paddingLeft: `${depth * 12 + 8}px` }}
        >
          {expanded ? (
            <ChevronDown className="size-3.5 shrink-0" />
          ) : (
            <ChevronRight className="size-3.5 shrink-0" />
          )}
          <span className="truncate">{entry.name}</span>
        </button>
        {expanded &&
          entry.children?.map((child) => (
            <FileTreeNode
              key={child.path}
              entry={child}
              depth={depth + 1}
              selectedPath={selectedPath}
              onSelect={onSelect}
            />
          ))}
      </div>
    );
  }

  return (
    <button
      onClick={() => onSelect(entry.path)}
      className={`flex w-full items-center gap-1.5 rounded px-2 py-1 text-sm ${
        isSelected
          ? 'bg-primary/10 text-primary font-medium'
          : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground'
      }`}
      style={{ paddingLeft: `${depth * 12 + 8}px` }}
    >
      <File className="size-3.5 shrink-0" />
      <span className="truncate">{entry.name.replace('.pen', '')}</span>
    </button>
  );
}

export function FileBrowser({ files, selectedPath, onSelect }: FileBrowserProps) {
  if (files.length === 0) {
    return (
      <div className="p-4 text-sm text-muted-foreground">
        No .pen files found in designs/ directory.
      </div>
    );
  }

  return (
    <div className="py-2">
      {files.map((entry) => (
        <FileTreeNode
          key={entry.path}
          entry={entry}
          depth={0}
          selectedPath={selectedPath}
          onSelect={onSelect}
        />
      ))}
    </div>
  );
}
