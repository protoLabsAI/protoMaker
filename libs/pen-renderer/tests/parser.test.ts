import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  parsePenDocument,
  listComponents,
  getNodeById,
  getNodeByPath,
  getDocumentInfo,
} from '../src/parser.js';

// Load real shadcn-kit.pen for integration tests
const shadcnKitPath = resolve(import.meta.dirname, '../../../designs/components/shadcn-kit.pen');
const shadcnKitJson = readFileSync(shadcnKitPath, 'utf-8');

describe('parsePenDocument', () => {
  it('parses valid .pen JSON', () => {
    const json = JSON.stringify({
      version: '2.8',
      children: [
        {
          type: 'frame',
          id: 'test1',
          name: 'Test Frame',
          width: 100,
          height: 100,
          layout: 'vertical',
        },
      ],
    });

    const result = parsePenDocument(json);
    expect(result.document.version).toBe('2.8');
    expect(result.document.children).toHaveLength(1);
    expect(result.nodeIndex.size).toBe(1);
  });

  it('throws on invalid JSON', () => {
    expect(() => parsePenDocument('not json')).toThrow('Invalid PEN JSON');
  });

  it('throws on missing version', () => {
    expect(() => parsePenDocument('{"children": []}')).toThrow('missing or invalid version');
  });

  it('throws on missing children', () => {
    expect(() => parsePenDocument('{"version": "2.8"}')).toThrow('missing children');
  });

  it('throws on non-object input', () => {
    expect(() => parsePenDocument('"hello"')).toThrow('expected an object');
  });

  it('indexes nested children', () => {
    const json = JSON.stringify({
      version: '2.8',
      children: [
        {
          type: 'frame',
          id: 'parent',
          children: [
            { type: 'text', id: 'child1', content: 'hello' },
            { type: 'text', id: 'child2', content: 'world' },
          ],
        },
      ],
    });

    const result = parsePenDocument(json);
    expect(result.nodeIndex.size).toBe(3);
    expect(result.nodeIndex.has('parent')).toBe(true);
    expect(result.nodeIndex.has('child1')).toBe(true);
    expect(result.nodeIndex.has('child2')).toBe(true);
  });

  it('builds component index for reusable nodes', () => {
    const json = JSON.stringify({
      version: '2.8',
      children: [
        {
          type: 'frame',
          id: 'btn',
          reusable: true,
          name: 'Button',
          children: [{ type: 'text', id: 'label', content: 'Click' }],
        },
        { type: 'frame', id: 'other', name: 'Not reusable' },
      ],
    });

    const result = parsePenDocument(json);
    expect(result.componentIndex.size).toBe(1);
    expect(result.componentIndex.has('btn')).toBe(true);
    expect(result.componentIndex.has('other')).toBe(false);
  });
});

describe('shadcn-kit.pen integration', () => {
  it('parses the real shadcn-kit.pen file', () => {
    const result = parsePenDocument(shadcnKitJson);
    expect(result.document.version).toBe('2.8');
    expect(result.document.children.length).toBeGreaterThan(0);
  });

  it('has theme axes defined', () => {
    const result = parsePenDocument(shadcnKitJson);
    expect(result.document.themes).toBeDefined();

    const axisNames = Object.keys(result.document.themes!);
    expect(axisNames).toHaveLength(3);
    expect(axisNames).toContain('Mode');
    expect(axisNames).toContain('Base');
    expect(axisNames).toContain('Accent');
  });

  it('has variables defined', () => {
    const result = parsePenDocument(shadcnKitJson);
    expect(result.document.variables).toBeDefined();
    const varNames = Object.keys(result.document.variables!);
    expect(varNames).toContain('--primary');
    expect(varNames).toContain('--background');
    expect(varNames).toContain('--foreground');
  });

  it('indexes 80+ reusable components', () => {
    const result = parsePenDocument(shadcnKitJson);
    // shadcn-kit has 87+ reusable components
    expect(result.componentIndex.size).toBeGreaterThanOrEqual(80);
  });

  it('lists components with names', () => {
    const result = parsePenDocument(shadcnKitJson);
    const components = listComponents(result);
    expect(components.length).toBeGreaterThanOrEqual(80);

    // Check for known components
    const names = components.map((c) => c.name);
    expect(names).toContain('Sidebar');
    expect(names.some((n) => n.includes('Button'))).toBe(true);
    expect(names.some((n) => n.includes('Card'))).toBe(true);
  });

  it('finds Button/Default component by ID', () => {
    const result = parsePenDocument(shadcnKitJson);
    // VSnC2 is the Button/Default component ID from our analysis
    const button = getNodeById(result.nodeIndex, 'VSnC2');
    expect(button).toBeDefined();
    expect(button!.name).toBe('Button/Default');
    expect(button!.reusable).toBe(true);
  });

  it('returns document info correctly', () => {
    const result = parsePenDocument(shadcnKitJson);
    const info = getDocumentInfo(result);
    expect(info.version).toBe('2.8');
    expect(info.themeAxes).toHaveLength(3);
    expect(info.variableCount).toBeGreaterThanOrEqual(20);
    expect(info.componentCount).toBeGreaterThanOrEqual(80);
    expect(info.topLevelNodeCount).toBeGreaterThan(0);
  });
});

describe('getNodeByPath', () => {
  it('finds node by simple ID', () => {
    const json = JSON.stringify({
      version: '2.8',
      children: [{ type: 'frame', id: 'root', children: [] }],
    });
    const result = parsePenDocument(json);
    const node = getNodeByPath(result.nodeIndex, 'root');
    expect(node).toBeDefined();
    expect(node!.id).toBe('root');
  });

  it('finds nested node by slash path', () => {
    const json = JSON.stringify({
      version: '2.8',
      children: [
        {
          type: 'frame',
          id: 'parent',
          children: [
            {
              type: 'frame',
              id: 'child',
              children: [{ type: 'text', id: 'grandchild', content: 'deep' }],
            },
          ],
        },
      ],
    });
    const result = parsePenDocument(json);
    const node = getNodeByPath(result.nodeIndex, 'parent/child/grandchild');
    expect(node).toBeDefined();
    expect(node!.id).toBe('grandchild');
  });

  it('returns undefined for invalid path', () => {
    const json = JSON.stringify({
      version: '2.8',
      children: [{ type: 'frame', id: 'root', children: [] }],
    });
    const result = parsePenDocument(json);
    expect(getNodeByPath(result.nodeIndex, 'nonexistent')).toBeUndefined();
    expect(getNodeByPath(result.nodeIndex, 'root/nonexistent')).toBeUndefined();
  });
});
