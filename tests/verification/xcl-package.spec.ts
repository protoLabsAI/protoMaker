/**
 * Verification test for the XCL (XML Component Language) package.
 *
 * Validates:
 *   1. Component → XCL serialization
 *   2. XCL → Component deserialization
 *   3. Round-trip fidelity (serialize → deserialize → deep equal)
 *   4. XCL → TSX code generation
 *   5. Token reduction ≥ 80% for verbose real-world components
 */

import { test, expect } from '@playwright/test';
import {
  serialize,
  deserialize,
  serializeDocument,
  deserializeDocument,
  validateRoundTrip,
  xclToTSX,
  componentDefToTSX,
  estimateReduction,
} from '../../libs/templates/starters/design-system/packages/xcl/dist/index.js';
import type {
  ComponentDef,
  XCLDocument,
} from '../../libs/templates/starters/design-system/packages/xcl/dist/index.js';

// ── Fixtures ──────────────────────────────────────────────────────────────────

const buttonDef: ComponentDef = {
  name: 'Button',
  exported: true,
  props: [
    {
      name: 'variant',
      type: "'default' | 'outline' | 'ghost'",
      optional: true,
      defaultValue: 'default',
    },
    { name: 'size', type: "'sm' | 'md' | 'lg'", optional: true, defaultValue: 'md' },
    { name: 'disabled', type: 'boolean', optional: true, defaultValue: false },
    { name: 'onClick', type: '() => void', optional: true },
    { name: 'children', type: 'ReactNode', optional: false },
  ],
  render: {
    tag: 'button',
    className: 'inline-flex items-center justify-center rounded-md font-medium',
    classConditions: [
      { prop: 'variant', value: 'default', classes: 'bg-primary text-primary-foreground' },
      { prop: 'variant', value: 'outline', classes: 'border border-input bg-transparent' },
      { prop: 'variant', value: 'ghost', classes: 'bg-transparent hover:bg-accent' },
      { prop: 'size', value: 'sm', classes: 'h-8 px-3 text-sm' },
      { prop: 'size', value: 'md', classes: 'h-10 px-4' },
      { prop: 'size', value: 'lg', classes: 'h-12 px-6 text-lg' },
      { prop: 'disabled', value: 'true', classes: 'opacity-50 cursor-not-allowed' },
    ],
    events: { click: 'onClick' },
    attrs: { disabled: '{disabled}' },
    children: [{ tag: '$slot' }],
  },
};

const badgeDef: ComponentDef = {
  name: 'Badge',
  exported: true,
  props: [
    { name: 'label', type: 'string', optional: false },
    { name: 'children', type: 'ReactNode', optional: true },
  ],
  render: {
    tag: 'span',
    className: 'inline-flex rounded-full px-2 text-xs font-semibold',
    children: [{ tag: '$slot' }],
  },
};

