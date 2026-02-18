import { describe, it, expect } from 'vitest';
import {
  convertSize,
  convertPadding,
  convertCornerRadius,
  convertStroke,
  convertFrameLayout,
  convertTextLayout,
  convertNodeToStyles,
} from '../src/layout.js';
import type { PenFrame, PenText } from '../src/types.js';

const noopResolver = () => undefined;
const identityResolver = (fill: unknown) => (typeof fill === 'string' ? fill : undefined);

describe('convertSize', () => {
  it('converts number to px', () => {
    expect(convertSize(100, 'width')).toEqual({ width: '100px' });
    expect(convertSize(50, 'height')).toEqual({ height: '50px' });
  });

  it('converts fill_container to flex', () => {
    const result = convertSize('fill_container', 'width');
    expect(result.flex).toBe('1');
    expect(result.width).toBe('100%');
  });

  it('converts fill_container(min) to flex + min', () => {
    const result = convertSize('fill_container(200)', 'width');
    expect(result.flex).toBe('1');
    expect(result.minWidth).toBe('200px');
  });

  it('converts fit_content to empty (auto)', () => {
    expect(convertSize('fit_content', 'width')).toEqual({});
  });

  it('converts fit_content(max) to maxWidth', () => {
    const result = convertSize('fit_content(300)', 'width');
    expect(result.maxWidth).toBe('300px');
  });

  it('handles undefined', () => {
    expect(convertSize(undefined, 'width')).toEqual({});
  });
});

describe('convertPadding', () => {
  it('converts uniform number', () => {
    expect(convertPadding(8)).toBe('8px');
  });

  it('converts [v, h] tuple', () => {
    expect(convertPadding([8, 16])).toBe('8px 16px');
  });

  it('converts [t, r, b, l] tuple', () => {
    expect(convertPadding([4, 8, 12, 16])).toBe('4px 8px 12px 16px');
  });

  it('handles undefined', () => {
    expect(convertPadding(undefined)).toBeUndefined();
  });
});

describe('convertCornerRadius', () => {
  it('converts uniform number', () => {
    expect(convertCornerRadius(6)).toBe('6px');
  });

  it('converts per-corner array', () => {
    expect(convertCornerRadius([4, 8, 12, 16])).toBe('4px 8px 12px 16px');
  });

  it('handles undefined', () => {
    expect(convertCornerRadius(undefined)).toBeUndefined();
  });
});

describe('convertStroke', () => {
  it('converts uniform stroke to border', () => {
    const result = convertStroke({ thickness: 1, fill: '#ccc', align: 'inside' }, identityResolver);
    expect(result.border).toBe('1px solid #ccc');
  });

  it('converts per-side stroke', () => {
    const result = convertStroke(
      { thickness: { right: 1 }, fill: '#ccc', align: 'inside' },
      identityResolver
    );
    expect(result.borderRight).toBe('1px solid #ccc');
    expect(result.borderTop).toBeUndefined();
  });

  it('handles undefined stroke', () => {
    expect(convertStroke(undefined, identityResolver)).toEqual({});
  });

  it('handles stroke with no thickness', () => {
    expect(convertStroke({ align: 'inside' }, identityResolver)).toEqual({});
  });
});

