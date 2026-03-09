# Project: Chat Render Pipeline — Rich Tool Result Cards

## Goal
Replace JSON fallback renderers for high-frequency Ava tools with purpose-built cards. Currently 22 of 65+ tools have custom cards; this project adds cards for the most commonly surfaced tools so structured data renders as rich UI instead of raw markdown or JSON.

## Milestones
1. Sitrep and Status Cards - Cards for the most-asked status questions: system sitrep, running agents, and health check. These are the #1 reason users open the chat overlay.
2. Project and Lifecycle Cards - Cards for project management views: project list, project detail, and lifecycle status.
3. PR Pipeline and Promotion Cards - Cards for the shipping workflow: merge confirmation, promotion status, and PR watch.
4. Auto-Mode and Agent Operation Cards - Cards for auto-mode controls and agent operations that currently render as JSON.