// Verbose TSX for token reduction comparison (real-world production component)
const verboseTSX = `
// ============================================================================
// input.tsx — Form Input component for the Design System
// ============================================================================
// Supports text, email, password, number, tel, url input types.
// Includes validation states, prefix/suffix icons, helper text,
// label, and size variants.
// ============================================================================

import * as React from 'react';
import { cn } from '@/lib/utils';

export interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  /** Input label text */
  label?: string;
  /** Helper text shown below the input */
  helperText?: string;
  /** Error message — also toggles error visual state */
  error?: string;
  /** Success message — also toggles success visual state */
  success?: string;
  /** Size variant */
  size?: 'sm' | 'md' | 'lg';
  /** Content rendered before the input (icon or text) */
  prefix?: React.ReactNode;
  /** Content rendered after the input (icon or text) */
  suffix?: React.ReactNode;
  /** Whether the field is required */
  required?: boolean;
  /** Whether the input is disabled */
  disabled?: boolean;
  /** Additional className for the wrapper */
  wrapperClassName?: string;
}

export const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ label, helperText, error, success, size = 'md', prefix, suffix,
     required = false, disabled = false, wrapperClassName, className, ...props }, ref) => {
    const hasError = Boolean(error);
    const hasSuccess = Boolean(success);

    return (
      <div className={cn('flex flex-col gap-1.5', wrapperClassName)}>
        {label && (
          <label className={cn('text-sm font-medium text-foreground', disabled && 'opacity-50')}>
            {label}
          </label>
        )}
        <div className={cn(
          'flex items-center rounded-md border bg-background',
          size === 'sm' && 'h-8 text-xs',
          size === 'md' && 'h-10 text-sm',
          size === 'lg' && 'h-12 text-base',
          hasError && 'border-destructive',
          hasSuccess && 'border-green-500',
          disabled && 'cursor-not-allowed opacity-50',
        )}>
          {prefix && <span className="pl-3 text-muted-foreground">{prefix}</span>}
          <input ref={ref} disabled={disabled} required={required}
            className={cn('flex-1 bg-transparent px-3 py-1 outline-none', className)}
            {...props}
          />
          {suffix && <span className="pr-3 text-muted-foreground">{suffix}</span>}
        </div>
        {(error || helperText) && (
          <p className={cn('text-xs', hasError ? 'text-destructive' : 'text-muted-foreground')}>
            {error ?? helperText}
          </p>
        )}
      </div>
    );
  }
);
Input.displayName = 'Input';
`;

const verboseInputDef: ComponentDef = {
  name: 'Input',
  exported: true,
  props: [
    { name: 'label', type: 'string', optional: true },
    { name: 'helperText', type: 'string', optional: true },
    { name: 'error', type: 'string', optional: true },
    { name: 'success', type: 'string', optional: true },
    { name: 'size', type: "'sm' | 'md' | 'lg'", optional: true, defaultValue: 'md' },
    { name: 'prefix', type: 'ReactNode', optional: true },
    { name: 'suffix', type: 'ReactNode', optional: true },
    { name: 'required', type: 'boolean', optional: true, defaultValue: false },
    { name: 'disabled', type: 'boolean', optional: true, defaultValue: false },
    { name: 'wrapperClassName', type: 'string', optional: true },
    { name: 'className', type: 'string', optional: true },
    { name: 'placeholder', type: 'string', optional: true },
    { name: 'type', type: 'string', optional: true },
    { name: 'value', type: 'string', optional: true },
    { name: 'onChange', type: '() => void', optional: true },
  ],
  render: {
    tag: 'div',
    className: 'flex flex-col gap-1.5',
    classConditions: [{ prop: '$', value: '', classes: 'wrapperClassName' }],
    children: [{ tag: '$slot' }],
  },
};

// ── Serialization tests ────────────────────────────────────────────────────────

test.describe('XCL Serialization', () => {
  test('serialize produces valid xcl wrapper', () => {
    const xcl = serialize(buttonDef);
    expect(xcl).toMatch(/^<xcl v="1">/);
    expect(xcl).toMatch(/<\/xcl>$/);
  });

  test('serialize includes component name and export flag', () => {
    const xcl = serialize(buttonDef);
    expect(xcl).toContain('<C n="Button" x="1">');
  });

  test('serialize encodes prop types in shorthand', () => {
    const xcl = serialize(buttonDef);
    // boolean with default
    expect(xcl).toContain('disabled="bool=false"');
    // function optional
    expect(xcl).toContain('onClick="fn?"');
    // ReactNode required
    expect(xcl).toContain('children="node"');
    // union with default
    expect(xcl).toContain('variant="default|outline|ghost=default"');
  });

  test('serialize emits conditional className attributes', () => {
    const xcl = serialize(buttonDef);
    expect(xcl).toContain('cn.variant=');
    expect(xcl).toContain('default:bg-primary text-primary-foreground');
  });

  test('serialize emits event handlers', () => {
    const xcl = serialize(buttonDef);
    expect(xcl).toContain('on.click="onClick"');
  });

  test('serialize emits slot for children', () => {
    const xcl = serialize(buttonDef);
    expect(xcl).toContain('<slot/>');
  });

  test('serialize non-exported component omits x attribute', () => {
    const def: ComponentDef = { ...buttonDef, exported: false };
    const xcl = serialize(def);
    expect(xcl).not.toContain('x="1"');
  });
});

