/**
 * Example tool: get_weather
 *
 * Demonstrates the define-once-deploy-everywhere pattern.
 * This single definition works as an MCP tool, LangGraph tool, or Express route.
 */

import { z } from 'zod';
import { defineSharedTool } from '../define-tool.js';

const GetWeatherInput = z.object({
  location: z.string().describe('City name or "City, Country" (e.g. "Paris" or "London, UK")'),
  units: z
    .enum(['celsius', 'fahrenheit'])
    .optional()
    .default('celsius')
    .describe('Temperature unit'),
});

const GetWeatherOutput = z.object({
  location: z.string(),
  temperature: z.number().describe('Current temperature in the requested unit'),
  unit: z.enum(['celsius', 'fahrenheit']),
  condition: z.string().describe('Weather condition description (e.g. "Partly cloudy")'),
  humidity: z.number().describe('Relative humidity percentage (0–100)'),
  windSpeed: z.number().describe('Wind speed in km/h'),
});

/**
 * get_weather — fetch current weather for a location.
 *
 * The context object may carry an `apiKey` property to authenticate against
 * a real weather API. In this example the tool returns mock data so it
 * works out of the box without any external credentials.
 */
export const getWeatherTool = defineSharedTool({
  name: 'get_weather',
  description:
    'Get the current weather conditions for a given location, including temperature, humidity, and wind speed.',
  inputSchema: GetWeatherInput,
  outputSchema: GetWeatherOutput,
  metadata: {
    category: 'utilities',
    tags: ['weather', 'external-api'],
    version: '1.0.0',
  },
  execute: async (input, context) => {
    // Replace this stub with a real weather API call, e.g. OpenWeatherMap:
    //
    //   const apiKey = context.apiKey as string;
    //   const url = `https://api.openweathermap.org/data/2.5/weather?q=${encodeURIComponent(input.location)}&appid=${apiKey}&units=metric`;
    //   const response = await fetch(url);
    //   const data = await response.json();
    //
    // Using context so TypeScript doesn't warn about an unused variable:
    void context;

    // Mock response — deterministic for demo/testing
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
});
