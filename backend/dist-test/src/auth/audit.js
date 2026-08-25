"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.logEvent = logEvent;
const AuditLogger_js_1 = require("../audit/AuditLogger.js");
/**
 * logEvent — delegates to centralized AuditLogger service.
 */
async function logEvent(opts) {
    return AuditLogger_js_1.AuditLogger.log(opts);
}
