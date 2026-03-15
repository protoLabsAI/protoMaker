/**
 * TokensRoute — /tokens
 *
 * Browse and inspect design tokens from CSS custom properties and .pen files.
 * Supports loading .pen files to extract DTCG tokens with theme variants.
 */

import React, { useCallback, useMemo, useRef, useState } from 'react';
import { parsePenFile } from '@@PROJECT_NAME-pen';
import { extractTokensFromPen, walkTokens } from '@@PROJECT_NAME-tokens';
import type { DTCGToken, DTCGTokenType } from '@@PROJECT_NAME-tokens';

// ─── Types ──────────────────────────────────────────────────────────────────

type TokenCategory = 'color' | 'spacing' | 'typography' | 'other';

interface FlatToken {
  path: string;
  cssVar: string;
  value: string | number;
  type: DTCGTokenType | undefined;
  category: TokenCategory;
  themes?: Record<string, string | number>;
}

// ─── Category classifier ───────────────────────────────────────────────────

function classifyToken(path: string, type: DTCGTokenType | undefined): TokenCategory {
  if (type === 'color') return 'color';
  if (type === 'dimension') return 'spacing';
  if (type === 'font-family' || type === 'font-weight' || type === 'font-style') return 'typography';
  const lower = path.toLowerCase();
  if (lower.includes('color') || lower.includes('bg') || lower.includes('fill')) return 'color';
  if (lower.includes('space') || lower.includes('size') || lower.includes('radius') || lower.includes('gap') || lower.includes('padding')) return 'spacing';
  if (lower.includes('font') || lower.includes('weight') || lower.includes('line-height') || lower.includes('letter')) return 'typography';
  return 'other';
}

// ─── CSS variable reader ────────────────────────────────────────────────────

function readCSSVariables(): FlatToken[] {
  const tokens: FlatToken[] = [];
  try {
    for (const sheet of document.styleSheets) {
      try {
        for (const rule of sheet.cssRules) {
          if (!(rule instanceof CSSStyleRule) || rule.selectorText !== ':root') continue;
          for (let i = 0; i < rule.style.length; i++) {
            const prop = rule.style[i];
            if (!prop.startsWith('--')) continue;
            const value = rule.style.getPropertyValue(prop).trim();
            const path = prop.replace(/^--/, '').replace(/-/g, '.');
            const category = classifyToken(path, undefined);
            tokens.push({ path, cssVar: prop, value, type: undefined, category });
          }
        }
      } catch {
        // Cross-origin stylesheet — skip
      }
    }
  } catch {
    // Stylesheet access error — skip
  }
  return tokens;
}

// ─── Styles ─────────────────────────────────────────────────────────────────

const baseFont: React.CSSProperties = {
  fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif',
  fontSize: 14,
};

const sectionHead: React.CSSProperties = {
  fontSize: 11,
  fontWeight: 700,
  letterSpacing: '0.06em',
  textTransform: 'uppercase',
  color: 'var(--pg-muted)',
  marginBottom: 12,
  marginTop: 0,
};

const monoFont: React.CSSProperties = {
  fontFamily: 'ui-monospace, "Cascadia Code", Menlo, monospace',
  fontSize: 12,
};

// ─── Token renderers ────────────────────────────────────────────────────────

function ColorToken({ token }: { token: FlatToken }) {
  const val = String(token.value);
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '8px 0' }}>
      <div
        style={{
          width: 32,
          height: 32,
          borderRadius: 6,
          background: val,
          border: '1px solid var(--pg-border)',
          flexShrink: 0,
        }}
      />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ ...monoFont, color: 'var(--pg-fg)' }}>{token.cssVar}</div>
        <div style={{ ...monoFont, color: 'var(--pg-muted)', fontSize: 11, marginTop: 2 }}>{val}</div>
      </div>
      {token.themes && <ThemeBadges themes={token.themes} type="color" />}
    </div>
  );
}

function SpacingToken({ token }: { token: FlatToken }) {
  const val = String(token.value);
  const numericPx = parseFloat(val);
  const barWidth = isNaN(numericPx) ? 20 : Math.min(Math.max(numericPx, 2), 200);
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '8px 0' }}>
      <div
        style={{
          width: barWidth,
          height: 12,
          borderRadius: 3,
          background: 'var(--pg-accent)',
          opacity: 0.6,
          flexShrink: 0,
        }}
      />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ ...monoFont, color: 'var(--pg-fg)' }}>{token.cssVar}</div>
        <div style={{ ...monoFont, color: 'var(--pg-muted)', fontSize: 11, marginTop: 2 }}>{val}</div>
      </div>
      {token.themes && <ThemeBadges themes={token.themes} type="spacing" />}
    </div>
  );
}

