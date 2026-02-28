---
name: linear-config
description: protoLabs Linear workspace configuration — team IDs, state IDs, and workflow mappings. Referenced by ava, headsdown, and jon when Linear integration is active.
---

# Linear Configuration (protoLabs)

This file centralizes Linear workspace identifiers for the protoLabs project. Skills that interact with Linear (ava, headsdown, jon) reference this config rather than hardcoding IDs.

## Team

| Key    | Value                                  | Label       |
| ------ | -------------------------------------- | ----------- |
| teamId | `185e7caa-2855-4c67-a347-2011016bdddf` | ProtoLabsAI |

## Workflow States

| Key        | Value                                  | Label       |
| ---------- | -------------------------------------- | ----------- |
| todo       | `8e05f945-0bf5-4d42-8d01-fbd63f471ead` | Todo        |
| inProgress | `3f4a449a-f1c1-49e4-999c-e0ccf0f828ad` | In Progress |

## Usage

When creating a Linear issue:

```
mcp__linear__linear_createIssue({
  teamId: "185e7caa-2855-4c67-a347-2011016bdddf",
  title: "Fix: [description]",
  description: "[details]"
})
```

When moving an issue to trigger the intake bridge:

```
mcp__linear__linear_updateIssue({
  issueId: "<issue-id>",
  stateId: "3f4a449a-f1c1-49e4-999c-e0ccf0f828ad"
})
```

## For Other Teams

If you are not using the protoLabs Linear workspace, create your own `linear-config.md` in `.claude/commands/` with your team's IDs. The headsdown, ava, and jon skills will pick up whatever `linear-config` is available at project level.
