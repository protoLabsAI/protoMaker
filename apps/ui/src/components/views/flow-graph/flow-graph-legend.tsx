/**
 * FlowGraphLegend — Node/edge type legend
 */

import { motion } from 'motion/react';
import { Brain, Server, Cog, Github, FileCode, Bot } from 'lucide-react';

const NODE_LEGEND = [
  { icon: Brain, label: 'Orchestrator', color: 'text-violet-400' },
  { icon: Server, label: 'Crew', color: 'text-emerald-400' },
  { icon: Cog, label: 'Service', color: 'text-blue-400' },
  { icon: Github, label: 'Integration', color: 'text-zinc-400' },
  { icon: FileCode, label: 'Feature', color: 'text-amber-400' },
  { icon: Bot, label: 'Agent', color: 'text-violet-400' },
];

const EDGE_LEGEND = [
  {
    label: 'Delegation',
    render: () => (
      <svg width="28" height="8" className="shrink-0">
        <line
          x1="0"
          y1="4"
          x2="28"
          y2="4"
          stroke="oklch(0.65 0.2 290 / 0.5)"
          strokeWidth="1.5"
          strokeDasharray="4 3"
        />
      </svg>
    ),
  },
  {
    label: 'Workflow',
    render: () => (
      <svg width="28" height="8" className="shrink-0">
        <line x1="0" y1="4" x2="28" y2="4" stroke="oklch(0.6 0.18 275 / 0.5)" strokeWidth="1.5" />
        <circle r="2.5" fill="oklch(0.7 0.2 275)" opacity={0.8}>
          <animateMotion dur="1.5s" repeatCount="indefinite" path="M0,4 L28,4" />
        </circle>
      </svg>
    ),
  },
  {
    label: 'Integration',
    render: () => (
      <svg width="28" height="8" className="shrink-0">
        <line x1="0" y1="4" x2="28" y2="4" stroke="oklch(0.7 0.17 155 / 0.5)" strokeWidth="1" />
      </svg>
    ),
  },
];

export function FlowGraphLegend() {
  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: 10 }}
      className="rounded-xl border border-border/50 bg-card/90 backdrop-blur-md shadow-lg p-3 space-y-3"
    >
      <h3 className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">
        Legend
      </h3>

      {/* Node types */}
      <div className="space-y-1.5">
        {NODE_LEGEND.map((item) => (
          <div key={item.label} className="flex items-center gap-2 text-[11px]">
            <item.icon className={`w-3 h-3 ${item.color}`} />
            <span className="text-muted-foreground">{item.label}</span>
          </div>
        ))}
      </div>

      {/* Edge types */}
      <div className="border-t border-border/30 pt-2 space-y-1.5">
        {EDGE_LEGEND.map((item) => (
          <div key={item.label} className="flex items-center gap-2 text-[11px]">
            {item.render()}
            <span className="text-muted-foreground">{item.label}</span>
          </div>
        ))}
      </div>
    </motion.div>
  );
}
