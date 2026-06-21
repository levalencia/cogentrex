import { Router } from 'express';
import { adminSkillTestSchema, createSkillSchema, importSkillKitSchema, updateSkillRouteSchema, updateSkillSchema } from '@cogentrex/shared';
import { currentUser, requireAuth, requireAdmin } from '../auth/authMiddleware.js';
import type { AuthService } from '../auth/authService.js';
import type { AppEnv } from '../config/env.js';
import type { ProviderService } from '../providers/providerService.js';
import type { SkillService } from './skillService.js';
import { buildSkillReadiness } from './skillReadiness.js';

import type { SkillRunRepository } from './skillRunRepository.js';
import type { LanguageModelClient, ModelMessage } from '../chat/languageModel.js';


function buildAdminTestMessages(input: {
  skillName: string;
  skillDescription: string;
  skillInstructions: string;
  prompt: string;
}): ModelMessage[] {
  const instructions = input.skillInstructions.trim() || 'No SKILL.md instructions were found. Use the skill name and description as the operating context.';
  return [
    {
      role: 'system',
      content: [
        'You are running an admin QA test for a Cogentrex governed skill package.',
        'Follow the skill instructions exactly enough for the admin to judge whether this package is safe to publish.',
        'Return the actual assistant output only. Do not mention that this is a test unless the user prompt asks for it.',
        '',
        `Skill: ${input.skillName}`,
        `Description: ${input.skillDescription}`,
        '',
        'SKILL.md / package instructions:',
        instructions,
      ].join('\n'),
    },
    { role: 'user', content: input.prompt },
  ];
}

function selectSkillInstructions(files: Awaited<ReturnType<SkillService['listFiles']>>): string {
  const skillFile = files.find((file) => file.kind === 'skill' || file.path.toLowerCase().endsWith('skill.md'));
  return skillFile?.content ?? '';
}

export function skillRoutes(auth: AuthService, skills: SkillService, providers: ProviderService, env: AppEnv, skillRuns: SkillRunRepository): Router {
  const router = Router();
  router.use(requireAuth(auth));

  router.get('/', async (_req, res, next) => {
    try {
      res.json({ skills: await skills.listVisible() });
    } catch (error) {
      next(error);
    }
  });

  router.get('/readiness', async (req, res, next) => {
    try {
      const user = currentUser(req);
      const [visibleSkills, availableProviders] = await Promise.all([
        skills.listVisibleDetails(),
        providers.list(user.id),
      ]);
      res.json({ skills: buildSkillReadiness(visibleSkills, availableProviders, env) });
    } catch (error) {
      next(error);
    }
  });

  router.get('/runs', async (req, res, next) => {
    try {
      const user = currentUser(req);
      const limit = typeof req.query.limit === 'string' ? Number.parseInt(req.query.limit, 10) : 50;
      res.json({ runs: await skillRuns.listForUser(user.id, Number.isFinite(limit) ? limit : 50) });
    } catch (error) {
      next(error);
    }
  });

  router.get('/runs/:id/events', async (req, res, next) => {
    try {
      const user = currentUser(req);
      const events = await skillRuns.listEventsForUserRun(user.id, req.params.id);
      if (!events) {
        res.status(404).json({ error: { message: 'Skill run not found' } });
        return;
      }
      res.json({ events });
    } catch (error) {
      next(error);
    }
  });

  router.get('/:slug', async (req, res, next) => {
    try {
      res.json({ skill: await skills.getVisible(req.params.slug) });
    } catch (error) {
      next(error);
    }
  });

  return router;
}

export function runRoutes(auth: AuthService, skillRuns: SkillRunRepository): Router {
  const router = Router();
  router.use(requireAuth(auth));

  router.get('/', async (req, res, next) => {
    try {
      const user = currentUser(req);
      const limit = typeof req.query.limit === 'string' ? Number.parseInt(req.query.limit, 10) : 50;
      res.json({ runs: await skillRuns.listForUser(user.id, Number.isFinite(limit) ? limit : 50) });
    } catch (error) {
      next(error);
    }
  });

  router.get('/:id', async (req, res, next) => {
    try {
      const user = currentUser(req);
      const run = await skillRuns.getForUser(user.id, req.params.id);
      if (!run) {
        res.status(404).json({ error: { message: 'Run not found' } });
        return;
      }
      const events = await skillRuns.listEventsForUserRun(user.id, req.params.id);
      res.json({ run, events: events ?? [] });
    } catch (error) {
      next(error);
    }
  });

  router.get('/:id/events', async (req, res, next) => {
    try {
      const user = currentUser(req);
      const events = await skillRuns.listEventsForUserRun(user.id, req.params.id);
      if (!events) {
        res.status(404).json({ error: { message: 'Run not found' } });
        return;
      }
      res.json({ events });
    } catch (error) {
      next(error);
    }
  });

  return router;
}

