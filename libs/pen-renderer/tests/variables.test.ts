import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { parsePenDocument } from '../src/parser.js';
import {
  resolveVariable,
  resolveAllVariables,
  resolveFillValue,
  createVariableResolver,
} from '../src/variables.js';
import type { PenVariable, PenThemeSelection } from '../src/types.js';

const shadcnKitPath = resolve(import.meta.dirname, '../../../designs/components/shadcn-kit.pen');
const shadcnKitJson = readFileSync(shadcnKitPath, 'utf-8');

describe('resolveVariable', () => {
  it('returns unthemed default when no theme match', () => {
    const variable: PenVariable = {
      type: 'color',
      value: [{ value: '#ff0000' }],
    };
    const result = resolveVariable(variable, {});
    expect(result).toBe('#ff0000');
  });

  it('returns most specific theme match', () => {
    const variable: PenVariable = {
      type: 'color',
      value: [
        { value: '#default' },
        { value: '#dark', theme: { Mode: 'Dark' } },
        { value: '#dark-zinc', theme: { Mode: 'Dark', Base: 'Zinc' } },
        {
          value: '#dark-zinc-violet',
          theme: { Mode: 'Dark', Base: 'Zinc', Accent: 'Violet' },
        },
      ],
    };

    // Full match → most specific
    expect(resolveVariable(variable, { Mode: 'Dark', Base: 'Zinc', Accent: 'Violet' })).toBe(
      '#dark-zinc-violet'
    );

    // Partial match → matches by specificity
    expect(resolveVariable(variable, { Mode: 'Dark', Base: 'Zinc' })).toBe('#dark-zinc');

    expect(resolveVariable(variable, { Mode: 'Dark' })).toBe('#dark');

    // No match → falls back to default
    expect(resolveVariable(variable, { Mode: 'Light' })).toBe('#default');
  });

  it('returns undefined for empty variable', () => {
    const variable: PenVariable = { type: 'color', value: [] };
    expect(resolveVariable(variable, {})).toBeUndefined();
  });

  it('handles variables with only themed values (no default)', () => {
    const variable: PenVariable = {
      type: 'color',
      value: [
        { value: '#light', theme: { Mode: 'Light' } },
        { value: '#dark', theme: { Mode: 'Dark' } },
      ],
    };

    expect(resolveVariable(variable, { Mode: 'Dark' })).toBe('#dark');
    expect(resolveVariable(variable, { Mode: 'Light' })).toBe('#light');
    // No match and no default
    expect(resolveVariable(variable, { Mode: 'HighContrast' })).toBeUndefined();
  });

  it('prefers higher specificity over first match', () => {
    const variable: PenVariable = {
      type: 'color',
      value: [
        { value: '#one-axis', theme: { Mode: 'Dark' } },
        { value: '#two-axes', theme: { Mode: 'Dark', Base: 'Zinc' } },
      ],
    };

    expect(resolveVariable(variable, { Mode: 'Dark', Base: 'Zinc' })).toBe('#two-axes');
  });

  it('breaks ties between equal-score entries with last-wins when both fully match', () => {
    // Simulates --primary in shadcn: Mode+Base vs Mode+Accent both score 2
    const variable: PenVariable = {
      type: 'color',
      value: [
        { value: '#default' },
        { value: '#dark-zinc', theme: { Mode: 'Dark', Base: 'Zinc' } },
        { value: '#dark-violet', theme: { Mode: 'Dark', Accent: 'Violet' } },
      ],
    };

    // When all axes specified: both entries are full matches, last-wins → violet
    expect(resolveVariable(variable, { Mode: 'Dark', Base: 'Zinc', Accent: 'Violet' })).toBe(
      '#dark-violet'
    );
  });

  it('prefers full match over partial match at same score', () => {
    const variable: PenVariable = {
      type: 'color',
      value: [
        { value: '#default' },
        { value: '#dark-zinc', theme: { Mode: 'Dark', Base: 'Zinc' } },
        { value: '#dark-zinc-violet', theme: { Mode: 'Dark', Base: 'Zinc', Accent: 'Violet' } },
      ],
    };

    // When theme only specifies 2 axes, the 3-axis entry is a partial match
    // The 2-axis entry is a full match and should win despite lower specificity
    expect(resolveVariable(variable, { Mode: 'Dark', Base: 'Zinc' })).toBe('#dark-zinc');
  });
});

