import type { ProviderCapabilityId, ProviderConfigView } from '@cogentrex/shared';

export function providerHasCapability(provider: ProviderConfigView, capability: ProviderCapabilityId): boolean {
  switch (capability) {
    case 'text':
      return provider.kind !== 'IMAGE_GENERATION' && provider.kind !== 'VIDEO_GENERATION';
    case 'streaming':
      return provider.supportsStreaming;
    case 'vision':
      return provider.supportsVision;
    case 'tool-calling':
      return provider.supportsTools;
    case 'provider-search':
      return provider.supportsSearch;
    case 'image':
      return provider.kind === 'IMAGE_GENERATION' || provider.supportsImage;
    case 'video':
      return provider.kind === 'VIDEO_GENERATION' || provider.supportsVideo;
    default:
      return false;
  }
}

export function findProviderForCapability(
  providers: ProviderConfigView[],
  capability: ProviderCapabilityId,
): ProviderConfigView | undefined {
  return providers.find((provider) => providerHasCapability(provider, capability));
}
