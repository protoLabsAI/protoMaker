/**
 * Express Adapter
 *
 * Adapts unified tools for use with Express HTTP routes
 * Maps tool functions to Express request handlers
 */

import type { Request, Response } from 'express';
import type { ToolContext, ToolResult } from '../types.js';
import { listFeatures } from '../domains/features/list-features.js';
import { getFeature } from '../domains/features/get-feature.js';
import { createFeature } from '../domains/features/create-feature.js';
import { updateFeature } from '../domains/features/update-feature.js';
import { deleteFeature } from '../domains/features/delete-feature.js';

/**
 * Express request handler type
 */
export type ExpressHandler = (req: Request, res: Response) => Promise<void>;

/**
 * Convert tool result to HTTP response
 */
function sendToolResult(res: Response, result: ToolResult): void {
  if (result.success) {
    res.json({ success: true, ...(result.data || {}), metadata: result.metadata });
  } else {
    // Map error codes to HTTP status codes
    let statusCode = 500;
    switch (result.errorCode) {
      case 'MISSING_PROJECT_PATH':
      case 'MISSING_REQUIRED_FIELDS':
        statusCode = 400;
        break;
      case 'FEATURE_NOT_FOUND':
        statusCode = 404;
        break;
      case 'DUPLICATE_TITLE':
        statusCode = 409;
        break;
      default:
        statusCode = 500;
    }

    res.status(statusCode).json({
      success: false,
      error: result.error,
      errorCode: result.errorCode,
      metadata: result.metadata,
    });
  }
}

/**
 * Express adapter for feature tools
 */
export class ExpressFeatureAdapter {
  private context: ToolContext;

  constructor(context: ToolContext) {
    this.context = context;
  }

  /**
   * List features handler
   */
  listFeaturesHandler(): ExpressHandler {
    return async (req: Request, res: Response): Promise<void> => {
      const result = await listFeatures(this.context, {
        projectPath: req.body.projectPath,
        status: req.body.status,
        compact: req.body.compact,
      });
      sendToolResult(res, result);
    };
  }

  /**
   * Get feature handler
   */
  getFeatureHandler(): ExpressHandler {
    return async (req: Request, res: Response): Promise<void> => {
      const result = await getFeature(this.context, {
        projectPath: req.body.projectPath,
        featureId: req.body.featureId,
      });
      sendToolResult(res, result);
    };
  }

  /**
   * Create feature handler
   */
  createFeatureHandler(): ExpressHandler {
    return async (req: Request, res: Response): Promise<void> => {
      const result = await createFeature(this.context, {
        projectPath: req.body.projectPath,
        feature: req.body.feature,
      });
      sendToolResult(res, result);
    };
  }

  /**
   * Update feature handler
   */
  updateFeatureHandler(): ExpressHandler {
    return async (req: Request, res: Response): Promise<void> => {
      const result = await updateFeature(this.context, {
        projectPath: req.body.projectPath,
        featureId: req.body.featureId,
        updates: req.body.updates,
      });
      sendToolResult(res, result);
    };
  }

  /**
   * Delete feature handler
   */
  deleteFeatureHandler(): ExpressHandler {
    return async (req: Request, res: Response): Promise<void> => {
      const result = await deleteFeature(this.context, {
        projectPath: req.body.projectPath,
        featureId: req.body.featureId,
      });
      sendToolResult(res, result);
    };
  }
}
