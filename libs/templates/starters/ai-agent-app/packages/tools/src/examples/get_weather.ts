/**
 * Example: get_weather tool
 *
 * Demonstrates the defineSharedTool pattern with Zod schema validation.
 * Uses a mock implementation — replace the execute body with a real
 * weather API call (e.g. OpenWeatherMap, WeatherAPI).
 *
 * @example Replace with real API:
 * ```typescript
 * const response = await fetch(
 *   `https://api.openweathermap.org/data/2.5/weather?q=${input.location}&appid=${context.config?.apiKey}`
 * );
 * const data = await response.json();
 * ```
 */

import { z } from 'zod';
import { defineSharedTool } from '../core/defineSharedTool.js';

export const get_weather = defineSharedTool({
  name: 'get_weather',
  description:
    'Get current weather conditions for a given location. Returns temperature, humidity, and conditions.',

  inputSchema: z.object({
    location: z
      .string()
      .min(1)
      .describe('The city and state/country, e.g. "San Francisco, CA" or "London, UK"'),
    units: z
      .enum(['celsius', 'fahrenheit'])
      .optional()
      .default('celsius')
      .describe('Temperature unit (default: celsius)'),
  }),

  outputSchema: z.object({
    location: z.string(),
    temperature: z.number(),
    units: z.enum(['celsius', 'fahrenheit']),
    condition: z.string().describe('Weather condition, e.g. "Sunny", "Cloudy", "Rainy"'),
    humidity: z.number().min(0).max(100).describe('Relative humidity percentage'),
    feelsLike: z.number().describe('Feels-like temperature in the requested unit'),
  }),

  execute: async (input) => {
    // Mock implementation — replace with real weather API call
    const temp = input.units === 'fahrenheit' ? 72 : 22;
    const feelsLike = input.units === 'fahrenheit' ? 70 : 21;

    return {
      success: true,
      data: {
        location: input.location,
        temperature: temp,
        units: input.units,
        condition: 'Partly Cloudy',
        humidity: 58,
        feelsLike,
      },
    };
  },

  metadata: {
    category: 'weather',
    tags: ['weather', 'location', 'example'],
    version: '1.0.0',
  },
});
