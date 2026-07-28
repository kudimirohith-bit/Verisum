"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.UserResponseSchema = exports.CreateUserSchema = exports.UserRoleSchema = void 0;
const zod_1 = require("zod");
exports.UserRoleSchema = zod_1.z.enum(['clinician', 'researcher', 'admin']);
exports.CreateUserSchema = zod_1.z.object({
    email: zod_1.z.string().email('Invalid email address'),
    role: exports.UserRoleSchema.default('clinician'),
    password: zod_1.z.string().min(8, 'Password must be at least 8 characters'),
});
exports.UserResponseSchema = zod_1.z.object({
    id: zod_1.z.string(),
    email: zod_1.z.string().email(),
    role: exports.UserRoleSchema,
    createdAt: zod_1.z.date(),
    updatedAt: zod_1.z.date(),
});
