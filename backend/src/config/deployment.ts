import { getSecret } from './secrets.js';

export type DeploymentMode = 'offline' | 'hybrid';

/**
 * Returns the active deployment mode ('offline' or 'hybrid').
 * Default is 'hybrid' unless DEPLOYMENT_MODE is explicitly set to 'offline'.
 */
export function getDeploymentMode(): DeploymentMode {
  const mode = getSecret('DEPLOYMENT_MODE', 'hybrid').toLowerCase();
  return mode === 'offline' ? 'offline' : 'hybrid';
}

/**
 * Returns true if the system is running in fully self-hosted/offline mode.
 */
export function isOfflineMode(): boolean {
  return getDeploymentMode() === 'offline';
}

/**
 * Validates whether a requested model backend is permitted under the current deployment mode.
 * Returns { allowed: true } or { allowed: false, message: string }.
 */
export function validateBackendAccess(backendName: string): { allowed: boolean; message?: string } {
  if (isOfflineMode() && backendName === 'hosted_llm') {
    return {
      allowed: false,
      message: 'Hosted LLM backend is disabled in offline deployment mode.',
    };
  }
  return { allowed: true };
}
