import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { parsePenDocument } from '../src/parser.js';
import { resolveRef, resolveAllRefs } from '../src/refs.js';
import type { PenFrame, PenRef, PenText } from '../src/types.js';

const shadcnKitPath = resolve(import.meta.dirname, '../../../designs/components/shadcn-kit.pen');
const shadcnKitJson = readFileSync(shadcnKitPath, 'utf-8');

describe('resolveRef', () => {
  it('resolves a simple ref to its component', () => {
    const json = JSON.stringify({
      version: '2.8',
      children: [
        {
          type: 'frame',
          id: 'btn',
          name: 'Button',
          reusable: true,
          fill: '#000',
          children: [{ type: 'text', id: 'label', content: 'Click' }],
        },
        {
          type: 'ref',
          id: 'instance1',
          ref: 'btn',
        },
      ],
    });

    const result = parsePenDocument(json);
    const ref = result.nodeIndex.get('instance1') as PenRef;
    const resolved = resolveRef(ref, result.componentIndex, result.nodeIndex);

    expect(resolved).toBeDefined();
    expect(resolved!.id).toBe('instance1'); // Instance ID, not component ID
    expect(resolved!.type).toBe('frame');
    expect((resolved as PenFrame).fill).toBe('#000');
    expect((resolved as PenFrame).children).toHaveLength(1);
    expect(((resolved as PenFrame).children![0] as PenText).content).toBe('Click');
  });

  it('applies direct property overrides', () => {
    const json = JSON.stringify({
      version: '2.8',
      children: [
        {
          type: 'frame',
          id: 'btn',
          name: 'Button',
          reusable: true,
          fill: '#000',
          width: 100,
        },
        {
          type: 'ref',
          id: 'instance1',
          ref: 'btn',
          fill: '#f00',
          width: 200,
          name: 'Red Button',
        },
      ],
    });

    const result = parsePenDocument(json);
    const ref = result.nodeIndex.get('instance1') as PenRef;
    const resolved = resolveRef(ref, result.componentIndex, result.nodeIndex);

    expect(resolved).toBeDefined();
    expect((resolved as PenFrame).fill).toBe('#f00');
    expect((resolved as PenFrame).width).toBe(200);
    expect(resolved!.name).toBe('Red Button');
  });

  it('applies descendant overrides', () => {
    const json = JSON.stringify({
      version: '2.8',
      children: [
        {
          type: 'frame',
          id: 'btn',
          name: 'Button',
          reusable: true,
          children: [{ type: 'text', id: 'label', content: 'Click', fill: '#fff' }],
        },
        {
          type: 'ref',
          id: 'instance1',
          ref: 'btn',
          descendants: {
            label: { content: 'Submit', fill: '#000' },
          },
        },
      ],
    });

    const result = parsePenDocument(json);
    const ref = result.nodeIndex.get('instance1') as PenRef;
    const resolved = resolveRef(ref, result.componentIndex, result.nodeIndex);

    expect(resolved).toBeDefined();
    const textChild = (resolved as PenFrame).children![0] as PenText;
    expect(textChild.content).toBe('Submit');
    expect(textChild.fill).toBe('#000');
  });

  it('returns undefined for missing component reference', () => {
    const json = JSON.stringify({
      version: '2.8',
      children: [
        {
          type: 'ref',
          id: 'instance1',
          ref: 'nonexistent',
        },
      ],
    });

    const result = parsePenDocument(json);
    const ref = result.nodeIndex.get('instance1') as PenRef;
    const resolved = resolveRef(ref, result.componentIndex, result.nodeIndex);
    expect(resolved).toBeUndefined();
  });

  it('prevents infinite recursion on circular refs', () => {
    const json = JSON.stringify({
      version: '2.8',
      children: [
        {
          type: 'frame',
          id: 'a',
          reusable: true,
          children: [{ type: 'ref', id: 'aRef', ref: 'a' }],
        },
      ],
    });

    const result = parsePenDocument(json);
    const node = result.nodeIndex.get('a') as PenFrame;
    // Manually create a ref to test recursion protection
    const ref: PenRef = { type: 'ref', id: 'test', ref: 'a' };
    // Should not throw or hang — maxDepth prevents infinite recursion
    const resolved = resolveRef(ref, result.componentIndex, result.nodeIndex, 3);
    expect(resolved).toBeDefined();
  });

  it('replaces children when ref provides its own', () => {
    const json = JSON.stringify({
      version: '2.8',
      children: [
        {
          type: 'frame',
          id: 'card',
          name: 'Card',
          reusable: true,
          children: [{ type: 'text', id: 'placeholder', content: 'Default content' }],
        },
        {
          type: 'ref',
          id: 'instance1',
          ref: 'card',
          children: [{ type: 'text', id: 'custom', content: 'Custom content' }],
        },
      ],
    });

    const result = parsePenDocument(json);
    const ref = result.nodeIndex.get('instance1') as PenRef;
    const resolved = resolveRef(ref, result.componentIndex, result.nodeIndex);

    expect(resolved).toBeDefined();
    const children = (resolved as PenFrame).children!;
    expect(children).toHaveLength(1);
    expect((children[0] as PenText).content).toBe('Custom content');
  });
});

