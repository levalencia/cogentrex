import type { DbAdapter } from '../db/adapter.js';
import { createId } from '../utils/id.js';
import { nowIso } from '../utils/time.js';

const FIXTURE_TITLE = '[QA Fixture] Deep Research Classification';
const FIXTURE_FILENAME = 'QA Deep Research classification fixture.md';
const FIXTURE_SKILL_SLUG = 'deep-research';

interface UserRow {
  id: string;
  email: string;
}

export interface LibraryQaFixtureSummary {
  targetUserId: string;
  targetEmail: string;
  conversationId: string;
  messageId: string;
  skillRunId: string;
  artifactId: string;
  conversationTitle: string;
  conversationMode: 'CHAT';
  effectiveMode: 'DEEP_RESEARCH';
  artifactFilename: string;
}

export class QaFixtureService {
  constructor(private readonly db: DbAdapter) {}

  async seedLibraryClassificationFixture(targetEmail: string): Promise<LibraryQaFixtureSummary | null> {
    const normalizedEmail = targetEmail.trim().toLowerCase();
    if (!normalizedEmail.endsWith('@cogentrex.test')) return null;

    const user = await this.db.prepare('SELECT id, email FROM users WHERE email = ?').get(normalizedEmail) as UserRow | undefined;
    if (!user) return null;

    await this.deleteExistingLibraryClassificationFixture(user.id);

    const now = nowIso();
    const completedAt = new Date(new Date(now).getTime() + 30_000).toISOString();
    const conversationId = createId('conv');
    const messageId = createId('msg');
    const skillRunId = createId('skr');
    const artifactId = createId('art');
    const content = `# QA Deep Research classification fixture\n\nThis fixture intentionally starts from a CHAT conversation row, then links a completed Deep Research skill run. The Library should classify this artifact as Deep Research.\n\n## Sources\n\n[1] QA fixture source — https://example.com/cogentrex-qa-fixture`;

    await this.db.prepare(
      `INSERT INTO conversations (id, user_id, title, mode, created_at, updated_at)
       VALUES (@id, @userId, @title, 'CHAT', @now, @now)`,
    ).run({ id: conversationId, userId: user.id, title: FIXTURE_TITLE, now });

    await this.db.prepare(
      `INSERT INTO messages (id, conversation_id, role, content, metadata_json, created_at)
       VALUES (@id, @conversationId, 'assistant', @content, @metadataJson, @now)`,
    ).run({
      id: messageId,
      conversationId,
      content,
      metadataJson: JSON.stringify({
        qaFixture: true,
        sources: [{ id: 1, title: 'QA fixture source', url: 'https://example.com/cogentrex-qa-fixture' }],
      }),
      now,
    });

    await this.db.prepare(
      `INSERT INTO skill_runs (
        id, user_id, skill_id, skill_slug, skill_name, mode, status,
        conversation_id, job_id, provider_id, started_at, completed_at, duration_ms, observability_json
      ) VALUES (
        @id, @userId, 'skl_deep_research', @skillSlug, 'Deep Research', 'DEEP_RESEARCH', 'completed',
        @conversationId, @jobId, NULL, @startedAt, @completedAt, 30000, @observabilityJson
      )`,
    ).run({
      id: skillRunId,
      userId: user.id,
      skillSlug: FIXTURE_SKILL_SLUG,
      conversationId,
      jobId: 'qa-library-fixture',
      startedAt: now,
      completedAt,
      observabilityJson: JSON.stringify({
        qaFixture: true,
        fixture: 'library-classification',
        expectedEffectiveMode: 'DEEP_RESEARCH',
        phase: 'synthesis',
        sourceCount: 4,
        newSourceCount: 3,
        planLength: 5,
        estimatedTokens: 1234,
        synthesisDurationMs: 45000,
        platforms: ['web', 'exa'],
        savedArtifactCount: 1,
        savedArtifactIds: [artifactId],
        savedArtifacts: [{ id: artifactId, filename: FIXTURE_FILENAME, type: 'text/markdown' }],
        note: 'Conversation row remains CHAT by design.',
      }),
    });

    await this.db.prepare(
      `INSERT INTO artifacts (id, user_id, conversation_id, message_id, type, filename, language, content, size_bytes, created_at)
       VALUES (@id, @userId, @conversationId, @messageId, 'text/markdown', @filename, 'markdown', @content, @sizeBytes, @createdAt)`,
    ).run({
      id: artifactId,
      userId: user.id,
      conversationId,
      messageId,
      filename: FIXTURE_FILENAME,
      content,
      sizeBytes: Buffer.byteLength(content, 'utf-8'),
      createdAt: completedAt,
    });

    return {
      targetUserId: user.id,
      targetEmail: user.email,
      conversationId,
      messageId,
      skillRunId,
      artifactId,
      conversationTitle: FIXTURE_TITLE,
      conversationMode: 'CHAT',
      effectiveMode: 'DEEP_RESEARCH',
      artifactFilename: FIXTURE_FILENAME,
    };
  }

  private async deleteExistingLibraryClassificationFixture(userId: string): Promise<void> {
    const rows = await this.db.prepare(
      'SELECT id FROM conversations WHERE user_id = ? AND title = ?',
    ).all(userId, FIXTURE_TITLE) as Array<{ id: string }>;

    for (const row of rows) {
      await this.db.prepare(
        `DELETE FROM skill_runs
         WHERE user_id = ? AND conversation_id = ? AND skill_slug = ?`,
      ).run(userId, row.id, FIXTURE_SKILL_SLUG);
      await this.db.prepare('DELETE FROM conversations WHERE user_id = ? AND id = ?').run(userId, row.id);
    }
  }
}
