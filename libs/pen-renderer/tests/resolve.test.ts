import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { parsePenDocument } from '../src/parser.js';
import { resolveDocument, resolveComponent } from '../src/resolve.js';
import type { PenThemeSelection } from '../src/types.js';

const shadcnKitPath = resolve(import.meta.dirname, '../../../designs/components/shadcn-kit.pen');
const shadcnKitJson = readFileSync(shadcnKitPath, 'utf-8');

describe('resolveDocument', () => {
  it('resolves a simple document', () => {
    const json = JSON.stringify({
      version: '2.8',
      variables: {
        '--bg': { type: 'color', value: [{ value: '#09090b' }] },
      },
      children: [
        {
          type: 'frame',
          id: 'root',
          layout: 'vertical',
          fill: '$--bg',
          width: 800,
          height: 600,
          children: [{ type: 'text', id: 't1', content: 'Hello', fill: '#fff', fontSize: 16 }],
        },
      ],
    });

    const result = parsePenDocument(json);
    const resolved = resolveDocument(result, {});

    expect(resolved).toHaveLength(1);
    expect(resolved[0].type).toBe('frame');
    expect(resolved[0].styles.display).toBe('flex');
    expect(resolved[0].styles.flexDirection).toBe('column');
    expect(resolved[0].styles.backgroundColor).toBe('#09090b');
    expect(resolved[0].styles.width).toBe('800px');
    expect(resolved[0].styles.height).toBe('600px');

    expect(resolved[0].children).toHaveLength(1);
    expect(resolved[0].children![0].type).toBe('text');
    expect(resolved[0].children![0].content).toBe('Hello');
    expect(resolved[0].children![0].styles.color).toBe('#fff');
    expect(resolved[0].children![0].styles.fontSize).toBe('16px');
  });

  it('resolves refs within the document', () => {
    const json = JSON.stringify({
      version: '2.8',
      children: [
        {
          type: 'frame',
          id: 'btn',
          reusable: true,
          fill: '#000',
          children: [{ type: 'text', id: 'label', content: 'Click' }],
        },
        {
          type: 'frame',
          id: 'page',
          layout: 'vertical',
          children: [{ type: 'ref', id: 'i1', ref: 'btn', fill: '#f00' }],
        },
      ],
    });

    const result = parsePenDocument(json);
    const resolved = resolveDocument(result, {});

    // The page frame should have a resolved child (expanded from ref)
    const page = resolved[1];
    expect(page.children).toHaveLength(1);
    expect(page.children![0].type).toBe('frame');
    expect(page.children![0].styles.backgroundColor).toBe('#f00');
    expect(page.children![0].children).toHaveLength(1);
    expect(page.children![0].children![0].content).toBe('Click');
  });

  it('skips invisible nodes', () => {
    const json = JSON.stringify({
      version: '2.8',
      children: [
        { type: 'frame', id: 'visible', width: 100 },
        { type: 'frame', id: 'hidden', visible: false, width: 200 },
      ],
    });

    const result = parsePenDocument(json);
    const resolved = resolveDocument(result, {});
    expect(resolved).toHaveLength(1);
    expect(resolved[0].id).toBe('visible');
  });
});

