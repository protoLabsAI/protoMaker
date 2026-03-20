/**
 * Quarantine Management Tools
 *
 * Tools for managing quarantine entries:
 * - list_quarantine_entries: List quarantine entries (with optional filtering)
 * - approve_quarantine_entry: Approve a pending entry
 * - reject_quarantine_entry: Reject with reason
 */

import { Tool } from '@modelcontextprotocol/sdk/types.js';

export const quarantineTools: Tool[] = [];
