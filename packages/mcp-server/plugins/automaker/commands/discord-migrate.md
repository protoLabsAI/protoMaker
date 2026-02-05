# Discord Channel Migration Tool

Guide for performing Discord server channel reorganization with safety checks and rollback capabilities.

## Usage

Use this skill to:
- Plan and execute Discord channel structure changes
- Archive/reorganize channels safely
- Document migration decisions
- Maintain audit trail for rollback

## Workflow

### 1. Pre-Migration Analysis

First, analyze the current Discord server structure:

**Ask the user:**
- What is the Discord server name/ID you want to reorganize?
- What is the primary goal of this reorganization? (e.g., reduce clutter, improve discoverability, align with team structure)

**Gather current state:**
- List all current channels by category
- Identify inactive channels (no messages in last 30/60/90 days)
- Note any pinned messages or important content
- Document current permissions/roles per channel

**Create snapshot file:**
```
.automaker/discord-migration/
├── audit-log.md              # All actions taken
├── pre-migration-state.json  # Current channel structure
├── migration-plan.md         # Proposed changes
└── rollback-plan.md          # How to undo changes
```

### 2. Design Migration Plan

Present the user with a before/after view:

**Current Structure:**
```
📁 Category 1
  - #channel-1 (last message: X days ago)
  - #channel-2 (last message: Y days ago)
📁 Category 2
  - #channel-3 (active)
```

**Proposed Structure:**
```
📁 New Category 1
  - #channel-3 (moved from Category 2)
  - #new-channel (created)
📁 Archive
  - #channel-1 (archived, last message: X days ago)
  - #channel-2 (archived, last message: Y days ago)
```

**Ask user to confirm:**
- [ ] Archive inactive channels (specify threshold: 30/60/90 days)
- [ ] Create new categories
- [ ] Move active channels to new structure
- [ ] Rename channels for consistency
- [ ] Adjust permissions

### 3. Interactive Migration Execution

For each destructive action, prompt for confirmation:

**Channel Archiving:**
```
⚠️  About to archive #old-channel
    Last message: 45 days ago
    Messages: ~150
    Pinned messages: 2

Do you want to:
1. Archive (hide from non-admins, keep history)
2. Delete (permanent, cannot undo)
3. Skip
4. View pinned messages first

Choice: [1]
```

**Channel Moving:**
```
📦 Moving #channel-name
    From: Category A
    To: Category B

Confirm? [y/N]:
```

**Channel Creation:**
```
➕ Creating new channel
    Name: #new-channel
    Category: Development
    Topic: Team development discussions
    Permissions: @everyone (read), @developers (write)

Confirm? [y/N]:
```

### 4. Audit Logging

Log every action to `audit-log.md`:

```markdown
# Discord Migration Audit Log
Server: [Server Name]
Date: [YYYY-MM-DD HH:MM:SS]
Executor: [Username]

## Actions Taken

### [YYYY-MM-DD HH:MM:SS] - Channel Archived
- **Channel:** #old-announcements
- **Reason:** Inactive for 60+ days
- **Last Message:** 2024-12-01
- **Messages Preserved:** 234
- **Pinned Messages:** 3
- **Rollback:** Restore from archive by making visible to @everyone

### [YYYY-MM-DD HH:MM:SS] - Channel Created
- **Channel:** #team-updates
- **Category:** Communication
- **Topic:** Weekly team updates and announcements
- **Permissions:** @everyone (read), @team-leads (write)
- **Rollback:** Delete channel #team-updates

### [YYYY-MM-DD HH:MM:SS] - Channel Moved
- **Channel:** #dev-chat
- **From:** General
- **To:** Development
- **Rollback:** Move #dev-chat back to General category
```

### 5. Post-Migration

After all changes are applied:

**Generate summary report:**
```markdown
# Migration Summary

## Statistics
- Channels archived: X
- Channels created: Y
- Channels moved: Z
- Categories created: N

## Before/After Comparison
[Show structure comparison]

## Rollback Available
All changes have been logged. See rollback-plan.md for instructions.

## Next Steps
- [ ] Announce changes to team
- [ ] Update channel guidelines
- [ ] Monitor for confusion/questions
- [ ] Review in 1 week to confirm structure is working
```

**Create rollback instructions:**
```markdown
# Rollback Plan

To undo the migration, execute the following steps in reverse order:

1. Restore archived channels
   - Make #old-announcements visible to @everyone

2. Move channels back
   - Move #dev-chat from Development → General

3. Delete created channels
   - Delete #team-updates (created [timestamp])

4. Restore original categories (if needed)
   - Rename "Communication" → "General"
```

### 6. Safety Guidelines

**Always:**
- Archive before deleting (gives 30-day window to restore)
- Export pinned messages before archiving channels
- Notify server members 24-48 hours before major changes
- Keep audit log for at least 90 days
- Test permissions after moving channels

**Never:**
- Delete channels without archiving first
- Move channels with active conversations mid-discussion
- Change permissions without documenting previous state
- Archive channels with recent activity without user confirmation

## Example Flow

### User Request
"I want to reorganize our Discord server. We have too many dead channels and the categories don't make sense anymore."

### Your Response
```
I'll help you safely reorganize your Discord server. Let me start by gathering information:

1. What's your Discord server name?
2. What's your main goal? (reduce clutter, improve structure, etc.)
3. Do you have admin access to the server?

Once I understand your needs, I'll:
- Analyze current channel structure
- Show you inactive channels
- Propose a new organization
- Create a migration plan with rollback instructions
- Guide you through each change with confirmations

Let's start - what server are we working with?
```

### Gather Info
[Use Discord's audit log API or manual review to document current state]

### Present Plan
```
I've analyzed your server. Here's what I found:

**Inactive Channels (60+ days):**
- #old-project-1 (last message: 89 days ago)
- #random-archive (last message: 120 days ago)

**Proposed Changes:**
1. Create "📁 Archive" category
2. Move 5 inactive channels → Archive
3. Merge #general and #off-topic (similar purpose)
4. Rename categories for clarity

Before/After view:
[Show structure comparison]

Does this look good? Any changes you'd like to make?
```

### Execute with Confirmations
```
Let's start the migration. I'll ask for confirmation at each step.

⚠️  Step 1/5: Archive #old-project-1
    Last message: 89 days ago
    Messages: 234 (will be preserved)

    Confirm archive? [y/N]: _
```

### Complete & Document
```
✅ Migration complete!

Summary:
- 5 channels archived
- 2 channels merged
- 3 categories renamed

All changes logged to .automaker/discord-migration/audit-log.md

Rollback instructions: .automaker/discord-migration/rollback-plan.md

Would you like me to:
- Draft an announcement for your team?
- Set a reminder to review in 1 week?
```

## Integration with Automaker

This skill integrates with:
- `/discord` - Core Discord communication features
- Project context files - Can reference `.automaker/context/discord-guidelines.md`
- Audit logging - All actions tracked for review

## Tips

**For large servers:**
- Break migration into phases (e.g., archive first, reorganize later)
- Migrate one category at a time
- Allow 1-2 days between phases for team adjustment

**For active servers:**
- Schedule during low-activity hours
- Announce changes in advance
- Create a "questions about new structure" channel

**Common pitfalls:**
- Don't archive channels with recent pins without review
- Don't forget to update channel topics after moving
- Don't skip permission verification after moves
- Remember that channel URLs change when renamed
