"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.logEvent = logEvent;
const AuditLog_js_1 = require("../models/AuditLog.js");
/**
 * logEvent — stub that writes an AuditLog entry.
 * Full audit pipeline (batching, integrity hashing) arrives in 0.9.
 * Safe to call without await — failures are non-fatal and logged to stderr.
 */
async function logEvent(opts) {
    try {
        await AuditLog_js_1.AuditLogModel.create({
            eventType: opts.eventType,
            actorId: opts.actorId ?? null,
            documentId: opts.documentId ?? null,
            jobId: opts.jobId ?? null,
            payload: opts.payload ?? {},
        });
    }
    catch (err) {
        // Audit failures must never crash the main request path.
        console.error('[AuditLog] Failed to write event:', err);
    }
}