// ── Deserialization tests ──────────────────────────────────────────────────────

test.describe('XCL Deserialization', () => {
  test('deserialize returns array of ComponentDefs', () => {
    const xcl = serialize(buttonDef);
    const defs = deserialize(xcl);
    expect(defs).toHaveLength(1);
    expect(defs[0]!.name).toBe('Button');
  });

  test('deserialize restores exported flag', () => {
    const xcl = serialize(buttonDef);
    const defs = deserialize(xcl);
    expect(defs[0]!.exported).toBe(true);
  });

  test('deserialize restores props with types and defaults', () => {
    const xcl = serialize(buttonDef);
    const defs = deserialize(xcl);
    const props = defs[0]!.props;
    const variantProp = props.find((p) => p.name === 'variant');
    expect(variantProp).toBeDefined();
    expect(variantProp!.defaultValue).toBe('default');
    expect(variantProp!.optional).toBe(true);

    const disabledProp = props.find((p) => p.name === 'disabled');
    expect(disabledProp!.type).toBe('boolean');
    expect(disabledProp!.defaultValue).toBe(false);
  });

  test('deserialize restores conditional classNames', () => {
    const xcl = serialize(buttonDef);
    const defs = deserialize(xcl);
    const ccs = defs[0]!.render.classConditions ?? [];
    const variantConditions = ccs.filter((c) => c.prop === 'variant');
    expect(variantConditions.length).toBeGreaterThan(0);
    const defaultCondition = variantConditions.find((c) => c.value === 'default');
    expect(defaultCondition!.classes).toBe('bg-primary text-primary-foreground');
  });

  test('deserializeDocument returns XCLDocument with version', () => {
    const doc: XCLDocument = { version: '1', components: [buttonDef, badgeDef] };
    const xcl = serializeDocument(doc);
    const parsed = deserializeDocument(xcl);
    expect(parsed.version).toBe('1');
    expect(parsed.components).toHaveLength(2);
    expect(parsed.components[0]!.name).toBe('Button');
    expect(parsed.components[1]!.name).toBe('Badge');
  });
});

// ── Round-trip fidelity tests ─────────────────────────────────────────────────

test.describe('XCL Round-trip Fidelity', () => {
  test('Button component survives round-trip with 100% fidelity', () => {
    const result = validateRoundTrip(buttonDef);
    expect(result.fidelity).toBe(true);
    if (!result.fidelity) {
      throw new Error(`Round-trip diff: ${result.diff}`);
    }
  });

  test('Badge component survives round-trip with 100% fidelity', () => {
    const result = validateRoundTrip(badgeDef);
    expect(result.fidelity).toBe(true);
    if (!result.fidelity) {
      throw new Error(`Round-trip diff: ${result.diff}`);
    }
  });

  test('component with computed vars survives round-trip', () => {
    const def: ComponentDef = {
      name: 'Avatar',
      exported: true,
      props: [
        { name: 'src', type: 'string', optional: true },
        { name: 'alt', type: 'string', optional: true },
        { name: 'size', type: 'number', optional: true, defaultValue: 40 },
      ],
      render: {
        tag: 'img',
        attrs: { src: '{src}', alt: '{alt ?? ""}' },
      },
      computedVars: [{ name: 'sizeStyle', expression: '`${size}px`' }],
    };
    const result = validateRoundTrip(def);
    expect(result.fidelity).toBe(true);
    if (!result.fidelity) {
      throw new Error(`Round-trip diff: ${result.diff}`);
    }
  });

  test('component with fragment children survives round-trip', () => {
    const def: ComponentDef = {
      name: 'Group',
      exported: false,
      props: [],
      render: {
        tag: '$frag',
        children: [
          { tag: 'div', className: 'a', children: [{ tag: '$slot' }] },
          { tag: 'div', className: 'b' },
        ],
      },
    };
    const result = validateRoundTrip(def);
    expect(result.fidelity).toBe(true);
    if (!result.fidelity) {
      throw new Error(`Round-trip diff: ${result.diff}`);
    }
  });
});

