import { describe, expect, it } from 'vitest';
import { setSkillKitImportFetchForTests } from '../skills/skillKitImporter.js';
import { SkillRepository } from '../skills/skillRepository.js';
import { nativeSkillSeeds } from '../skills/skillService.js';
import { createProvider, makeTestApp, registerAndLogin } from './testApp.js';

async function registerAdmin(agent: Awaited<ReturnType<typeof makeTestApp>>['agent'], database: Awaited<ReturnType<typeof makeTestApp>>['database']) {
  const user = await registerAndLogin(agent);
  await database.adapter.prepare('UPDATE users SET role = ? WHERE id = ?').run('ADMIN', user.id);
  return { ...user, role: 'ADMIN' as const };
}

describe('skill registry API', () => {
  it('seeds native skills idempotently when a slug already exists with a legacy id', async () => {
    const { database } = await makeTestApp();
    await database.adapter.prepare('DELETE FROM skill_routes WHERE skill_id = ?').run('skl_algorithmic_art');
    await database.adapter.prepare('DELETE FROM skills WHERE id = ?').run('skl_algorithmic_art');
    await database.adapter.prepare(
      `INSERT INTO skills (
        id, slug, name, description, kind, status, visibility, category, icon,
        input_schema_json, output_contract_json, tool_requirements_json, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(
      'skl_legacy_algorithmic_art',
      'algorithmic-art',
      'Legacy Algorithmic Art',
      'Existing row from an earlier DEV seed/import.',
      'IMPORTED',
      'PUBLISHED',
      'USER_VISIBLE',
      'Creative',
      'sparkles',
      null,
      null,
      '[]',
      '2026-01-01T00:00:00.000Z',
      '2026-01-01T00:00:00.000Z',
    );

    await database.adapter.prepare(
      `INSERT INTO skill_routes (
        id, skill_id, mode, default_provider_id, search_profile, max_budget_cents, config_json, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(
      'skr_legacy_algorithmic_art',
      'skl_legacy_algorithmic_art',
      'CHAT',
      null,
      null,
      null,
      null,
      '2026-01-01T00:00:00.000Z',
      '2026-01-01T00:00:00.000Z',
    );

    const repository = new SkillRepository(database.adapter);
    await repository.seedNative(nativeSkillSeeds.filter((seed) => seed.slug === 'algorithmic-art'), '2026-01-02T00:00:00.000Z');

    const skill = await repository.findBySlug('algorithmic-art');
    expect(skill).toMatchObject({
      id: 'skl_legacy_algorithmic_art',
      slug: 'algorithmic-art',
      kind: 'NATIVE',
      name: 'Algorithmic Art',
    });
    expect(skill?.route).toMatchObject({
      skillId: 'skl_legacy_algorithmic_art',
      mode: 'CHAT',
    });
    expect(skill?.route?.config).toMatchObject({
      skillAssist: expect.objectContaining({
        keywords: expect.arrayContaining(['algorithmic art']),
      }),
    });

    database.close();
  });

  it('lists only published user-visible native skills for authenticated users', async () => {
    const { agent, database } = await makeTestApp();
    await registerAndLogin(agent);

    const res = await agent.get('/api/skills').expect(200);

    const slugs = res.body.skills.map((skill: { slug: string }) => skill.slug);
    expect(slugs).toContain('chat');
    expect(slugs).toContain('deep-research');
    expect(slugs).toContain('linkedin-writer');
    expect(slugs).toContain('image-studio');
    expect(slugs).toContain('project-management');
    expect(slugs).toContain('artifact-writer');
    expect(slugs).not.toContain('video-lab');
    expect(slugs).not.toContain('flight-search');
    expect(res.body.skills[0].route.mode).toBeDefined();

    database.close();
  });

  it('returns skill detail for visible skills and hides staged admin-only skills', async () => {
    const { agent, database } = await makeTestApp();
    await registerAndLogin(agent);

    await agent.get('/api/skills/deep-research').expect(200).expect((res) => {
      expect(res.body.skill.slug).toBe('deep-research');
      expect(res.body.skill.status).toBe('PUBLISHED');
      expect(res.body.skill.visibility).toBe('USER_VISIBLE');
      expect(res.body.skill.route.mode).toBe('DEEP_RESEARCH');
      expect(Array.isArray(res.body.skill.toolRequirements)).toBe(true);
      expect(res.body.skill.inputSchema.fields[0]).toMatchObject({ name: 'question', label: 'Research question', type: 'textarea', required: true });
      expect(res.body.skill.outputContract.artifacts).toContain('Cited answer');
      expect(res.body.skill.route.config.promptTemplates).toHaveLength(5);
      expect(res.body.skill.route.config.promptTemplates[0]).toMatchObject({
        id: 'research-market-map',
        label: 'Market map',
        prompt: expect.stringContaining('Research'),
      });
    });

    await agent.get('/api/skills/video-lab').expect(404);

    database.close();
  });

  it('returns visible skill readiness with provider and tool dependency status', async () => {
    const { agent, database } = await makeTestApp();
    await registerAndLogin(agent);
    await agent.post('/api/providers').send({
      name: 'Text Model',
      baseUrl: 'https://llm.example.com/v1',
      apiKey: 'test-api-key',
      model: 'text-model',
      kind: 'OPENAI_COMPATIBLE',
      isDefault: true,
      defaultForMode: 'CHAT',
      supportsStreaming: true,
    }).expect(201);
    await agent.post('/api/providers').send({
      name: 'Image Model',
      baseUrl: 'https://image.example.com/v1',
      apiKey: 'test-api-key',
      model: 'image-model',
      kind: 'IMAGE_GENERATION',
      isDefault: false,
      defaultForMode: 'IMAGE_GENERATION',
      supportsImage: true,
    }).expect(201);

    const res = await agent.get('/api/skills/readiness').expect(200);

    const bySlug = new Map(res.body.skills.map((item: { skill: { slug: string } }) => [item.skill.slug, item]));
    const visibleSlugs = Array.from(bySlug.keys());
    expect(visibleSlugs).toContain('chat');
    expect(visibleSlugs).toContain('deep-research');
    expect(visibleSlugs).not.toContain('video-lab');

    const chat = bySlug.get('chat') as { status: string; dependencies: Array<{ kind: string; id: string; status: string; required: boolean; label: string }> };
    expect(chat.status).toBe('ready');
    expect(chat.dependencies).toEqual(expect.arrayContaining([
      expect.objectContaining({ kind: 'provider', id: 'text', status: 'ready', required: true }),
    ]));

    const research = bySlug.get('deep-research') as { status: string; dependencies: Array<{ kind: string; id: string; status: string; required: boolean; label: string }> };
    expect(research.status).toBe('degraded');
    expect(research.dependencies).toEqual(expect.arrayContaining([
      expect.objectContaining({ kind: 'tool', id: 'web.search', status: 'degraded', required: true }),
    ]));

    const image = bySlug.get('image-studio') as { status: string; dependencies: Array<{ kind: string; id: string; status: string; required: boolean; label: string }> };
    expect(image.status).toBe('ready');
    expect(image.dependencies).toEqual(expect.arrayContaining([
      expect.objectContaining({ kind: 'provider', id: 'image', status: 'ready', required: true }),
    ]));

    const projectManagement = bySlug.get('project-management') as { status: string; dependencies: Array<{ kind: string; id: string; status: string; required: boolean; label: string }> };
    expect(projectManagement.status).toBe('degraded');
    expect(projectManagement.dependencies).toEqual(expect.arrayContaining([
      expect.objectContaining({ kind: 'provider', id: 'text', status: 'ready', required: true }),
      expect.objectContaining({ kind: 'tool', id: 'web.search', status: 'degraded', required: false }),
    ]));

    database.close();
  });

  it('allows admins to list all skills and blocks non-admin users', async () => {
    const userApp = await makeTestApp();
    await registerAndLogin(userApp.agent);
    await userApp.agent.get('/api/admin/skills').expect(403);
    userApp.database.close();

    const { agent, database } = await makeTestApp();
    await registerAdmin(agent, database);

    const res = await agent.get('/api/admin/skills').expect(200);
    const slugs = res.body.skills.map((skill: { slug: string }) => skill.slug);
    expect(slugs).toContain('video-lab');
    expect(slugs).toContain('flight-search');
    for (const skill of res.body.skills as Array<{ route: { config: { promptTemplates?: unknown[] } | null } | null }>) {
      expect(skill.route?.config?.promptTemplates).toHaveLength(5);
    }

    database.close();
  });

  it('allows admins to curate skill metadata and configure skill routes', async () => {
    const { agent, database } = await makeTestApp();
    await registerAdmin(agent, database);

    await agent.patch('/api/admin/skills/flight-search').send({
      status: 'PUBLISHED',
      visibility: 'USER_VISIBLE',
      category: 'Travel Ops',
      toolRequirements: [{ name: 'web.search', required: true }],
    }).expect(200).expect((res) => {
      expect(res.body.skill.slug).toBe('flight-search');
      expect(res.body.skill.status).toBe('PUBLISHED');
      expect(res.body.skill.visibility).toBe('USER_VISIBLE');
      expect(res.body.skill.category).toBe('Travel Ops');
    });

    await agent.put('/api/admin/skills/flight-search/route').send({
      mode: 'DEEP_RESEARCH',
      searchProfile: 'travel-web',
      maxBudgetCents: 500,
      config: {
        requiredSources: 4,
        promptTemplates: [
          { id: 'flight-weekend', label: 'Weekend trip', prompt: 'Find weekend flight options: ', description: 'Short trip research' },
        ],
      },
    }).expect(200).expect((res) => {
      expect(res.body.route.mode).toBe('DEEP_RESEARCH');
      expect(res.body.route.searchProfile).toBe('travel-web');
      expect(res.body.route.maxBudgetCents).toBe(500);
      expect(res.body.route.config.requiredSources).toBe(4);
      expect(res.body.route.config.promptTemplates).toEqual([
        { id: 'flight-weekend', label: 'Weekend trip', prompt: 'Find weekend flight options: ', description: 'Short trip research' },
      ]);
    });

    await agent.get('/api/skills/flight-search').expect(200).expect((res) => {
      expect(res.body.skill.route.searchProfile).toBe('travel-web');
      expect(res.body.skill.route.config.promptTemplates[0].id).toBe('flight-weekend');
    });

    database.close();
  });


  it('runs admin Skill Test Lab checks and records an auditable run', async () => {
    const { agent, database } = await makeTestApp();
    await registerAdmin(agent, database);
    const provider = await createProvider(agent);

    await agent.post('/api/admin/skills').send({
      slug: 'qa-copywriter',
      name: 'QA Copywriter',
      description: 'Drafts concise QA copy.',
      category: 'Imported',
      icon: 'sparkles',
      instructions: '# QA Copywriter\n\nAlways produce concise, evidence-aware copy.',
    }).expect(201);

    await agent.patch('/api/admin/skills/qa-copywriter').send({
      status: 'PUBLISHED',
      visibility: 'USER_VISIBLE',
    }).expect(400).expect((publishRes) => {
      expect(publishRes.body.error.message).toContain('Run a successful admin test');
    });

    const beforeTestList = await agent.get('/api/admin/skills').expect(200);
    const beforeTestSkill = beforeTestList.body.skills.find((skill: { slug: string }) => skill.slug === 'qa-copywriter');
    expect(beforeTestSkill.publishGate).toMatchObject({ status: 'untested' });

    const res = await agent.post('/api/admin/skills/qa-copywriter/test').send({
      prompt: 'Write a launch note for the new Test Lab.',
      exampleId: 'launch-note',
      providerId: provider.id,
    }).expect(200);

    expect(res.body).toMatchObject({
      output: 'Research answer with citation [1].',
      prompt: 'Write a launch note for the new Test Lab.',
      skill: { slug: 'qa-copywriter', name: 'QA Copywriter' },
      provider: { id: provider.id, name: 'Microsoft Foundry Kimi', model: 'Kimi 2.6' },
    });
    expect(res.body.run).toMatchObject({
      skillSlug: 'qa-copywriter',
      skillName: 'QA Copywriter',
      status: 'completed',
      mode: 'CHAT',
      providerId: provider.id,
    });
    expect(res.body.run.observability).toMatchObject({
      isAdminTest: true,
      exampleId: 'launch-note',
      promptLength: 'Write a launch note for the new Test Lab.'.length,
      outputLength: 'Research answer with citation [1].'.length,
    });

    const events = await agent.get(`/api/runs/${res.body.run.id}/events`).expect(200);
    const eventTypes = events.body.events.map((event: { eventType: string }) => event.eventType);
    expect(eventTypes).toEqual(expect.arrayContaining([
      'run_started',
      'admin_test_prompt_ready',
      'admin_test_output_received',
      'run_completed',
    ]));

    const afterTestList = await agent.get('/api/admin/skills').expect(200);
    const afterTestSkill = afterTestList.body.skills.find((skill: { slug: string }) => skill.slug === 'qa-copywriter');
    expect(afterTestSkill.publishGate).toMatchObject({
      status: 'passing',
      lastSuccessfulTest: {
        runId: res.body.run.id,
        providerId: provider.id,
        model: 'Kimi 2.6',
      },
    });

    await agent.patch('/api/admin/skills/qa-copywriter').send({
      status: 'PUBLISHED',
      visibility: 'USER_VISIBLE',
    }).expect(200).expect((publishRes) => {
      expect(publishRes.body.skill.status).toBe('PUBLISHED');
      expect(publishRes.body.skill.visibility).toBe('USER_VISIBLE');
    });

    await agent.put('/api/admin/skills/qa-copywriter/route').send({
      mode: 'CHAT',
      config: { promptTemplates: [{ id: 'changed', label: 'Changed', prompt: 'Changed prompt' }] },
    }).expect(200);

    const staleList = await agent.get('/api/admin/skills').expect(200);
    const staleSkill = staleList.body.skills.find((skill: { slug: string }) => skill.slug === 'qa-copywriter');
    expect(staleSkill.publishGate).toMatchObject({ status: 'stale' });

    database.close();
  });

  it('marks the publish gate stale when admins edit SKILL.md instructions', async () => {
    const { agent, database } = await makeTestApp();
    await registerAdmin(agent, database);
    const provider = await createProvider(agent);

    await agent.post('/api/admin/skills').send({
      slug: 'editable-skill',
      name: 'Editable Skill',
      description: 'A skill with editable instructions.',
      category: 'Imported',
      icon: 'sparkles',
      instructions: '# Editable Skill\n\nInitial instructions.',
    }).expect(201);

    const testRes = await agent.post('/api/admin/skills/editable-skill/test').send({
      prompt: 'Run a short QA test.',
      providerId: provider.id,
    }).expect(200);
    expect(testRes.body.run.status).toBe('completed');

    const updateRes = await agent.put('/api/admin/skills/editable-skill/instructions').send({
      content: '# Editable Skill\n\nUpdated instructions that require a fresh admin test.',
    }).expect(200);
    expect(updateRes.body.files).toEqual(expect.arrayContaining([
      expect.objectContaining({
        path: 'SKILL.md',
        kind: 'skill',
        content: '# Editable Skill\n\nUpdated instructions that require a fresh admin test.',
      }),
    ]));
    expect(updateRes.body.skill.publishGate).toMatchObject({ status: 'stale' });

    await agent.patch('/api/admin/skills/editable-skill').send({
      status: 'PUBLISHED',
      visibility: 'USER_VISIBLE',
    }).expect(400).expect((publishRes) => {
      expect(publishRes.body.error.message).toContain('Re-run Test Lab');
    });

    database.close();
  });

  it('allows admins to create a draft imported skill and read SKILL.md instructions from stored files', async () => {
    const { agent, database } = await makeTestApp();
    await registerAdmin(agent, database);

    const createRes = await agent.post('/api/admin/skills').send({
      slug: 'manual-skill',
      name: 'Manual Skill',
      description: 'A small draft skill created from the admin catalog.',
      category: 'Imported',
      icon: '✨',
      instructions: '# Manual Skill\n\nFollow the user brief and stay concise.',
    }).expect(201);

    expect(createRes.body.skill).toMatchObject({
      slug: 'manual-skill',
      kind: 'IMPORTED',
      status: 'DRAFT',
      visibility: 'ADMIN_ONLY',
    });
    expect(createRes.body.files).toHaveLength(1);
    expect(createRes.body.files[0]).toMatchObject({
      path: 'SKILL.md',
      kind: 'skill',
      content: '# Manual Skill\n\nFollow the user brief and stay concise.',
      executable: false,
    });

    const filesRes = await agent.get('/api/admin/skills/manual-skill/files').expect(200);
    expect(filesRes.body.files).toEqual(expect.arrayContaining([
      expect.objectContaining({
        path: 'SKILL.md',
        content: '# Manual Skill\n\nFollow the user brief and stay concise.',
        contentType: 'text/markdown',
        sizeBytes: Buffer.byteLength('# Manual Skill\n\nFollow the user brief and stay concise.', 'utf8'),
      }),
    ]));

    await agent.get('/api/admin/skills/missing-skill/files').expect(404);

    database.close();
  });

  it('allows admins to upload a manual skill package folder with supported files and warnings', async () => {
    const { agent, database } = await makeTestApp();
    await registerAdmin(agent, database);

    const res = await agent.post('/api/admin/skills/import-manual-kit').send({
      sourceLabel: 'local brand package',
      files: [
        {
          path: 'local-brand-package/SKILL.md',
          content: '---\nname: Brand Voice\ndescription: Keep launch copy sharp.\n---\n\nUse the references before drafting.',
        },
        { path: 'local-brand-package/references/tone.md', content: '# Tone\n\nPremium, direct, grounded.' },
        { path: 'local-brand-package/scripts/check.py', content: 'print("reference only")' },
        { path: 'local-brand-package/private/raw.bin', content: 'ignored binary-ish content' },
      ],
    }).expect(201);

    expect(res.body.skill).toMatchObject({
      slug: 'brand-voice',
      kind: 'IMPORTED',
      status: 'DRAFT',
      visibility: 'ADMIN_ONLY',
    });
    expect(res.body.skill.route.config.manualSkillKit).toMatchObject({
      sourceLabel: 'local brand package',
      fileCount: 3,
    });
    expect(res.body.skill.route.config.importedSkillKit).toBeUndefined();
    expect(res.body.skill.route.config.importWarnings).toEqual(expect.arrayContaining([
      expect.stringContaining('scripts/check.py'),
      expect.stringContaining('private/raw.bin'),
    ]));
    expect(res.body.files.map((file: { path: string }) => file.path)).toEqual([
      'SKILL.md',
      'references/tone.md',
      'scripts/check.py',
    ]);

    await agent.post('/api/admin/skills/brand-voice/reimport').expect(404);

    database.close();
  });

  it('allows admins to edit reference/template package files but keeps scripts and SKILL.md read-only in Files tab editor', async () => {
    const { agent, database } = await makeTestApp();
    await registerAdmin(agent, database);
    const provider = await createProvider(agent);

    await agent.post('/api/admin/skills/import-manual-kit').send({
      sourceLabel: 'editable package',
      files: [
        { path: 'SKILL.md', content: '---\nname: Editable Package\ndescription: Validate file editing.\n---\n\nUse package files.' },
        { path: 'references/tone.md', content: '# Tone\n\nOriginal.' },
        { path: 'templates/reply.md', content: 'Original template.' },
        { path: 'scripts/check.py', content: 'print("reference only")' },
      ],
    }).expect(201);

    await agent.put('/api/admin/skills/editable-package/route').send({
      mode: 'CHAT',
      defaultProviderId: provider.id,
    }).expect(200);
    const testRes = await agent.post('/api/admin/skills/editable-package/test').send({ prompt: 'Use the package.', providerId: provider.id }).expect(200);

    const edited = await agent.put('/api/admin/skills/editable-package/files').send({
      path: 'references/tone.md',
      content: '# Tone\n\nUpdated premium voice.',
    }).expect(200);

    expect(edited.body.files).toEqual(expect.arrayContaining([
      expect.objectContaining({
        path: 'references/tone.md',
        content: '# Tone\n\nUpdated premium voice.',
        executable: false,
      }),
    ]));
    expect(edited.body.skill.route.config.adminTestGate).toMatchObject({ runId: testRes.body.run.id });
    expect(edited.body.skill.publishGate.status).toBe('stale');

    await agent.put('/api/admin/skills/editable-package/files').send({
      path: 'templates/reply.md',
      content: 'Updated template.',
    }).expect(200);
    await agent.put('/api/admin/skills/editable-package/files').send({
      path: 'scripts/check.py',
      content: 'print("mutated")',
    }).expect(400);
    await agent.put('/api/admin/skills/editable-package/files').send({
      path: 'SKILL.md',
      content: '# Mutated',
    }).expect(400);

    database.close();
  });

  it('imports one skill kit from a specific GitHub folder and ignores sibling skills', async () => {
    const { agent, database } = await makeTestApp();
    await registerAdmin(agent, database);
    const fetchedUrls: string[] = [];
    setSkillKitImportFetchForTests((async (url: string | URL | Request) => {
      const href = typeof url === 'string' ? url : url instanceof URL ? url.href : url.url;
      fetchedUrls.push(href);
      if (href === 'https://api.github.com/repos/acme/agent-skills/git/trees/main?recursive=1') {
        return new Response(JSON.stringify({
          tree: [
            { path: 'skills/excalidraw/SKILL.md', type: 'blob', size: 340 },
            { path: 'skills/excalidraw/references/color-palette.md', type: 'blob', size: 120 },
            { path: 'skills/excalidraw/scripts/render.py', type: 'blob', size: 80 },
            { path: 'skills/other-skill/SKILL.md', type: 'blob', size: 240 },
          ],
        }), { status: 200 });
      }
      const rawPrefix = 'https://raw.githubusercontent.com/acme/agent-skills/main/';
      if (href === `${rawPrefix}skills/excalidraw/SKILL.md`) {
        return new Response('---\nname: Excalidraw Diagram\ndescription: Generate practical Excalidraw diagrams.\n---\n\nUse references/color-palette.md for colors.', { status: 200 });
      }
      if (href === `${rawPrefix}skills/excalidraw/references/color-palette.md`) {
        return new Response('# Color Palette\n\nUse purple and cyan.', { status: 200 });
      }
      if (href === `${rawPrefix}skills/excalidraw/scripts/render.py`) {
        return new Response('print("stored but not executable")', { status: 200 });
      }
      return new Response('not found', { status: 404 });
    }) as typeof fetch);

    try {
      const res = await agent.post('/api/admin/skills/import-kit').send({
        sourceUrl: 'https://github.com/acme/agent-skills',
        folderPath: 'skills/excalidraw',
      }).expect(201);

      expect(res.body.skill.slug).toBe('excalidraw-diagram');
      expect(res.body.skill.kind).toBe('IMPORTED');
      expect(res.body.skill.status).toBe('DRAFT');
      expect(res.body.skill.visibility).toBe('ADMIN_ONLY');
      expect(res.body.files.map((file: { path: string }) => file.path)).toEqual([
        'SKILL.md',
        'references/color-palette.md',
        'scripts/render.py',
      ]);
      expect(res.body.warnings).toEqual(expect.arrayContaining([
        expect.stringContaining('scripts/render.py'),
      ]));
      expect(fetchedUrls).not.toContain('https://raw.githubusercontent.com/acme/agent-skills/main/skills/other-skill/SKILL.md');

      const stored = await database.adapter.prepare('SELECT path, kind, executable FROM skill_files WHERE skill_id = ? ORDER BY path ASC').all(res.body.skill.id) as Array<{ path: string; kind: string; executable: number }>;
      expect(stored).toEqual([
        { path: 'SKILL.md', kind: 'skill', executable: 0 },
        { path: 'references/color-palette.md', kind: 'reference', executable: 0 },
        { path: 'scripts/render.py', kind: 'script', executable: 0 },
      ]);
    } finally {
      setSkillKitImportFetchForTests(null);
      database.close();
    }
  });

  it('refreshes imported skill kits from stored source while preserving examples and test history', async () => {
    const { agent, database } = await makeTestApp();
    await registerAdmin(agent, database);
    const provider = await createProvider(agent);
    let skillMd = '---\nname: Writing Coach\ndescription: Improve user writing.\n---\n\nFollow the brief.';
    setSkillKitImportFetchForTests((async (url: string | URL | Request) => {
      const href = typeof url === 'string' ? url : url instanceof URL ? url.href : url.url;
      if (href === 'https://api.github.com/repos/acme/agent-skills/git/trees/main?recursive=1') {
        return new Response(JSON.stringify({
          tree: [
            { path: 'skills/writing/SKILL.md', type: 'blob', size: 220 },
            { path: 'skills/writing/scripts/check.py', type: 'blob', size: 30 },
          ],
        }), { status: 200 });
      }
      const rawPrefix = 'https://raw.githubusercontent.com/acme/agent-skills/main/';
      if (href === `${rawPrefix}skills/writing/SKILL.md`) return new Response(skillMd, { status: 200 });
      if (href === `${rawPrefix}skills/writing/scripts/check.py`) return new Response('print("reference only")', { status: 200 });
      return new Response('not found', { status: 404 });
    }) as typeof fetch);

    try {
      const imported = await agent.post('/api/admin/skills/import-kit').send({
        sourceUrl: 'https://github.com/acme/agent-skills',
        folderPath: 'skills/writing',
      }).expect(201);
      expect(imported.body.skill.route.config.importedSkillKit).toMatchObject({
        sourceUrl: 'https://github.com/acme/agent-skills',
        sourceRef: 'main',
        sourcePath: 'skills/writing',
      });
      expect(imported.body.skill.route.config.importWarnings).toEqual(expect.arrayContaining([
        expect.stringContaining('scripts/check.py'),
      ]));

      await agent.put('/api/admin/skills/writing-coach/route').send({
        mode: 'CHAT',
        defaultProviderId: provider.id,
        config: {
          promptTemplates: [{ id: 'rewrite', label: 'Rewrite', prompt: 'Rewrite this:', visibleToUsers: true }],
          importedSkillKit: imported.body.skill.route.config.importedSkillKit,
          importWarnings: imported.body.skill.route.config.importWarnings,
        },
      }).expect(200);
      const testRes = await agent.post('/api/admin/skills/writing-coach/test').send({ prompt: 'Rewrite this launch note.', providerId: provider.id }).expect(200);

      skillMd = '---\nname: Writing Coach\ndescription: Improve user writing.\n---\n\nFollow the refreshed brief.';
      const refreshed = await agent.post('/api/admin/skills/writing-coach/reimport').expect(200);

      expect(refreshed.body.files).toEqual(expect.arrayContaining([
        expect.objectContaining({ path: 'SKILL.md', content: skillMd }),
      ]));
      expect(refreshed.body.skill.route.config.promptTemplates).toEqual([
        { id: 'rewrite', label: 'Rewrite', prompt: 'Rewrite this:', visibleToUsers: true },
      ]);
      expect(refreshed.body.skill.route.config.adminTestGate).toMatchObject({ runId: testRes.body.run.id });
      expect(refreshed.body.skill.route.config.importWarnings).toEqual(expect.arrayContaining([
        expect.stringContaining('scripts/check.py'),
      ]));
      expect(refreshed.body.skill.publishGate.status).toBe('stale');
    } finally {
      setSkillKitImportFetchForTests(null);
      database.close();
    }
  });

  it('accepts GitHub tree URLs as direct folder imports', async () => {
    const { agent, database } = await makeTestApp();
    await registerAdmin(agent, database);
    setSkillKitImportFetchForTests((async (url: string | URL | Request) => {
      const href = typeof url === 'string' ? url : url instanceof URL ? url.href : url.url;
      if (href === 'https://api.github.com/repos/acme/many-skills/git/trees/main?recursive=1') {
        return new Response(JSON.stringify({
          tree: [
            { path: 'catalog/writing/SKILL.md', type: 'blob', size: 220 },
            { path: 'catalog/writing/references/style.md', type: 'blob', size: 80 },
            { path: 'catalog/diagram/SKILL.md', type: 'blob', size: 220 },
          ],
        }), { status: 200 });
      }
      const rawPrefix = 'https://raw.githubusercontent.com/acme/many-skills/main/';
      if (href === `${rawPrefix}catalog/writing/SKILL.md`) return new Response('---\nname: Writing Coach\ndescription: Improve user writing.\n---\n\nFollow the brief.', { status: 200 });
      if (href === `${rawPrefix}catalog/writing/references/style.md`) return new Response('# Style', { status: 200 });
      return new Response('not found', { status: 404 });
    }) as typeof fetch);

    try {
      const res = await agent.post('/api/admin/skills/import-kit').send({
        sourceUrl: 'https://github.com/acme/many-skills/tree/main/catalog/writing',
      }).expect(201);

      expect(res.body.skill.slug).toBe('writing-coach');
      expect(res.body.files.map((file: { path: string }) => file.path)).toEqual(['SKILL.md', 'references/style.md']);
    } finally {
      setSkillKitImportFetchForTests(null);
      database.close();
    }
  });

  it('seeds native skills idempotently across repeated startup', async () => {
    const { app, agent, database } = await makeTestApp();
    await registerAdmin(agent, database);

    const first = await agent.get('/api/admin/skills').expect(200);
    const firstCount = first.body.skills.length;

    const { createApp } = await import('../app.js');
    await createApp({
      NODE_ENV: 'test',
      API_PORT: 0,
      WEB_ORIGIN: 'http://localhost:3000',
      DATABASE_URL: ':memory:',
      JWT_SECRET: 'test-jwt-secret-with-enough-length',
      APP_ENCRYPTION_KEY: 'test-encryption-secret-with-enough-length',
      FIRECRAWL_API_KEY: undefined,
      BRAVE_SEARCH_API_KEY: undefined,
      SCRAPLING_BASE_URL: undefined,
      WEB_SEARCH_ADAPTER: undefined,
      WEB_FETCH_ADAPTER: undefined,
      DEFAULT_PROVIDER_NAME: 'Microsoft Foundry Kimi',
      DEFAULT_PROVIDER_BASE_URL: 'https://foundry.example.com/openai/v1',
      DEFAULT_PROVIDER_MODEL: 'Kimi 2.6',
      LOG_LEVEL: 'silent',
      QA_FIXTURES_ENABLED: false,
    }, {
      database,
      logger: { debug() {}, info() {}, warn() {}, error() {}, child: () => ({ debug() {}, info() {}, warn() {}, error() {}, child: () => { throw new Error('unused'); } }) } as never,
    });

    const after = await agent.get('/api/admin/skills').expect(200);
    expect(after.body.skills).toHaveLength(firstCount);

    expect(app).toBeDefined();
    database.close();
  });
});
