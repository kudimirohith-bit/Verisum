import { AuditLogModel } from '../models/AuditLog.js';
import type { AuditEventType } from '../models/AuditLog.js';

export interface LogEventOptions {
  eventType: AuditEventType;
  actorId?: string | null;
  documentId?: string | null;
  jobId?: string | null;
  payload?: Record<string, unknown>;
}

/**
 * logEvent — stub that writes an AuditLog entry.
 * Full audit pipeline (batching, integrity hashing) arrives in 0.9.
 * Safe to call without await — failures are non-fatal and logged to stderr.
 */
export async function logEvent(opts: LogEventOptions): Promise<void> {
  try {
    await AuditLogModel.create({
      eventType: opts.eventType,
      actorId: opts.actorId ?? null,
      documentId: opts.documentId ?? null,
      jobId: opts.jobId ?? null,
      payload: opts.payload ?? {},
    });
  } catch (err) {
    // Audit failures must never crash the main request path.
    console.error('[AuditLog] Failed to write event:', err);
  }
}
