"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getDeploymentMode = getDeploymentMode;
exports.isOfflineMode = isOfflineMode;
exports.validateBackendAccess = validateBackendAccess;
const secrets_js_1 = require("./secrets.js");
/**
 * Returns the active deployment mode ('offline' or 'hybrid').
 * Default is 'hybrid' unless DEPLOYMENT_MODE is explicitly set to 'offline'.
 */
function getDeploymentMode() {
    const mode = (0, secrets_js_1.getSecret)('DEPLOYMENT_MODE', 'hybrid').toLowerCase();
    return mode === 'offline' ? 'offline' : 'hybrid';
}
/**
 * Returns true if the system is running in fully self-hosted/offline mode.
 */
function isOfflineMode() {
    return getDeploymentMode() === 'offline';
}
/**
 * Validates whether a requested model backend is permitted under the current deployment mode.
 * Returns { allowed: true } or { allowed: false, message: string }.
 */
function validateBackendAccess(backendName) {
    if (isOfflineMode() && backendName === 'hosted_llm') {
        return {
            allowed: false,
            message: 'Hosted LLM backend is disabled in offline deployment mode.',
        };
    }
    return { allowed: true };
}
