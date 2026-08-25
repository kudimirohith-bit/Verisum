import fs from 'fs';

/**
 * Utility function to read secret values.
 * Checks for a corresponding environment variable with a `_FILE` suffix first
 * (e.g., `JWT_SECRET_FILE=/run/secrets/jwt_secret`). If found and exists, returns file contents.
 * Otherwise returns process.env[key] or fallback defaultValue.
 */
export function getSecret(key: string, defaultValue: string = ''): string {
  const fileEnvVar = `${key}_FILE`;
  const filePath = process.env[fileEnvVar];

  if (filePath) {
    try {
      if (fs.existsSync(filePath)) {
        return fs.readFileSync(filePath, 'utf-8').trim();
      }
    } catch (err) {
      console.warn(`[Secrets] Failed to read secret from file "${filePath}":`, err);
    }
  }

  return process.env[key] ?? defaultValue;
}