describe('resolveAllVariables', () => {
  it('resolves all variables for a given theme', () => {
    const variables: Record<string, PenVariable> = {
      '--primary': {
        type: 'color',
        value: [{ value: '#000' }, { value: '#a78bfa', theme: { Accent: 'Violet' } }],
      },
      '--background': {
        type: 'color',
        value: [{ value: '#fff' }, { value: '#09090b', theme: { Mode: 'Dark' } }],
      },
    };

    const resolved = resolveAllVariables(variables, { Mode: 'Dark', Accent: 'Violet' });
    expect(resolved.get('--primary')).toBe('#a78bfa');
    expect(resolved.get('--background')).toBe('#09090b');
  });
});

describe('resolveFillValue', () => {
  it('resolves variable references', () => {
    const vars = new Map<string, string | number | boolean>([['--primary', '#a78bfa']]);
    expect(resolveFillValue('$--primary', vars)).toBe('#a78bfa');
  });

  it('passes through plain colors', () => {
    const vars = new Map<string, string | number | boolean>();
    expect(resolveFillValue('#ff0000', vars)).toBe('#ff0000');
  });

  it('returns undefined for missing variable', () => {
    const vars = new Map<string, string | number | boolean>();
    expect(resolveFillValue('$--nonexistent', vars)).toBeUndefined();
  });

  it('returns undefined for non-string fills', () => {
    const vars = new Map<string, string | number | boolean>();
    expect(resolveFillValue({ type: 'linear', angle: 0, stops: [] }, vars)).toBeUndefined();
  });
});

describe('shadcn-kit.pen variable resolution', () => {
  const result = parsePenDocument(shadcnKitJson);
  const variables = result.document.variables!;

  it('resolves --primary to violet for Dark/Zinc/Violet theme', () => {
    const theme: PenThemeSelection = { Mode: 'Dark', Base: 'Zinc', Accent: 'Violet' };
    const value = resolveVariable(variables['--primary'], theme);
    // Should resolve to the violet accent color, not the zinc base gray
    expect(value).toBe('#8b5cf6');
  });

  it('resolves --background for Dark/Zinc theme', () => {
    const theme: PenThemeSelection = { Mode: 'Dark', Base: 'Zinc' };
    const value = resolveVariable(variables['--background'], theme);
    expect(value).toBeDefined();
  });

  it('resolves most variables for brand theme', () => {
    const theme: PenThemeSelection = { Mode: 'Dark', Base: 'Zinc', Accent: 'Violet' };
    const resolved = resolveAllVariables(variables, theme);

    // Most variables should resolve — some may not have entries for all theme combos
    const totalVars = Object.keys(variables).length;
    const resolvedCount = resolved.size;
    expect(resolvedCount).toBeGreaterThan(totalVars * 0.8);
  });

  it('resolves differently for Light vs Dark mode', () => {
    const light: PenThemeSelection = { Mode: 'Light', Base: 'Zinc', Accent: 'Violet' };
    const dark: PenThemeSelection = { Mode: 'Dark', Base: 'Zinc', Accent: 'Violet' };

    const lightBg = resolveVariable(variables['--background'], light);
    const darkBg = resolveVariable(variables['--background'], dark);

    expect(lightBg).toBeDefined();
    expect(darkBg).toBeDefined();
    expect(lightBg).not.toBe(darkBg);
  });

  it('createVariableResolver resolves $--primary from document', () => {
    const theme: PenThemeSelection = { Mode: 'Dark', Base: 'Zinc', Accent: 'Violet' };
    const resolver = createVariableResolver(result.document, theme);
    const value = resolver('$--primary');
    expect(value).toBeDefined();
    expect(typeof value).toBe('string');
  });
});
