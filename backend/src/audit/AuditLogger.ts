import { AuditLogModel, AuditEventType } from '../models/AuditLog.js';
import { getCurrentRequestId } from '../middleware/requestId.js';

export interface AuditLogOptions {
  eventType: AuditEventType;
  actorId?: string | null;
  documentId?: string | null;
  jobId?: string | null;
  summaryId?: string | null;
  requestId?: string | null;
  payload?: Record<string, unknown>;
}

export class AuditLogger {
  /**
   * Redacts sensitive PHI keys from structured payloads to prevent raw clinical text from leaking into audit logs.
   */
  private static sanitizePayload(payload?: Record<string, unknown>): Record<string, unknown> {
    if (!payload) return {};
    const sanitized: Record<string, unknown> = {};

    const sensitiveKeys = ['rawtext', 'summarytext', 'patientname', 'dob', 'ssn', 'mrn', 'address', 'phone'];

    for (const [key, value] of Object.entries(payload)) {
      const lowerKey = key.toLowerCase();
      if (sensitiveKeys.includes(lowerKey)) {
        sanitized[key] = '[REDACTED_PHI]';
      } else if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
        sanitized[key] = this.sanitizePayload(value as Record<string, unknown>);
      } else {
        sanitized[key] = value;
      }
    }

    return sanitized;
  }

  /**
   * Logs a structured audit trail event to MongoDB.
   */
  public static async log(opts: AuditLogOptions): Promise<void> {
    try {
      const effectiveRequestId = opts.requestId || getCurrentRequestId() || null;
      const sanitizedPayload = this.sanitizePayload(opts.payload);

      await AuditLogModel.create({
        eventType: opts.eventType,
        actorId: opts.actorId ?? null,
        documentId: opts.documentId ?? null,
        jobId: opts.jobId ?? null,
        summaryId: opts.summaryId ?? null,
        requestId: effectiveRequestId,
        payload: sanitizedPayload,
      });
    } catch (err) {
      // Audit log failures must be non-fatal to the main request flow
      console.error('[AuditLogger] Failed to persist audit log entry:', err);
    }
  }
}

/**
 * Backward compatibility alias for logEvent
 */
export const logEvent = AuditLogger.log.bind(AuditLogger);
