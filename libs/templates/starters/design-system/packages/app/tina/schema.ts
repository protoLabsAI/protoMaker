/**
 * TinaCMS content schema — defines the data model for git-backed content.
 *
 * Collections:
 *  - page          → content/pages/*.md       (site pages)
 *  - componentDoc  → content/components/*.md  (component documentation)
 *  - guideline     → content/guidelines/*.md  (design guidelines)
 *  - changelog     → content/changelog/*.md   (version history)
 *
 * Usage: imported by tina/config.ts
 */

import type { TinaCollection } from 'tinacms';

// ─── Pages ────────────────────────────────────────────────────────────────────

export const pageCollection: TinaCollection = {
  name: 'page',
  label: 'Pages',
  path: 'content/pages',
  format: 'md',
  fields: [
    {
      type: 'string',
      name: 'title',
      label: 'Title',
      isTitle: true,
      required: true,
    },
    {
      type: 'string',
      name: 'description',
      label: 'Description',
      ui: { component: 'textarea' },
    },
    {
      type: 'string',
      name: 'order',
      label: 'Navigation Order',
      description: 'Numeric order in the navigation sidebar (e.g. "1", "2")',
    },
    {
      type: 'rich-text',
      name: 'body',
      label: 'Body',
      isBody: true,
    },
  ],
};

// ─── Component Documentation ──────────────────────────────────────────────────

export const componentDocCollection: TinaCollection = {
  name: 'componentDoc',
  label: 'Component Docs',
  path: 'content/components',
  format: 'md',
  fields: [
    {
      type: 'string',
      name: 'title',
      label: 'Component Name',
      isTitle: true,
      required: true,
    },
    {
      type: 'string',
      name: 'category',
      label: 'Category',
      options: ['Atoms', 'Molecules', 'Organisms', 'Utilities'],
    },
    {
      type: 'string',
      name: 'description',
      label: 'Short Description',
      ui: { component: 'textarea' },
    },
    {
      type: 'string',
      name: 'status',
      label: 'Status',
      options: ['stable', 'beta', 'deprecated'],
    },
    {
      type: 'rich-text',
      name: 'body',
      label: 'Documentation',
      isBody: true,
    },
  ],
};

// ─── Design Guidelines ────────────────────────────────────────────────────────

export const guidelineCollection: TinaCollection = {
  name: 'guideline',
  label: 'Design Guidelines',
  path: 'content/guidelines',
  format: 'md',
  fields: [
    {
      type: 'string',
      name: 'title',
      label: 'Title',
      isTitle: true,
      required: true,
    },
    {
      type: 'string',
      name: 'category',
      label: 'Category',
      options: ['Color', 'Typography', 'Spacing', 'Motion', 'Accessibility', 'Writing'],
    },
    {
      type: 'string',
      name: 'description',
      label: 'Description',
      ui: { component: 'textarea' },
    },
    {
      type: 'rich-text',
      name: 'body',
      label: 'Content',
      isBody: true,
    },
  ],
};

// ─── Changelog ────────────────────────────────────────────────────────────────

export const changelogCollection: TinaCollection = {
  name: 'changelog',
  label: 'Changelog',
  path: 'content/changelog',
  format: 'md',
  fields: [
    {
      type: 'string',
      name: 'version',
      label: 'Version',
      isTitle: true,
      required: true,
    },
    {
      type: 'datetime',
      name: 'date',
      label: 'Release Date',
    },
    {
      type: 'string',
      name: 'type',
      label: 'Release Type',
      options: ['major', 'minor', 'patch'],
    },
    {
      type: 'rich-text',
      name: 'body',
      label: 'Changes',
      isBody: true,
    },
  ],
};

// ─── Exported collections ─────────────────────────────────────────────────────

export const collections: TinaCollection[] = [
  pageCollection,
  componentDocCollection,
  guidelineCollection,
  changelogCollection,
];
