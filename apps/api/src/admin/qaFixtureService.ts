import type { DbAdapter } from '../db/adapter.js';
import { createId } from '../utils/id.js';
import { nowIso } from '../utils/time.js';

const FIXTURE_TITLE = '[QA Fixture] Deep Research Classification';
const FIXTURE_FILENAME = 'QA Deep Research classification fixture.md';
const FIXTURE_SKILL_SLUG = 'deep-research';

interface UserRow {
  id: string;
  email: string;
  role?: 'USER' | 'ADMIN';
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

export interface TemporaryAdminQaFixtureSummary {
  targetUserId: string;
  targetEmail: string;
  previousRole: 'USER' | 'ADMIN';
  role: 'USER' | 'ADMIN';
}

export class QaFixtureService {
  constructor(private readonly db: DbAdapter) {}

  async updateTemporaryAdminRole(targetEmail: string, role: 'USER' | 'ADMIN'): Promise<TemporaryAdminQaFixtureSummary | null> {
    const normalizedEmail = targetEmail.trim().toLowerCase();
    if (!normalizedEmail.endsWith('@cogentrex.test')) return null;

    const user = await this.db.prepare('SELECT id, email, role FROM users WHERE email = ?').get(normalizedEmail) as Required<UserRow> | undefined;
    if (!user) return null;

    await this.db.prepare('UPDATE users SET role = ? WHERE id = ? AND email = ?').run(role, user.id, user.email);

    return {
      targetUserId: user.id,
      targetEmail: user.email,
      previousRole: user.role,
      role,
    };
  }

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

    await this.seedSkillRunEvents({
      userId: user.id,
      skillRunId,
      conversationId,
      messageId,
      artifactId,
      startedAt: now,
      completedAt,
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

  private async seedSkillRunEvents(input: {
    userId: string;
    skillRunId: string;
    conversationId: string;
    messageId: string;
    artifactId: string;
    startedAt: string;
    completedAt: string;
  }): Promise<void> {
    const eventInsert = this.db.prepare(
      `INSERT INTO skill_run_events (
        id, run_id, user_id, sequence, event_type, label, message, metadata_json, created_at
      ) VALUES (
        @id, @runId, @userId, @sequence, @eventType, @label, @message, @metadataJson, @createdAt
      )`,
    );
    const eventTimes = [
      input.startedAt,
      new Date(new Date(input.startedAt).getTime() + 10_000).toISOString(),
      new Date(new Date(input.startedAt).getTime() + 20_000).toISOString(),
      input.completedAt,
    ];
    const events = [
      {
        sequence: 1,
        eventType: 'run_started',
        label: 'Deep Research started',
        message: 'QA fixture started a Deep Research run from an existing chat conversation.',
        metadata: {
          mode: 'DEEP_RESEARCH',
          skillSlug: FIXTURE_SKILL_SLUG,
          conversationId: input.conversationId,
          jobId: 'qa-library-fixture',
        },
      },
      {
        sequence: 2,
        eventType: 'research_sources_collected',
        label: 'Sources collected',
        message: 'Fixture captured source and planning metrics for the run detail trace.',
        metadata: {
          sourceCount: 4,
          newSourceCount: 3,
          planLength: 5,
          platforms: ['web', 'exa'],
        },
      },
      {
        sequence: 3,
        eventType: 'artifact_saved',
        label: 'Artifact saved to library',
        message: 'Fixture saved the synthesized Deep Research output as a Library artifact.',
        metadata: {
          artifactId: input.artifactId,
          messageId: input.messageId,
          filename: FIXTURE_FILENAME,
          type: 'text/markdown',
          savedArtifactCount: 1,
        },
      },
      {
        sequence: 4,
        eventType: 'run_completed',
        label: 'Deep Research completed',
        message: 'Fixture completed the run with saved output metadata for Library navigation.',
        metadata: {
          phase: 'synthesis',
          synthesisDurationMs: 45000,
          savedArtifactCount: 1,
          savedArtifactIds: [input.artifactId],
        },
      },
    ];

    for (const event of events) {
      await eventInsert.run({
        id: createId('ske'),
        runId: input.skillRunId,
        userId: input.userId,
        sequence: event.sequence,
        eventType: event.eventType,
        label: event.label,
        message: event.message,
        metadataJson: JSON.stringify(event.metadata),
        createdAt: eventTimes[event.sequence - 1],
      });
    }

    await this.db.prepare('UPDATE skill_runs SET event_sequence = ? WHERE id = ? AND user_id = ?')
      .run(events.length, input.skillRunId, input.userId);
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
