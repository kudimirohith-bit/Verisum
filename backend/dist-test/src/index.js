"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const dotenv_1 = __importDefault(require("dotenv"));
const db_js_1 = require("./lib/db.js");
const app_js_1 = require("./app.js");
dotenv_1.default.config();
const PORT = process.env.PORT || 5000;
const MONGO_URI = process.env.MONGO_URI || 'mongodb://localhost:27017/verisumm';
async function startServer() {
    await (0, db_js_1.connectDB)(MONGO_URI);
    app_js_1.app.listen(PORT, () => {
        console.log(`[Backend] Express server running on port ${PORT}`);
    });
}
startServer().catch((err) => {
    console.error('[Backend] Failed to start server:', err);
    process.exit(1);
});