describe('resolveAllRefs', () => {
  it('resolves all refs in a node array', () => {
    const json = JSON.stringify({
      version: '2.8',
      children: [
        {
          type: 'frame',
          id: 'btn',
          reusable: true,
          fill: '#000',
          children: [],
        },
        { type: 'ref', id: 'i1', ref: 'btn', fill: '#f00' },
        { type: 'ref', id: 'i2', ref: 'btn', fill: '#0f0' },
        { type: 'frame', id: 'plain', fill: '#00f', children: [] },
      ],
    });

    const result = parsePenDocument(json);
    const resolved = resolveAllRefs(
      result.document.children,
      result.componentIndex,
      result.nodeIndex
    );

    // All nodes should be resolved (refs expanded)
    expect(resolved).toHaveLength(4);
    // Refs should be resolved to frames
    expect(resolved[1].type).toBe('frame');
    expect((resolved[1] as PenFrame).fill).toBe('#f00');
    expect(resolved[2].type).toBe('frame');
    expect((resolved[2] as PenFrame).fill).toBe('#0f0');
    // Plain node should be unchanged
    expect(resolved[3].type).toBe('frame');
    expect((resolved[3] as PenFrame).fill).toBe('#00f');
  });

  it('does not modify the original tree', () => {
    const json = JSON.stringify({
      version: '2.8',
      children: [
        { type: 'frame', id: 'btn', reusable: true, fill: '#000', children: [] },
        { type: 'ref', id: 'i1', ref: 'btn', fill: '#f00' },
      ],
    });

    const result = parsePenDocument(json);
    const originalSecond = result.document.children[1];
    resolveAllRefs(result.document.children, result.componentIndex, result.nodeIndex);
    // Original should still be a ref
    expect(originalSecond.type).toBe('ref');
  });
});

describe('shadcn-kit.pen ref resolution', () => {
  const result = parsePenDocument(shadcnKitJson);

  it('finds Badge/Secondary as a ref to Badge/Default', () => {
    // WuUMk is Badge/Secondary, UjXug is Badge/Default from analysis
    const badgeSecondary = result.nodeIndex.get('WuUMk');
    expect(badgeSecondary).toBeDefined();
    expect(badgeSecondary!.type).toBe('ref');
    expect((badgeSecondary as PenRef).ref).toBe('UjXug');
  });

  it('resolves Badge/Secondary to a frame with overridden fill', () => {
    const badgeSecondary = result.nodeIndex.get('WuUMk') as PenRef;
    const resolved = resolveRef(badgeSecondary, result.componentIndex, result.nodeIndex);

    expect(resolved).toBeDefined();
    expect(resolved!.type).toBe('frame');
    // Badge/Secondary overrides fill to $--secondary
    expect((resolved as PenFrame).fill).toBe('$--secondary');
  });

  it('resolves Button/Default component structure', () => {
    // VSnC2 is Button/Default
    const button = result.componentIndex.get('VSnC2');
    expect(button).toBeDefined();
    expect(button!.type).toBe('frame');
    expect((button as PenFrame).fill).toBe('$--primary');

    // Should have children (icon + text)
    const children = (button as PenFrame).children;
    expect(children).toBeDefined();
    expect(children!.length).toBeGreaterThanOrEqual(1);
  });
});
