---
name: due-diligence
description: Validate approaches and question architectures with evidence-based research. Use when evaluating a technology choice, validating an approach, comparing solutions, or questioning an architectural decision.
category: planning
argument-hint: <approach, technology, or decision to validate>
allowed-tools:
  - Read
  - Glob
  - Grep
  - Task
  - WebSearch
  - WebFetch
model: sonnet
---

# Due Diligence

Evidence-based validation of approaches, technologies, and architectural decisions. Combines codebase analysis with external research.

## Process

### 1. Analyze Codebase Context

Identify:

- Existing patterns and conventions
- Current technologies and versions
- Architectural constraints
- Integration points and dependencies

### 2. Conduct Web Research

Use WebSearch and WebFetch to find:

- Industry best practices
- Performance benchmarks and metrics
- Scalability case studies
- Common pitfalls and anti-patterns
- Recent developments and trends

### 3. Evaluate Solutions

**Performance**: Speed, resource usage, efficiency, latency, throughput
**Scalability**: Growth handling, horizontal/vertical scaling, bottlenecks
**Compatibility**: Fit with existing codebase, migration complexity
**Maintainability**: Community support, documentation, learning curve

### Response Structure

```
<scratchpad>
- Key findings from codebase (patterns, technologies, constraints)
- Key findings from web research (benchmarks, recommendations, data points)
- Compare/contrast solution options
- Evaluate trade-offs: performance vs scalability vs complexity vs compatibility
- Identify most promising solution(s)
</scratchpad>

<analysis>
Detailed analysis covering:
- Relevant codebase findings
- Best practices from research (with sources)
- Performance considerations (include specific metrics/benchmarks)
- Scalability considerations (load handling, data volume, user growth)
- Compatibility and integration factors
</analysis>

<recommendation>
- Specific approach or technology recommended
- Why most performant (with evidence)
- Why most scalable (with evidence)
- Implementation considerations and caveats
- Alternative solutions if primary isn't feasible
</recommendation>
```

## When to Use

- Before adopting a new library or framework
- When choosing between architectural patterns
- Validating a proposed technical approach
- Questioning existing technical decisions
- Evaluating migration or refactoring strategies

## Research Guidelines

- Cite sources and provide links when possible
- Prefer recent benchmarks (within last 2 years)
- Look for production case studies, not just theory
- Consider the specific scale and context of the project
- Be honest about uncertainty or conflicting evidence
