/**
 * GET /logs endpoint - Read and return server log content
 *
 * The server can always access its own log file at DATA_DIR/server.log,
 * even when running inside Docker. The MCP tool calls this endpoint
 * instead of trying to read the file from disk (which fails when the
 * MCP tool runs on the host and the log file is inside a Docker volume).
 *
 * Query params:
 *   maxLines - Maximum lines to return (default: 200, -1 for unlimited)
 *   filter   - Case-insensitive text filter
 *   since    - ISO timestamp, only return lines after this time
 */

import type { Request, Response } from 'express';
import fs from 'fs';
import { getServerLogPath } from '../../../lib/server-log.js';

export function createLogsHandler() {
  return (req: Request, res: Response): void => {
    const logPath = getServerLogPath();

    if (!fs.existsSync(logPath)) {
      res.status(404).json({
        success: false,
        error: 'Server log file not found. File logging may not be enabled.',
        logPath,
      });
      return;
    }

    const maxLines = parseInt(req.query.maxLines as string) || 200;
    const filterText = req.query.filter as string | undefined;
    const sinceTimestamp = req.query.since as string | undefined;

    const content = fs.readFileSync(logPath, 'utf-8');
    let lines = content.split('\n').filter((l) => l.length > 0);

    // Filter by timestamp
    if (sinceTimestamp) {
      const sinceDate = new Date(sinceTimestamp);
      lines = lines.filter((line) => {
        const match = line.match(/^\[(\d{4}-\d{2}-\d{2}T[\d:.]+Z?)\]/);
        if (!match) return true;
        const lineDate = new Date(match[1]);
        return lineDate >= sinceDate;
      });
    }

    // Filter by text content
    if (filterText) {
      const lowerFilter = filterText.toLowerCase();
      lines = lines.filter((line) => line.toLowerCase().includes(lowerFilter));
    }

    const totalLines = lines.length;
    if (maxLines > 0 && lines.length > maxLines) {
      lines = lines.slice(-maxLines);
    }

    const stats = fs.statSync(logPath);

    res.json({
      success: true,
      logPath,
      fileSize: `${(stats.size / 1024).toFixed(1)} KB`,
      totalLines,
      returnedLines: lines.length,
      truncated: maxLines > 0 && totalLines > maxLines,
      content: lines.join('\n'),
    });
  };
}