describe('resolveComponent', () => {
  it('resolves a single component by ID', () => {
    const json = JSON.stringify({
      version: '2.8',
      variables: {
        '--primary': { type: 'color', value: [{ value: '#a78bfa' }] },
        '--primary-foreground': { type: 'color', value: [{ value: '#1a1625' }] },
      },
      children: [
        {
          type: 'frame',
          id: 'root',
          children: [
            {
              type: 'frame',
              id: 'btn',
              name: 'Button',
              reusable: true,
              fill: '$--primary',
              cornerRadius: 6,
              gap: 6,
              padding: [8, 16],
              justifyContent: 'center',
              alignItems: 'center',
              children: [
                {
                  type: 'text',
                  id: 'label',
                  content: 'Button',
                  fill: '$--primary-foreground',
                  fontSize: 14,
                  fontWeight: '500',
                },
              ],
            },
          ],
        },
      ],
    });

    const result = parsePenDocument(json);
    const resolved = resolveComponent(result, 'btn', {});

    expect(resolved).toBeDefined();
    expect(resolved!.name).toBe('Button');
    expect(resolved!.styles.backgroundColor).toBe('#a78bfa');
    expect(resolved!.styles.borderRadius).toBe('6px');
    expect(resolved!.styles.gap).toBe('6px');
    expect(resolved!.styles.padding).toBe('8px 16px');
    expect(resolved!.styles.justifyContent).toBe('center');
    expect(resolved!.styles.alignItems).toBe('center');

    expect(resolved!.children).toHaveLength(1);
    expect(resolved!.children![0].content).toBe('Button');
    expect(resolved!.children![0].styles.color).toBe('#1a1625');
  });

  it('returns undefined for non-existent component', () => {
    const json = JSON.stringify({ version: '2.8', children: [] });
    const result = parsePenDocument(json);
    expect(resolveComponent(result, 'nonexistent', {})).toBeUndefined();
  });
});

describe('shadcn-kit.pen full resolution', () => {
  const result = parsePenDocument(shadcnKitJson);
  const brandTheme: PenThemeSelection = { Mode: 'Dark', Base: 'Zinc', Accent: 'Violet' };

  it('resolves the full document without errors', () => {
    const resolved = resolveDocument(result, brandTheme);
    expect(resolved.length).toBeGreaterThan(0);
  });

  it('resolves Button/Default component with brand theme', () => {
    const button = resolveComponent(result, 'VSnC2', brandTheme);

    expect(button).toBeDefined();
    expect(button!.name).toBe('Button/Default');
    expect(button!.styles.backgroundColor).toBeDefined();
    // Should have children (icon wrapper + text)
    expect(button!.children).toBeDefined();
    expect(button!.children!.length).toBeGreaterThanOrEqual(1);
  });

  it('resolves Sidebar component with nested children', () => {
    // PV1ln is the Sidebar component
    const sidebar = resolveComponent(result, 'PV1ln', brandTheme);

    expect(sidebar).toBeDefined();
    expect(sidebar!.name).toBe('Sidebar');
    expect(sidebar!.styles.display).toBe('flex');
    expect(sidebar!.styles.flexDirection).toBe('column');
    expect(sidebar!.children).toBeDefined();
    expect(sidebar!.children!.length).toBeGreaterThan(0);
  });

  it('resolves differently for Light vs Dark theme', () => {
    const lightTheme: PenThemeSelection = { Mode: 'Light', Base: 'Zinc', Accent: 'Violet' };

    const darkButton = resolveComponent(result, 'VSnC2', brandTheme);
    const lightButton = resolveComponent(result, 'VSnC2', lightTheme);

    expect(darkButton).toBeDefined();
    expect(lightButton).toBeDefined();

    // Background colors should differ between themes
    // (exact values depend on the variable definitions in shadcn-kit.pen)
    if (darkButton!.styles.backgroundColor && lightButton!.styles.backgroundColor) {
      expect(darkButton!.styles.backgroundColor).not.toBe(lightButton!.styles.backgroundColor);
    }
  });

  it('resolves icon_font nodes with icon metadata', () => {
    // Navigate Button/Default → icon wrapper → icon_font
    const button = resolveComponent(result, 'VSnC2', brandTheme);
    expect(button).toBeDefined();

    // Find the icon node in the tree
    function findIcon(node: {
      type: string;
      iconFamily?: string;
      iconName?: string;
      children?: unknown[];
    }): { iconFamily?: string; iconName?: string } | undefined {
      if (node.type === 'icon_font') return node;
      if (node.children) {
        for (const child of node.children as Array<typeof node>) {
          const found = findIcon(child);
          if (found) return found;
        }
      }
      return undefined;
    }

    const icon = findIcon(button!);
    if (icon) {
      expect(icon.iconFamily).toBeDefined();
      expect(icon.iconName).toBeDefined();
    }
  });
});
