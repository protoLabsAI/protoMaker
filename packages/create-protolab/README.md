# create-protolab

CLI tool for ProtoLabs setup and initialization.

## Features

Interactive CLI flow for setting up ProtoLabs in any repository:

1. **Intro banner** - Shows project name and path
2. **Research phase** - Analyzes repository structure with spinner
3. **Gap analysis** - Displays compliance score, compliant items, and gaps by severity
4. **Phase selection** - Multi-select prompt for which phases to run (all recommended by default)
5. **Execution** - Runs selected phases with status updates
6. **Summary** - Shows created files and next steps
7. **Outro** - Completion message

## Installation

```bash
npm install -g create-protolab
```

Or run directly with npx:

```bash
npx create-protolab
```

## Usage

### Interactive Mode (Default)

```bash
create-protolab [path]
```

Starts the interactive CLI flow with colorful prompts and user input.

### Skip Prompts (--yes)

```bash
create-protolab --yes
```

Runs all recommended phases without prompting for confirmation.

### Dry Run (--dry-run)

```bash
create-protolab --dry-run
```

Stops after gap analysis without executing any setup phases. Useful for understanding what changes would be made.

### JSON Output (--json)

```bash
create-protolab --json
```

Outputs machine-readable JSON to stdout without any interactive prompts. Perfect for automation and CI/CD pipelines.

### Combined Flags

```bash
create-protolab --json --dry-run
```

Outputs gap analysis results as JSON without executing setup phases.

## Development

### Build

```bash
npm run build
```

### Watch Mode

```bash
npm run dev
```

### Type Check

```bash
npm run typecheck
```

## Architecture

The CLI uses:

- **@clack/prompts** - Beautiful terminal prompts with spinners, multi-select, and logging
- **picocolors** - Fast terminal colors for non-JSON mode

In production, the CLI would integrate with the ProtoLabs server API for actual research, gap analysis, and setup execution. The current implementation includes mock functions for demonstration purposes.

## License

MIT
