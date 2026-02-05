"use strict";
/**
 * Event emitter for streaming events to WebSocket clients
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.createEventEmitter = createEventEmitter;
var utils_1 = require("@automaker/utils");
var logger = (0, utils_1.createLogger)('Events');
function createEventEmitter() {
    var subscribers = new Set();
    return {
        emit: function (type, payload) {
            for (var _i = 0, subscribers_1 = subscribers; _i < subscribers_1.length; _i++) {
                var callback = subscribers_1[_i];
                try {
                    callback(type, payload);
                }
                catch (error) {
                    logger.error('Error in event subscriber:', error);
                }
            }
        },
        subscribe: function (callback) {
            subscribers.add(callback);
            return function () {
                subscribers.delete(callback);
            };
        },
    };
}
