"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.getSecret = getSecret;
const fs_1 = __importDefault(require("fs"));
/**
 * Utility function to read secret values.
 * Checks for a corresponding environment variable with a `_FILE` suffix first
 * (e.g., `JWT_SECRET_FILE=/run/secrets/jwt_secret`). If found and exists, returns file contents.
 * Otherwise returns process.env[key] or fallback defaultValue.
 */
function getSecret(key, defaultValue = '') {
    const fileEnvVar = `${key}_FILE`;
    const filePath = process.env[fileEnvVar];
    if (filePath) {
        try {
            if (fs_1.default.existsSync(filePath)) {
                return fs_1.default.readFileSync(filePath, 'utf-8').trim();
            }
        }
        catch (err) {
            console.warn(`[Secrets] Failed to read secret from file "${filePath}":`, err);
        }
    }
    return process.env[key] ?? defaultValue;
}
