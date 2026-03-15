/**
 * ProjectGrid — filterable project grid React island.
 *
 * Receives a flat list of serializable project objects from Astro and renders
 * tag-filter buttons + a responsive grid. Uses client:load for immediate
 * interactivity so filters work without a round-trip.
 *
 * Usage (in an .astro file):
 *   import ProjectGrid from '@/components/sections/ProjectGrid';
 *   <ProjectGrid client:load projects={projects} />
 */

import { useState } from "react";

export interface ProjectItem {
  title: string;
  description: string;
  techStack: string[];
  slug: string;
  tags: string[];
  liveUrl?: string;
  repoUrl?: string;
  image?: string;
  imageAlt?: string;
  featured?: boolean;
}

interface Props {
  projects: ProjectItem[];
}

export default function ProjectGrid({ projects }: Props) {
  // Collect all unique tags, prepend "All"
  const allTags = [
    "All",
    ...Array.from(new Set(projects.flatMap((p) => p.tags))).sort(),
  ];

  const [activeTag, setActiveTag] = useState("All");

  const filtered =
    activeTag === "All"
      ? projects
      : projects.filter((p) => p.tags.includes(activeTag));

  return (
    <div>
      {/* ── Tag filters ───────────────────────────────────────── */}
      {allTags.length > 1 && (
        <div
          className="mb-8 flex flex-wrap gap-2"
          role="group"
          aria-label="Filter projects by tag"
        >
          {allTags.map((tag) => {
            const isActive = activeTag === tag;
            return (
              <button
                key={tag}
                onClick={() => setActiveTag(tag)}
                aria-pressed={isActive}
                className="rounded-full px-4 py-1.5 text-sm font-medium transition-all duration-150"
                style={{
                  background: isActive
                    ? "var(--color-accent)"
                    : "var(--color-surface-3)",
                  color: isActive ? "#fff" : "#a1a1aa",
                  border: isActive
                    ? "1px solid transparent"
                    : "1px solid var(--border-subtle)",
                }}
              >
                {tag}
              </button>
            );
          })}
        </div>
      )}

      {/* ── Projects grid ─────────────────────────────────────── */}
      {filtered.length > 0 ? (
        <div className="grid gap-6 sm:grid-cols-2">
          {filtered.map((project) => (
            <article
              key={project.slug}
              className="group relative flex flex-col overflow-hidden rounded-xl border transition-all duration-300"
              style={{
                background: "var(--color-surface-2)",
                borderColor: "var(--border-subtle)",
              }}
            >
              {/* Hover glow */}
              <div
                className="pointer-events-none absolute inset-0 rounded-xl opacity-0 transition-opacity duration-300 group-hover:opacity-100"
                style={{ boxShadow: "0 0 40px rgba(167, 139, 250, 0.08)" }}
                aria-hidden="true"
              />

              {project.image && (
                <div className="aspect-video overflow-hidden">
                  <img
                    src={project.image}
                    alt={project.imageAlt ?? project.title}
                    className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
                    loading="lazy"
                    decoding="async"
                  />
                </div>
              )}

              <div className="flex flex-1 flex-col gap-4 p-6">
                {/* Title + badge */}
                <div className="flex items-start justify-between gap-3">
                  <h3 className="text-lg font-bold leading-tight text-white">
                    <a
                      href={`/projects/${project.slug}`}
                      className="no-underline transition-colors"
                      style={{ color: "inherit" }}
                    >
                      {project.title}
                    </a>
                  </h3>
                  {project.featured && (
                    <span
                      className="shrink-0 rounded-full px-2.5 py-0.5 text-xs font-semibold"
                      style={{
                        background: "rgba(167,139,250,0.15)",
                        color: "var(--color-accent)",
                      }}
                    >
                      Featured
                    </span>
                  )}
                </div>

                {/* Description */}
                <p
                  className="text-sm leading-relaxed"
                  style={{ color: "var(--color-muted)" }}
                >
                  {project.description}
                </p>

                {/* Tech stack chips */}
                <ul className="m-0 mt-auto flex list-none flex-wrap gap-2 p-0">
                  {project.techStack.slice(0, 5).map((tech) => (
                    <li
                      key={tech}
                      className="rounded px-2 py-0.5 text-xs font-medium"
                      style={{
                        background: "var(--color-surface-3)",
                        color: "#a1a1aa",
                      }}
                    >
                      {tech}
                    </li>
                  ))}
                </ul>

                {/* Links */}
                {(project.liveUrl || project.repoUrl) && (
                  <div className="flex gap-4 pt-2">
                    {project.liveUrl && (
                      <a
                        href={project.liveUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-sm font-medium no-underline transition-colors"
                        style={{ color: "var(--color-accent)" }}
                      >
                        Live demo →
                      </a>
                    )}
                    {project.repoUrl && (
                      <a
                        href={project.repoUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-sm font-medium no-underline transition-colors"
                        style={{ color: "#71717a" }}
                      >
                        Source code
                      </a>
                    )}
                  </div>
                )}
              </div>
            </article>
          ))}
        </div>
      ) : (
        <p
          className="py-12 text-center text-sm"
          style={{ color: "var(--color-muted)" }}
        >
          No projects match this filter.
        </p>
      )}
    </div>
  );
}
