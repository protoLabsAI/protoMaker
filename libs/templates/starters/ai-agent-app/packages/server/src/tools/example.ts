/**
 * Server-side example tool: get_current_time
 *
 * Demonstrates defining a tool directly in the server package using
 * `defineSharedTool` from the tools package.
 *
 * This tool is registered alongside the shared example tools (get_weather,
 * search_web) in registry.ts, showing how server-specific tools coexist with
 * reusable shared tools.
 */

import { z } from 'zod';
import { defineSharedTool } from '@@PROJECT_NAME-tools';

const GetCurrentTimeInput = z.object({
  timezone: z
    .string()
    .optional()
    .default('UTC')
    .describe('IANA timezone string, e.g. "America/New_York" or "Europe/London"'),
});

const GetCurrentTimeOutput = z.object({
  datetime: z.string().describe('Formatted date/time string in the requested timezone'),
  timezone: z.string().describe('The timezone used for formatting'),
  timestamp: z.number().describe('Unix timestamp in milliseconds'),
  utcOffset: z.string().describe('UTC offset, e.g. "+05:30" or "-08:00"'),
});

/**
 * get_current_time — return the current date, time, and Unix timestamp.
 *
 * No external API required — useful as a lightweight tool for demos and tests.
 */
export const getCurrentTimeTool = defineSharedTool({
  name: 'get_current_time',
  description:
    'Get the current date and time, optionally formatted for a specific timezone. Returns the datetime string, Unix timestamp, and UTC offset.',
  inputSchema: GetCurrentTimeInput,
  outputSchema: GetCurrentTimeOutput,
  metadata: {
    category: 'utilities',
    tags: ['time', 'datetime', 'no-api-key'],
    version: '1.0.0',
  },
  execute: async (input) => {
    const timezone = input.timezone ?? 'UTC';
    const now = new Date();

    const formatter = new Intl.DateTimeFormat('en-US', {
      timeZone: timezone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false,
      timeZoneName: 'shortOffset',
    });

    const parts = formatter.formatToParts(now);
    const get = (type: string) => parts.find((p) => p.type === type)?.value ?? '';

    const datetime = `${get('year')}-${get('month')}-${get('day')} ${get('hour')}:${get('minute')}:${get('second')}`;
    const timeZoneName = get('timeZoneName'); // e.g. "GMT-8" or "GMT+5:30"
    const utcOffset = timeZoneName.replace('GMT', '') || '+00:00';

    return {
      success: true,
      data: {
        datetime,
        timezone,
        timestamp: now.getTime(),
        utcOffset: utcOffset || '+00:00',
      },
    };
  },
});
