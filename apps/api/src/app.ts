import cookieParser from 'cookie-parser';
import cors from 'cors';
import express from 'express';
import rateLimit from 'express-rate-limit';
import helmet from 'helmet';
import { resolve } from 'path';
import type { AppEnv } from './config/env.js';
import { AuthRepository } from './auth/authRepository.js';
import { AuthService } from './auth/authService.js';
import { authRoutes } from './auth/authRoutes.js';
import { ConversationRepository } from './chat/conversationRepository.js';
import { ChatService } from './chat/chatService.js';
import { OpenAICompatibleClient, type LanguageModelClient } from './chat/languageModel.js';
import { AppDatabase } from './db/database.js';
import { errorMiddleware } from './http/errorMiddleware.js';
import { ProviderRepository } from './providers/providerRepository.js';
import { ProviderService } from './providers/providerService.js';
import { providerRoutes } from './providers/providerRoutes.js';
import { EncryptionService } from './security/encryption.js';
import { FirecrawlSearchClient, FakeWebSearchClient, type WebSearchClient } from './tools/searchClient.js';
import { ResearchService } from './research/researchService.js';
import { ResearchJobRepository } from './research/researchJobRepository.js';
import { ResearchSourceRepository } from './research/researchSourceRepository.js';
import { ProviderUsageRepository } from './providers/providerUsageRepository.js';
import { ChannelRegistry } from './tools/channels/channelRegistry.js';
import { WebChannelClient } from './tools/channels/webChannelClient.js';
import { RedditChannelClient } from './tools/channels/redditChannelClient.js';
import { RssChannelClient } from './tools/channels/rssChannelClient.js';
import { YouTubeChannelClient } from './tools/channels/youtubeChannelClient.js';
import { chatRoutes } from './chat/chatRoutes.js';
import { createLogger, type AppLogger } from './observability/logger.js';
import { requestLogger } from './observability/requestLogger.js';
import { adminRoutes } from './admin/adminRoutes.js';
import { MetricsRepository } from './observability/metricsRepository.js';
import { MediaRepository } from './media/mediaRepository.js';
import { MediaService } from './media/mediaService.js';
import { mediaRoutes } from './media/mediaRoutes.js';
import { SocialConfigRepository } from './social/socialConfigRepository.js';
import { SocialWritingService } from './social/socialWritingService.js';
import { socialRoutes } from './social/socialRoutes.js';
import { ProjectRepository } from './projects/projectRepository.js';
import { projectRoutes } from './projects/projectRoutes.js';
import { LinkedInTokenRepository } from './linkedin/linkedInTokenRepository.js';
import { LinkedInPostService } from './linkedin/linkedInPostService.js';
import { linkedInRoutes } from './linkedin/linkedInRoutes.js';
import { ScheduledPostRepository } from './schedule/scheduledPostRepository.js';
import { ScheduledPostService } from './schedule/scheduledPostService.js';
import { scheduledPostRoutes } from './schedule/scheduledPostRoutes.js';
import { ArtifactRepository } from './artifacts/artifactRepository.js';
import { ArtifactService } from './artifacts/artifactService.js';
import { artifactRoutes } from './artifacts/artifactRoutes.js';

export interface AppDependencies {
  database?: AppDatabase;
  llm?: LanguageModelClient;
  search?: WebSearchClient;
  logger?: AppLogger;
}

