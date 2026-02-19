#!/usr/bin/env node

/**
 * Roadmap HTML injection script for protoLabs public pages.
 * Reads site/data/roadmap.json and injects static HTML into site/roadmap/index.html.
 *
 * Usage:
 *   node site/scripts/generate-roadmap.mjs
 */

import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROADMAP_JSON = resolve(__dirname, '../data/roadmap.json');
const ROADMAP_HTML = resolve(__dirname, '../roadmap/index.html');

function escapeHtml(str) {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function statusLabel(status) {
  switch (status) {
    case 'completed':
      return 'Shipped';
    case 'in-progress':
      return 'In Progress';
    case 'planned':
      return 'Planned';
    default:
      return status;
  }
}

function generateHtml(milestones) {
  const parts = [];

  for (const m of milestones) {
    const status = m.status;
    const dotClass = `dot-${status}`;
    const statusClass = `status-${status}`;
    const borderColor =
      status === 'completed'
        ? 'border-green-500/20'
        : status === 'in-progress'
          ? 'border-accent/20'
          : 'border-zinc-700/50';
    const bgColor =
      status === 'completed'
        ? 'bg-surface-1'
        : status === 'in-progress'
          ? 'bg-surface-1'
          : 'bg-surface-0';
    const titleColor = status === 'planned' ? 'text-zinc-500' : 'text-white';
    const descColor = status === 'planned' ? 'text-zinc-600' : 'text-zinc-400';
    const itemColor = status === 'planned' ? 'text-zinc-600' : 'text-zinc-400';
    const checkColor =
      status === 'completed'
        ? 'text-green-500'
        : status === 'in-progress'
          ? 'text-accent'
          : 'text-zinc-700';
    const checkIcon =
      status === 'completed' ? '&#10003;' : status === 'in-progress' ? '&#9679;' : '&#9675;';

    parts.push(`            <div class="mb-8 relative">`);
    parts.push(
      `              <div class="absolute -left-10 top-4 w-[30px] h-[30px] rounded-full ${dotClass} flex items-center justify-center z-10">`
    );
    if (status === 'completed') {
      parts.push(
        `                <svg class="w-3.5 h-3.5 text-surface-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="3"><path stroke-linecap="round" stroke-linejoin="round" d="M5 13l4 4L19 7"/></svg>`
      );
    }
    parts.push(`              </div>`);
    parts.push(`              <div class="rounded-xl border ${borderColor} ${bgColor} p-6">`);
    parts.push(`                <div class="flex items-center gap-3 mb-2">`);
    parts.push(
      `                  <span class="${statusClass} inline-block px-2.5 py-0.5 rounded-md text-[11px] font-medium uppercase tracking-wider border">${statusLabel(status)}</span>`
    );
    parts.push(
      `                  <h3 class="text-lg font-semibold ${titleColor}">${escapeHtml(m.title)}</h3>`
    );
    parts.push(`                </div>`);
    parts.push(
      `                <p class="text-sm ${descColor} mb-4">${escapeHtml(m.description)}</p>`
    );
    parts.push(`                <ul class="space-y-1.5">`);
    for (const item of m.items) {
      parts.push(
        `                  <li class="flex items-start gap-2 text-sm ${itemColor}"><span class="${checkColor} mt-0.5">${checkIcon}</span>${escapeHtml(item)}</li>`
      );
    }
    parts.push(`                </ul>`);
    parts.push(`              </div>`);
    parts.push(`            </div>`);
  }

  return parts.join('\n');
}

function main() {
  console.log('Generating roadmap...');

  if (!existsSync(ROADMAP_JSON)) {
    console.error(`  roadmap.json not found at ${ROADMAP_JSON}`);
    process.exit(1);
  }

  if (!existsSync(ROADMAP_HTML)) {
    console.error(`  roadmap HTML not found at ${ROADMAP_HTML}`);
    process.exit(1);
  }

  const roadmap = JSON.parse(readFileSync(ROADMAP_JSON, 'utf-8'));
  const milestones = roadmap.milestones || [];
  console.log(`  Found ${milestones.length} milestones`);

  const counts = {
    completed: milestones.filter((m) => m.status === 'completed').length,
    'in-progress': milestones.filter((m) => m.status === 'in-progress').length,
    planned: milestones.filter((m) => m.status === 'planned').length,
  };
  console.log(
    `  Status: ${counts.completed} completed, ${counts['in-progress']} in progress, ${counts.planned} planned`
  );

  let html = readFileSync(ROADMAP_HTML, 'utf-8');

  // Inject milestone entries
  const entriesHtml = generateHtml(milestones);
  html = html.replace(
    /<!--ROADMAP_START-->[\s\S]*?<!--ROADMAP_END-->/,
    `<!--ROADMAP_START-->\n${entriesHtml}\n            <!--ROADMAP_END-->`
  );

  // Inject counts
  html = html.replace('<!--COUNT:completed-->', String(counts.completed));
  html = html.replace('<!--COUNT:in-progress-->', String(counts['in-progress']));
  html = html.replace('<!--COUNT:planned-->', String(counts.planned));

  // Inject last updated
  const lastUpdated = new Date(roadmap.lastUpdated).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
  html = html.replace('<!--ROADMAP:lastUpdated-->', `Last updated ${lastUpdated}`);

  writeFileSync(ROADMAP_HTML, html);
  console.log(`  Injected into ${ROADMAP_HTML}`);
  console.log('\nRoadmap generation complete.');
}

main();
