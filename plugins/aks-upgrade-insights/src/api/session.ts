import { DemoProvider } from './demo';
import { InsightsProvider } from './types';

export const demoProvider = new DemoProvider();
let activeProvider: InsightsProvider = demoProvider;
const contextResources = new WeakMap<InsightsProvider, Map<string, string>>();

export function getContextResource(provider: InsightsProvider, context: string) {
  return contextResources.get(provider)?.get(context);
}

export function setContextResource(provider: InsightsProvider, context: string, resourceId: string) {
  const resources = contextResources.get(provider) ?? new Map<string, string>();
  resources.set(context, resourceId);
  contextResources.set(provider, resources);
}

export function getActiveProvider() {
  return activeProvider;
}

export function setActiveProvider(provider: InsightsProvider) {
  activeProvider = provider;
}
