"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.UserModel = void 0;
const mongoose_1 = require("mongoose");
const UserSchema = new mongoose_1.Schema({
    email: {
        type: String,
        required: true,
        unique: true,
        lowercase: true,
        trim: true,
    },
    role: {
        type: String,
        enum: ['clinician', 'researcher', 'admin'],
        required: true,
        default: 'clinician',
    },
    passwordHash: {
        type: String,
        required: true,
    },
}, { timestamps: true });
exports.UserModel = (0, mongoose_1.model)('User', UserSchema);
