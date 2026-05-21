import type { CapabilityReadinessItem, CapabilityStatus, ProviderCapabilityId, WorkflowReadiness } from '@cogentrex/shared';
import type { AppEnv } from '../config/env.js';
import type { ProviderService } from '../providers/providerService.js';
import { workflowDefinitions } from './workflows.js';
import { findProviderForCapability } from './providerCapabilities.js';
import { resolveToolCapability } from './toolCapabilities.js';

export class CapabilityService {
  constructor(
    private readonly providers: ProviderService,
    private readonly env: AppEnv,
  ) {}

  async listWorkflowReadiness(userId: string): Promise<WorkflowReadiness[]> {
    const providers = await this.providers.list(userId);
    return workflowDefinitions.map((workflow) => {
      const requiredProviders = workflow.requiredProviderCapabilities.map((capability) => {
        const provider = findProviderForCapability(providers, capability);
        return provider
          ? readiness(capability, 'ready', undefined, `Satisfied by ${provider.name}.`)
          : readiness(capability, 'missing', undefined, `No provider satisfies ${capability}.`);
      });
      const optionalProviders = workflow.optionalProviderCapabilities.map((capability) => {
        const provider = findProviderForCapability(providers, capability);
        return provider
          ? readiness(capability, 'ready', undefined, `Satisfied by ${provider.name}.`)
          : readiness(capability, 'missing', undefined, `Optional provider capability ${capability} is not configured.`);
      });

      const requiredTools = workflow.requiredToolCapabilities.map((capability) => resolveToolCapability(this.env, capability));
      const optionalTools = workflow.optionalToolCapabilities.map((capability) => resolveToolCapability(this.env, capability));
      const providersReadiness = [...requiredProviders, ...optionalProviders];
      const toolsReadiness = [...requiredTools, ...optionalTools];

      const hasMissingRequired = [...requiredProviders, ...requiredTools].some((item) => item.status === 'missing');
      const hasDegradedRequired = [...requiredProviders, ...requiredTools].some((item) => item.status === 'degraded');
      const hasMissingOrDegradedOptionalTools = optionalTools.some((item) => item.status !== 'ready');
      const status: CapabilityStatus = hasMissingRequired
        ? 'missing'
        : hasDegradedRequired || hasMissingOrDegradedOptionalTools
          ? 'degraded'
          : 'ready';

      return {
        workflow,
        status,
        providers: providersReadiness,
        tools: toolsReadiness,
      };
    });
  }
}

function readiness(
  id: ProviderCapabilityId,
  status: CapabilityStatus,
  adapterId?: string,
  message?: string,
): CapabilityReadinessItem {
  return { id, status, adapterId, message };
}
