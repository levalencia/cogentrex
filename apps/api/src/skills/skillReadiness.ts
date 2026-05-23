import type {
  AppMode,
  CapabilityStatus,
  ProviderCapabilityId,
  ProviderConfigView,
  SkillDetail,
  SkillReadiness,
  SkillReadinessDependency,
  ToolCapabilityId,
  WorkflowDefinition,
} from '@cogentrex/shared';
import type { AppEnv } from '../config/env.js';
import { providerHasCapability } from '../capabilities/providerCapabilities.js';
import { resolveToolCapability } from '../capabilities/toolCapabilities.js';
import { workflowDefinitions } from '../capabilities/workflows.js';

const toolCapabilityIds = new Set<string>(['web.search', 'web.fetch', 'web.extract']);

const capabilityLabels: Record<ProviderCapabilityId | ToolCapabilityId, string> = {
  text: 'Text generation provider',
  streaming: 'Streaming responses',
  vision: 'Vision/image understanding',
  'tool-calling': 'Tool calling',
  'provider-search': 'Provider-native search',
  image: 'Image generation provider',
  video: 'Video generation provider',
  'web.search': 'Web search tool',
  'web.fetch': 'URL fetch tool',
  'web.extract': 'URL extraction tool',
};

export function buildSkillReadiness(
  skills: SkillDetail[],
  providers: ProviderConfigView[],
  env: AppEnv,
): SkillReadiness[] {
  return skills.map((skill) => {
    const workflow = findWorkflowForSkill(skill);
    const dependencies = [
      ...providerDependencies(skill, workflow, providers),
      ...toolDependencies(skill, workflow, env),
    ];
    return {
      skill: toSkillSummary(skill),
      status: aggregateStatus(dependencies),
      dependencies,
    };
  });
}

function findWorkflowForSkill(skill: SkillDetail): WorkflowDefinition | undefined {
  const mode = skill.route?.mode;
  return workflowDefinitions.find((workflow) => workflow.id === mode);
}

function providerDependencies(
  skill: SkillDetail,
  workflow: WorkflowDefinition | undefined,
  providers: ProviderConfigView[],
): SkillReadinessDependency[] {
  const required = workflow?.requiredProviderCapabilities ?? fallbackRequiredProviderCapabilities(skill.route?.mode);
  const optional = workflow?.optionalProviderCapabilities ?? [];
  return [
    ...required.map((capability) => providerDependency(skill, capability, true, providers)),
    ...optional.map((capability) => providerDependency(skill, capability, false, providers)),
  ];
}

function providerDependency(
  skill: SkillDetail,
  capability: ProviderCapabilityId,
  required: boolean,
  providers: ProviderConfigView[],
): SkillReadinessDependency {
  const routedProvider = skill.route?.defaultProviderId
    ? providers.find((provider) => provider.id === skill.route?.defaultProviderId)
    : undefined;
  const provider = routedProvider && providerHasCapability(routedProvider, capability)
    ? routedProvider
    : providers.find((candidate) => providerHasCapability(candidate, capability));
  if (provider) {
    return {
      kind: 'provider',
      id: capability,
      label: capabilityLabels[capability],
      required,
      status: 'ready',
      adapterId: provider.id,
      message: `Satisfied by ${provider.name}.`,
    };
  }
  const routedMessage = routedProvider
    ? `${routedProvider.name} is selected for this skill but does not satisfy ${capability}.`
    : `No configured provider satisfies ${capability}.`;
  return {
    kind: 'provider',
    id: capability,
    label: capabilityLabels[capability],
    required,
    status: required ? 'missing' : 'degraded',
    message: required ? routedMessage : `Optional provider capability ${capability} is not configured.`,
  };
}

function toolDependencies(
  skill: SkillDetail,
  workflow: WorkflowDefinition | undefined,
  env: AppEnv,
): SkillReadinessDependency[] {
  const required = new Set<ToolCapabilityId>(workflow?.requiredToolCapabilities ?? []);
  const optional = new Set<ToolCapabilityId>(workflow?.optionalToolCapabilities ?? []);
  for (const requirement of skill.toolRequirements) {
    if (!isToolCapabilityId(requirement.name)) continue;
    if (requirement.required) {
      required.add(requirement.name);
      optional.delete(requirement.name);
    } else if (!required.has(requirement.name)) {
      optional.add(requirement.name);
    }
  }
  return [
    ...Array.from(required).map((capability) => toolDependency(capability, true, env)),
    ...Array.from(optional).map((capability) => toolDependency(capability, false, env)),
  ];
}

function toolDependency(capability: ToolCapabilityId, required: boolean, env: AppEnv): SkillReadinessDependency {
  const resolved = resolveToolCapability(env, capability);
  return {
    kind: 'tool',
    id: capability,
    label: capabilityLabels[capability],
    required,
    status: resolved.status,
    adapterId: resolved.adapterId,
    message: resolved.message,
  };
}

function fallbackRequiredProviderCapabilities(mode: AppMode | undefined): ProviderCapabilityId[] {
  if (mode === 'IMAGE_GENERATION') return ['image'];
  if (mode === 'VIDEO_GENERATION') return ['video'];
  return ['text'];
}

function aggregateStatus(dependencies: SkillReadinessDependency[]): CapabilityStatus {
  const required = dependencies.filter((dependency) => dependency.required);
  if (required.some((dependency) => dependency.status === 'missing')) return 'missing';
  if (required.some((dependency) => dependency.status === 'degraded')) return 'degraded';
  const degradedOptionalTools = dependencies.some(
    (dependency) => dependency.kind === 'tool' && !dependency.required && dependency.status !== 'ready',
  );
  return degradedOptionalTools ? 'degraded' : 'ready';
}

function isToolCapabilityId(value: string): value is ToolCapabilityId {
  return toolCapabilityIds.has(value);
}

function toSkillSummary(skill: SkillDetail): SkillReadiness['skill'] {
  return {
    id: skill.id,
    slug: skill.slug,
    name: skill.name,
    description: skill.description,
    kind: skill.kind,
    status: skill.status,
    visibility: skill.visibility,
    category: skill.category,
    icon: skill.icon,
    route: skill.route,
    createdAt: skill.createdAt,
    updatedAt: skill.updatedAt,
  };
}
