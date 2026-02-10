---
name: setuplab
description: Set up a laboratory environment for a project. Initialize project structure, configure settings, and prepare for feature development.
argument-hint: <project path (relative or absolute)>
allowed-tools:
  - AskUserQuestion
  - Task
  - mcp__automaker__setup_lab
  - mcp__automaker__health_check
model: haiku
---

# Setup Lab Command

Initialize a laboratory environment for a project with project structure, configuration, and settings.

## Capabilities

You can:

- **Check server health**: Verify Automaker server is running
- **Validate project path**: Ensure the path exists and is accessible
- **Initialize project structure**: Set up .automaker directory and required files
- **Configure project settings**: Create default configuration files
- **Display setup results**: Show what was initialized and next steps
- **Handle errors gracefully**: Provide clear error messages for invalid paths or setup failures

## Workflow

### Step 1: Initial Validation

Check if Automaker server is running:

```
mcp__automaker__health_check()
```

If it fails, inform the user: "Automaker server is not running. Start it with `npm run dev` in the automaker directory."

### Step 2: Get Project Path

Parse the user's argument to get the project path:

- If the user provided a path, use it (relative or absolute)
- If no path provided, ask the user for the project path:

```
header: "Project Path"
question: "What project path should we set up as a lab?"
options:
  - label: "Current directory (.)"
    description: "Use the current working directory"
  - label: "Custom path"
    description: "Specify a different directory"
```

Resolve relative paths to absolute paths:

- If path starts with `/`, it's already absolute
- Otherwise, resolve it relative to the current working directory
- Handle `~` expansion for home directory paths
- Validate the path exists and is a directory

### Step 3: Call Setup Lab Tool

Invoke the setup_lab MCP tool with the resolved path:

```
mcp__automaker__setup_lab({
  projectPath: <resolved path>,
})
```

The tool will:

- Create `.automaker/` directory if it doesn't exist
- Initialize default configuration files
- Set up context directory for agent prompts
- Create or update settings.json
- Create or update spec.md
- Return status of what was initialized

### Step 4: Display Results

Show the user what was set up:

```
## Lab Setup Complete ✓

**Project:** <projectPath>

### Initialized:
- ✓ .automaker/ directory
- ✓ .automaker/context/ (for context files)
- ✓ .automaker/settings.json (project settings)
- ✓ .automaker/spec.md (project specification)

### Next Steps:
1. View your project setup: Use `/board` to see the Kanban board
2. Create your first feature: Use `/board` to add features
3. Configure project rules: Use `/context` to add coding standards
4. Start auto-mode: Use `/auto-mode` to begin autonomous feature processing

### Quick Commands:
- View board: `/board`
- Create feature: `/board` then "Create feature"
- Add context: `/context` then "Create context file"
- Start work: `/auto-mode start`
```

### Step 5: Error Handling

If setup fails:

**Invalid Path:**

```
❌ Setup Failed: Path does not exist

The path you provided does not exist or is not accessible:
  <path>

Please check:
- The path is correct
- The directory exists
- You have read/write permissions

Try again with a valid project path.
```

**Permission Error:**

```
❌ Setup Failed: Permission Denied

Could not write to the project directory:
  <path>

Please check:
- You have write permissions to the directory
- The directory is not read-only
- You are not running inside a system-protected location

Try again with a writable directory.
```

**Server Error:**

```
❌ Setup Failed: Server Error

The Automaker server encountered an error while setting up the lab.

Error: <error message>

Try:
1. Check the server logs
2. Restart the server: `npm run dev`
3. Try again with a different project path
```

## Usage Examples

### Example 1: Current Directory

```
/setuplab .
```

Sets up the current directory as a lab.

### Example 2: Relative Path

```
/setuplab my-project
```

Sets up `my-project/` relative to current directory.

### Example 3: Absolute Path

```
/setuplab /path/to/my-project
```

Sets up the absolute path.

### Example 4: Home Directory

```
/setuplab ~/projects/new-app
```

Sets up a directory in the home folder.

## Edge Cases

### Already Initialized

If the project is already initialized (`.automaker/` exists):

```
## Lab Already Initialized ℹ️

The project is already set up as a lab:
  <projectPath>

Would you like to:
  [ ] Reset and reinitialize (clears existing configuration)
  [ ] Keep existing and continue
  [ ] View current configuration
  [ ] Update settings
```

### Empty Project

If the project directory is empty:

```
## Lab Setup Complete ✓

Created new project lab structure in:
  <projectPath>

This is a fresh start! You can now:
1. Create your first feature
2. Add context files with project rules
3. Configure your project specification
4. Start building!
```

### Nested in Git Repo

If the project path is inside a git repository:

```
## Lab Initialized in Git Repo

Project path is inside a git repository:
  <projectPath>

Automaker will:
- Use git for version control
- Create worktrees for feature branches
- Manage PRs and merges

All features will be tracked in git!
```

## Output Format

Use status icons for clarity:

- ✓ Success / Created
- ℹ️ Information / Already exists
- ⚠️ Warning / Needs attention
- ❌ Error / Failed

Example:

```
## Setup Progress

✓ Created .automaker/ directory
✓ Initialized settings.json
✓ Created context/ for agent prompts
⚠️ Existing spec.md found (keeping existing)
✓ Ready for feature development!
```

## Error Handling

- If server is down, suggest starting it
- If path is invalid, show what went wrong and ask for correction
- If permissions issue, explain and suggest workarounds
- If initialization partially fails, show what succeeded and what failed
