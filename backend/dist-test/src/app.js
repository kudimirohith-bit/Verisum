"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.app = void 0;
const express_1 = __importDefault(require("express"));
const cors_1 = __importDefault(require("cors"));
const cookie_parser_1 = __importDefault(require("cookie-parser"));
const dotenv_1 = __importDefault(require("dotenv"));
const index_js_1 = require("./auth/index.js");
const index_js_2 = require("./ingestion/index.js");
const index_js_3 = require("./jobs/index.js");
const index_js_4 = require("./summaries/index.js");
dotenv_1.default.config();
const app = (0, express_1.default)();
exports.app = app;
app.use((0, cors_1.default)({ credentials: true, origin: process.env.CORS_ORIGIN || 'http://localhost:5173' }));
app.use(express_1.default.json());
app.use((0, cookie_parser_1.default)());
// ── Health Check ───────────────────────────────────────────────────────────────
app.get('/health', (_req, res) => {
    res.status(200).json({ status: 'ok' });
});
// ── Routes ─────────────────────────────────────────────────────────────────────
app.use('/auth', index_js_1.authRouter);
app.use('/documents', index_js_2.ingestionRouter);
app.use('/jobs', index_js_3.jobsRouter);
app.use('/summaries', index_js_4.summariesRouter);