function TypographyToken({ token }: { token: FlatToken }) {
  const val = String(token.value);
  const sampleStyle: React.CSSProperties = {};
  const lower = token.path.toLowerCase();
  if (lower.includes('size') || token.type === 'dimension') sampleStyle.fontSize = val;
  if (lower.includes('weight') || token.type === 'font-weight') sampleStyle.fontWeight = val;
  if (lower.includes('family') || token.type === 'font-family') sampleStyle.fontFamily = val;
  if (lower.includes('line-height')) sampleStyle.lineHeight = val;

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '8px 0' }}>
      <div style={{ width: 120, flexShrink: 0 }}>
        <span style={{ color: 'var(--pg-fg)', ...sampleStyle }}>Aa Bb Cc</span>
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ ...monoFont, color: 'var(--pg-fg)' }}>{token.cssVar}</div>
        <div style={{ ...monoFont, color: 'var(--pg-muted)', fontSize: 11, marginTop: 2 }}>{val}</div>
      </div>
      {token.themes && <ThemeBadges themes={token.themes} type="typography" />}
    </div>
  );
}

function GenericToken({ token }: { token: FlatToken }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '8px 0' }}>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ ...monoFont, color: 'var(--pg-fg)' }}>{token.cssVar}</div>
        <div style={{ ...monoFont, color: 'var(--pg-muted)', fontSize: 11, marginTop: 2 }}>{String(token.value)}</div>
      </div>
      {token.themes && <ThemeBadges themes={token.themes} type="other" />}
    </div>
  );
}

function ThemeBadges({ themes, type }: { themes: Record<string, string | number>; type: string }) {
  return (
    <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
      {Object.entries(themes).map(([mode, val]) => (
        <div
          key={mode}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 4,
            padding: '2px 8px',
            borderRadius: 9999,
            border: '1px solid var(--pg-border)',
            fontSize: 11,
            ...monoFont,
            color: 'var(--pg-muted)',
          }}
        >
          {type === 'color' && (
            <div
              style={{
                width: 10,
                height: 10,
                borderRadius: '50%',
                background: String(val),
                border: '1px solid var(--pg-border)',
              }}
            />
          )}
          <span>{mode}: {String(val)}</span>
        </div>
      ))}
    </div>
  );
}

function TokenGrid({ tokens, category }: { tokens: FlatToken[]; category: TokenCategory }) {
  const Renderer =
    category === 'color' ? ColorToken
    : category === 'spacing' ? SpacingToken
    : category === 'typography' ? TypographyToken
    : GenericToken;

  return (
    <div>
      {tokens.map((t) => (
        <Renderer key={t.cssVar} token={t} />
      ))}
    </div>
  );
}

// ─── TokensRoute ────────────────────────────────────────────────────────────

const CATEGORIES: TokenCategory[] = ['color', 'spacing', 'typography', 'other'];
const CATEGORY_LABELS: Record<TokenCategory, string> = {
  color: 'Color',
  spacing: 'Spacing',
  typography: 'Typography',
  other: 'Other',
};

type TokenSource = 'css' | 'pen';

