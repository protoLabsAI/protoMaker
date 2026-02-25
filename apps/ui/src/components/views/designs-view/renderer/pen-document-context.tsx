/**
 * React context for providing PenDocument to renderers
 */

import { createContext, useContext } from 'react';
import type { PenDocument, PenNode } from '@protolabs-ai/types';

interface PenDocumentContextValue {
  document: PenDocument;
  /**
   * Resolve a ref node by its refId
   */
  resolveRef: (refId: string) => PenNode | null;
}

const PenDocumentContext = createContext<PenDocumentContextValue | null>(null);

/**
 * Hook to access the current PenDocument context
 */
export function usePenDocument() {
  const context = useContext(PenDocumentContext);
  if (!context) {
    throw new Error('usePenDocument must be used within a PenDocumentProvider');
  }
  return context;
}

/**
 * Provider component for PenDocument context
 */
export function PenDocumentProvider({
  document,
  children,
}: {
  document: PenDocument;
  children: React.ReactNode;
}) {
  /**
   * Recursively search for a node by ID in the document tree
   */
  const resolveRef = (refId: string): PenNode | null => {
    const findNodeById = (nodes: PenNode[]): PenNode | null => {
      for (const node of nodes) {
        if (node.id === refId) {
          return node;
        }
        // Recursively search children if the node has them
        if ('children' in node && Array.isArray(node.children)) {
          const found = findNodeById(node.children);
          if (found) return found;
        }
      }
      return null;
    };

    return findNodeById(document.children);
  };

  const value: PenDocumentContextValue = {
    document,
    resolveRef,
  };

  return <PenDocumentContext.Provider value={value}>{children}</PenDocumentContext.Provider>;
}