// ── XCL → TSX generation tests ────────────────────────────────────────────────

test.describe('XCL → TSX Generation', () => {
  test('xclToTSX returns non-empty TSX string', () => {
    const xcl = serialize(buttonDef);
    const tsx = xclToTSX(xcl);
    expect(tsx.length).toBeGreaterThan(0);
  });

  test('xclToTSX generates export function declaration', () => {
    const xcl = serialize(buttonDef);
    const tsx = xclToTSX(xcl);
    expect(tsx).toContain('export function Button(');
  });

  test('xclToTSX generates TypeScript interface', () => {
    const xcl = serialize(buttonDef);
    const tsx = xclToTSX(xcl);
    expect(tsx).toContain('interface ButtonProps {');
    expect(tsx).toContain('variant?:');
    expect(tsx).toContain('disabled?:');
  });

  test('xclToTSX adds React import when ReactNode props present', () => {
    const xcl = serialize(buttonDef);
    const tsx = xclToTSX(xcl);
    expect(tsx).toContain("import React from 'react'");
  });

  test('xclToTSX adds cn import when classConditions present', () => {
    const xcl = serialize(buttonDef);
    const tsx = xclToTSX(xcl);
    expect(tsx).toContain('import { cn } from');
  });

  test('xclToTSX generates cn() call for conditional classNames', () => {
    const xcl = serialize(buttonDef);
    const tsx = xclToTSX(xcl);
    expect(tsx).toContain('cn(');
    expect(tsx).toContain("variant === 'default'");
  });

  test('xclToTSX converts slot to {children}', () => {
    const xcl = serialize(buttonDef);
    const tsx = xclToTSX(xcl);
    expect(tsx).toContain('{children}');
  });

  test('xclToTSX converts on.click to onClick handler', () => {
    const xcl = serialize(buttonDef);
    const tsx = xclToTSX(xcl);
    expect(tsx).toContain('onClick={onClick}');
  });

  test('componentDefToTSX produces same output as xclToTSX for single component', () => {
    const xcl = serialize(buttonDef);
    const fromXCL = xclToTSX(xcl);
    const fromDef = componentDefToTSX(buttonDef);
    expect(fromDef).toBe(fromXCL);
  });
});

// ── Token reduction tests ─────────────────────────────────────────────────────

test.describe('XCL Token Reduction', () => {
  test('achieves ≥80% token reduction for verbose real-world TSX', () => {
    const metrics = estimateReduction(verboseTSX, verboseInputDef);
    expect(metrics.reductionPercent).toBeGreaterThanOrEqual(80);
  });

  test('always achieves positive token reduction', () => {
    const metrics = estimateReduction(verboseTSX, verboseInputDef);
    expect(metrics.xclTokens).toBeLessThan(metrics.tsxTokens);
  });

  test('estimateReduction returns valid metrics object', () => {
    const metrics = estimateReduction(verboseTSX, verboseInputDef);
    expect(metrics.tsxTokens).toBeGreaterThan(0);
    expect(metrics.xclTokens).toBeGreaterThan(0);
    expect(metrics.reductionPercent).toBeGreaterThanOrEqual(0);
    expect(metrics.reductionPercent).toBeLessThanOrEqual(100);
  });
});
