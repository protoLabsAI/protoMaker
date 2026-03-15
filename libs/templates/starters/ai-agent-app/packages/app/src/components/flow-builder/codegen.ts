/**
 * codegen.ts — LangGraph TypeScript code generator.
 *
 * Takes a ReactFlow graph (nodes + edges) and emits executable
 * @langchain/langgraph boilerplate that users can build on.
 */

import type { Node, Edge } from '@xyflow/react';
import type { FlowNodeData } from './nodes.js';

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Convert an arbitrary label into a valid JS identifier. */
function toId(label: string): string {
  const safe = label
    .trim()
    .replace(/[^a-zA-Z0-9]/g, '_')
    .replace(/^([0-9])/, '_$1')
    .replace(/_+/g, '_')
    .replace(/^_|_$/g, '');
  return safe || 'node';
}

/** Build a deduplicated label → identifier map for all nodes. */
function buildNameMap(nodes: Node<FlowNodeData>[]): Map<string, string> {
  const map = new Map<string, string>();
  const seen = new Set<string>();
  for (const n of nodes) {
    let base = toId(n.data.label);
    let candidate = base;
    let i = 2;
    while (seen.has(candidate)) candidate = `${base}_${i++}`;
    map.set(n.id, candidate);
    seen.add(candidate);
  }
  return map;
}

// ── Main export ───────────────────────────────────────────────────────────────

/**
 * Generate a LangGraph TypeScript module from the visual flow graph.
 *
 * @param nodes  ReactFlow node array (with FlowNodeData).
 * @param edges  ReactFlow edge array.
 * @returns      A TypeScript source string ready to save and run.
 */
