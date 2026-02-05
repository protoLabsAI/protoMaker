"use strict";
/**
 * Scheduler Service - Executes scheduled tasks based on cron expressions
 *
 * Provides a cron-based task scheduling system that:
 * - Parses and validates cron expressions
 * - Executes tasks on schedule
 * - Tracks last/next run times
 * - Integrates with health monitoring and auto-mode
 *
 * Cron expression format: "minute hour dayOfMonth month dayOfWeek"
 * - minute: 0-59
 * - hour: 0-23
 * - dayOfMonth: 1-31
 * - month: 1-12 (or names: jan, feb, etc.)
 * - dayOfWeek: 0-7 (0 and 7 are Sunday, or names: sun, mon, etc.)
 *
 * Special characters:
 * - *: any value
 * - ,: list separator (1,3,5)
 * - -: range (1-5)
 * - /: step values (*\/15 = every 15)
 */
var __assign = (this && this.__assign) || function () {
    __assign = Object.assign || function(t) {
        for (var s, i = 1, n = arguments.length; i < n; i++) {
            s = arguments[i];
            for (var p in s) if (Object.prototype.hasOwnProperty.call(s, p))
                t[p] = s[p];
        }
        return t;
    };
    return __assign.apply(this, arguments);
};
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __generator = (this && this.__generator) || function (thisArg, body) {
    var _ = { label: 0, sent: function() { if (t[0] & 1) throw t[1]; return t[1]; }, trys: [], ops: [] }, f, y, t, g = Object.create((typeof Iterator === "function" ? Iterator : Object).prototype);
    return g.next = verb(0), g["throw"] = verb(1), g["return"] = verb(2), typeof Symbol === "function" && (g[Symbol.iterator] = function() { return this; }), g;
    function verb(n) { return function (v) { return step([n, v]); }; }
    function step(op) {
        if (f) throw new TypeError("Generator is already executing.");
        while (g && (g = 0, op[0] && (_ = 0)), _) try {
            if (f = 1, y && (t = op[0] & 2 ? y["return"] : op[0] ? y["throw"] || ((t = y["return"]) && t.call(y), 0) : y.next) && !(t = t.call(y, op[1])).done) return t;
            if (y = 0, t) op = [op[0] & 2, t.value];
            switch (op[0]) {
                case 0: case 1: t = op; break;
                case 4: _.label++; return { value: op[1], done: false };
                case 5: _.label++; y = op[1]; op = [0]; continue;
                case 7: op = _.ops.pop(); _.trys.pop(); continue;
                default:
                    if (!(t = _.trys, t = t.length > 0 && t[t.length - 1]) && (op[0] === 6 || op[0] === 2)) { _ = 0; continue; }
                    if (op[0] === 3 && (!t || (op[1] > t[0] && op[1] < t[3]))) { _.label = op[1]; break; }
                    if (op[0] === 6 && _.label < t[1]) { _.label = t[1]; t = op; break; }
                    if (t && _.label < t[2]) { _.label = t[2]; _.ops.push(op); break; }
                    if (t[2]) _.ops.pop();
                    _.trys.pop(); continue;
            }
            op = body.call(thisArg, _);
        } catch (e) { op = [6, e]; y = 0; } finally { f = t = 0; }
        if (op[0] & 5) throw op[1]; return { value: op[0] ? op[1] : void 0, done: true };
    }
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.SchedulerService = void 0;
exports.parseCronExpression = parseCronExpression;
exports.validateCronExpression = validateCronExpression;
exports.getNextRunTime = getNextRunTime;
exports.getSchedulerService = getSchedulerService;
var utils_1 = require("@automaker/utils");
var platform_1 = require("@automaker/platform");
var logger = (0, utils_1.createLogger)('Scheduler');
/**
 * Day of week name mappings
 */
var DAY_NAMES = {
    sun: 0,
    mon: 1,
    tue: 2,
    wed: 3,
    thu: 4,
    fri: 5,
    sat: 6,
    sunday: 0,
    monday: 1,
    tuesday: 2,
    wednesday: 3,
    thursday: 4,
    friday: 5,
    saturday: 6,
};
/**
 * Month name mappings
 */
var MONTH_NAMES = {
    jan: 1,
    feb: 2,
    mar: 3,
    apr: 4,
    may: 5,
    jun: 6,
    jul: 7,
    aug: 8,
    sep: 9,
    oct: 10,
    nov: 11,
    dec: 12,
    january: 1,
    february: 2,
    march: 3,
    april: 4,
    june: 6,
    july: 7,
    august: 8,
    september: 9,
    october: 10,
    november: 11,
    december: 12,
};
/**
 * Parse a single cron field into allowed values
 */
function parseCronField(field, min, max, names) {
    var values = new Set();
    // Handle names (e.g., "mon" -> 1)
    var normalizedField = field.toLowerCase();
    if (names) {
        for (var _i = 0, _a = Object.entries(names); _i < _a.length; _i++) {
            var _b = _a[_i], name_1 = _b[0], value = _b[1];
            normalizedField = normalizedField.replace(new RegExp("\\b".concat(name_1, "\\b"), 'gi'), String(value));
        }
    }
    // Split by comma for lists
    var parts = normalizedField.split(',');
    for (var _c = 0, parts_1 = parts; _c < parts_1.length; _c++) {
        var part = parts_1[_c];
        // Handle step values (*/15 or 1-30/5)
        var _d = part.split('/'), range = _d[0], stepStr = _d[1];
        var step = stepStr ? parseInt(stepStr, 10) : 1;
        if (isNaN(step) || step < 1) {
            throw new Error("Invalid step value: ".concat(stepStr));
        }
        if (range === '*') {
            // All values with step
            for (var i = min; i <= max; i += step) {
                values.add(i);
            }
        }
        else if (range.includes('-')) {
            // Range (e.g., 1-5)
            var _e = range.split('-'), startStr = _e[0], endStr = _e[1];
            var start = parseInt(startStr, 10);
            var end = parseInt(endStr, 10);
            if (isNaN(start) || isNaN(end) || start < min || end > max || start > end) {
                throw new Error("Invalid range: ".concat(range));
            }
            for (var i = start; i <= end; i += step) {
                values.add(i);
            }
        }
        else {
            // Single value
            var value = parseInt(range, 10);
            if (isNaN(value) || value < min || value > max) {
                throw new Error("Invalid value: ".concat(range, " (must be between ").concat(min, " and ").concat(max, ")"));
            }
            values.add(value);
        }
    }
    return { values: Array.from(values).sort(function (a, b) { return a - b; }) };
}
/**
 * Parse a cron expression into its component fields
 */
function parseCronExpression(expression) {
    var parts = expression.trim().split(/\s+/);
    if (parts.length !== 5) {
        throw new Error("Invalid cron expression: expected 5 fields, got ".concat(parts.length));
    }
    var minute = parts[0], hour = parts[1], dayOfMonth = parts[2], month = parts[3], dayOfWeek = parts[4];
    return {
        minute: parseCronField(minute, 0, 59),
        hour: parseCronField(hour, 0, 23),
        dayOfMonth: parseCronField(dayOfMonth, 1, 31),
        month: parseCronField(month, 1, 12, MONTH_NAMES),
        dayOfWeek: parseCronField(dayOfWeek, 0, 7, DAY_NAMES),
    };
}
/**
 * Validate a cron expression
 */
function validateCronExpression(expression) {
    try {
        parseCronExpression(expression);
        return { valid: true };
    }
    catch (error) {
        return { valid: false, error: error.message };
    }
}
/**
 * Check if a date matches a parsed cron expression
 */
function matchesCron(date, cron) {
    var minute = date.getMinutes();
    var hour = date.getHours();
    var dayOfMonth = date.getDate();
    var month = date.getMonth() + 1; // JavaScript months are 0-indexed
    var dayOfWeek = date.getDay();
    // Normalize day of week (7 -> 0 for Sunday)
    if (dayOfWeek === 7)
        dayOfWeek = 0;
    // Check if cron dayOfWeek includes 7 (alternative Sunday)
    var normalizedDayOfWeek = cron.dayOfWeek.values.map(function (d) { return (d === 7 ? 0 : d); });
    return (cron.minute.values.includes(minute) &&
        cron.hour.values.includes(hour) &&
        cron.dayOfMonth.values.includes(dayOfMonth) &&
        cron.month.values.includes(month) &&
        normalizedDayOfWeek.includes(dayOfWeek));
}
/**
 * Calculate the next run time for a cron expression
 */
function getNextRunTime(cronExpression, after) {
    if (after === void 0) { after = new Date(); }
    var cron = parseCronExpression(cronExpression);
    // Start from the next minute
    var next = new Date(after);
    next.setSeconds(0);
    next.setMilliseconds(0);
    next.setMinutes(next.getMinutes() + 1);
    // Search for the next matching time (max 2 years ahead to prevent infinite loop)
    var maxIterations = 2 * 365 * 24 * 60; // 2 years in minutes
    var iterations = 0;
    while (iterations < maxIterations) {
        if (matchesCron(next, cron)) {
            return next;
        }
        next.setMinutes(next.getMinutes() + 1);
        iterations++;
    }
    throw new Error('Could not find next run time within 2 years');
}
/**
 * Scheduler Service
 *
 * Manages scheduled tasks with cron-based timing, tracking execution history,
 * and integrating with the event system for monitoring.
 */
var SchedulerService = /** @class */ (function () {
    function SchedulerService() {
        this.tasks = new Map();
        this.parsedCrons = new Map();
        this.intervalId = null;
        this.running = false;
        this.events = null;
        this.dataDir = null;
        /** Check interval in milliseconds (default: 60 seconds) */
        this.checkInterval = 60000;
    }
    /**
     * Initialize the scheduler with an event emitter and data directory
     */
    SchedulerService.prototype.initialize = function (events, dataDir) {
        this.events = events;
        this.dataDir = dataDir;
        logger.info('Scheduler service initialized');
        // Load persisted tasks on initialization
        void this.loadTasks();
    };
    /**
     * Load task metadata from disk
     */
    SchedulerService.prototype.loadTasks = function () {
        return __awaiter(this, void 0, void 0, function () {
            var tasksPath, fs, _a, content, persistedTasks, _i, persistedTasks_1, persisted, task, error_1;
            return __generator(this, function (_b) {
                switch (_b.label) {
                    case 0:
                        if (!this.dataDir) {
                            logger.warn('Cannot load tasks: dataDir not initialized');
                            return [2 /*return*/];
                        }
                        _b.label = 1;
                    case 1:
                        _b.trys.push([1, 8, , 9]);
                        tasksPath = (0, platform_1.getScheduledTasksPath)(this.dataDir);
                        return [4 /*yield*/, Promise.resolve().then(function () { return require('fs/promises'); })];
                    case 2:
                        fs = _b.sent();
                        _b.label = 3;
                    case 3:
                        _b.trys.push([3, 5, , 6]);
                        return [4 /*yield*/, fs.access(tasksPath)];
                    case 4:
                        _b.sent();
                        return [3 /*break*/, 6];
                    case 5:
                        _a = _b.sent();
                        // File doesn't exist yet, this is normal on first run
                        logger.debug('No persisted tasks file found, starting fresh');
                        return [2 /*return*/];
                    case 6: return [4 /*yield*/, fs.readFile(tasksPath, 'utf-8')];
                    case 7:
                        content = _b.sent();
                        persistedTasks = JSON.parse(content);
                        // Update task metadata for registered tasks
                        for (_i = 0, persistedTasks_1 = persistedTasks; _i < persistedTasks_1.length; _i++) {
                            persisted = persistedTasks_1[_i];
                            task = this.tasks.get(persisted.id);
                            if (task) {
                                task.lastRun = persisted.lastRun;
                                task.nextRun = persisted.nextRun;
                                task.lastError = persisted.lastError;
                                task.failureCount = persisted.failureCount;
                                task.executionCount = persisted.executionCount;
                                task.enabled = persisted.enabled;
                            }
                        }
                        logger.info("Loaded metadata for ".concat(persistedTasks.length, " tasks from disk"));
                        return [3 /*break*/, 9];
                    case 8:
                        error_1 = _b.sent();
                        logger.error('Error loading tasks from disk:', error_1);
                        return [3 /*break*/, 9];
                    case 9: return [2 /*return*/];
                }
            });
        });
    };
    /**
     * Save task metadata to disk
     */
    SchedulerService.prototype.saveTasks = function () {
        return __awaiter(this, void 0, void 0, function () {
            var tasksPath, persistableTasks, error_2;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        if (!this.dataDir) {
                            logger.warn('Cannot save tasks: dataDir not initialized');
                            return [2 /*return*/];
                        }
                        _a.label = 1;
                    case 1:
                        _a.trys.push([1, 4, , 5]);
                        return [4 /*yield*/, (0, platform_1.ensureDataDir)(this.dataDir)];
                    case 2:
                        _a.sent();
                        tasksPath = (0, platform_1.getScheduledTasksPath)(this.dataDir);
                        persistableTasks = Array.from(this.tasks.values()).map(function (task) { return ({
                            id: task.id,
                            name: task.name,
                            cronExpression: task.cronExpression,
                            enabled: task.enabled,
                            lastRun: task.lastRun,
                            nextRun: task.nextRun,
                            lastError: task.lastError,
                            failureCount: task.failureCount,
                            executionCount: task.executionCount,
                        }); });
                        return [4 /*yield*/, (0, utils_1.atomicWriteJson)(tasksPath, persistableTasks, { backupCount: utils_1.DEFAULT_BACKUP_COUNT })];
                    case 3:
                        _a.sent();
                        logger.debug("Saved ".concat(persistableTasks.length, " tasks to disk"));
                        return [3 /*break*/, 5];
                    case 4:
                        error_2 = _a.sent();
                        logger.error('Error saving tasks to disk:', error_2);
                        return [3 /*break*/, 5];
                    case 5: return [2 /*return*/];
                }
            });
        });
    };
    /**
     * Register a new scheduled task
     */
    SchedulerService.prototype.registerTask = function (id, name, cronExpression, handler, enabled) {
        if (enabled === void 0) { enabled = true; }
        // Validate cron expression
        var validation = validateCronExpression(cronExpression);
        if (!validation.valid) {
            throw new Error("Invalid cron expression for task \"".concat(name, "\": ").concat(validation.error));
        }
        // Parse and store cron
        var parsed = parseCronExpression(cronExpression);
        this.parsedCrons.set(id, parsed);
        // Calculate next run time
        var nextRun = enabled ? getNextRunTime(cronExpression).toISOString() : undefined;
        // Create task
        var task = {
            id: id,
            name: name,
            cronExpression: cronExpression,
            handler: handler,
            enabled: enabled,
            nextRun: nextRun,
            failureCount: 0,
            executionCount: 0,
        };
        this.tasks.set(id, task);
        logger.info("Registered task \"".concat(name, "\" (").concat(id, ") with schedule: ").concat(cronExpression));
        // Emit event
        this.emitEvent('scheduler:task_registered', { taskId: id, name: name, cronExpression: cronExpression, enabled: enabled });
    };
    /**
     * Unregister a task
     */
    SchedulerService.prototype.unregisterTask = function (id) {
        var task = this.tasks.get(id);
        if (!task) {
            return false;
        }
        this.tasks.delete(id);
        this.parsedCrons.delete(id);
        logger.info("Unregistered task \"".concat(task.name, "\" (").concat(id, ")"));
        this.emitEvent('scheduler:task_unregistered', { taskId: id, name: task.name });
        return true;
    };
    /**
     * Enable a task
     */
    SchedulerService.prototype.enableTask = function (id) {
        return __awaiter(this, void 0, void 0, function () {
            var task;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        task = this.tasks.get(id);
                        if (!task) {
                            return [2 /*return*/, false];
                        }
                        task.enabled = true;
                        task.nextRun = getNextRunTime(task.cronExpression).toISOString();
                        logger.info("Enabled task \"".concat(task.name, "\" (").concat(id, ")"));
                        this.emitEvent('scheduler:task_enabled', { taskId: id, name: task.name, nextRun: task.nextRun });
                        // Save updated task metadata to disk
                        return [4 /*yield*/, this.saveTasks()];
                    case 1:
                        // Save updated task metadata to disk
                        _a.sent();
                        return [2 /*return*/, true];
                }
            });
        });
    };
    /**
     * Disable a task
     */
    SchedulerService.prototype.disableTask = function (id) {
        return __awaiter(this, void 0, void 0, function () {
            var task;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        task = this.tasks.get(id);
                        if (!task) {
                            return [2 /*return*/, false];
                        }
                        task.enabled = false;
                        task.nextRun = undefined;
                        logger.info("Disabled task \"".concat(task.name, "\" (").concat(id, ")"));
                        this.emitEvent('scheduler:task_disabled', { taskId: id, name: task.name });
                        // Save updated task metadata to disk
                        return [4 /*yield*/, this.saveTasks()];
                    case 1:
                        // Save updated task metadata to disk
                        _a.sent();
                        return [2 /*return*/, true];
                }
            });
        });
    };
    /**
     * Get a task by ID
     */
    SchedulerService.prototype.getTask = function (id) {
        return this.tasks.get(id);
    };
    /**
     * Get all tasks
     */
    SchedulerService.prototype.getAllTasks = function () {
        return Array.from(this.tasks.values());
    };
    /**
     * Get scheduler status for health monitoring
     */
    SchedulerService.prototype.getStatus = function () {
        var tasks = Array.from(this.tasks.values());
        return {
            running: this.running,
            taskCount: tasks.length,
            enabledTaskCount: tasks.filter(function (t) { return t.enabled; }).length,
            tasks: tasks.map(function (t) { return ({
                id: t.id,
                name: t.name,
                enabled: t.enabled,
                lastRun: t.lastRun,
                nextRun: t.nextRun,
                failureCount: t.failureCount,
                executionCount: t.executionCount,
            }); }),
        };
    };
    /**
     * Start the scheduler
     */
    SchedulerService.prototype.start = function () {
        var _this = this;
        if (this.running) {
            logger.warn('Scheduler is already running');
            return;
        }
        this.running = true;
        // Run immediately for any tasks that should have run
        void this.tick();
        // Set up interval for checking tasks
        this.intervalId = setInterval(function () {
            void _this.tick();
        }, this.checkInterval);
        logger.info("Scheduler started (check interval: ".concat(this.checkInterval, "ms)"));
        this.emitEvent('scheduler:started', { taskCount: this.tasks.size });
    };
    /**
     * Stop the scheduler
     */
    SchedulerService.prototype.stop = function () {
        if (!this.running) {
            logger.warn('Scheduler is not running');
            return;
        }
        if (this.intervalId) {
            clearInterval(this.intervalId);
            this.intervalId = null;
        }
        this.running = false;
        logger.info('Scheduler stopped');
        this.emitEvent('scheduler:stopped', {});
    };
    /**
     * Check and execute due tasks
     */
    SchedulerService.prototype.tick = function () {
        return __awaiter(this, void 0, void 0, function () {
            var now, _i, _a, _b, id, task, cron, lastRunDate;
            return __generator(this, function (_c) {
                switch (_c.label) {
                    case 0:
                        now = new Date();
                        _i = 0, _a = this.tasks;
                        _c.label = 1;
                    case 1:
                        if (!(_i < _a.length)) return [3 /*break*/, 4];
                        _b = _a[_i], id = _b[0], task = _b[1];
                        if (!task.enabled)
                            return [3 /*break*/, 3];
                        cron = this.parsedCrons.get(id);
                        if (!cron)
                            return [3 /*break*/, 3];
                        if (!matchesCron(now, cron)) return [3 /*break*/, 3];
                        // Prevent double execution in the same minute
                        if (task.lastRun) {
                            lastRunDate = new Date(task.lastRun);
                            if (lastRunDate.getFullYear() === now.getFullYear() &&
                                lastRunDate.getMonth() === now.getMonth() &&
                                lastRunDate.getDate() === now.getDate() &&
                                lastRunDate.getHours() === now.getHours() &&
                                lastRunDate.getMinutes() === now.getMinutes()) {
                                return [3 /*break*/, 3];
                            }
                        }
                        return [4 /*yield*/, this.executeTask(id)];
                    case 2:
                        _c.sent();
                        _c.label = 3;
                    case 3:
                        _i++;
                        return [3 /*break*/, 1];
                    case 4: return [2 /*return*/];
                }
            });
        });
    };
    /**
     * Execute a task immediately
     */
    SchedulerService.prototype.executeTask = function (id) {
        return __awaiter(this, void 0, void 0, function () {
            var task, startTime, executedAt, success, error, err_1, duration, result;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        task = this.tasks.get(id);
                        if (!task) {
                            throw new Error("Task not found: ".concat(id));
                        }
                        startTime = Date.now();
                        executedAt = new Date().toISOString();
                        logger.info("Executing task \"".concat(task.name, "\" (").concat(id, ")"));
                        this.emitEvent('scheduler:task_started', { taskId: id, name: task.name, executedAt: executedAt });
                        success = false;
                        _a.label = 1;
                    case 1:
                        _a.trys.push([1, 3, , 4]);
                        return [4 /*yield*/, task.handler()];
                    case 2:
                        _a.sent();
                        success = true;
                        task.failureCount = 0;
                        task.lastError = undefined;
                        logger.info("Task \"".concat(task.name, "\" completed successfully"));
                        return [3 /*break*/, 4];
                    case 3:
                        err_1 = _a.sent();
                        success = false;
                        error = err_1.message;
                        task.failureCount++;
                        task.lastError = error;
                        logger.error("Task \"".concat(task.name, "\" failed:"), err_1);
                        return [3 /*break*/, 4];
                    case 4:
                        duration = Date.now() - startTime;
                        task.lastRun = executedAt;
                        task.executionCount++;
                        task.nextRun = task.enabled ? getNextRunTime(task.cronExpression).toISOString() : undefined;
                        result = {
                            taskId: id,
                            success: success,
                            executedAt: executedAt,
                            duration: duration,
                            error: error,
                        };
                        this.emitEvent('scheduler:task_completed', __assign(__assign({}, result), { name: task.name, nextRun: task.nextRun }));
                        // Save updated task metadata to disk
                        return [4 /*yield*/, this.saveTasks()];
                    case 5:
                        // Save updated task metadata to disk
                        _a.sent();
                        return [2 /*return*/, result];
                }
            });
        });
    };
    /**
     * Manually trigger a task (for testing or immediate execution)
     */
    SchedulerService.prototype.triggerTask = function (id) {
        return __awaiter(this, void 0, void 0, function () {
            return __generator(this, function (_a) {
                return [2 /*return*/, this.executeTask(id)];
            });
        });
    };
    /**
     * Set the check interval (for testing purposes)
     */
    SchedulerService.prototype.setCheckInterval = function (ms) {
        this.checkInterval = ms;
        // Restart if running to apply new interval
        if (this.running) {
            this.stop();
            this.start();
        }
    };
    /**
     * Emit an event if emitter is available
     */
    SchedulerService.prototype.emitEvent = function (type, payload) {
        if (this.events) {
            // Cast type to EventType since scheduler events are valid event types
            this.events.emit(type, payload);
        }
    };
    /**
     * Cleanup resources
     */
    SchedulerService.prototype.destroy = function () {
        this.stop();
        this.tasks.clear();
        this.parsedCrons.clear();
        this.events = null;
        logger.info('Scheduler service destroyed');
    };
    return SchedulerService;
}());
exports.SchedulerService = SchedulerService;
// Singleton instance
var schedulerServiceInstance = null;
/**
 * Get the singleton scheduler service instance
 */
function getSchedulerService() {
    if (!schedulerServiceInstance) {
        schedulerServiceInstance = new SchedulerService();
    }
    return schedulerServiceInstance;
}
