/**
 * WeatherCard — Custom tool result renderer for the `get_weather` tool.
 *
 * Registers itself with `toolResultRegistry` so `ToolInvocationPart`
 * automatically displays it instead of the default JSON preview whenever
 * the `get_weather` tool completes.
 *
 * ## Registration
 *
 * Import this file once in your app entry point (e.g. `main.tsx`) to
 * register the card:
 *
 * ```typescript
 * import '../packages/ui/src/tool-results/weather-card';
 * // or from the ui package:
 * import '@@PROJECT_NAME-ui/tool-results/weather-card';
 * ```
 *
 * The side effect of the import calls `toolResultRegistry.register()`,
 * so no further setup is required.
 *
 * ## Data shape
 *
 * The card handles two output shapes — both the bare output and the
 * `{ success, data }` wrapper produced by `defineSharedTool`:
 *
 * ```json
 * // Direct
 * { "location": "London", "temperature": 22, "unit": "celsius", ... }
 *
 * // Wrapped (from defineSharedTool)
 * { "success": true, "data": { "location": "London", ... } }
 * ```
 */

import { Droplets, Wind, Cloud } from 'lucide-react';
import {
  toolResultRegistry,
  type ToolResultRendererProps,
} from '../components/tool-result-registry.js';

// ─── Types ────────────────────────────────────────────────────────────────────

interface WeatherData {
  location: string;
  temperature: number;
  unit: 'celsius' | 'fahrenheit';
  condition: string;
  humidity: number;
  windSpeed: number;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function parseWeatherOutput(output: unknown): WeatherData | null {
  if (!output || typeof output !== 'object') return null;

  const raw = output as Record<string, unknown>;

  // Unwrap { success, data } envelope from defineSharedTool
  const data =
    'data' in raw && raw.data && typeof raw.data === 'object'
      ? (raw.data as Record<string, unknown>)
      : raw;

  const location = typeof data.location === 'string' ? data.location : null;
  const temperature = typeof data.temperature === 'number' ? data.temperature : null;
  const unit = data.unit === 'celsius' || data.unit === 'fahrenheit' ? data.unit : 'celsius';
  const condition = typeof data.condition === 'string' ? data.condition : 'Unknown';
  const humidity = typeof data.humidity === 'number' ? data.humidity : null;
  const windSpeed = typeof data.windSpeed === 'number' ? data.windSpeed : null;

  if (location === null || temperature === null) return null;

  return {
    location,
    temperature,
    unit,
    condition,
    humidity: humidity ?? 0,
    windSpeed: windSpeed ?? 0,
  };
}

function unitSymbol(unit: 'celsius' | 'fahrenheit'): string {
  return unit === 'celsius' ? '°C' : '°F';
}

// ─── Component ────────────────────────────────────────────────────────────────

function WeatherCard({ output, state }: ToolResultRendererProps) {
  if (state !== 'output-available') return null;

  const weather = parseWeatherOutput(output);

  if (!weather) {
    return (
      <p style={{ fontSize: 12, color: 'var(--text-muted)' }}>Unable to parse weather data.</p>
    );
  }

  return (
    <div
      style={{
        borderRadius: 8,
        border: '1px solid var(--border)',
        overflow: 'hidden',
        fontSize: 13,
        backgroundColor: 'var(--surface)',
      }}
    >
      {/* Header: location + condition */}
      <div
        style={{
          padding: '10px 12px 8px',
          borderBottom: '1px solid var(--border)',
          display: 'flex',
          alignItems: 'flex-start',
          justifyContent: 'space-between',
          gap: 8,
        }}
      >
        <div>
          <p
            style={{
              fontWeight: 600,
              fontSize: 14,
              color: 'var(--foreground)',
              margin: 0,
            }}
          >
            {weather.location}
          </p>
          <p
            style={{
              fontSize: 11,
              color: 'var(--text-muted)',
              margin: '2px 0 0',
              display: 'flex',
              alignItems: 'center',
              gap: 4,
            }}
          >
            <Cloud size={11} />
            {weather.condition}
          </p>
        </div>

        {/* Temperature display */}
        <p
          style={{
            fontSize: 28,
            fontWeight: 700,
            color: 'var(--primary)',
            lineHeight: 1,
            margin: 0,
            flexShrink: 0,
          }}
        >
          {weather.temperature}
          <span style={{ fontSize: 16, fontWeight: 400 }}>{unitSymbol(weather.unit)}</span>
        </p>
      </div>

      {/* Stats row: humidity + wind speed */}
      <div
        style={{
          display: 'flex',
          gap: 0,
          padding: '6px 12px',
        }}
      >
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 5,
            color: 'var(--text-muted)',
            fontSize: 11,
            flex: 1,
          }}
        >
          <Droplets size={13} style={{ color: 'var(--primary)', opacity: 0.8 }} />
          <span>
            Humidity <strong style={{ color: 'var(--foreground)' }}>{weather.humidity}%</strong>
          </span>
        </div>

        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 5,
            color: 'var(--text-muted)',
            fontSize: 11,
            flex: 1,
          }}
        >
          <Wind size={13} style={{ color: 'var(--primary)', opacity: 0.8 }} />
          <span>
            Wind <strong style={{ color: 'var(--foreground)' }}>{weather.windSpeed} km/h</strong>
          </span>
        </div>
      </div>
    </div>
  );
}

// ─── Registration (side effect) ───────────────────────────────────────────────

/**
 * Register the WeatherCard renderer for the `get_weather` tool.
 * This runs once when the module is first imported.
 */
toolResultRegistry.register('get_weather', WeatherCard);

export { WeatherCard };
