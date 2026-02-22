# GlyphKit Storybook Release

## Status: Content in pipeline, deployment needed

## URLs
- **Vanity**: glyphkit.design (301 redirect)
- **Hosting**: glyphkit.protolabs.studio (Cloudflare Pages)
- **Use in content**: Always glyphkit.design (shorter, brandable)

## What's Being Released
- 103 component stories across 9 sections
- 5 genre themes (Fantasy, Sci-Fi, Paranoia, Horror, Dungeon)
- 16-bit pixel-art aesthetic with Framer Motion animations
- Package: @rpg-mcp/mythx-theme
- Location: examples/mythxengine/

### Story Breakdown
| Section | Count | Highlights |
|---------|-------|------------|
| Foundation | 11 | Theme showcase, color palette, genre effects, pixel motion |
| Primitives | 15 | Button, Card, Input, PixelCheckbox, PixelSlider, PixelTabs |
| Game | 28 | CharacterCard, DiceDisplay, CombatStatus, ClockDisplay, PixelWindow |
| Forms | 16 | PlayerAction, CombatAction, RollTest, PositionEffect |
| Layouts | 4 | GameSession, GameViewport, SplitLayout |
| Screens | 8 | CombatHUD, DialogueScreen, InventoryScreen, PartyScreen |
| Views | 5 | GM, Player, Shared, Solo, ViewRouter |
| Features | 14 | WorldGeneration, SoloWizard, PlayHub, Dashboard, ImageGen |

## Deployment (Matt/Frank)
1. Build: `cd examples/mythxengine && npx storybook build`
2. Create Cloudflare Pages project for glyphkit.protolabs.studio
3. Set up glyphkit.design DNS redirect to glyphkit.protolabs.studio
4. Connect build output to auto-deploy

## Content Pipeline
- Companion blog: "How AI Agents Built a 103-Component Design System" (via Cindi)
- Twitter thread: 5-tweet announcement (see below)

## Twitter Thread Draft

**Tweet 1 (hook):**
103 components. 5 genre themes. Zero lines written by a human.

GlyphKit — a 16-bit pixel-art design system for AI-powered TTRPGs.

Built entirely by AI agents using protoLabs. Storybook is live → glyphkit.design

**Tweet 2 (the system):**
GlyphKit powers MythXEngine — an AI game master that runs tabletop RPGs with real mechanics.

9 sections in the Storybook:
- Foundations (themes, motion, color)
- Primitives (15 components)
- Game UI (dice, combat, clocks, inventory)
- Forms, Layouts, Screens, Views, Features

All theme-switchable across 5 genres.

**Tweet 3 (genre showcase):**
One component. Five genres.

Fantasy — pixel windows with stone borders
Sci-Fi — hologram panels with scan lines
Paranoia — clearance-level panels (Friend Computer approved)
Horror — shadow realm with vignette effects
Dungeon — deep dungeon with torch flicker

Same API. CSS variables do the rest.

**Tweet 4 (the methodology):**
This is what "orchestration beats implementation" looks like.

I designed the system architecture. AI agents built 103 components, wrote the stories, wired the themes, and shipped the Storybook.

The design system for a complete TTRPG engine. $52 in API costs.

**Tweet 5 (CTA):**
GlyphKit Storybook: glyphkit.design
MythXEngine: github.com/proto-labs-ai/mythxengine
protoLabs (the tool that built it): protolabs.studio

Source-available. No subscriptions. Built in public.
