# Contributing to protoMaker

Thank you for your interest in contributing to protoMaker! We're excited to have you as part of our community.

## Ideas-Only Contribution Model

protoMaker follows an **ideas-only contribution model**. This means:

- ✅ **We welcome:** Ideas, bug reports, feature requests, feedback, and suggestions
- ❌ **We do not accept:** Code contributions, pull requests, or patches from the community

### Why This Model?

protoMaker is an autonomous AI development studio that uses AI agents to implement features. By focusing on ideas rather than code contributions, we:

- Maintain architectural consistency
- Ensure all code follows our patterns and standards
- Leverage AI agents to handle implementation details
- Allow the community to focus on what matters: great ideas

### We Do Not Accept Code Contributions

**Please do not submit pull requests with code changes.** They will be automatically closed with a reference to this document.

Instead, submit your ideas through our issue templates, and our AI agents will handle the implementation if your idea is accepted.

## How to Contribute

### 1. Submit Ideas

Have an idea for a new feature or improvement? We'd love to hear it!

**Process:**

1. [Search existing issues](https://github.com/proto-labs-ai/protoMaker/issues) to avoid duplicates
2. [Submit an idea](https://github.com/proto-labs-ai/protoMaker/issues/new/choose) using the "Idea Submission" template
3. Provide a clear problem statement and proposed solution
4. Our team will review and respond

**What happens next:**

- **Triage:** Maintainers review your idea and label it appropriately
- **Discussion:** We may ask clarifying questions or discuss alternatives
- **Accepted:** If approved, the idea is added to our backlog
- **Implementation:** AI agents implement the feature
- **Review:** Maintainers review the generated code
- **Merged:** Once approved, changes are merged and released

### 2. Report Bugs

Found a bug? Help us fix it by reporting it properly.

**Process:**

1. [Search existing bug reports](https://github.com/proto-labs-ai/protoMaker/issues?q=is%3Aissue+label%3Abug) to avoid duplicates
2. [Submit a bug report](https://github.com/proto-labs-ai/protoMaker/issues/new/choose) using the "Bug Report" template
3. Include all requested information: steps to reproduce, expected behavior, actual behavior, environment details
4. Add screenshots or logs if available

**What makes a good bug report:**

- Clear, descriptive title
- Step-by-step reproduction steps
- Expected vs. actual behavior
- Environment information (OS, version, etc.)
- Error messages or logs

### 3. Join Discussions

Participate in conversations about features, architecture, and the future of protoMaker.

**Where to engage:**

- **GitHub Issues:** Comment on existing issues with your thoughts
- **GitHub Discussions:** Share ideas, ask questions, or help others
- **Discord:** Join our [Discord server](https://discord.gg/jjem7aEDKU) for real-time chat

### 4. Improve Documentation

Documentation improvements are valuable contributions!

**How to help:**

- Report unclear or outdated documentation
- Suggest new guides or tutorials
- Point out typos or broken links
- Share use cases or examples

**Note:** While we accept documentation ideas and suggestions, the implementation (writing/updating docs) is handled by maintainers or AI agents through our normal process.

### 5. Spread the Word

Help grow the protoMaker community:

- ⭐ Star the [GitHub repository](https://github.com/proto-labs-ai/protoMaker)
- Share your experience on social media
- Write blog posts about your use cases
- Recommend protoMaker to others
- Answer questions in Discord or GitHub Discussions

## Architecture Resources

Understanding protoMaker's architecture helps you contribute better ideas:

### Core Architecture

- **[Monorepo Architecture](./docs/dev/monorepo-architecture.md)** - Package structure, dependency chain, import conventions
- **[Git Workflow](./docs/dev/git-workflow.md)** - Branch strategies, worktree isolation, epic workflow
- **[Environment Setup](./docs/dev/environment-setup.md)** - Required environment variables, configuration

### Agent System

- **[Agent SDK Integration](./docs/agents/sdk-integration.md)** - How agents execute, session management, context injection
- **[Agent Templates](./docs/agents/authoring-templates.md)** - Creating custom agent templates
- **[Model Resolver](./docs/server/model-resolver.md)** - Model aliases, complexity-based selection

### Extensibility

- **[Creating MCP Tools](./docs/dev/creating-mcp-tools.md)** - Build custom MCP tools for agents
- **[MCP Tools Reference](./docs/integrations/mcp-tools-reference.md)** - Complete catalog of 135+ tools
- **[Project Orchestration](./docs/infra/orchestration.md)** - Hierarchical project planning, epics, dependencies

## Code of Conduct

We are committed to providing a welcoming and inclusive environment for everyone.

Please read our [Code of Conduct](./CODE_OF_CONDUCT.md) for:

- Community standards and expectations
- Unacceptable behavior
- Enforcement procedures
- How to report violations

**Report violations:**

- Discord: DM `@webdevcody`
- Email: conduct@protolabs.studio

## Security Issues

**Do not report security vulnerabilities publicly.**

See our [Security Policy](SECURITY.md) for instructions on responsibly disclosing security issues.

## Issue Labels

Understanding our label system helps you navigate issues:

### Type Labels

- `type: idea` - Feature ideas or enhancement suggestions
- `bug` - Something isn't working correctly
- `documentation` - Documentation improvements

### Status Labels

- `status: needs-triage` - Awaiting initial review
- `status: accepted` - Approved for implementation
- `status: in-progress` - Currently being worked on
- `status: blocked` - Waiting on something else

### Priority Labels

- `priority: critical` - Urgent issues requiring immediate attention
- `priority: high` - Important issues to address soon
- `priority: medium` - Standard priority
- `priority: low` - Nice-to-have improvements

### Area Labels

- `area: ui` - User interface changes
- `area: agent` - AI agent functionality
- `area: kanban` - Kanban board features
- `area: git` - Git/worktree operations
- `area: performance` - Performance improvements

## FAQ

### Can I fork the repository and make changes for my own use?

Yes! protoMaker is open source under the MIT License. You're free to fork, modify, and use it however you like for your own purposes. We just don't accept those changes back into the main repository via pull requests.

### Can I help with code review?

Code review is handled by maintainers. However, you can:

- Comment on issues with technical insights
- Share your expertise in discussions
- Help others troubleshoot problems in Discord

### How long does it take for ideas to be implemented?

It varies based on:

- Complexity of the idea
- Current priorities and roadmap
- Available resources
- Number of ideas in the backlog

We can't provide specific timelines, but accepted ideas are tracked publicly in our issue tracker.

### What if my idea is rejected?

Not all ideas can be implemented. Ideas may be declined because they:

- Don't align with the project's vision
- Are too complex relative to the benefit
- Are better suited as plugins or extensions
- Conflict with existing design decisions

We'll explain our reasoning when declining ideas.

### Can I implement a feature as a plugin?

We're exploring a plugin system for future releases. Stay tuned for updates!

## Recognition

While we don't accept code contributions, we value all forms of contribution:

- **Contributors List:** Idea submitters are credited in release notes when their ideas are implemented
- **Discord Roles:** Active community members receive special roles
- **Acknowledgments:** Bug reporters are thanked in fix announcements

## Getting Help

Need help using protoMaker or have questions?

- 📚 **Documentation:** [https://docs.protolabs.studio](https://docs.protolabs.studio)
- 💬 **Discord:** [https://discord.gg/jjem7aEDKU](https://discord.gg/jjem7aEDKU)
- 🐛 **Bug Reports:** [Submit an issue](https://github.com/proto-labs-ai/protoMaker/issues/new/choose)
- 💡 **Feature Ideas:** [Submit an idea](https://github.com/proto-labs-ai/protoMaker/issues/new/choose)

## Thank You

Your ideas, feedback, and participation make protoMaker better. Whether you're reporting bugs, suggesting features, or helping others in the community, you're making a valuable contribution.

We appreciate your understanding of our ideas-only model and look forward to building the future of AI-powered development together!

---

**License:** This project is licensed under the [MIT License](LICENSE).
