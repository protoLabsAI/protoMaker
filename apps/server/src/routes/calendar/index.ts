/**
 * Calendar routes - HTTP API for calendar event management
 */

import { Router, type Request, type Response } from 'express';
import { validatePathParams } from '../../middleware/validate-paths.js';
import type { CalendarService, CalendarQueryOptions } from '../../services/calendar-service.js';
import type { JobAction } from '@protolabs-ai/types';
import type { JobExecutorService } from '../../services/job-executor-service.js';

/**
 * Create calendar routes
 */
export function createCalendarRoutes(
  calendarService: CalendarService,
  jobExecutorService: JobExecutorService
): Router {
  const router = Router();

  /**
   * POST /api/calendar/list
   * List calendar events with optional filtering
   * Body: { projectPath: string, startDate?: string, endDate?: string, types?: CalendarEventType[] }
   */
  router.post('/list', validatePathParams('projectPath'), async (req: Request, res: Response) => {
    try {
      const { projectPath, startDate, endDate, types } = req.body;

      if (!projectPath) {
        res.status(400).json({
          success: false,
          error: 'projectPath is required',
        });
        return;
      }

      const options: CalendarQueryOptions = {
        startDate,
        endDate,
        types,
      };

      const events = await calendarService.listEvents(projectPath, options);

      res.json({
        success: true,
        events,
      });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      res.status(500).json({
        success: false,
        error: errorMessage,
      });
    }
  });

  /**
   * POST /api/calendar/create
   * Create a new calendar event
   * Body: { projectPath: string, title: string, date: string, endDate?: string, type: CalendarEventType, description?: string, color?: string, url?: string }
   */
  router.post('/create', validatePathParams('projectPath'), async (req: Request, res: Response) => {
    try {
      const { projectPath, title, date, endDate, type, description, color, url, time, jobAction } =
        req.body;

      if (!projectPath) {
        res.status(400).json({ success: false, error: 'projectPath is required' });
        return;
      }
      if (!title) {
        res.status(400).json({ success: false, error: 'title is required' });
        return;
      }
      if (!date) {
        res.status(400).json({ success: false, error: 'date is required' });
        return;
      }
      if (!type) {
        res.status(400).json({ success: false, error: 'type is required' });
        return;
      }

      // Validate job-specific fields
      if (type === 'job') {
        if (!time) {
          res.status(400).json({ success: false, error: 'time is required for job events' });
          return;
        }
        if (!jobAction || !jobAction.type) {
          res.status(400).json({ success: false, error: 'jobAction is required for job events' });
          return;
        }
      }

      const event = await calendarService.createEvent(projectPath, {
        title,
        date,
        endDate,
        type,
        description,
        color,
        url,
        ...(type === 'job' && {
          time,
          jobAction: jobAction as JobAction,
          jobStatus: 'pending' as const,
        }),
      });

      res.json({ success: true, event });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      res.status(500).json({ success: false, error: errorMessage });
    }
  });

  /**
   * POST /api/calendar/run-job
   * Manually trigger a pending job immediately
   * Body: { projectPath: string, id: string }
   */
  router.post(
    '/run-job',
    validatePathParams('projectPath'),
    async (req: Request, res: Response) => {
      try {
        const { projectPath, id } = req.body;

        if (!projectPath) {
          res.status(400).json({ success: false, error: 'projectPath is required' });
          return;
        }
        if (!id) {
          res.status(400).json({ success: false, error: 'id is required' });
          return;
        }

        // Read the event
        const events = await calendarService.listEvents(projectPath);
        const job = events.find((e) => e.id === id);
        if (!job) {
          res.status(404).json({ success: false, error: `Event ${id} not found` });
          return;
        }
        if (job.type !== 'job') {
          res.status(400).json({ success: false, error: 'Event is not a job' });
          return;
        }
        if (job.jobStatus !== 'pending') {
          res
            .status(400)
            .json({ success: false, error: `Job is not pending (status: ${job.jobStatus})` });
          return;
        }

        // Execute async — respond immediately
        jobExecutorService.executeJob(projectPath, job).catch(() => {
          // Error handling is done inside executeJob (updates job status)
        });

        res.json({ success: true, message: 'Job execution started' });
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        res.status(500).json({ success: false, error: errorMessage });
      }
    }
  );

  /**
   * POST /api/calendar/update
   * Update an existing calendar event
   * Body: { projectPath: string, id: string, ...fields }
   */
  router.post('/update', validatePathParams('projectPath'), async (req: Request, res: Response) => {
    try {
      const { projectPath, id, ...updates } = req.body;

      if (!projectPath) {
        res.status(400).json({
          success: false,
          error: 'projectPath is required',
        });
        return;
      }

      if (!id) {
        res.status(400).json({
          success: false,
          error: 'id is required',
        });
        return;
      }

      // Remove projectPath and id from updates
      delete updates.projectPath;
      delete updates.id;

      const event = await calendarService.updateEvent(projectPath, id, updates);

      res.json({
        success: true,
        event,
      });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      res.status(500).json({
        success: false,
        error: errorMessage,
      });
    }
  });

  /**
   * POST /api/calendar/delete
   * Delete a calendar event
   * Body: { projectPath: string, id: string }
   */
  router.post('/delete', validatePathParams('projectPath'), async (req: Request, res: Response) => {
    try {
      const { projectPath, id } = req.body;

      if (!projectPath) {
        res.status(400).json({
          success: false,
          error: 'projectPath is required',
        });
        return;
      }

      if (!id) {
        res.status(400).json({
          success: false,
          error: 'id is required',
        });
        return;
      }

      await calendarService.deleteEvent(projectPath, id);

      res.json({
        success: true,
      });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      res.status(500).json({
        success: false,
        error: errorMessage,
      });
    }
  });

  return router;
}
