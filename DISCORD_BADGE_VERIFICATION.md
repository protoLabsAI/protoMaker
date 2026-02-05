# Discord Badge Feature - Manual Verification Guide

## What Was Implemented

The Discord badge feature adds visual indicators to feature cards when they have an associated Discord channel for communication.

## Implementation Details

### 1. Type Definitions (`libs/types/src/feature.ts`)
Added two new optional fields to the Feature interface:
- `discordChannelId?: string` - The Discord channel ID
- `discordChannelName?: string` - The Discord channel name for display

### 2. UI Component (`apps/ui/src/components/views/board-view/components/kanban-card/card-badges.tsx`)
Added Discord badge to the CardBadges component with:
- **MessageCircle icon** from lucide-react
- **Green indicator** when both `discordChannelId` and `discordChannelName` are present (valid mapping)
- **Red indicator** when only `discordChannelId` is present but `discordChannelName` is missing (broken mapping)
- **Tooltip** showing channel name on hover (or error message if broken)
- **Click functionality** to open the Discord channel in browser/app

## Manual Verification Steps

### Test Case 1: Feature with Valid Discord Channel

1. Create/edit a feature JSON file in `.automaker/features/{feature-id}/feature.json`
2. Add these fields:
   ```json
   {
     "discordChannelId": "1234567890",
     "discordChannelName": "feature-discussion"
   }
   ```
3. Refresh the board view
4. **Expected Result:**
   - Green Discord badge (MessageCircle icon) appears on the feature card
   - Hovering shows tooltip: "Discord: feature-discussion"
   - Clicking opens Discord channel in new tab

### Test Case 2: Feature with Broken Discord Mapping

1. Create/edit a feature JSON file
2. Add only discordChannelId:
   ```json
   {
     "discordChannelId": "9876543210"
   }
   ```
3. Refresh the board view
4. **Expected Result:**
   - Red Discord badge appears on the feature card
   - Hovering shows tooltip: "Discord channel mapping broken"
   - Clicking still attempts to open the channel

### Test Case 3: Feature Without Discord Channel

1. Create/edit a feature without Discord fields
2. **Expected Result:**
   - No Discord badge appears on the feature card

## Visual Indicators

- **Green badge**: ✅ Valid Discord channel mapping (both ID and name present)
- **Red badge**: ❌ Broken Discord channel mapping (ID present, name missing)
- **No badge**: Feature has no Discord channel

## Files Modified

1. `libs/types/src/feature.ts` - Added discordChannelId and discordChannelName fields
2. `apps/ui/src/components/views/board-view/components/kanban-card/card-badges.tsx` - Implemented Discord badge UI

## Notes

- The feature requires rebuilding the types package (`npm run build:packages`) which has been done
- The Discord URL format currently uses a generic format: `https://discord.com/channels/@me/{channelId}`
- For production, you may want to store the Discord server ID in settings and use: `https://discord.com/channels/{serverId}/{channelId}`
- The badge appears in the CardBadges section below the card header, alongside Epic and Error badges
