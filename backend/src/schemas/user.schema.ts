import { z } from 'zod';

export const UserRoleSchema = z.enum(['clinician', 'researcher', 'admin']);

export const CreateUserSchema = z.object({
  email: z.string().email('Invalid email address'),
  role: UserRoleSchema.default('clinician'),
  password: z.string().min(8, 'Password must be at least 8 characters'),
});

export const UserResponseSchema = z.object({
  id: z.string(),
  email: z.string().email(),
  role: UserRoleSchema,
  createdAt: z.date(),
  updatedAt: z.date(),
});

export type CreateUserInput = z.infer<typeof CreateUserSchema>;
export type UserResponse = z.infer<typeof UserResponseSchema>;
