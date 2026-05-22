import { describe, expect, it } from 'vitest';
import { buildHtmlReport } from './report-generator.js';
import type { GapAnalysisReport } from 'create-protolab';

type GapItem = GapAnalysisReport['gaps'][number];
type ComplianceItem = GapAnalysisReport['compliant'][number];

function makeGap(overrides: Partial<GapItem> = {}): GapItem {
  return {
    id: 'gap-1',
    category: 'ci',
    severity: 'critical',
    title: 'Missing CI config',
    current: 'No CI',
    target: 'GitHub Actions',
    effort: 'small',
    featureDescription: 'Add GitHub Actions workflow',
    ...overrides,
  };
}

function makeCompliant(overrides: Partial<ComplianceItem> = {}): ComplianceItem {
  return {
    category: 'quality',
    title: 'Has README',
    detail: 'README.md present',
    ...overrides,
  };
}

function makeReport(overrides: Partial<GapAnalysisReport> = {}): GapAnalysisReport {
  return {
    projectPath: '/home/user/my-project',
    analyzedAt: '2024-01-01T00:00:00.000Z',
    overallScore: 75,
    summary: { critical: 1, recommended: 1, optional: 0, compliant: 1 },
    gaps: [
      makeGap({ severity: 'critical' }),
      makeGap({
        id: 'gap-2',
        title: 'Add linting',
        severity: 'recommended',
        current: 'None',
        target: 'ESLint',
        effort: 'medium',
      }),
    ],
    compliant: [makeCompliant()],
    ...overrides,
  };
}

describe('buildHtmlReport', () => {
  it('renders normal report without modification', () => {
    const html = buildHtmlReport(makeReport());
    expect(html).toContain('Missing CI config');
    expect(html).toContain('No CI');
    expect(html).toContain('GitHub Actions');
    expect(html).toContain('Has README');
    expect(html).toContain('README.md present');
    expect(html).toContain('/home/user/my-project');
  });

  it('escapes XSS payload in projectPath', () => {
    const xss = '/repos/<script>alert(1)</script>';
    const html = buildHtmlReport(makeReport({ projectPath: xss }));
    expect(html).not.toContain('<script>alert(1)</script>');
    expect(html).toContain('&lt;script&gt;');
  });

  it('escapes XSS payload in gap title', () => {
    const payload = '<img src=x onerror=alert(1)>';
    const html = buildHtmlReport(
      makeReport({
        gaps: [makeGap({ title: payload })],
        summary: { critical: 1, recommended: 0, optional: 0, compliant: 0 },
        compliant: [],
      })
    );
    expect(html).not.toContain('<img src=x onerror=alert(1)>');
    expect(html).toContain('&lt;img src=x onerror=alert(1)&gt;');
  });

  it('escapes XSS payload in gap current field', () => {
    const payload = '"><script>evil()</script>';
    const html = buildHtmlReport(
      makeReport({
        gaps: [makeGap({ current: payload })],
        summary: { critical: 1, recommended: 0, optional: 0, compliant: 0 },
        compliant: [],
      })
    );
    expect(html).not.toContain('<script>evil()</script>');
    expect(html).toContain('&lt;script&gt;');
    expect(html).toContain('&quot;');
  });

  it('escapes XSS payload in gap target field', () => {
    const payload = '<b onmouseover=alert(2)>hover</b>';
    const html = buildHtmlReport(
      makeReport({
        gaps: [makeGap({ severity: 'optional', target: payload, effort: 'large' })],
        summary: { critical: 0, recommended: 0, optional: 1, compliant: 0 },
        compliant: [],
      })
    );
    expect(html).not.toContain('<b onmouseover=alert(2)>');
    expect(html).toContain('&lt;b onmouseover=alert(2)&gt;');
  });

  it('escapes XSS payload in effort field', () => {
    const payload = 'small<script>x()</script>' as GapItem['effort'];
    const html = buildHtmlReport(
      makeReport({
        gaps: [makeGap({ effort: payload })],
        summary: { critical: 1, recommended: 0, optional: 0, compliant: 0 },
        compliant: [],
      })
    );
    expect(html).not.toContain('<script>x()</script>');
    expect(html).toContain('&lt;script&gt;');
  });

  it('escapes XSS payload in compliant title', () => {
    const payload = '<script>document.cookie</script>';
    const html = buildHtmlReport(
      makeReport({
        compliant: [makeCompliant({ title: payload })],
        gaps: [],
        summary: { critical: 0, recommended: 0, optional: 0, compliant: 1 },
      })
    );
    expect(html).not.toContain('<script>document.cookie</script>');
    expect(html).toContain('&lt;script&gt;');
  });

  it('escapes XSS payload in compliant detail', () => {
    const payload = '<img src=x onerror=fetch("//evil.com")>';
    const html = buildHtmlReport(
      makeReport({
        compliant: [makeCompliant({ detail: payload })],
        gaps: [],
        summary: { critical: 0, recommended: 0, optional: 0, compliant: 1 },
      })
    );
    expect(html).not.toContain('<img src=x');
    expect(html).toContain('&lt;img src=x');
  });

  it('escapes ampersands and quotes in text fields', () => {
    const html = buildHtmlReport(
      makeReport({
        gaps: [
          makeGap({
            title: 'A & B',
            severity: 'recommended',
            current: 'value with "quotes"',
            target: "value with 'apostrophe'",
            effort: 'small',
          }),
        ],
        summary: { critical: 0, recommended: 1, optional: 0, compliant: 0 },
        compliant: [],
      })
    );
    expect(html).toContain('A &amp; B');
    expect(html).toContain('value with &quot;quotes&quot;');
    expect(html).toContain('value with &#39;apostrophe&#39;');
  });
});
