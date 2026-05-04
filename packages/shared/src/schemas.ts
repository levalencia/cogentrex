import { z } from 'zod';

export const emailSchema = z.string().trim().email().max(320).toLowerCase();
export const passwordSchema = z.string().min(10).max(200);

export const registerSchema = z.object({
  email: emailSchema,
  password: passwordSchema,
});

export const loginSchema = registerSchema;

export const providerKindSchema = z.enum([
  'OPENAI_COMPATIBLE',
  'ANTHROPIC',
  'GOOGLE',
  'AZURE_FOUNDRY',
  'IMAGE_GENERATION',
  'VIDEO_GENERATION',
]);

export const createProviderSchema = z.object({
  name: z.string().trim().min(1).max(120),
  baseUrl: z.string().trim().url().max(1000),
  apiKey: z.string().trim().min(1).max(4000),
  model: z.string().trim().min(1).max(200),
  kind: providerKindSchema.default('OPENAI_COMPATIBLE'),
  isDefault: z.boolean().default(false),
  isGlobal: z.boolean().default(false),
  defaultForMode: z.enum(['CHAT', 'DEEP_RESEARCH', 'SOCIAL_WRITING', 'IMAGE_GENERATION', 'VIDEO_GENERATION']).optional().nullable(),
  supportsStreaming: z.boolean().default(true),
  supportsVision: z.boolean().default(false),
  supportsTools: z.boolean().default(false),
  supportsSearch: z.boolean().default(false),
  supportsImage: z.boolean().default(false),
  supportsVideo: z.boolean().default(false),
});

export const updateProviderSchema = createProviderSchema.partial().extend({
  apiKey: z.string().trim().min(1).max(4000).optional(),
});

export const sendMessageSchema = z.object({
  conversationId: z.string().optional(),
  providerId: z.string().optional(),
  content: z.string().trim().min(1).max(20000),
  mode: z.enum(['CHAT', 'DEEP_RESEARCH']).default('CHAT'),
});

export type RegisterInput = z.infer<typeof registerSchema>;
export type LoginInput = z.infer<typeof loginSchema>;
export type CreateProviderInput = z.infer<typeof createProviderSchema>;
export type UpdateProviderInput = z.infer<typeof updateProviderSchema>;
export type SendMessageInput = z.infer<typeof sendMessageSchema>;
