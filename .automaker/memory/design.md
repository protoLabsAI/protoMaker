---
tags: [design]
summary: design implementation decisions and patterns
relevantTo: [design]
importance: 0.7
relatedFiles: []
usageStats:
  loaded: 8
  referenced: 6
  successfulFeatures: 6
---

# design

### OKLCH chosen as canonical color space for all internal representations, with exact lightness shade values (50–950) encoded in system prompt. (2026-03-15)

- **Context:** Color agent must generate palettes that pass WCAG contrast ratios and work across light/dark/high-contrast themes.
- **Why:** OKLCH separates perceptual lightness from hue/chroma, making it ideal for generating WCAG-compliant palettes. Lightness can be used as a predictable proxy for contrast. Encoding shade reference in prompt educates the agent about valid lightness ranges.
- **Rejected:** HSL/HSV: hue-saturation-value perceptually non-linear in lightness. Hex: loses domain semantics, requires conversion. RGB: no perceptual structure.
- **Trade-offs:** Gains: predictable contrast math, accessible-by-design palette generation, clear agent guidance. Loses: unfamiliar color space for designers (requires education).
- **Breaking if changed:** If color space is switched to HSL/HSV, the contrast math and shade generation algorithms break. Prompt references to lightness ranges (50–950) become invalid.
