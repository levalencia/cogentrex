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

export const appModeSchema = z.enum(['CHAT', 'DEEP_RESEARCH', 'SOCIAL_WRITING', 'IMAGE_GENERATION', 'VIDEO_GENERATION']);
export const skillStatusSchema = z.enum(['DRAFT', 'STAGED', 'PUBLISHED', 'DISABLED']);
export const skillVisibilitySchema = z.enum(['ADMIN_ONLY', 'USER_VISIBLE']);
export const skillKindSchema = z.enum(['NATIVE', 'IMPORTED']);

export const createProviderSchema = z.object({
  name: z.string().trim().min(1).max(120),
  baseUrl: z.string().trim().url().max(1000),
  apiKey: z.string().trim().min(1).max(4000),
  model: z.string().trim().min(1).max(200),
  kind: providerKindSchema.default('OPENAI_COMPATIBLE'),
  isDefault: z.boolean().default(false),
  isGlobal: z.boolean().default(false),
  defaultForMode: appModeSchema.optional().nullable(),
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

const skillAssistSlugSchema = z.string().trim().min(1).max(120).regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/);
export const skillAssistModeSchema = z.enum(['auto', 'hybrid', 'manual', 'off']);

export const sendMessageSchema = z.object({
  conversationId: z.string().optional(),
  providerId: z.string().optional(),
  content: z.string().trim().min(1).max(20000),
  mode: z.enum(['CHAT', 'DEEP_RESEARCH']).default('CHAT'),
  useSkills: z.boolean().default(false),
  skillAssistMode: skillAssistModeSchema.default('auto'),
  selectedSkillSlug: skillAssistSlugSchema.optional(),
  selectedSkillSlugs: z.array(skillAssistSlugSchema).max(6).optional(),
});

export const workflowIdSchema = z.enum([
  'CHAT',
  'IMAGE_GENERATION',
  'VIDEO_GENERATION',
  'SOCIAL_WRITING',
  'DEEP_RESEARCH',
]);

export const providerCapabilitySchema = z.enum([
  'text',
  'streaming',
  'vision',
  'tool-calling',
  'provider-search',
  'image',
  'video',
]);

export const toolCapabilitySchema = z.enum([
  'web.search',
  'web.fetch',
  'web.extract',
]);

export const capabilityStatusSchema = z.enum(['ready', 'degraded', 'missing']);

export const skillToolRequirementSchema = z.object({
  name: z.string().trim().min(1).max(120),
  required: z.boolean(),
  description: z.string().trim().max(500).optional(),
});

export const updateSkillSchema = z.object({
  name: z.string().trim().min(1).max(120).optional(),
  description: z.string().trim().min(1).max(1000).optional(),
  status: skillStatusSchema.optional(),
  visibility: skillVisibilitySchema.optional(),
  category: z.string().trim().min(1).max(80).nullable().optional(),
  icon: z.string().trim().min(1).max(80).nullable().optional(),
  inputSchema: z.record(z.string(), z.unknown()).nullable().optional(),
  outputContract: z.record(z.string(), z.unknown()).nullable().optional(),
  toolRequirements: z.array(skillToolRequirementSchema).max(20).optional(),
});

export const updateSkillRouteSchema = z.object({
  mode: appModeSchema,
  defaultProviderId: z.string().trim().min(1).nullable().optional(),
  searchProfile: z.string().trim().min(1).max(120).nullable().optional(),
  maxBudgetCents: z.number().int().min(0).max(100000).nullable().optional(),
  config: z.record(z.string(), z.unknown()).nullable().optional(),
});

export const createSkillSchema = z.object({
  slug: z.string().trim().min(1).max(120).regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'Slug must use lowercase letters, numbers, and dashes'),
  name: z.string().trim().min(1).max(120),
  description: z.string().trim().min(1).max(1000),
  category: z.string().trim().min(1).max(80).nullable().optional(),
  icon: z.string().trim().min(1).max(80).nullable().optional(),
  instructions: z.string().trim().min(1).max(40000),
});

export const importSkillKitSchema = z.object({
  sourceUrl: z.string().trim().url().max(1000),
  folderPath: z.string().trim().min(1).max(500).optional(),
  ref: z.string().trim().min(1).max(200).optional(),
});

export const manualSkillKitFileSchema = z.object({
  path: z.string().trim().min(1).max(500),
  content: z.string().max(400000),
});

export const importManualSkillKitSchema = z.object({
  sourceLabel: z.string().trim().min(1).max(200).optional(),
  files: z.array(manualSkillKitFileSchema).min(1).max(80),
});

export const adminSkillTestSchema = z.object({
  prompt: z.string().trim().min(1).max(20000),
  exampleId: z.string().trim().min(1).max(160).optional(),
  providerId: z.string().trim().min(1).optional(),
});

export const updateSkillInstructionsSchema = z.object({
  content: z.string().trim().min(1).max(40000),
});

export const updateSkillFileSchema = z.object({
  path: z.string().trim().min(1).max(500),
  content: z.string().min(1).max(400000),
});

export const createArtifactFromMessageSchema = z.object({
  messageId: z.string().trim().min(1),
  filename: z.string().trim().min(1).max(120).optional(),
  tags: z.array(z.string().trim().min(1).max(40)).max(12).optional(),
  projectId: z.string().trim().min(1).nullable().optional(),
});

export const updateArtifactMetadataSchema = z.object({
  filename: z.string().trim().min(1).max(120).optional(),
  tags: z.array(z.string().trim().min(1).max(40)).max(12).optional(),
  projectId: z.string().trim().min(1).nullable().optional(),
});

export type RegisterInput = z.infer<typeof registerSchema>;
export type LoginInput = z.infer<typeof loginSchema>;
export type CreateProviderInput = z.infer<typeof createProviderSchema>;
export type UpdateProviderInput = z.infer<typeof updateProviderSchema>;
export type SendMessageInput = z.infer<typeof sendMessageSchema>;
export type WorkflowIdInput = z.infer<typeof workflowIdSchema>;
export type ProviderCapabilityInput = z.infer<typeof providerCapabilitySchema>;
export type ToolCapabilityInput = z.infer<typeof toolCapabilitySchema>;
export type CapabilityStatusInput = z.infer<typeof capabilityStatusSchema>;
export type UpdateSkillInput = z.infer<typeof updateSkillSchema>;
export type UpdateSkillRouteInput = z.infer<typeof updateSkillRouteSchema>;
export type CreateSkillInput = z.infer<typeof createSkillSchema>;
export type ImportSkillKitInput = z.infer<typeof importSkillKitSchema>;
export type ImportManualSkillKitInput = z.infer<typeof importManualSkillKitSchema>;
export type AdminSkillTestInput = z.infer<typeof adminSkillTestSchema>;
export type UpdateSkillInstructionsInput = z.infer<typeof updateSkillInstructionsSchema>;
export type UpdateSkillFileInput = z.infer<typeof updateSkillFileSchema>;
export type CreateArtifactFromMessageInput = z.infer<typeof createArtifactFromMessageSchema>;
export type UpdateArtifactMetadataInput = z.infer<typeof updateArtifactMetadataSchema>;
