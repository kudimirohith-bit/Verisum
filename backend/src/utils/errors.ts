/**
 * Safely extracts an error message from an unknown caught value.
 * Use this in every catch block instead of accessing `err.message` directly.
 */
export function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