describe('convertFrameLayout', () => {
  it('converts vertical layout to flexbox column', () => {
    const frame: PenFrame = {
      type: 'frame',
      id: 'test',
      layout: 'vertical',
      gap: 16,
      padding: [8, 16],
    };
    const styles = convertFrameLayout(frame, noopResolver);
    expect(styles.display).toBe('flex');
    expect(styles.flexDirection).toBe('column');
    expect(styles.gap).toBe('16px');
    expect(styles.padding).toBe('8px 16px');
  });

  it('converts horizontal layout to flexbox row', () => {
    const frame: PenFrame = {
      type: 'frame',
      id: 'test',
      layout: 'horizontal',
      alignItems: 'center',
      justifyContent: 'space_between',
    };
    const styles = convertFrameLayout(frame, noopResolver);
    expect(styles.display).toBe('flex');
    expect(styles.flexDirection).toBe('row');
    expect(styles.alignItems).toBe('center');
    expect(styles.justifyContent).toBe('space-between');
  });

  it('converts layout: none to relative positioning (as parent context)', () => {
    const frame: PenFrame = {
      type: 'frame',
      id: 'test',
      layout: 'none',
      x: 10,
      y: 20,
    };
    // With no parent context (top-level), x/y → absolute
    const styles = convertFrameLayout(frame, noopResolver);
    expect(styles.position).toBe('absolute');
    expect(styles.left).toBe('10px');
    expect(styles.top).toBe('20px');
  });

  it('positions children absolutely when parent has layout: none', () => {
    const frame: PenFrame = {
      type: 'frame',
      id: 'test',
      layout: 'vertical',
      x: 100,
      y: 200,
    };
    // With parent layout: none, child gets absolute positioning
    const styles = convertFrameLayout(frame, noopResolver, 'none');
    expect(styles.position).toBe('absolute');
    expect(styles.left).toBe('100px');
    expect(styles.top).toBe('200px');
    // Internal layout still applies
    expect(styles.display).toBe('flex');
    expect(styles.flexDirection).toBe('column');
  });

  it('does not apply absolute positioning when parent is flex', () => {
    const frame: PenFrame = {
      type: 'frame',
      id: 'test',
      layout: 'none',
      x: 10,
      y: 20,
    };
    // With parent layout: vertical, x/y are ignored (flex positioning)
    const styles = convertFrameLayout(frame, noopResolver, 'vertical');
    expect(styles.position).toBe('relative'); // relative for own children
    expect(styles.left).toBeUndefined();
    expect(styles.top).toBeUndefined();
  });

  it('resolves fill variable references', () => {
    const frame: PenFrame = {
      type: 'frame',
      id: 'test',
      fill: '$--primary',
      width: 100,
      height: 50,
    };
    const resolver = (fill: unknown) =>
      fill === '$--primary' ? '#a78bfa' : typeof fill === 'string' ? fill : undefined;
    const styles = convertFrameLayout(frame, resolver);
    expect(styles.backgroundColor).toBe('#a78bfa');
    expect(styles.width).toBe('100px');
    expect(styles.height).toBe('50px');
  });

  it('handles clip: true as overflow: hidden', () => {
    const frame: PenFrame = { type: 'frame', id: 'test', clip: true };
    const styles = convertFrameLayout(frame, noopResolver);
    expect(styles.overflow).toBe('hidden');
  });

  it('handles corner radius', () => {
    const frame: PenFrame = { type: 'frame', id: 'test', cornerRadius: 6 };
    const styles = convertFrameLayout(frame, noopResolver);
    expect(styles.borderRadius).toBe('6px');
  });

  it('handles opacity', () => {
    const frame: PenFrame = { type: 'frame', id: 'test', opacity: 0.5 };
    const styles = convertFrameLayout(frame, noopResolver);
    expect(styles.opacity).toBe('0.5');
  });

  it('handles rotation', () => {
    const frame: PenFrame = { type: 'frame', id: 'test', rotation: 45 };
    const styles = convertFrameLayout(frame, noopResolver);
    expect(styles.transform).toBe('rotate(45deg)');
  });
});

describe('convertTextLayout', () => {
  it('converts text node styles', () => {
    const text: PenText = {
      type: 'text',
      id: 'test',
      content: 'Hello',
      fill: '#fff',
      fontFamily: 'Inter',
      fontSize: 14,
      fontWeight: '500',
      textAlign: 'center',
    };
    const styles = convertTextLayout(text, identityResolver);
    expect(styles.color).toBe('#fff');
    expect(styles.fontFamily).toBe('Inter');
    expect(styles.fontSize).toBe('14px');
    expect(styles.fontWeight).toBe('500');
    expect(styles.textAlign).toBe('center');
  });

  it('resolves fill variable for text color', () => {
    const text: PenText = {
      type: 'text',
      id: 'test',
      content: 'Hello',
      fill: '$--foreground',
    };
    const resolver = (fill: unknown) =>
      fill === '$--foreground' ? '#fafafa' : typeof fill === 'string' ? fill : undefined;
    const styles = convertTextLayout(text, resolver);
    expect(styles.color).toBe('#fafafa');
  });
});

describe('convertNodeToStyles', () => {
  it('dispatches frame nodes correctly', () => {
    const frame: PenFrame = { type: 'frame', id: 'test', layout: 'vertical', width: 100 };
    const styles = convertNodeToStyles(frame, noopResolver);
    expect(styles.display).toBe('flex');
    expect(styles.width).toBe('100px');
  });

  it('dispatches text nodes correctly', () => {
    const text: PenText = { type: 'text', id: 'test', content: 'hi', fontSize: 16 };
    const styles = convertNodeToStyles(text, noopResolver);
    expect(styles.fontSize).toBe('16px');
  });

  it('handles rectangle nodes', () => {
    const rect = { type: 'rectangle' as const, id: 'test', width: 50, height: 50, fill: '#f00' };
    const styles = convertNodeToStyles(rect, identityResolver);
    expect(styles.width).toBe('50px');
    expect(styles.backgroundColor).toBe('#f00');
  });

  it('handles ellipse nodes', () => {
    const ellipse = { type: 'ellipse' as const, id: 'test', width: 40, height: 40 };
    const styles = convertNodeToStyles(ellipse, noopResolver);
    expect(styles.borderRadius).toBe('50%');
    expect(styles.width).toBe('40px');
  });

  it('handles icon_font nodes', () => {
    const icon = {
      type: 'icon_font' as const,
      id: 'test',
      width: 16,
      height: 16,
      fill: '#fff',
    };
    const styles = convertNodeToStyles(icon, identityResolver);
    expect(styles.width).toBe('16px');
    expect(styles.color).toBe('#fff');
  });
});
