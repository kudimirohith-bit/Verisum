"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.connectDB = connectDB;
exports.disconnectDB = disconnectDB;
const mongoose_1 = __importDefault(require("mongoose"));
async function connectDB(uri) {
    mongoose_1.default.connection.on('connected', () => console.log('[MongoDB] Connection established'));
    mongoose_1.default.connection.on('error', (err) => console.error('[MongoDB] Connection error:', err));
    mongoose_1.default.connection.on('disconnected', () => console.warn('[MongoDB] Disconnected'));
    await mongoose_1.default.connect(uri, {
        serverSelectionTimeoutMS: 5000,
    });
}
async function disconnectDB() {
    await mongoose_1.default.disconnect();
    console.log('[MongoDB] Disconnected cleanly');
}
