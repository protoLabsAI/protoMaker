/**
 * DesignRoute — /design
 *
 * Design workbench for loading .pen files, previewing components,
 * viewing generated code, and chatting with AI agents.
 */

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { parsePenFile, findReusableComponents } from '@@PROJECT_NAME-pen';
import type { PenDocument, FrameNode } from '@@PROJECT_NAME-pen';
import {
  generateComponent,
  toComponentName,
  type PenDocument as CodegenDoc,
  type PenFrame as CodegenFrame,
  type GeneratedFile,
} from '@@PROJECT_NAME-codegen';
import { generateHTMLFromFrame } from '@@PROJECT_NAME-codegen/html-generator';
import { generateCSSFromFrame } from '@@PROJECT_NAME-codegen/css-generator';
import { ChatPanel } from '../components/design/chat-panel';

// ─── Types ──────────────────────────────────────────────────────────────────

type CenterTab = 'preview' | 'react' | 'html' | 'css';

interface CodegenCache {
  react: string;
  html: string;
  css: string;
}

// ─── Styles ─────────────────────────────────────────────────────────────────

const monoFont: React.CSSProperties = {
  fontFamily: 'ui-monospace, "Cascadia Code", Menlo, monospace',
  fontSize: 12,
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

// ─── Code block ─────────────────────────────────────────────────────────────

function CodeBlock({ code, language }: { code: string; language: string }) {
  return (
    <pre
      style={{
        ...monoFont,
        background: 'var(--pg-code-bg)',
        color: 'var(--pg-fg)',
        padding: '16px 20px',
        borderRadius: 8,
        overflow: 'auto',
        margin: 0,
        height: '100%',
        lineHeight: 1.6,
        tabSize: 2,
      }}
      data-language={language}
    >
      <code>{code}</code>
    </pre>
  );
}

// ─── Preview iframe ─────────────────────────────────────────────────────────

function PreviewFrame({ html }: { html: string }) {
  const [blobUrl, setBlobUrl] = useState<string | null>(null);

  useEffect(() => {
    const blob = new Blob([html], { type: 'text/html' });
    const url = URL.createObjectURL(blob);
    setBlobUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [html]);

  if (!blobUrl) return null;

  return (
    <iframe
      src={blobUrl}
      title="Component preview"
      style={{
        width: '100%',
        height: '100%',
        border: 'none',
        borderRadius: 8,
        background: '#fff',
      }}
      sandbox="allow-scripts"
    />
  );
}

// ─── DesignRoute ────────────────────────────────────────────────────────────

export default function DesignRoute() {
  const [doc, setDoc] = useState<PenDocument | null>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<CenterTab>('preview');
  const [chatOpen, setChatOpen] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const cacheRef = useRef<Map<string, CodegenCache>>(new Map());

  // Discover reusable components
  const components = useMemo(() => {
    if (!doc) return [];
    return findReusableComponents(doc);
  }, [doc]);

  // Auto-select first component
  useEffect(() => {
    if (components.length > 0 && !selectedId) {
      setSelectedId(components[0].id);
    }
  }, [components, selectedId]);

  const selectedFrame = useMemo(
    () => components.find((c) => c.id === selectedId) ?? null,
    [components, selectedId]
  );

  // Get or compute codegen for the selected frame
  const codegen = useMemo((): CodegenCache | null => {
    if (!selectedFrame || !doc) return null;
    const cached = cacheRef.current.get(selectedFrame.id);
    if (cached) return cached;

    try {
      // Cast pen types to codegen's structural types
      const cDoc = doc as unknown as CodegenDoc;
      const cFrame = selectedFrame as unknown as CodegenFrame;

      const reactFile: GeneratedFile = generateComponent(cFrame, cDoc);
      const htmlFile = generateHTMLFromFrame(cFrame as Parameters<typeof generateHTMLFromFrame>[0], cDoc as Parameters<typeof generateHTMLFromFrame>[1]);
      const cssFile = generateCSSFromFrame(cFrame as Parameters<typeof generateCSSFromFrame>[0], cDoc as Parameters<typeof generateCSSFromFrame>[1]);

      const result: CodegenCache = {
        react: reactFile.content,
        html: htmlFile.content,
        css: cssFile.content,
      };
      cacheRef.current.set(selectedFrame.id, result);
      return result;
    } catch (err) {
      return {
        react: `// Error generating React code:\n// ${err instanceof Error ? err.message : String(err)}`,
        html: `<!-- Error generating HTML: ${err instanceof Error ? err.message : String(err)} -->`,
        css: `/* Error generating CSS: ${err instanceof Error ? err.message : String(err)} */`,
      };
    }
  }, [selectedFrame, doc]);

  const handleFileLoad = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setError(null);
    cacheRef.current.clear();
    setSelectedId(null);

    try {
      const text = await file.text();
      const parsed = parsePenFile(text);
      setDoc(parsed);
      setFileName(file.name);
    } catch (err) {
      setError(`Failed to parse .pen file: ${err instanceof Error ? err.message : String(err)}`);
    }
  }, []);

  const tabs: { key: CenterTab; label: string }[] = [
    { key: 'preview', label: 'Preview' },
    { key: 'react', label: 'React' },
    { key: 'html', label: 'HTML' },
    { key: 'css', label: 'CSS' },
  ];

  return (
    <div
      style={{
        display: 'flex',
        height: '100%',
        fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
        fontSize: 13,
        background: 'var(--pg-bg)',
        color: 'var(--pg-fg)',
      }}
    >
      {/* ── Left: Component tree sidebar ── */}
      <aside
        style={{
          width: 240,
          flexShrink: 0,
          borderRight: '1px solid var(--pg-border)',
          display: 'flex',
          flexDirection: 'column',
          background: 'var(--pg-sidebar)',
        }}
      >
        {/* File loader header */}
        <div
          style={{
            padding: '12px 16px',
            borderBottom: '1px solid var(--pg-border)',
            display: 'flex',
            alignItems: 'center',
            gap: 8,
          }}
        >
          <span style={{ fontWeight: 600, fontSize: 14, flex: 1 }}>
            {fileName ?? 'Design'}
          </span>
          <button
            onClick={() => fileInputRef.current?.click()}
            style={{
              padding: '4px 10px',
              borderRadius: 6,
              border: '1px solid var(--pg-border)',
              background: 'var(--pg-surface-2)',
              color: 'var(--pg-fg)',
              fontSize: 11,
              cursor: 'pointer',
              fontFamily: 'inherit',
            }}
          >
            Open
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept=".pen"
            style={{ display: 'none' }}
            onChange={handleFileLoad}
          />
        </div>

        {/* Component list */}
        <nav style={{ flex: 1, overflow: 'auto', padding: '8px 0' }}>
          {components.length === 0 ? (
            <div style={{ color: 'var(--pg-muted)', textAlign: 'center', padding: 40, fontSize: 12 }}>
              {doc ? 'No reusable components found.' : 'Load a .pen file to start.'}
            </div>
          ) : (
            <>
              <p style={{ ...sectionHead, padding: '0 16px' }}>Components ({components.length})</p>
              {components.map((frame) => {
                const name = toComponentName(frame.name ?? frame.id);
                const active = frame.id === selectedId;
                return (
                  <button
                    key={frame.id}
                    onClick={() => setSelectedId(frame.id)}
                    style={{
                      display: 'block',
                      width: '100%',
                      textAlign: 'left',
                      padding: '7px 16px',
                      border: 'none',
                      background: active ? 'var(--pg-selected-bg)' : 'transparent',
                      color: active ? 'var(--pg-accent)' : 'var(--pg-item-fg)',
                      fontWeight: active ? 600 : 400,
                      fontSize: 13,
                      cursor: 'pointer',
                      fontFamily: 'inherit',
                    }}
                  >
                    {name}
                  </button>
                );
              })}
            </>
          )}
        </nav>
      </aside>

      {/* ── Center: Preview / code ── */}
      <main style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0 }}>
        {/* Toolbar */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 2,
            padding: '8px 16px',
            borderBottom: '1px solid var(--pg-border)',
            background: 'var(--pg-toolbar)',
          }}
        >
          {tabs.map(({ key, label }) => (
            <button
              key={key}
              onClick={() => setActiveTab(key)}
              style={{
                padding: '5px 14px',
                borderRadius: 6,
                border: 'none',
                background: activeTab === key ? 'var(--pg-selected-bg)' : 'transparent',
                color: activeTab === key ? 'var(--pg-accent)' : 'var(--pg-muted)',
                fontWeight: activeTab === key ? 600 : 400,
                fontSize: 12,
                cursor: 'pointer',
                fontFamily: 'inherit',
              }}
            >
              {label}
            </button>
          ))}
          <div style={{ flex: 1 }} />
          <button
            onClick={() => setChatOpen(true)}
            style={{
              padding: '5px 14px',
              borderRadius: 6,
              border: '1px solid var(--pg-border)',
              background: chatOpen ? 'var(--pg-accent)' : 'var(--pg-surface-2)',
              color: chatOpen ? '#000' : 'var(--pg-fg)',
              fontWeight: 600,
              fontSize: 12,
              cursor: 'pointer',
              fontFamily: 'inherit',
            }}
          >
            AI Chat
          </button>
        </div>

        {/* Content area */}
        <div style={{ flex: 1, overflow: 'auto', padding: 0 }}>
          {error && (
            <div style={{ padding: '12px 20px', background: 'rgba(248,113,113,0.1)', color: 'var(--pg-error)', fontSize: 13 }}>
              {error}
            </div>
          )}

          {!selectedFrame && (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: 'var(--pg-muted)' }}>
              {doc ? 'Select a component from the sidebar.' : 'Load a .pen file to get started.'}
            </div>
          )}

          {selectedFrame && codegen && (
            <div style={{ height: '100%' }}>
              {activeTab === 'preview' && <PreviewFrame html={codegen.html} />}
              {activeTab === 'react' && <CodeBlock code={codegen.react} language="tsx" />}
              {activeTab === 'html' && <CodeBlock code={codegen.html} language="html" />}
              {activeTab === 'css' && <CodeBlock code={codegen.css} language="css" />}
            </div>
          )}
        </div>
      </main>

      {/* ── Right: Props panel ── */}
      {selectedFrame && (
        <aside
          style={{
            width: 280,
            flexShrink: 0,
            borderLeft: '1px solid var(--pg-border)',
            overflow: 'auto',
            padding: '16px',
            background: 'var(--pg-sidebar)',
          }}
        >
          <p style={sectionHead}>Component Info</p>
          <div style={{ marginBottom: 16 }}>
            <div style={{ fontWeight: 600, fontSize: 16, marginBottom: 4 }}>
              {toComponentName(selectedFrame.name ?? selectedFrame.id)}
            </div>
            <div style={{ ...monoFont, color: 'var(--pg-muted)', fontSize: 11 }}>
              ID: {selectedFrame.id}
            </div>
          </div>

          {/* Frame properties */}
          <p style={sectionHead}>Properties</p>
          <div style={{ marginBottom: 16 }}>
            <PropertyRow label="Type" value={selectedFrame.type} />
            {(selectedFrame as FrameNode).layout && (
              <PropertyRow label="Layout" value={(selectedFrame as FrameNode).layout ?? 'none'} />
            )}
            {typeof (selectedFrame as FrameNode).cornerRadius === 'number' && (
              <PropertyRow label="Corner Radius" value={String((selectedFrame as FrameNode).cornerRadius)} />
            )}
            {(selectedFrame as FrameNode).children && (
              <PropertyRow label="Children" value={String(((selectedFrame as FrameNode).children ?? []).length)} />
            )}
          </div>
        </aside>
      )}

      {/* ── Chat panel overlay ── */}
      {chatOpen && <ChatPanel onClose={() => setChatOpen(false)} penFilePath={fileName ?? undefined} />}
    </div>
  );
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function PropertyRow({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 0', fontSize: 12 }}>
      <span style={{ color: 'var(--pg-muted)' }}>{label}</span>
      <span style={{ color: 'var(--pg-fg)', ...{ fontFamily: 'ui-monospace, Menlo, monospace', fontSize: 11 } }}>{value}</span>
    </div>
  );
}
