/**
 * Example tools demonstrating the define-once-deploy-everywhere pattern.
 *
 * Each tool is defined once with Zod schemas and an execute function,
 * then used unchanged across MCP, LangGraph, and Express adapters.
 */

export { getWeatherTool } from './get-weather.js';
export { searchWebTool } from './search-web.js';