export default function TokensRoute() {
  const [source, setSource] = useState<TokenSource>('css');
  const [activeCategory, setActiveCategory] = useState<TokenCategory>('color');
  const [penTokens, setPenTokens] = useState<FlatToken[]>([]);
  const [penFileName, setPenFileName] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const cssTokens = useMemo(readCSSVariables, []);

  const handleFileLoad = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setError(null);

    try {
      const text = await file.text();
      const doc = parsePenFile(text);

      if (!doc.variables || Object.keys(doc.variables).length === 0) {
        setError('No variables found in this .pen file.');
        return;
      }

      const { document: dtcgDoc } = extractTokensFromPen(
        doc.variables as Record<string, { type: string; value: string | number | Array<{ value: string | number; theme: Record<string, string> }> }>,
        doc.themes as Record<string, string[]> | undefined,
      );

      const flat: FlatToken[] = [];
      walkTokens(dtcgDoc, (token: DTCGToken, path: string, resolvedType: DTCGTokenType | undefined) => {
        const cssVar = '--' + path.replace(/\./g, '-');
        const category = classifyToken(path, resolvedType);
        const themes = (token.$extensions as Record<string, unknown> | undefined)?.['themes'] as Record<string, string | number> | undefined;
        flat.push({
          path,
          cssVar,
          value: token.$value as string | number,
          type: resolvedType,
          category,
          themes: themes && Object.keys(themes).length > 0 ? themes : undefined,
        });
      });

      setPenTokens(flat);
      setPenFileName(file.name);
      setSource('pen');
    } catch (err) {
      setError(`Failed to parse .pen file: ${err instanceof Error ? err.message : String(err)}`);
    }
  }, []);

  const tokens = source === 'css' ? cssTokens : penTokens;
  const grouped = useMemo(() => {
    const map: Record<TokenCategory, FlatToken[]> = { color: [], spacing: [], typography: [], other: [] };
    for (const t of tokens) {
      map[t.category].push(t);
    }
    return map;
  }, [tokens]);

  const activeTokens = grouped[activeCategory];

  return (
    <div style={{ ...baseFont, display: 'flex', flexDirection: 'column', height: '100%', background: 'var(--pg-bg)', color: 'var(--pg-fg)' }}>
      {/* Toolbar */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 12,
          padding: '10px 20px',
          background: 'var(--pg-toolbar)',
          borderBottom: '1px solid var(--pg-border)',
        }}
      >
        <span style={{ fontWeight: 600, fontSize: 15 }}>Design Tokens</span>

        <div style={{ display: 'flex', gap: 2, marginLeft: 16 }}>
          <button
            onClick={() => setSource('css')}
            style={{
              padding: '4px 12px',
              borderRadius: 6,
              border: 'none',
              background: source === 'css' ? 'var(--pg-selected-bg)' : 'transparent',
              color: source === 'css' ? 'var(--pg-accent)' : 'var(--pg-muted)',
              fontWeight: source === 'css' ? 600 : 400,
              fontSize: 12,
              cursor: 'pointer',
              fontFamily: 'inherit',
            }}
          >
            CSS Variables ({cssTokens.length})
          </button>
          {penTokens.length > 0 && (
            <button
              onClick={() => setSource('pen')}
              style={{
                padding: '4px 12px',
                borderRadius: 6,
                border: 'none',
                background: source === 'pen' ? 'var(--pg-selected-bg)' : 'transparent',
                color: source === 'pen' ? 'var(--pg-accent)' : 'var(--pg-muted)',
                fontWeight: source === 'pen' ? 600 : 400,
                fontSize: 12,
                cursor: 'pointer',
                fontFamily: 'inherit',
              }}
            >
              {penFileName} ({penTokens.length})
            </button>
          )}
        </div>

        <div style={{ flex: 1 }} />

        <button
          onClick={() => fileInputRef.current?.click()}
          style={{
            padding: '6px 14px',
            borderRadius: 6,
            border: '1px solid var(--pg-border)',
            background: 'var(--pg-surface-2)',
            color: 'var(--pg-fg)',
            fontSize: 12,
            cursor: 'pointer',
            fontFamily: 'inherit',
          }}
        >
          Load .pen file
        </button>
        <input
          ref={fileInputRef}
          type="file"
          accept=".pen"
          style={{ display: 'none' }}
          onChange={handleFileLoad}
        />
      </div>

      {/* Error */}
      {error && (
        <div style={{ padding: '10px 20px', background: 'rgba(248,113,113,0.1)', color: 'var(--pg-error)', fontSize: 13 }}>
          {error}
        </div>
      )}

      {/* Category tabs + grid */}
      <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>
        {/* Category sidebar */}
        <div
          style={{
            width: 180,
            flexShrink: 0,
            borderRight: '1px solid var(--pg-border)',
            padding: '16px 0',
            background: 'var(--pg-sidebar)',
          }}
        >
          <p style={{ ...sectionHead, padding: '0 16px' }}>Categories</p>
          {CATEGORIES.map((cat) => {
            const count = grouped[cat].length;
            const active = cat === activeCategory;
            return (
              <button
                key={cat}
                onClick={() => setActiveCategory(cat)}
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  width: '100%',
                  padding: '8px 16px',
                  border: 'none',
                  background: active ? 'var(--pg-selected-bg)' : 'transparent',
                  color: active ? 'var(--pg-accent)' : 'var(--pg-item-fg)',
                  fontWeight: active ? 600 : 400,
                  fontSize: 13,
                  cursor: 'pointer',
                  textAlign: 'left',
                  fontFamily: 'inherit',
                }}
              >
                <span>{CATEGORY_LABELS[cat]}</span>
                <span style={{ color: 'var(--pg-muted)', fontSize: 11 }}>{count}</span>
              </button>
            );
          })}
        </div>

        {/* Token grid */}
        <div style={{ flex: 1, overflow: 'auto', padding: '20px 28px' }}>
          {activeTokens.length === 0 ? (
            <div style={{ color: 'var(--pg-muted)', textAlign: 'center', padding: 40 }}>
              No {CATEGORY_LABELS[activeCategory].toLowerCase()} tokens found.
            </div>
          ) : (
            <TokenGrid tokens={activeTokens} category={activeCategory} />
          )}
        </div>
      </div>
    </div>
  );
}
