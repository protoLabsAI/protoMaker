# Plugin Quickstart

Get the protoLabs Claude Code plugin running in 5 minutes.

## Prerequisites

- Node.js 22+
- Claude Code CLI installed and authenticated
- Git

## Steps

### 1. Clone and build

```bash
git clone https://github.com/protoLabsAI/protomaker.git
cd protomaker
npm install
npm run build:packages
```

### 2. Install the plugin

```bash
claude plugin marketplace add $(pwd)/packages/mcp-server/plugins
claude plugin install protolabs
```

### 3. Configure environment

```bash
PLUGIN_DIR=~/.claude/plugins/protolabs
cp "$PLUGIN_DIR/.env.example" "$PLUGIN_DIR/.env"
echo "AUTOMAKER_ROOT=$(pwd)" > "$PLUGIN_DIR/.env"
echo "AUTOMAKER_API_KEY=your-dev-key-2026" >> "$PLUGIN_DIR/.env"
```

### 4. Start the server

In a separate terminal:

```bash
cd protomaker
AUTOMAKER_API_KEY=your-dev-key-2026 npm run dev:web
```

### 5. Verify

```bash
claude
> /board
```

You should see your Kanban board. If you see a connection error, check that the server is running on port 3008.

## Next Steps

| Want to...                         | Read                                             |
| ---------------------------------- | ------------------------------------------------ |
| See all commands and examples      | [Plugin Commands](./plugin-commands.md)          |
| Understand the plugin architecture | [Plugin Deep Dive](./plugin-deep-dive.md)        |
| Configure Docker, GitHub, Discord  | [Claude Plugin Setup](./claude-plugin.md)        |
| Browse the full tool catalog       | [MCP Tools Reference](../reference/mcp-tools.md) |
