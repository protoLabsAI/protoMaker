/**
 * Server-side example tools.
 *
 * Demonstrates defining tools directly in the server package using
 * `defineSharedTool` from the tools package.
 *
 * These tools are registered in registry.ts alongside the shared tools from
 * `@@PROJECT_NAME-tools`, showing how server-specific tools coexist with
 * reusable shared ones.
 *
 * ## get_weather (requiresConfirmation: true)
 *
 * The get_weather tool is intentionally flagged with `requiresConfirmation: true`
 * to demonstrate the server-level confirmation pattern. In a production app you
 * would apply this flag to tools with side effects (sending messages, charging
 * cards, etc.) rather than read-only lookups — it is used here purely as a
 * clear, runnable example of the mechanism.
 *
 * ## get_current_time
 *
 * A lightweight utility tool that requires no external API key — useful for
 * demos and tests.
 */

import { z } from 'zod';
import { defineSharedTool } from '@@PROJECT_NAME-tools';

// ---------------------------------------------------------------------------
// get_weather — server-local, requiresConfirmation: true
// ---------------------------------------------------------------------------

const GetWeatherInput = z.object({
  location: z
    .string()
    .describe('City name or "City, Country" format, e.g. "Paris" or "London, UK"'),
  units: z
    .enum(['celsius', 'fahrenheit'])
    .optional()
    .default('celsius')
    .describe('Temperature unit to return'),
});

const GetWeatherOutput = z.object({
  location: z.string().describe('Location as provided'),
  temperature: z.number().describe('Current temperature in the requested unit'),
  unit: z.enum(['celsius', 'fahrenheit']).describe('Unit used for the temperature value'),
  condition: z.string().describe('Weather condition description, e.g. "Partly cloudy"'),
  humidity: z.number().describe('Relative humidity percentage (0–100)'),
  windSpeed: z.number().describe('Wind speed in km/h'),
});

/**
 * get_weather — fetch current weather for a location.
 *
 * This is a **server-local** copy of the weather tool, defined with
 * `requiresConfirmation: true` to demonstrate the server confirmation pattern.
 * The `Object.assign` approach attaches the flag to the SharedTool returned by
 * `defineSharedTool`, which `registerTool()` in registry.ts then tracks.
 *
 * Replace the mock `execute` body with a real weather API call (e.g.
 * OpenWeatherMap) when deploying to production.
 */
export const getWeatherTool = Object.assign(
  defineSharedTool({
    name: 'get_weather',
    description:
      'Get the current weather conditions for a given location, including temperature, ' +
      'humidity, and wind speed.',
    inputSchema: GetWeatherInput,
    outputSchema: GetWeatherOutput,
    metadata: {
      category: 'utilities',
      tags: ['weather', 'external-api'],
      version: '1.0.0',
    },
    execute: async (input) => {
      // Replace with a real weather API call, e.g.:
      //   const url = `https://api.openweathermap.org/data/2.5/weather?q=${encodeURIComponent(input.location)}&appid=${API_KEY}&units=metric`;
      //   const data = await fetch(url).then(r => r.json());
      //
      // Mock response — deterministic for demos and tests:
      return {
        success: true,
        data: {
          location: input.location,
          temperature: input.units === 'fahrenheit' ? 72 : 22,
          unit: input.units ?? 'celsius',
          condition: 'Partly cloudy',
          humidity: 65,
          windSpeed: 15,
        },
      };
    },
  }),
  // Flag this tool as requiring user confirmation before execution.
  // registry.ts tracks this in its `confirmationRequired` set and exposes
  // `toolRequiresConfirmation(name)` for callers to check.
  { requiresConfirmation: true as const }
);

// ---------------------------------------------------------------------------
// get_current_time — server-local, no confirmation required
// ---------------------------------------------------------------------------

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
 * Does NOT set `requiresConfirmation`; the registry registers it without gating.
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
