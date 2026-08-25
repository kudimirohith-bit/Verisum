"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.requestIdStore = void 0;
exports.requestIdMiddleware = requestIdMiddleware;
exports.getCurrentRequestId = getCurrentRequestId;
const node_async_hooks_1 = require("node:async_hooks");
const node_crypto_1 = __importDefault(require("node:crypto"));
// AsyncLocalStorage context to store requestId for the duration of an HTTP request
exports.requestIdStore = new node_async_hooks_1.AsyncLocalStorage();
/**
 * requestIdMiddleware
 * Assigns or propagates X-Request-ID header across HTTP requests and stores it in AsyncLocalStorage.
 */
function requestIdMiddleware(req, res, next) {
    const headerVal = req.headers['x-request-id'] || req.headers['x-correlation-id'];
    const requestId = Array.isArray(headerVal)
        ? headerVal[0]
        : headerVal || node_crypto_1.default.randomUUID();
    req.requestId = requestId;
    res.setHeader('X-Request-ID', requestId);
    exports.requestIdStore.run({ requestId }, () => {
        next();
    });
}
/**
 * getCurrentRequestId
 * Retrieves current requestId from AsyncLocalStorage context if available.
 */
function getCurrentRequestId() {
    const store = exports.requestIdStore.getStore();
    return store?.requestId;
}
