import { AuditLogger, AuditLogOptions } from '../audit/AuditLogger.js';

export type LogEventOptions = AuditLogOptions;

/**
 * logEvent — delegates to centralized AuditLogger service.
 */
export async function logEvent(opts: AuditLogOptions): Promise<void> {
  return AuditLogger.log(opts);
}
