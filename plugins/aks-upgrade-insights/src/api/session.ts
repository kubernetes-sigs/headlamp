import { DemoProvider } from './demo';
import { InsightsProvider } from './types';

export const demoProvider = new DemoProvider();
let activeProvider: InsightsProvider = demoProvider;

export function getActiveProvider() {
  return activeProvider;
}

export function setActiveProvider(provider: InsightsProvider) {
  activeProvider = provider;
}
