export interface CatalogProvider {
  id: string;
  name: string;
  description: string;
  kind: 'OPENAI_COMPATIBLE' | 'ANTHROPIC' | 'GOOGLE' | 'AZURE_FOUNDRY' | 'IMAGE_GENERATION' | 'VIDEO_GENERATION';
  baseUrl?: string;
  baseUrlTemplate?: string;
  models: string[];
  features: {
    chat: boolean;
    vision: boolean;
    tools: boolean;
    image: boolean;
    video: boolean;
  };
  docsUrl: string;
}

export const providerCatalog: CatalogProvider[] = [
  {
    id: 'azure-foundry',
    name: 'Microsoft Foundry',
    description: 'Azure AI Foundry with OpenAI-compatible endpoints. Supports GPT, Kimi, and other models.',
    kind: 'AZURE_FOUNDRY',
    baseUrlTemplate: 'https://{project}.services.ai.azure.com/openai/v1',
    models: ['gpt-5.5', 'Kimi 2.6', 'gpt-4o'],
    features: { chat: true, vision: true, tools: true, image: false, video: false },
    docsUrl: 'https://learn.microsoft.com/azure/ai-foundry',
  },
  {
    id: 'openai',
    name: 'OpenAI',
    description: 'OpenAI API for GPT-4, GPT-3.5, DALL-E, and Sora.',
    kind: 'OPENAI_COMPATIBLE',
    baseUrl: 'https://api.openai.com/v1',
    models: ['gpt-4o', 'gpt-4-turbo', 'gpt-3.5-turbo', 'dall-e-3', 'sora-2'],
    features: { chat: true, vision: true, tools: true, image: true, video: true },
    docsUrl: 'https://platform.openai.com/docs',
  },
  {
    id: 'anthropic',
    name: 'Anthropic',
    description: 'Claude models for text, vision, and tool use.',
    kind: 'ANTHROPIC',
    baseUrl: 'https://api.anthropic.com/v1',
    models: ['claude-3-5-sonnet', 'claude-3-opus', 'claude-3-haiku'],
    features: { chat: true, vision: true, tools: true, image: false, video: false },
    docsUrl: 'https://docs.anthropic.com',
  },
  {
    id: 'google',
    name: 'Google AI',
    description: 'Gemini models via Google AI Studio or Vertex AI.',
    kind: 'GOOGLE',
    baseUrl: 'https://generativelanguage.googleapis.com/v1',
    models: ['gemini-1.5-pro', 'gemini-1.5-flash', 'gemini-1.0-pro'],
    features: { chat: true, vision: true, tools: true, image: true, video: false },
    docsUrl: 'https://ai.google.dev',
  },
];