export async function createApp(env: AppEnv, deps: AppDependencies = {}) {
  const app = express();
  app.set('trust proxy', 1);
  const webOrigins = env.WEB_ORIGIN.split(',').map((origin) => origin.trim()).filter(Boolean);
  const database = deps.database ?? new AppDatabase(env.DATABASE_URL);
  await database.init();
  const logger = deps.logger ?? createLogger(env.LOG_LEVEL);
  const authRepository = new AuthRepository(database.adapter);
  const authService = new AuthService(authRepository, env.JWT_SECRET, logger.child({ component: 'AuthService' }));
  const encryption = new EncryptionService(env.APP_ENCRYPTION_KEY);
  const providerRepository = new ProviderRepository(database.adapter);
  const providerService = new ProviderService(providerRepository, encryption, logger.child({ component: 'ProviderService' }));
  const conversationRepository = new ConversationRepository(database.adapter);
  const llm = deps.llm ?? new OpenAICompatibleClient();
  const search = deps.search ?? (env.FIRECRAWL_API_KEY ? new FirecrawlSearchClient(env.FIRECRAWL_API_KEY) : new FakeWebSearchClient());
  const metricsRepository = new MetricsRepository(database.adapter);

  const artifactRepository = new ArtifactRepository(database.adapter);
  const artifactService = new ArtifactService(artifactRepository, logger.child({ component: 'ArtifactService' }));

  const chatService = new ChatService(conversationRepository, providerService, llm, new ProviderUsageRepository(database.adapter), metricsRepository, logger.child({ component: 'ChatService' }), artifactService);
  const researchJobRepository = new ResearchJobRepository(database.adapter);
  const researchSourceRepository = new ResearchSourceRepository(database.adapter);
  const channelRegistry = new ChannelRegistry();
  channelRegistry.register(new WebChannelClient(search));
  channelRegistry.register(new RedditChannelClient());
  channelRegistry.register(new RssChannelClient());
  channelRegistry.register(new YouTubeChannelClient());
  const researchService = new ResearchService(conversationRepository, providerService, llm, search, channelRegistry, researchJobRepository, researchSourceRepository, new ProviderUsageRepository(database.adapter), metricsRepository, logger.child({ component: 'ResearchService' }));

  const mediaRepository = new MediaRepository(database.adapter);
  const apiBaseUrl = env.API_PUBLIC_BASE_URL ?? `http://localhost:${env.API_PORT}`;
  const mediaService = new MediaService(conversationRepository, providerService, mediaRepository, llm, logger.child({ component: 'MediaService' }), apiBaseUrl);

  const socialConfigRepository = new SocialConfigRepository(database.adapter);
  const mediaDir = env.MEDIA_DIR ?? resolve(process.cwd(), 'data', 'media');
  const socialWritingService = new SocialWritingService(
    conversationRepository,
    providerService,
    llm,
    channelRegistry,
    search,
    socialConfigRepository,
    new ProviderUsageRepository(database.adapter),
    metricsRepository,
    logger.child({ component: 'SocialWritingService' }),
    mediaDir,
  );

  const projectRepository = new ProjectRepository(database.adapter);

  const linkedInTokenRepository = new LinkedInTokenRepository(database.adapter);
  const linkedInPostService = env.LINKEDIN_CLIENT_ID && env.LINKEDIN_CLIENT_SECRET
    ? new LinkedInPostService(
        linkedInTokenRepository,
        encryption,
        {
          clientId: env.LINKEDIN_CLIENT_ID,
          clientSecret: env.LINKEDIN_CLIENT_SECRET,
          redirectUri: `${apiBaseUrl}/api/linkedin/callback`,
        },
        logger.child({ component: 'LinkedInPostService' }),
      )
    : null;

  const scheduledPostRepository = new ScheduledPostRepository(database.adapter);
  const scheduledPostService = new ScheduledPostService(
    scheduledPostRepository,
    linkedInPostService!,
    mediaRepository,
    logger.child({ component: 'ScheduledPostService' }),
  );
  scheduledPostService.startScheduler();

  app.use(helmet());
  app.use(requestLogger(logger));
  app.use(cors({ origin: webOrigins.length === 1 ? webOrigins[0] : webOrigins, credentials: true }));
  app.use(express.json({ limit: '1mb' }));
  app.use(cookieParser());
  app.use(rateLimit({ windowMs: 15 * 60 * 1000, max: 500, standardHeaders: true, legacyHeaders: false }));

  app.get('/health', (_req, res) => res.json({ status: 'ok' }));
  app.get('/api/default-provider-template', (_req, res) => res.json({
    provider: {
      name: env.DEFAULT_PROVIDER_NAME,
      baseUrl: env.DEFAULT_PROVIDER_BASE_URL ?? '',
      model: env.DEFAULT_PROVIDER_MODEL,
      kind: 'AZURE_FOUNDRY' as const,
    },
  }));
  app.use('/api/auth', authRoutes(authService));
  app.use('/api/providers', providerRoutes(authService, providerService));
  app.use('/api/admin', adminRoutes(authService, providerService));
  app.use('/api/chat', chatRoutes(authService, chatService, researchService, metricsRepository, artifactService, logger.child({ component: 'ChatRoutes' })));
  app.use('/api/media', mediaRoutes(authService, mediaService, apiBaseUrl));
  app.use('/api/social', socialRoutes(authService, socialWritingService, socialConfigRepository, logger.child({ component: 'SocialRoutes' })));
  app.use('/api/projects', projectRoutes(authService, projectRepository));
  app.use('/api/artifacts', artifactRoutes(authService, artifactRepository));
  if (linkedInPostService) {
    app.use('/api/linkedin', linkedInRoutes(authService, linkedInPostService, mediaRepository, scheduledPostService));
  }
  app.use('/api/scheduled-posts', scheduledPostRoutes(authService, scheduledPostService));
  app.use(errorMiddleware(logger));

  logger.info({ databaseKind: env.DATABASE_URL.startsWith('postgres') ? 'postgres' : 'sqlite', firecrawlConfigured: Boolean(env.FIRECRAWL_API_KEY) }, 'app_initialized');
  return { app, database, services: { authService, providerService, chatService, researchService } };
}
