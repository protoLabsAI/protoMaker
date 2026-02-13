---
tags: [auth]
summary: auth implementation decisions and patterns
relevantTo: [auth]
importance: 0.7
relatedFiles: []
usageStats:
  loaded: 0
  referenced: 0
  successfulFeatures: 0
---
# auth

#### [Gotcha] OAuth token stored as nested path in settings (integrations.linear.agentToken) requires specific path string, not object traversal (2026-02-12)
- **Situation:** Implementation reads token from settings using exact path string. Easy to mistype the path or assume different structure.
- **Root cause:** Project settings use dot-notation path strings for nested configuration values. This is consistent with settings service implementation pattern
- **How to avoid:** String-based paths are error-prone (typos break silently) but consistent with existing settings service pattern across codebase