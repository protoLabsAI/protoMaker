import { describe, it, expect } from 'vitest';
import { readFile } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SHADCN_PEN = join(__dirname, '../../../designs/components/shadcn-kit.pen');
import {
  parsePenFile,
  parsePenFileFromPath,
  traverseNodes,
  findNodeById,
  findNodes,
  findReusableComponents,
  resolveVariable,
  resolveRef,
  extractTheme,
  buildComponentMap,
} from '../src/index.js';
import type { PenDocument, PenNode } from '../src/index.js';

describe('parsePenFile', () => {
  it('should parse valid PEN JSON', () => {
    const json = JSON.stringify({
      version: '2.8',
      children: [
        {
          type: 'frame',
          id: 'test1',
          name: 'Test Frame',
          x: 0,
          y: 0,
          width: 100,
          height: 100,
        },
      ],
    });

    const doc = parsePenFile(json);
    expect(doc.version).toBe('2.8');
    expect(doc.children).toHaveLength(1);
    expect(doc.children[0].id).toBe('test1');
  });

  it('should throw error on invalid JSON', () => {
    expect(() => parsePenFile('not json')).toThrow('Invalid JSON');
  });

  it('should throw error on missing version', () => {
    const json = JSON.stringify({
      children: [],
    });
    expect(() => parsePenFile(json)).toThrow('missing or invalid version');
  });

  it('should throw error on missing children', () => {
    const json = JSON.stringify({
      version: '2.8',
    });
    expect(() => parsePenFile(json)).toThrow('children must be an array');
  });
});

describe('parsePenFileFromPath', () => {
  it('should parse shadcn-kit.pen file', async () => {
    // Navigate up from libs/pen-parser to project root
    const penPath = SHADCN_PEN;
    const doc = await parsePenFileFromPath(penPath);

    expect(doc.version).toBe('2.8');
    expect(doc.children).toBeDefined();
    expect(doc.children.length).toBeGreaterThan(0);
  });
});

describe('traverseNodes', () => {
  const createTestDoc = (): PenDocument => ({
    version: '2.8',
    children: [
      {
        type: 'frame',
        id: 'root',
        name: 'Root',
        children: [
          {
            type: 'frame',
            id: 'child1',
            name: 'Child 1',
            children: [
              {
                type: 'text',
                id: 'text1',
                name: 'Text 1',
                content: 'Hello',
              },
            ],
          },
          {
            type: 'frame',
            id: 'child2',
            name: 'Child 2',
          },
        ],
      },
    ],
  });

  it('should visit all nodes', () => {
    const doc = createTestDoc();
    const visited: string[] = [];

    traverseNodes(doc, (node) => {
      visited.push(node.id);
    });

    expect(visited).toEqual(['root', 'child1', 'text1', 'child2']);
  });

  it('should pass parent and depth to visitor', () => {
    const doc = createTestDoc();
    const depths: number[] = [];

    traverseNodes(doc, (node, parent, depth) => {
      if (depth !== undefined) {
        depths.push(depth);
      }
    });

    expect(depths).toEqual([0, 1, 2, 1]);
  });

  it('should skip children when visitor returns false', () => {
    const doc = createTestDoc();
    const visited: string[] = [];

    traverseNodes(doc, (node) => {
      visited.push(node.id);
      if (node.id === 'child1') {
        return false; // Skip children
      }
    });

    expect(visited).toEqual(['root', 'child1', 'child2']);
  });

  it('should traverse all nodes in shadcn-kit.pen', async () => {
    const penPath = SHADCN_PEN;
    const doc = await parsePenFileFromPath(penPath);

    let count = 0;
    traverseNodes(doc, () => {
      count++;
    });

    // shadcn-kit.pen should have 88+ nodes
    expect(count).toBeGreaterThan(88);
  });
});

describe('findNodeById', () => {
  it('should find node by ID', () => {
    const doc: PenDocument = {
      version: '2.8',
      children: [
        {
          type: 'frame',
          id: 'parent',
          children: [
            {
              type: 'text',
              id: 'target',
              content: 'Found me!',
            },
          ],
        },
      ],
    };

    const node = findNodeById(doc, 'target');
    expect(node).toBeDefined();
    expect(node?.id).toBe('target');
    expect(node?.type).toBe('text');
  });

  it('should return undefined for non-existent ID', () => {
    const doc: PenDocument = {
      version: '2.8',
      children: [
        {
          type: 'frame',
          id: 'only',
        },
      ],
    };

    const node = findNodeById(doc, 'nope');
    expect(node).toBeUndefined();
  });
});

describe('findNodes', () => {
  it('should find all nodes matching predicate', () => {
    const doc: PenDocument = {
      version: '2.8',
      children: [
        {
          type: 'frame',
          id: 'f1',
          children: [
            {
              type: 'text',
              id: 't1',
              content: 'Text 1',
            },
            {
              type: 'text',
              id: 't2',
              content: 'Text 2',
            },
            {
              type: 'frame',
              id: 'f2',
            },
          ],
        },
      ],
    };

    const textNodes = findNodes(doc, (node) => node.type === 'text');
    expect(textNodes).toHaveLength(2);
    expect(textNodes.map((n) => n.id)).toEqual(['t1', 't2']);
  });
});

