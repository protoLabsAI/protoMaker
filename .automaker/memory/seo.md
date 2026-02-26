---
tags: [seo]
summary: seo implementation decisions and patterns
relevantTo: [seo]
importance: 0.7
relatedFiles: []
usageStats:
  loaded: 2
  referenced: 1
  successfulFeatures: 1
---
# seo

### Use JSON-LD structured data format over microdata or RDFa for schema markup (2026-02-25)
- **Context:** Need to add structured data for rich results in Google Search - multiple valid formats exist
- **Why:** JSON-LD is Google's recommended format. Key advantages: (1) doesn't require HTML attribute changes - isolated in script tag, (2) easier to validate and maintain - valid JSON, (3) cleaner separation of concerns, (4) no risk of breaking HTML rendering if syntax error occurs. Microdata would clutter attributes; RDFa requires custom prefixes.
- **Rejected:** Microdata: requires data-* attributes throughout HTML, harder to maintain complex schemas, mingles data with presentation. RDFa: more complex prefix syntax, steeper learning curve, less commonly used in modern web.
- **Trade-offs:** Gained maintainability and validation tooling (can validate JSON separately). Slightly larger file size vs inline microdata (negligible - ~2KB). More declarative approach at cost of less semantic HTML.
- **Breaking if changed:** If schema structure changes, only JSON-LD needs update. With microdata, would need to update both HTML attributes and attributes. Rich results validation would fail if JSON-LD is removed - Google Search Console would report schema issues.
