import { createId } from '../utils/id.js';
import type { ScheduledPostRepository } from './scheduledPostRepository.js';
import type { LinkedInPostService } from '../linkedin/linkedInPostService.js';
import type { MediaRepository } from '../media/mediaRepository.js';
import type { AppLogger } from '../observability/logger.js';
import { resolve } from 'path';

const MEDIA_DIR = resolve(process.cwd(), 'data', 'media');

export class ScheduledPostService {
  private timer: ReturnType<typeof setInterval> | null = null;

  constructor(
    private readonly posts: ScheduledPostRepository,
    private readonly linkedIn: LinkedInPostService,
    private readonly media: MediaRepository,
    private readonly logger: AppLogger,
  ) {}

  startScheduler(intervalMs = 60_000): void {
    if (this.timer) return;
    this.logger.info({ intervalMs }, 'scheduler_started');
    this.timer = setInterval(() => {
      void this.processPending();
    }, intervalMs);
  }

  stopScheduler(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
      this.logger.info({}, 'scheduler_stopped');
    }
  }

  async processPending(): Promise<void> {
    const pending = this.posts.listPending(20);
    if (!pending.length) return;
    this.logger.info({ count: pending.length }, 'scheduler_processing_pending');

    for (const post of pending) {
      try {
        if (post.platform === 'linkedin') {
          if (post.imageArtifactId) {
            const artifact = this.media.findById(post.userId, post.imageArtifactId);
            if (artifact?.localPath) {
              await this.linkedIn.postWithImage(post.userId, post.content, resolve(MEDIA_DIR, artifact.localPath));
            } else {
              await this.linkedIn.postText(post.userId, post.content);
            }
          } else {
            await this.linkedIn.postText(post.userId, post.content);
          }
        } else {
          throw new Error(`Platform ${post.platform} not supported for scheduled posting yet`);
        }
        this.posts.markPosted(post.id, new Date().toISOString());
        this.logger.info({ postId: post.id, platform: post.platform }, 'scheduler_posted');
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Scheduler post failed';
        this.posts.markFailed(post.id, message);
        this.logger.error({ postId: post.id, errorMessage: message }, 'scheduler_post_failed');
      }
    }
  }

  schedule(userId: string, platform: string, content: string, imageArtifactId: string | null, postAt: string): void {
    this.posts.create({
      id: createId('sch'),
      userId,
      platform,
      content,
      imageArtifactId,
      postAt,
      status: 'pending',
      errorMessage: null,
      postedAt: null,
      createdAt: new Date().toISOString(),
    });
    this.logger.info({ userId, platform, postAt }, 'post_scheduled');
  }

  logPosted(userId: string, platform: string, content: string, imageArtifactId: string | null): void {
    const now = new Date().toISOString();
    this.posts.create({
      id: createId('pst'),
      userId,
      platform,
      content,
      imageArtifactId,
      postAt: now,
      status: 'posted',
      errorMessage: null,
      postedAt: now,
      createdAt: now,
    });
    this.logger.info({ userId, platform }, 'immediate_post_logged');
  }

  listForUser(userId: string) {
    return this.posts.listForUser(userId);
  }

  updatePost(userId: string, id: string, content: string, imageArtifactId: string | null, postAt: string): void {
    const existing = this.posts.findById(userId, id);
    if (!existing) throw new Error('Post not found');
    if (existing.userId !== userId) throw new Error('Unauthorized');
    if (existing.status !== 'pending') throw new Error('Cannot edit a post that has already been processed');
    this.posts.update({ id, userId, content, imageArtifactId, postAt });
    this.logger.info({ userId, postId: id }, 'scheduled_post_updated');
  }

  cancel(userId: string, id: string): void {
    this.posts.deleteForUser(userId, id);
    this.logger.info({ userId, postId: id }, 'post_cancelled');
  }
}
