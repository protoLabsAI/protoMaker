# Phase 1: Extract LangGraph graph primitives

*AI Agent App Starter Kit > Flows — LangGraph State Graphs + Visual Builder*

Create packages/flows/ in the starter kit. Extract from libs/flows/src/graphs/: GraphBuilder class with OTel tracing, createLinearGraph/createLoopGraph/createBranchingGraph factories, state-utils (createStateAnnotation from Zod, validateState, mergeState), all routers (createBinaryRouter, createValueRouter, createSequentialRouter, createParallelRouter, etc.), all reducers (appendReducer, replaceReducer, counterReducer, etc.), state-transforms (createSubgraphBridge, createFieldMapper). Also extract xml-parser (extractTag, extractAllTags, etc.) as a zero-dep utility. Include example flows: basic-chat-agent.ts, tool-calling-agent.ts, hitl-approval-flow.ts.

**Complexity:** large

## Files to Modify

- libs/templates/starters/ai-agent-app/packages/flows/src/builder.ts
- libs/templates/starters/ai-agent-app/packages/flows/src/routers.ts
- libs/templates/starters/ai-agent-app/packages/flows/src/reducers.ts
- libs/templates/starters/ai-agent-app/packages/flows/src/state-utils.ts
- libs/templates/starters/ai-agent-app/packages/flows/src/xml-parser.ts

## Acceptance Criteria

- [ ] GraphBuilder wraps StateGraph with OTel spans
- [ ] Factory functions create common graph patterns
- [ ] Zod-to-LangGraph state annotations work
- [ ] All routers and reducers function correctly
- [ ] XML parser extracts tags from LLM output
- [ ] Example flows compile and run