export function adminSkillRoutes(auth: AuthService, skills: SkillService, providers: ProviderService, llm: LanguageModelClient, skillRuns: SkillRunRepository): Router {
  const router = Router();
  router.use(requireAuth(auth));
  router.use(requireAdmin());

  router.get('/', async (req, res, next) => {
    try {
      const admin = currentUser(req);
      res.json({ skills: await skills.listAll(), admin });
    } catch (error) {
      next(error);
    }
  });

  router.post('/import-kit', async (req, res, next) => {
    try {
      const input = importSkillKitSchema.parse(req.body);
      const result = await skills.importSkillKit(input);
      res.status(201).json(result);
    } catch (error) {
      next(error);
    }
  });

  router.post('/', async (req, res, next) => {
    try {
      const input = createSkillSchema.parse(req.body);
      const result = await skills.createSkill(input);
      res.status(201).json(result);
    } catch (error) {
      next(error);
    }
  });

  router.get('/:slug/files', async (req, res, next) => {
    try {
      res.json({ files: await skills.listFiles(req.params.slug) });
    } catch (error) {
      next(error);
    }
  });

  router.patch('/:slug', async (req, res, next) => {
    try {
      const input = updateSkillSchema.parse(req.body);
      res.json({ skill: await skills.updateSkill(req.params.slug, input) });
    } catch (error) {
      next(error);
    }
  });


  router.post('/:slug/test', async (req, res, next) => {
    try {
      const admin = currentUser(req);
      const input = adminSkillTestSchema.parse(req.body);
      const skill = await skills.getAdmin(req.params.slug);
      if (!skill.route) {
        res.status(400).json({ error: { message: 'Skill route must be configured before running an admin test' } });
        return;
      }
      const skillFiles = await skills.listFiles(skill.slug);
      const providerId = input.providerId ?? skill.route.defaultProviderId ?? undefined;
      const provider = await providers.resolveForMode(admin.id, skill.route.mode, providerId);
      const started = performance.now();
      const observabilityBase = {
        isAdminTest: true,
        testPrompt: input.prompt,
        exampleId: input.exampleId ?? null,
        routeMode: skill.route.mode,
        promptLength: input.prompt.length,
      };
      const run = await skillRuns.create({
        userId: admin.id,
        skillId: skill.id,
        skillSlug: skill.slug,
        skillName: skill.name,
        mode: skill.route.mode,
        providerId: provider.id,
        observability: observabilityBase,
      });
      await skillRuns.safeAppendEvent(run.id, admin.id, {
        eventType: 'admin_test_prompt_ready',
        label: 'Admin test prompt prepared',
        message: input.prompt.slice(0, 500),
        metadata: observabilityBase,
      });
      try {
        const output = await llm.complete(provider, buildAdminTestMessages({
          skillName: skill.name,
          skillDescription: skill.description,
          skillInstructions: selectSkillInstructions(skillFiles),
          prompt: input.prompt,
        }));
        const durationMs = Math.round(performance.now() - started);
        const observability = {
          ...observabilityBase,
          durationMs,
          outputLength: output.length,
          providerName: provider.name,
          model: provider.model,
        };
        await skillRuns.safeAppendEvent(run.id, admin.id, {
          eventType: 'admin_test_output_received',
          label: 'Admin test output received',
          message: output.slice(0, 500),
          metadata: observability,
        });
        await skillRuns.complete(run.id, { status: 'completed', observability });
        const completedRun = await skillRuns.getForUser(admin.id, run.id);
        res.json({
          run: completedRun ?? run,
          output,
          prompt: input.prompt,
          skill: { slug: skill.slug, name: skill.name },
          provider: { id: provider.id, name: provider.name, model: provider.model },
          durationMs,
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Admin test failed';
        await skillRuns.safeComplete(run.id, { status: 'failed', errorMessage: message, observability: { ...observabilityBase, errorMessage: message } });
        throw error;
      }
    } catch (error) {
      next(error);
    }
  });

  router.put('/:slug/route', async (req, res, next) => {
    try {
      const input = updateSkillRouteSchema.parse(req.body);
      res.json({ route: await skills.updateRoute(req.params.slug, input) });
    } catch (error) {
      next(error);
    }
  });

  return router;
}
