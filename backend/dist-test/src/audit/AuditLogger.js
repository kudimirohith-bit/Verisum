"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.logEvent = exports.AuditLogger = void 0;
const AuditLog_js_1 = require("../models/AuditLog.js");
const requestId_js_1 = require("../middleware/requestId.js");
class AuditLogger {
    /**
     * Redacts sensitive PHI keys from structured payloads to prevent raw clinical text from leaking into audit logs.
     */
    static sanitizePayload(payload) {
        if (!payload)
            return {};
        const sanitized = {};
        const sensitiveKeys = ['rawtext', 'summarytext', 'patientname', 'dob', 'ssn', 'mrn', 'address', 'phone'];
        for (const [key, value] of Object.entries(payload)) {
            const lowerKey = key.toLowerCase();
            if (sensitiveKeys.includes(lowerKey)) {
                sanitized[key] = '[REDACTED_PHI]';
            }
            else if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
                sanitized[key] = this.sanitizePayload(value);
            }
            else {
                sanitized[key] = value;
            }
        }
        return sanitized;
    }
    /**
     * Logs a structured audit trail event to MongoDB.
     */
    static async log(opts) {
        try {
            const effectiveRequestId = opts.requestId || (0, requestId_js_1.getCurrentRequestId)() || null;
            const sanitizedPayload = this.sanitizePayload(opts.payload);
            await AuditLog_js_1.AuditLogModel.create({
                eventType: opts.eventType,
                actorId: opts.actorId ?? null,
                documentId: opts.documentId ?? null,
                jobId: opts.jobId ?? null,
                summaryId: opts.summaryId ?? null,
                requestId: effectiveRequestId,
                payload: sanitizedPayload,
            });
        }
        catch (err) {
            // Audit log failures must be non-fatal to the main request flow
            console.error('[AuditLogger] Failed to persist audit log entry:', err);
        }
    }
}
exports.AuditLogger = AuditLogger;
/**
 * Backward compatibility alias for logEvent
 */
exports.logEvent = AuditLogger.log.bind(AuditLogger);
