# Contributing to protoLabs Studio

Thank you for your interest in contributing to protoLabs Studio! We're excited to have you join our community of developers building the future of autonomous AI development.

protoLabs Studio is an autonomous AI development studio that provides a Kanban-based workflow where AI agents implement features in isolated git worktrees. Whether you're fixing bugs, adding features, improving documentation, or suggesting ideas, your contributions help make this project better for everyone.

This guide will help you get started with contributing to protoLabs Studio. Please take a moment to read through these guidelines to ensure a smooth contribution process.

## Contribution License

By submitting a pull request, you agree that your contributions are licensed under the same [MIT License](LICENSE) that covers this project. You retain copyright to your work — no copyright assignment or transfer is required.

## Table of Contents

- [Contributing to protoLabs Studio](#contributing-to-protolabs-studio)
  - [Table of Contents](#table-of-contents)
  - [Getting Started](#getting-started)
    - [Prerequisites](#prerequisites)
    - [Fork and Clone](#fork-and-clone)
    - [Development Setup](#development-setup)
    - [Project Structure](#project-structure)
  - [Pull Request Process](#pull-request-process)
    - [Branching Strategy (RC Branches)](#branching-strategy-rc-branches)
    - [Branch Naming Convention](#branch-naming-convention)
    - [Commit Message Format](#commit-message-format)
    - [Submitting a Pull Request](#submitting-a-pull-request)
      - [1. Prepare Your Changes](#1-prepare-your-changes)
      - [2. Run Pre-submission Checks](#2-run-pre-submission-checks)
      - [3. Push Your Changes](#3-push-your-changes)
      - [4. Open a Pull Request](#4-open-a-pull-request)
      - [PR Requirements Checklist](#pr-requirements-checklist)
    - [Review Process](#review-process)
      - [What to Expect](#what-to-expect)
      - [Review Focus Areas](#review-focus-areas)
      - [Responding to Feedback](#responding-to-feedback)
      - [Approval Criteria](#approval-criteria)
      - [Getting Help](#getting-help)
  - [Code Style Guidelines](#code-style-guidelines)
  - [Testing Requirements](#testing-requirements)
    - [Running Tests](#running-tests)
    - [Test Frameworks](#test-frameworks)
      - [End-to-End Tests (Playwright)](#end-to-end-tests-playwright)
      - [Unit Tests (Vitest)](#unit-tests-vitest)
    - [Writing Tests](#writing-tests)
      - [When to Write Tests](#when-to-write-tests)
    - [CI/CD Pipeline](#cicd-pipeline)
      - [CI Checks](#ci-checks)
      - [CI Testing Environment](#ci-testing-environment)
      - [Viewing CI Results](#viewing-ci-results)
      - [Common CI Failures](#common-ci-failures)
    - [Coverage Requirements](#coverage-requirements)
  - [Issue Reporting](#issue-reporting)
    - [Bug Reports](#bug-reports)
      - [Before Reporting](#before-reporting)
      - [Bug Report Template](#bug-report-template)
    - [Feature Requests](#feature-requests)
      - [Before Requesting](#before-requesting)
      - [Feature Request Template](#feature-request-template)
    - [Security Issues](#security-issues)

---

## Getting Started

### Prerequisites

Before contributing to protoLabs Studio, ensure you have the following installed on your system:

- **Node.js 18+** (tested with Node.js 22)
  - Download from [nodejs.org](https://nodejs.org/)
  - Verify installation: `node --version`
- **npm** (comes with Node.js)
  - Verify installation: `npm --version`
- **Git** for version control
  - Verify installation: `git --version`
- **Claude Code CLI** or **Anthropic API Key** (for AI agent functionality)
  - Required to run the AI development features

**Optional but recommended:**

- A code editor with TypeScript support (VS Code recommended)
- GitHub CLI (`gh`) for easier PR management

### Fork and Clone

1. **Fork the repository** on GitHub
   - Navigate to [https://github.com/proto-labs-ai/protolabs-studio](https://github.com/proto-labs-ai/protolabs-studio)
   - Click the "Fork" button in the top-right corner
   - This creates your own copy of the repository

2. **Clone your fork locally**

   ```bash
   git clone https://github.com/YOUR_USERNAME/protolabs-studio.git
   cd protolabs-studio
   ```

3. **Add the upstream remote** to keep your fork in sync

   ```bash
   git remote add upstream https://github.com/proto-labs-ai/protolabs-studio.git
   ```

4. **Verify remotes**
   ```bash
   git remote -v
   # Should show:
   # origin    https://github.com/YOUR_USERNAME/protolabs-studio.git (fetch)
   # origin    https://github.com/YOUR_USERNAME/protolabs-studio.git (push)
   # upstream  https://github.com/proto-labs-ai/protolabs-studio.git (fetch)
   # upstream  https://github.com/proto-labs-ai/protolabs-studio.git (push)
   ```

### Development Setup

1. **Install dependencies**

   ```bash
   npm install
   ```

2. **Build shared packages** (required before running the app)

   ```bash
   npm run build:packages
   ```

3. **Start the development server**
   ```bash
   npm run dev          # Interactive launcher - choose mode
   npm run dev:web      # Browser mode (web interface)
   npm run dev:electron # Desktop app mode
   ```

**Common development commands:**

| Command                  | Description                      |
| ------------------------ | -------------------------------- |
| `npm run dev`            | Interactive development launcher |
| `npm run dev:web`        | Start in browser mode            |
| `npm run dev:electron`   | Start desktop app                |
| `npm run build`          | Build all packages and apps      |
| `npm run build:packages` | Build shared packages only       |
| `npm run lint`           | Run ESLint checks                |
| `npm run format`         | Format code with Prettier        |
| `npm run format:check`   | Check formatting without changes |
| `npm run test`           | Run E2E tests (Playwright)       |
| `npm run test:server`    | Run server unit tests            |
| `npm run test:packages`  | Run package tests                |
| `npm run test:all`       | Run all tests                    |

**Issue tracking setup (optional):**

This repository uses [Beads](https://github.com/steveyegge/beads) for AI-native issue tracking. A custom Git merge driver is configured in `.gitattributes` for JSONL files. After cloning, run:

```bash
bd init
```

This sets up the merge driver so `.beads/issues.jsonl` merges correctly. See `.beads/README.md` for more details.

### Project Structure

protoLabs Studio is organized as an npm workspace monorepo:

```
protolabs-studio/
├── apps/
│   ├── ui/              # React + Vite + Electron frontend
│   └── server/          # Express + WebSocket backend
├── libs/
│   ├── @protolabs-ai/types/            # Shared TypeScript types
│   ├── @protolabs-ai/utils/            # Utility functions
│   ├── @protolabs-ai/prompts/          # AI prompt templates
│   ├── @protolabs-ai/platform/         # Platform abstractions
│   ├── @protolabs-ai/model-resolver/   # AI model resolution
│   ├── @protolabs-ai/dependency-resolver/ # Dependency management
│   └── @protolabs-ai/git-utils/        # Git operations
├── docs/                # Documentation
└── package.json         # Root package configuration
```

**Key conventions:**

- Always import from `@protolabs-ai/*` shared packages, never use relative paths to `libs/`
- Frontend code lives in `apps/ui/`
- Backend code lives in `apps/server/`
- Shared logic should be in the appropriate `libs/` package

---

## Pull Request Process

This section covers everything you need to know about contributing changes through pull requests, from creating your branch to getting your code merged.

### Branching Strategy (RC Branches)

protoLabs Studio uses **Release Candidate (RC) branches** for all development work. Understanding this workflow is essential before contributing.

**How it works:**

1. **All development happens on RC branches** - We maintain version-specific RC branches (e.g., `v0.10.0rc`, `v0.11.0rc`) where all active development occurs
2. **RC branches are eventually merged to main** - Once an RC branch is stable and ready for release, it gets merged into `main`
3. **Main branch is for releases only** - The `main` branch contains only released, stable code

**Before creating a PR:**

1. **Check for the latest RC branch** - Before starting work, check the repository for the current RC branch:

   ```bash
   git fetch upstream
   git branch -r | grep rc
   ```

2. **Base your work on the RC branch** - Create your feature branch from the latest RC branch, not from `main`:

   ```bash
   # Find the latest RC branch (e.g., v0.11.0rc)
   git checkout upstream/v0.11.0rc
   git checkout -b feature/your-feature-name
   ```

3. **Target the RC branch in your PR** - When opening your pull request, set the base branch to the current RC branch, not `main`

**Example workflow:**

```bash
# 1. Fetch latest changes
git fetch upstream

# 2. Check for RC branches
git branch -r | grep rc
# Output: upstream/v0.11.0rc

# 3. Create your branch from the RC
git checkout -b feature/add-dark-mode upstream/v0.11.0rc

# 4. Make your changes and commit
git commit -m "feat: Add dark mode support"

# 5. Push to your fork
git push origin feature/add-dark-mode

# 6. Open PR targeting the RC branch (v0.11.0rc), NOT main
```

**Important:** PRs opened directly against `main` will be asked to retarget to the current RC branch.

### Branch Naming Convention

We use a consistent branch naming pattern to keep our repository organized:

```
<type>/<description>
```

**Branch types:**

| Type       | Purpose                  | Example                           |
| ---------- | ------------------------ | --------------------------------- |
| `feature`  | New functionality        | `feature/add-user-authentication` |
| `fix`      | Bug fixes                | `fix/resolve-memory-leak`         |
| `docs`     | Documentation changes    | `docs/update-contributing-guide`  |
| `refactor` | Code restructuring       | `refactor/simplify-api-handlers`  |
| `test`     | Adding or updating tests | `test/add-utils-unit-tests`       |
| `chore`    | Maintenance tasks        | `chore/update-dependencies`       |

**Guidelines:**

- Use lowercase letters and hyphens (no underscores or spaces)
- Keep descriptions short but descriptive
- Include issue number when applicable: `feature/123-add-login`

```bash
# Create and checkout a new feature branch
git checkout -b feature/add-dark-mode

# Create a fix branch with issue reference
git checkout -b fix/456-resolve-login-error
```

### Commit Message Format

We follow the **Conventional Commits** style for clear, readable commit history:

```
<type>: <description>

[optional body]
```

**Commit types:**

| Type       | Purpose                     |
| ---------- | --------------------------- |
| `feat`     | New feature                 |
| `fix`      | Bug fix                     |
| `docs`     | Documentation only          |
| `style`    | Formatting (no code change) |
| `refactor` | Code restructuring          |
| `test`     | Adding or updating tests    |
| `chore`    | Maintenance tasks           |

**Guidelines:**

- Use **imperative mood** ("Add feature" not "Added feature")
- Keep first line under **72 characters**
- Capitalize the first letter after the type prefix
- No period at the end of the subject line
- Add a blank line before the body for detailed explanations

**Examples:**

```bash
# Simple commit
git commit -m "feat: Add user authentication flow"

# Commit with body for more context
git commit -m "fix: Resolve memory leak in WebSocket handler

The connection cleanup was not being called when clients
disconnected unexpectedly. Added proper cleanup in the
error handler to prevent memory accumulation."

# Documentation update
git commit -m "docs: Update API documentation"

# Refactoring
git commit -m "refactor: Simplify state management logic"
```

### Submitting a Pull Request

Follow these steps to submit your contribution:

#### 1. Prepare Your Changes

Ensure you've synced with the latest upstream changes from the RC branch:

```bash
# Fetch latest changes from upstream
git fetch upstream

# Rebase your branch on the current RC branch (if needed)
git rebase upstream/v0.11.0rc  # Use the current RC branch name
```

#### 2. Run Pre-submission Checks

Before opening your PR, verify everything passes locally:

```bash
# Run all tests
npm run test:all

# Check formatting
npm run format:check

# Run linter
npm run lint

# Build to verify no compile errors
npm run build
```

#### 3. Push Your Changes

```bash
# Push your branch to your fork
git push origin feature/your-feature-name
```

#### 4. Open a Pull Request

1. Go to your fork on GitHub
2. Click "Compare & pull request" for your branch
3. **Important:** Set the base repository to `proto-labs-ai/protolabs-studio` and the base branch to the **current RC branch** (e.g., `v0.11.0rc`), not `main`
4. Fill out the PR template completely

#### PR Requirements Checklist

Your PR should include:

- [ ] **Targets the current RC branch** (not `main`) - see [Branching Strategy](#branching-strategy-rc-branches)
- [ ] **Clear title** describing the change (use conventional commit format)
- [ ] **Description** explaining what changed and why
- [ ] **Link to related issue** (if applicable): `Closes #123` or `Fixes #456`
- [ ] **All CI checks passing** (format, lint, build, tests)
- [ ] **No merge conflicts** with the RC branch
- [ ] **Tests included** for new functionality
- [ ] **Documentation updated** if adding/changing public APIs

**Example PR Description:**

```markdown
## Summary

This PR adds dark mode support to the protoLabs Studio UI.

- Implements theme toggle in settings panel
- Adds CSS custom properties for theme colors
- Persists theme preference to localStorage

## Related Issue

Closes #123

## Testing

- [x] Tested toggle functionality in Chrome and Firefox
- [x] Verified theme persists across page reloads
- [x] Checked accessibility contrast ratios

## Screenshots

[Include before/after screenshots for UI changes]
```

### Review Process

All contributions go through code review to maintain quality:

#### What to Expect

1. **CI Checks Run First** - Automated checks (format, lint, build, tests) must pass before review
2. **Maintainer Review** - The project maintainers will review your PR and decide whether to merge it
3. **Feedback & Discussion** - The reviewer may ask questions or request changes
4. **Iteration** - Make requested changes and push updates to the same branch
5. **Approval & Merge** - Once approved and checks pass, your PR will be merged

#### Review Focus Areas

The reviewer checks for:

- **Correctness** - Does the code work as intended?
- **Clean Code** - Does it follow our [code style guidelines](#code-style-guidelines)?
- **Test Coverage** - Are new features properly tested?
- **Documentation** - Are public APIs documented?
- **Breaking Changes** - Are any breaking changes discussed first?

#### Responding to Feedback

- Respond to **all** review comments, even if just to acknowledge
- Ask questions if feedback is unclear
- Push additional commits to address feedback (don't force-push during review)
- Mark conversations as resolved once addressed

#### Approval Criteria

Your PR is ready to merge when:

- ✅ All CI checks pass
- ✅ The maintainer has approved the changes
- ✅ All review comments are addressed
- ✅ No unresolved merge conflicts

#### Getting Help

If your PR seems stuck:

- Comment asking for status update (mention @webdevcody if needed)
- Reach out on [Discord](https://discord.gg/jjem7aEDKU)
- Make sure all checks are passing and you've responded to all feedback

---

## Code Style Guidelines

protoLabs Studio uses automated tooling to enforce code style. Run `npm run format` to format code and `npm run lint` to check for issues. Pre-commit hooks automatically format staged files before committing.

---

## Testing Requirements

Testing helps prevent regressions. protoLabs Studio uses **Playwright** for end-to-end testing and **Vitest** for unit tests.

### Running Tests

Use these commands to run tests locally:

| Command                        | Description                           |
| ------------------------------ | ------------------------------------- |
| `npm run test`                 | Run E2E tests (Playwright)            |
| `npm run test:server`          | Run server unit tests (Vitest)        |
| `npm run test:packages`        | Run shared package tests              |
| `npm run test:all`             | Run all tests                         |
| `npm run test:server:coverage` | Run server tests with coverage report |

**Before submitting a PR**, always run the full test suite:

```bash
npm run test:all
```

### Test Frameworks

#### End-to-End Tests (Playwright)

E2E tests verify the entire application works correctly from a user's perspective.

- **Framework:** [Playwright](https://playwright.dev/)
- **Location:** `e2e/` directory
- **Test ports:** UI on port 3007, Server on port 3008

**Running E2E tests:**

```bash
# Run all E2E tests
npm run test

# Run with headed browser (useful for debugging)
npx playwright test --headed

# Run a specific test file
npm test --workspace=@protolabs-ai/ui -- tests/example.spec.ts
```

**E2E Test Guidelines:**

- Write tests from a user's perspective
- Use descriptive test names that explain the scenario
- Clean up test data after each test
- Use appropriate timeouts for async operations
- Prefer `locator` over direct selectors for resilience

#### Unit Tests (Vitest)

Unit tests verify individual functions and modules work correctly in isolation.

- **Framework:** [Vitest](https://vitest.dev/)
- **Location:** In the `tests/` directory within each package (e.g., `apps/server/tests/`)

**Running unit tests:**

```bash
# Run all server unit tests
npm run test:server

# Run with coverage report
npm run test:server:coverage

# Run package tests
npm run test:packages

# Run in watch mode during development
npx vitest --watch
```

**Unit Test Guidelines:**

- Keep tests small and focused on one behavior
- Use descriptive test names: `it('should return null when user is not found')`
- Follow the AAA pattern: Arrange, Act, Assert
- Mock external dependencies to isolate the unit under test
- Aim for meaningful coverage, not just line coverage

### Writing Tests

#### When to Write Tests

- **New features:** All new features should include tests
- **Bug fixes:** Add a test that reproduces the bug before fixing
- **Refactoring:** Ensure existing tests pass after refactoring
- **Public APIs:** All public APIs must have test coverage

### CI/CD Pipeline

protoLabs Studio uses **GitHub Actions** for continuous integration. Every pull request triggers automated checks.

#### CI Checks

The following checks must pass before your PR can be merged:

| Check             | Description                                      |
| ----------------- | ------------------------------------------------ |
| **Format**        | Verifies code is formatted with Prettier         |
| **Build**         | Ensures the project compiles without errors      |
| **Package Tests** | Runs tests for shared `@protolabs-ai/*` packages |
| **Server Tests**  | Runs server unit tests with coverage             |

#### CI Testing Environment

For CI environments, protoLabs Studio supports a mock agent mode:

```bash
# Enable mock agent mode for CI testing
AUTOMAKER_MOCK_AGENT=true npm run test
```

This allows tests to run without requiring a real Claude API connection.

#### Viewing CI Results

1. Go to your PR on GitHub
2. Scroll to the "Checks" section at the bottom
3. Click on any failed check to see detailed logs
4. Fix issues locally and push updates

#### Common CI Failures

| Issue               | Solution                                      |
| ------------------- | --------------------------------------------- |
| Format check failed | Run `npm run format` locally                  |
| Build failed        | Run `npm run build` and fix TypeScript errors |
| Tests failed        | Run `npm run test:all` locally to reproduce   |
| Coverage decreased  | Add tests for new code paths                  |

### Coverage Requirements

While we don't enforce strict coverage percentages, we expect:

- **New features:** Should include comprehensive tests
- **Bug fixes:** Should include a regression test
- **Critical paths:** Must have test coverage (authentication, data persistence, etc.)

To view coverage reports locally:

```bash
npm run test:server:coverage
```

This generates an HTML report you can open in your browser to see which lines are covered.

---

## Issue Reporting

Found a bug or have an idea for a new feature? We'd love to hear from you! This section explains how to report issues effectively.

### Bug Reports

When reporting a bug, please provide as much information as possible to help us understand and reproduce the issue.

#### Before Reporting

1. **Search existing issues** - Check if the bug has already been reported
2. **Try the latest version** - Make sure you're running the latest version of protoLabs Studio
3. **Reproduce the issue** - Verify you can consistently reproduce the bug

#### Bug Report Template

When creating a bug report, include:

- **Title:** A clear, descriptive title summarizing the issue
- **Environment:**
  - Operating System and version
  - Node.js version (`node --version`)
  - protoLabs Studio version or commit hash
- **Steps to Reproduce:** Numbered list of steps to reproduce the bug
- **Expected Behavior:** What you expected to happen
- **Actual Behavior:** What actually happened
- **Logs/Screenshots:** Any relevant error messages, console output, or screenshots

**Example Bug Report:**

```markdown
## Bug: WebSocket connection drops after 5 minutes of inactivity

### Environment

- OS: Windows 11
- Node.js: 22.11.0
- protoLabs Studio: commit abc1234

### Steps to Reproduce

1. Start the application with `npm run dev:web`
2. Open the Kanban board
3. Leave the browser tab open for 5+ minutes without interaction
4. Try to move a card

### Expected Behavior

The card should move to the new column.

### Actual Behavior

The UI shows "Connection lost" and the card doesn't move.

### Logs

[WebSocket] Connection closed: 1006
```

### Feature Requests

We welcome ideas for improving protoLabs Studio! Here's how to submit a feature request:

#### Before Requesting

1. **Check existing issues** - Your idea may already be proposed or in development
2. **Consider scope** - Think about whether the feature fits protoLabs Studio's mission as an autonomous AI development studio

#### Feature Request Template

A good feature request includes:

- **Title:** A brief, descriptive title
- **Problem Statement:** What problem does this feature solve?
- **Proposed Solution:** How do you envision this working?
- **Alternatives Considered:** What other approaches did you consider?
- **Additional Context:** Mockups, examples, or references that help explain your idea

**Example Feature Request:**

```markdown
## Feature: Dark Mode Support

### Problem Statement

Working late at night, the bright UI causes eye strain and doesn't match
my system's dark theme preference.

### Proposed Solution

Add a theme toggle in the settings panel that allows switching between
light and dark modes. Ideally, it should also detect system preference.

### Alternatives Considered

- Browser extension to force dark mode (doesn't work well with custom styling)
- Custom CSS override (breaks with updates)

### Additional Context

Similar to how VS Code handles themes - a dropdown in settings with
immediate preview.
```

### Security Issues

**Important:** If you discover a security vulnerability, please do NOT open a public issue. Instead:

1. Join our [Discord server](https://discord.gg/jjem7aEDKU) and send a direct message to the user `@webdevcody`
2. Include detailed steps to reproduce
3. Allow time for us to address the issue before public disclosure

We take security seriously and appreciate responsible disclosure.

---

This project is licensed under the [MIT License](LICENSE).

---

Thank you for contributing to protoLabs Studio!