export function generateLangGraphCode(nodes: Node<FlowNodeData>[], edges: Edge[]): string {
  if (nodes.length === 0) {
    return '// Empty flow — drag nodes onto the canvas to get started.\n';
  }

  const nameMap = buildNameMap(nodes);
  const lines: string[] = [];

  // ── Imports ──────────────────────────────────────────────────────────────
  lines.push('import { StateGraph, Annotation, START, END } from "@langchain/langgraph";');
  lines.push('import { BaseMessage, HumanMessage, AIMessage } from "@langchain/core/messages";');

  if (nodes.some((n) => n.data.kind === 'agent')) {
    lines.push('import { ChatAnthropic } from "@langchain/anthropic";');
  }
  if (nodes.some((n) => n.data.kind === 'hitl')) {
    lines.push('import { interrupt } from "@langchain/langgraph";');
  }
  lines.push('');

  // ── State annotation ─────────────────────────────────────────────────────
  lines.push('// ── State ────────────────────────────────────────────────────────────────');
  lines.push('const GraphState = Annotation.Root({');
  lines.push('  messages: Annotation<BaseMessage[]>({');
  lines.push('    reducer: (prev: BaseMessage[], next: BaseMessage[]) => [...prev, ...next],');
  lines.push('    default: () => [],');
  lines.push('  }),');

  for (const n of nodes.filter((x) => x.data.kind === 'state')) {
    const key = toId(n.data.stateKey ?? n.data.label);
    lines.push(`  ${key}: Annotation<unknown>({ default: () => null }),`);
  }

  lines.push('});');
  lines.push('type State = typeof GraphState.State;');
  lines.push('');

  // ── Node functions ────────────────────────────────────────────────────────
  lines.push('// ── Nodes ────────────────────────────────────────────────────────────────');

  for (const node of nodes) {
    const fn = nameMap.get(node.id)!;
    const { kind, model, toolName, condition, description } = node.data;

    if (description) lines.push(`/** ${description} */`);

    switch (kind) {
      case 'agent': {
        const modelId = model ?? 'claude-3-5-haiku-20241022';
        lines.push(`async function ${fn}(state: State): Promise<Partial<State>> {`);
        lines.push(`  const llm = new ChatAnthropic({ model: "${modelId}" });`);
        lines.push(`  const response = await llm.invoke(state.messages);`);
        lines.push(`  return { messages: [response as AIMessage] };`);
        lines.push(`}`);
        break;
      }

      case 'tool': {
        const tool = toolName ?? fn;
        lines.push(`async function ${fn}(state: State): Promise<Partial<State>> {`);
        lines.push(`  // TODO: implement "${tool}" tool`);
        lines.push(`  console.log("Running tool:", state.messages.at(-1)?.content);`);
        lines.push(`  return { messages: [new HumanMessage("${tool} result")] };`);
        lines.push(`}`);
        break;
      }

      case 'condition': {
        const outs = edges
          .filter((e) => e.source === node.id)
          .map((e) => nameMap.get(e.target) ?? 'END');
        lines.push(`function ${fn}(state: State): string {`);
        if (condition) lines.push(`  // Condition: ${condition}`);
        lines.push(`  // Should return one of: ${outs.length ? outs.join(', ') : 'END'}`);
        lines.push(`  return "${outs[0] ?? 'END'}"; // ← replace with real routing logic`);
        lines.push(`}`);
        break;
      }

      case 'state': {
        lines.push(`async function ${fn}(state: State): Promise<Partial<State>> {`);
        lines.push(`  // TODO: transform / enrich state`);
        lines.push(`  return state;`);
        lines.push(`}`);
        break;
      }

      case 'hitl': {
        lines.push(`async function ${fn}(state: State): Promise<Partial<State>> {`);
        lines.push(`  // Execution pauses here until a human provides input`);
        lines.push(`  const humanInput = interrupt(state) as string;`);
        lines.push(`  return { messages: [new HumanMessage(humanInput)] };`);
        lines.push(`}`);
        break;
      }
    }

    lines.push('');
  }

  // ── Graph assembly ────────────────────────────────────────────────────────
  lines.push('// ── Graph ────────────────────────────────────────────────────────────────');
  lines.push('const graph = new StateGraph(GraphState)');

  // addNode for all non-condition nodes
  for (const n of nodes.filter((x) => x.data.kind !== 'condition')) {
    const name = nameMap.get(n.id)!;
    lines.push(`  .addNode("${name}", ${name})`);
  }

  // START edges for entry nodes (no incoming edges)
  const targetsSet = new Set(edges.map((e) => e.target));
  for (const n of nodes.filter((x) => !targetsSet.has(x.id) && x.data.kind !== 'condition')) {
    lines.push(`  .addEdge(START, "${nameMap.get(n.id)}")`);
  }

  // Regular + conditional edges
  const handledConditionals = new Set<string>();

  for (const edge of edges) {
    const srcNode = nodes.find((n) => n.id === edge.source);
    const tgtNode = nodes.find((n) => n.id === edge.target);
    if (!srcNode || !tgtNode) continue;

    const srcName = nameMap.get(srcNode.id)!;

    // Edge into a condition node → emit .addConditionalEdges from condition's output edges
    if (tgtNode.data.kind === 'condition') {
      if (handledConditionals.has(tgtNode.id)) continue;
      handledConditionals.add(tgtNode.id);

      const condFn = nameMap.get(tgtNode.id)!;
      const branches = edges
        .filter((e) => e.source === tgtNode.id)
        .map((e) => {
          const dest = nodes.find((n) => n.id === e.target);
          const destName = dest ? nameMap.get(dest.id)! : 'END';
          const label = (e.label as string | undefined) ?? destName;
          const destValue = dest ? `"${destName}"` : 'END';
          return `    "${label}": ${destValue}`;
        });

      if (branches.length > 0) {
        lines.push(`  .addConditionalEdges("${srcName}", ${condFn}, {`);
        lines.push(branches.join(',\n'));
        lines.push('  })');
      } else {
        lines.push(`  .addConditionalEdges("${srcName}", ${condFn})`);
      }
      continue;
    }

    // Skip outgoing edges from condition nodes (handled above)
    if (srcNode.data.kind === 'condition') continue;

    lines.push(`  .addEdge("${srcName}", "${nameMap.get(tgtNode.id)}")`);
  }

  // Terminal nodes (no outgoing edges, not condition) → END
  const sourcesSet = new Set(edges.map((e) => e.source));
  for (const n of nodes.filter((x) => x.data.kind !== 'condition' && !sourcesSet.has(x.id))) {
    lines.push(`  .addEdge("${nameMap.get(n.id)}", END)`);
  }

  lines.push('  .compile();');
  lines.push('');
  lines.push('export { graph };');
  lines.push('');
  lines.push('// ── Usage ────────────────────────────────────────────────────────────────');
  lines.push('// const result = await graph.invoke({');
  lines.push('//   messages: [new HumanMessage("Hello!")],');
  lines.push('// });');
  lines.push('// console.log(result.messages.at(-1)?.content);');

  return lines.join('\n');
}

// ── JSON snapshot ─────────────────────────────────────────────────────────────

/** Serialise the flow graph as a plain JSON object for localStorage. */
export function graphToJson(nodes: Node<FlowNodeData>[], edges: Edge[]): Record<string, unknown> {
  return {
    version: 1,
    nodes: nodes.map((n) => ({ id: n.id, type: n.type, position: n.position, data: n.data })),
    edges: edges.map((e) => ({ id: e.id, source: e.source, target: e.target, label: e.label })),
  };
}
