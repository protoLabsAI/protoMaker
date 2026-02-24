import { useEffect, useState, useCallback } from 'react';
import { useDesignsStore, type FileTreeNode } from '@/store/designs-store';
import { getElectronAPI } from '@/lib/electron';
import { Spinner } from '@protolabs-ai/ui/atoms';
import { Folder, FolderOpen, FileText, ChevronRight, ChevronDown } from 'lucide-react';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';

interface DesignsTreeProps {
  projectPath: string;
}

export function DesignsTree({ projectPath }: DesignsTreeProps) {
  const {
    fileTree,
    expandedFolders,
    selectedFilePath,
    isLoadingTree,
    setFileTree,
    toggleFolder,
    setSelectedFile,
    setLoadingTree,
    setLoadingDocument,
  } = useDesignsStore();

  const [error, setError] = useState<string | null>(null);

  // Load the file tree on mount
  useEffect(() => {
    loadFileTree();
  }, [projectPath]);

  const loadFileTree = useCallback(async () => {
    setLoadingTree(true);
    setError(null);

    try {
      const api = getElectronAPI();
      const designsPath = `${projectPath}/designs`;

      // Check if designs directory exists
      const dirResult = await api.readDirectory(designsPath);
      if (!dirResult.success) {
        setFileTree([]);
        setError('No designs directory found');
        setLoadingTree(false);
        return;
      }

      // Build the file tree recursively
      const tree = await buildFileTree(designsPath, '');
      setFileTree(tree);
    } catch (err) {
      console.error('Failed to load file tree:', err);
      setError('Failed to load designs directory');
      setFileTree([]);
    } finally {
      setLoadingTree(false);
    }
  }, [projectPath, setFileTree, setLoadingTree]);

  const buildFileTree = async (basePath: string, relativePath: string): Promise<FileTreeNode[]> => {
    const api = getElectronAPI();
    const fullPath = relativePath ? `${basePath}/${relativePath}` : basePath;

    const result = await api.readDirectory(fullPath);
    if (!result.success || !result.files) {
      return [];
    }

    const nodes: FileTreeNode[] = [];

    for (const file of result.files) {
      const filePath = relativePath ? `${relativePath}/${file}` : file;
      const fileFullPath = `${basePath}/${filePath}`;

      // Check if it's a directory
      const statResult = await api.statFile(fileFullPath);
      const isDirectory = statResult.success && statResult.isDirectory;

      if (isDirectory) {
        // Recursively build subtree
        const children = await buildFileTree(basePath, filePath);
        nodes.push({
          name: file,
          path: filePath,
          type: 'folder',
          children,
        });
      } else if (file.endsWith('.pen')) {
        // Only include .pen files
        nodes.push({
          name: file,
          path: filePath,
          type: 'file',
        });
      }
    }

    // Sort: folders first, then files, alphabetically
    return nodes.sort((a, b) => {
      if (a.type !== b.type) {
        return a.type === 'folder' ? -1 : 1;
      }
      return a.name.localeCompare(b.name);
    });
  };

  const handleFileClick = useCallback(
    async (node: FileTreeNode) => {
      if (node.type === 'folder') {
        toggleFolder(node.path);
        return;
      }

      // Load the .pen file
      setLoadingDocument(true);
      try {
        const api = getElectronAPI();
        const fullPath = `${projectPath}/designs/${node.path}`;

        const result = await api.readFile(fullPath);
        if (!result.success || !result.content) {
          toast.error('Failed to load design file');
          return;
        }

        // Parse the .pen file (for now, just store the raw content)
        const document = {
          content: result.content,
        };

        setSelectedFile(node.path, document);
      } catch (err) {
        console.error('Failed to load design file:', err);
        toast.error('Failed to load design file');
      } finally {
        setLoadingDocument(false);
      }
    },
    [projectPath, toggleFolder, setSelectedFile, setLoadingDocument]
  );

  return (
    <div className="p-2">
      <div className="mb-3 px-2">
        <h3 className="text-sm font-semibold">Designs</h3>
      </div>

      {isLoadingTree ? (
        <div className="flex items-center justify-center py-8">
          <Spinner size="sm" />
        </div>
      ) : error ? (
        <div className="px-2 py-4 text-center">
          <p className="text-xs text-muted-foreground">{error}</p>
        </div>
      ) : fileTree.length === 0 ? (
        <div className="px-2 py-4 text-center">
          <p className="text-xs text-muted-foreground">No design files found</p>
        </div>
      ) : (
        <TreeNodeList
          nodes={fileTree}
          level={0}
          expandedFolders={expandedFolders}
          selectedPath={selectedFilePath}
          onNodeClick={handleFileClick}
        />
      )}
    </div>
  );
}

interface TreeNodeListProps {
  nodes: FileTreeNode[];
  level: number;
  expandedFolders: Set<string>;
  selectedPath: string | null;
  onNodeClick: (node: FileTreeNode) => void;
}

function TreeNodeList({
  nodes,
  level,
  expandedFolders,
  selectedPath,
  onNodeClick,
}: TreeNodeListProps) {
  return (
    <div>
      {nodes.map((node) => (
        <TreeNode
          key={node.path}
          node={node}
          level={level}
          isExpanded={expandedFolders.has(node.path)}
          isSelected={selectedPath === node.path}
          onNodeClick={onNodeClick}
          expandedFolders={expandedFolders}
        />
      ))}
    </div>
  );
}

interface TreeNodeProps {
  node: FileTreeNode;
  level: number;
  isExpanded: boolean;
  isSelected: boolean;
  expandedFolders: Set<string>;
  onNodeClick: (node: FileTreeNode) => void;
}

function TreeNode({
  node,
  level,
  isExpanded,
  isSelected,
  expandedFolders,
  onNodeClick,
}: TreeNodeProps) {
  const isFolder = node.type === 'folder';
  const hasChildren = isFolder && node.children && node.children.length > 0;

  return (
    <div>
      <button
        onClick={() => onNodeClick(node)}
        className={cn(
          'flex w-full items-center gap-2 rounded px-2 py-1.5 text-sm hover:bg-accent',
          isSelected && 'bg-accent',
          'transition-colors'
        )}
        style={{ paddingLeft: `${level * 12 + 8}px` }}
      >
        {/* Chevron for folders with children */}
        {isFolder && hasChildren && (
          <span className="flex-shrink-0">
            {isExpanded ? (
              <ChevronDown className="h-4 w-4 text-muted-foreground" />
            ) : (
              <ChevronRight className="h-4 w-4 text-muted-foreground" />
            )}
          </span>
        )}

        {/* Icon */}
        <span className="flex-shrink-0">
          {isFolder ? (
            isExpanded ? (
              <FolderOpen className="h-4 w-4 text-muted-foreground" />
            ) : (
              <Folder className="h-4 w-4 text-muted-foreground" />
            )
          ) : (
            <FileText className="h-4 w-4 text-muted-foreground" />
          )}
        </span>

        {/* Name */}
        <span className="flex-1 truncate text-left">{node.name}</span>
      </button>

      {/* Children */}
      {isFolder && hasChildren && isExpanded && (
        <TreeNodeList
          nodes={node.children!}
          level={level + 1}
          expandedFolders={expandedFolders}
          selectedPath={isSelected ? null : null}
          onNodeClick={onNodeClick}
        />
      )}
    </div>
  );
}
