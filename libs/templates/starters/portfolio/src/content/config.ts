import { defineCollection, z } from 'astro:content';

// ── Projects collection ─────────────────────────────────────────────────────
// Each markdown file in src/content/projects/ represents a portfolio project.

const projects = defineCollection({
  type: 'content',
  schema: z.object({
    /** Project display title */
    title: z.string(),
    /** One-sentence summary shown in cards and meta tags */
    description: z.string(),
    /** Technologies / tools used */
    techStack: z.array(z.string()),
    /** Date the project was shipped or started */
    pubDate: z.coerce.date(),
    /** Link to source code repository */
    repoUrl: z.string().url().optional(),
    /** Link to live demo or deployed site */
    liveUrl: z.string().url().optional(),
    /** Open Graph / card image path (relative to /public) */
    image: z.string().optional(),
    /** Alt text for the card image */
    imageAlt: z.string().optional(),
    /** Show on the home page featured section */
    featured: z.boolean().default(false),
    /** Tags for filtering */
    tags: z.array(z.string()).default([]),
  }),
});

// ── Blog collection ─────────────────────────────────────────────────────────
// Each markdown file in src/content/blog/ is a blog post.

const blog = defineCollection({
  type: 'content',
  schema: z.object({
    /** Post title */
    title: z.string(),
    /** Short description for meta tags and card excerpts */
    description: z.string(),
    /** ISO 8601 publish date */
    pubDate: z.coerce.date(),
    /** Optional update date */
    updatedDate: z.coerce.date().optional(),
    /** Author name (defaults to site owner) */
    author: z.string().optional(),
    /** Cover image path (relative to /public) */
    image: z.string().optional(),
    /** Alt text for the cover image */
    imageAlt: z.string().optional(),
    /** Topic tags for filtering and related posts */
    tags: z.array(z.string()).default([]),
    /** Draft posts are excluded from the production build */
    draft: z.boolean().default(false),
  }),
});

// ── Testimonials data collection ─────────────────────────────────────────────
// JSON or YAML files in src/content/testimonials/.

const testimonials = defineCollection({
  type: 'data',
  schema: z.object({
    /** Person's full name */
    author: z.string(),
    /** Job title */
    role: z.string(),
    /** Company or project name */
    company: z.string(),
    /** The testimonial text */
    quote: z.string(),
    /** Path to avatar image (relative to /public) */
    avatar: z.string().optional(),
    /** Optional link to the person's LinkedIn / profile */
    link: z.string().url().optional(),
    /** Controls render order — lower numbers appear first */
    order: z.number().default(99),
  }),
});

// ── Site config data collection ──────────────────────────────────────────────
// Single JSON file: src/content/siteConfig/main.json
// Access via: const [{ data: config }] = await getCollection('siteConfig')

const siteConfig = defineCollection({
  type: 'data',
  schema: z.object({
    /** Your name — used in the <title> tag and nav logo */
    name: z.string(),
    /** Short bio shown in the hero and about page */
    bio: z.string(),
    /** Meta description for the home page */
    description: z.string(),
    /** Email address (used in the contact section) */
    email: z.string().email().optional(),
    /** Social links */
    social: z
      .object({
        github: z.string().url().optional(),
        twitter: z.string().url().optional(),
        linkedin: z.string().url().optional(),
        bluesky: z.string().url().optional(),
      })
      .default({}),
    /** Canonical site URL (set in astro.config.mjs too) */
    siteUrl: z.string().url(),
    /** Open Graph image for the home page */
    ogImage: z.string().optional(),
  }),
});

export const collections = { projects, blog, testimonials, siteConfig };
