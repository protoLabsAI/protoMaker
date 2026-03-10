# PRD: Hivemind UI Consolidation

## Situation
The hivemind/instance UI is split across three places: a PeersPanel in the board view (with All/Mine tabs), a bottom-panel ticker dropdown that mixes server URL switching with peer stats, and a Developer Settings section. This fragmentation creates redundancy and cognitive overhead.

## Problem
Three separate surfaces handle the same data (peers, server connection, instance stats) with no clear ownership. The board's PeersPanel and All/Mine tabs add noise to the primary work surface. The bottom-panel ticker dropdown conflates server URL switching (a rare config action) with live network stats (always-visible monitoring).

## Approach
1. Remove PeersPanel from board view entirely and remove All/Mine tab filter UI. 2. Convert the bottom-panel ticker from a click DropdownMenu to a hover HoverCard showing live hivemind stats: connection status, instance name/role, peer count, per-peer capacity. No server URL switching in the ticker. 3. Developer Settings remains the sole place for server URL override and peer config.

## Results
Board view focused on features only. Ticker gives instant hover-access to network health. Server URL switching is a deliberate Settings action. Fewer components, simpler mental model.

## Constraints
Server URL override must still work via Developer Settings,No changes to server-side API or app-store state shape,instanceFilter state stays in app-store but UI that sets it is removed,Ticker popover uses hover (HoverCard or Popover with openDelay), not click
