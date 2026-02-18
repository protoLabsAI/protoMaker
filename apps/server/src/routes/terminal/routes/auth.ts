/**
 * POST /auth endpoint - Authenticate with password to get a session token
 */

import type { Request, Response } from 'express';
import {
  getTerminalEnabledConfigValue,
  getTerminalPasswordConfig,
  generateToken,
  addToken,
  getTokenExpiryMs,
} from '../common.js';

export function createAuthHandler() {
  return (req: Request, res: Response): void => {
    if (!getTerminalEnabledConfigValue()) {
      res.status(403).json({
        success: false,
        error: 'Terminal access is disabled',
      });
      return;
    }

    const terminalPassword = getTerminalPasswordConfig();

    // If no password required, return immediate success
    if (!terminalPassword) {
      res.json({
        success: true,
        data: {
          authenticated: true,
          passwordRequired: false,
        },
      });
      return;
    }

    const { password } = req.body;

    if (!password || password !== terminalPassword) {
      res.status(401).json({
        success: false,
        error: 'Invalid password',
      });
      return;
    }

    // Generate session token
    const token = generateToken();
    const now = new Date();
    addToken(token, {
      createdAt: now,
      expiresAt: new Date(now.getTime() + getTokenExpiryMs()),
    });

    res.json({
      success: true,
      data: {
        authenticated: true,
        token,
        expiresIn: getTokenExpiryMs(),
      },
    });
  };
}