describe('findReusableComponents', () => {
  it('should find all reusable components', () => {
    const doc: PenDocument = {
      version: '2.8',
      children: [
        {
          type: 'frame',
          id: 'comp1',
          reusable: true,
          name: 'Button',
        },
        {
          type: 'frame',
          id: 'regular',
          name: 'Not reusable',
        },
        {
          type: 'frame',
          id: 'comp2',
          reusable: true,
          name: 'Card',
        },
      ],
    };

    const components = findReusableComponents(doc);
    expect(components).toHaveLength(2);
    expect(components.map((c) => c.id)).toEqual(['comp1', 'comp2']);
  });

  it('should find reusable components in shadcn-kit.pen', async () => {
    const penPath = SHADCN_PEN;
    const doc = await parsePenFileFromPath(penPath);

    const components = findReusableComponents(doc);
    expect(components.length).toBeGreaterThan(0);
  });
});

describe('resolveVariable', () => {
  it('should resolve variable from theme', () => {
    const theme = {
      Mode: 'Dark',
      Base: 'Zinc',
      '--background': '#000000',
    };

    const result = resolveVariable('$--background', theme);
    expect(result).toBe('#000000');
  });

  it('should resolve variable without $ prefix', () => {
    const theme = {
      '--color': '#ff0000',
    };

    const result = resolveVariable('--color', theme);
    expect(result).toBe('#ff0000');
  });

  it('should resolve from variables before theme', () => {
    const theme = { '--color': 'theme-value' };
    const variables = { '--color': 'var-value' };

    const result = resolveVariable('$--color', theme, variables);
    expect(result).toBe('var-value');
  });

  it('should return original name if not found', () => {
    const result = resolveVariable('$--unknown', { Mode: 'Dark' });
    expect(result).toBe('$--unknown');
  });

  it('should handle theme-dependent values in shadcn-kit.pen', async () => {
    const penPath = SHADCN_PEN;
    const doc = await parsePenFileFromPath(penPath);
    const theme = extractTheme(doc);

    expect(theme).toBeDefined();
    expect(theme?.Mode).toBe('Dark');
    expect(theme?.Base).toBe('Zinc');
    expect(theme?.Accent).toBe('Violet');
  });
});

describe('resolveRef', () => {
  it('should resolve component reference', () => {
    const doc: PenDocument = {
      version: '2.8',
      children: [
        {
          type: 'frame',
          id: 'component',
          reusable: true,
          name: 'Button',
        },
        {
          type: 'frame',
          id: 'instance-parent',
          children: [
            {
              type: 'ref',
              id: 'instance',
              ref: 'component',
            },
          ],
        },
      ],
    };

    const ref = resolveRef('component', doc);
    expect(ref).toBeDefined();
    expect(ref?.id).toBe('component');
    expect(ref?.name).toBe('Button');
  });

  it('should resolve component instances in shadcn-kit.pen', async () => {
    const penPath = SHADCN_PEN;
    const doc = await parsePenFileFromPath(penPath);

    // Find a ref node
    const refs = findNodes(doc, (node) => node.type === 'ref');
    expect(refs.length).toBeGreaterThan(0);

    // Test resolving the first ref
    const refNode = refs[0] as { type: 'ref'; id: string; ref: string };
    const resolved = resolveRef(refNode.ref, doc);
    expect(resolved).toBeDefined();
  });
});

describe('extractTheme', () => {
  it('should extract theme from root frame', () => {
    const doc: PenDocument = {
      version: '2.8',
      children: [
        {
          type: 'frame',
          id: 'root',
          theme: {
            Mode: 'Dark',
            Base: 'Zinc',
          },
        },
      ],
    };

    const theme = extractTheme(doc);
    expect(theme).toBeDefined();
    expect(theme?.Mode).toBe('Dark');
    expect(theme?.Base).toBe('Zinc');
  });

  it('should return undefined if no theme found', () => {
    const doc: PenDocument = {
      version: '2.8',
      children: [
        {
          type: 'frame',
          id: 'root',
        },
      ],
    };

    const theme = extractTheme(doc);
    expect(theme).toBeUndefined();
  });
});

describe('buildComponentMap', () => {
  it('should build map of reusable components', () => {
    const doc: PenDocument = {
      version: '2.8',
      children: [
        {
          type: 'frame',
          id: 'comp1',
          reusable: true,
          name: 'Button',
        },
        {
          type: 'frame',
          id: 'regular',
        },
        {
          type: 'frame',
          id: 'parent',
          children: [
            {
              type: 'frame',
              id: 'comp2',
              reusable: true,
              name: 'Card',
            },
          ],
        },
      ],
    };

    const map = buildComponentMap(doc);
    expect(map.size).toBe(2);
    expect(map.has('comp1')).toBe(true);
    expect(map.has('comp2')).toBe(true);
    expect(map.get('comp1')?.name).toBe('Button');
  });
});

describe('integration tests with shadcn-kit.pen', () => {
  it('should parse and analyze shadcn-kit.pen completely', async () => {
    const penPath = SHADCN_PEN;
    const content = await readFile(penPath, 'utf-8');
    const doc = parsePenFile(content);

    // Verify document structure
    expect(doc.version).toBe('2.8');
    expect(doc.children.length).toBeGreaterThan(0);

    // Extract theme
    const theme = extractTheme(doc);
    expect(theme).toBeDefined();

    // Count nodes
    let nodeCount = 0;
    traverseNodes(doc, () => {
      nodeCount++;
    });
    expect(nodeCount).toBeGreaterThan(88);

    // Find reusable components
    const components = findReusableComponents(doc);
    expect(components.length).toBeGreaterThan(0);

    // Build component map
    const componentMap = buildComponentMap(doc);
    expect(componentMap.size).toBeGreaterThan(0);

    // Find refs and resolve them
    const refs = findNodes(doc, (node) => node.type === 'ref');
    if (refs.length > 0) {
      const refNode = refs[0] as { type: 'ref'; ref: string };
      const resolved = resolveRef(refNode.ref, doc);
      expect(resolved).toBeDefined();
    }
  });
});
