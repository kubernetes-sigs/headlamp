import { z } from 'zod';
import { API_VERSION, Cluster, ClusterInventory, GenerateRequest, Insight, InsightsProvider, insightSchema } from './types';

export type ArmTransport = (path: string, method: 'GET' | 'POST', body?: GenerateRequest, signal?: AbortSignal) => Promise<unknown>;
const clusterSchema = z.object({
  id: z.string(), name: z.string(), location: z.string(),
  properties: z.object({
    kubernetesVersion: z.string().optional(),
    currentKubernetesVersion: z.string().optional(),
    agentPoolProfiles: z.array(z.object({
      name: z.string(), orchestratorVersion: z.string().optional(),
      currentOrchestratorVersion: z.string().optional(), nodeImageVersion: z.string().optional(),
    })).optional(),
  }),
});
export function clusterBase(cluster: Cluster) {
  if (!/^\/subscriptions\/[a-zA-Z0-9-]+\/resourceGroups\/[^/]+\/providers\/Microsoft\.ContainerService\/managedClusters\/[^/?#]+$/i.test(cluster.id)) {
    throw new Error('Invalid AKS resource ID.');
  }
  return cluster.id.split('/').map(segment => encodeURIComponent(segment)).join('/');
}
export class ArmProvider implements InsightsProvider {
  readonly mode = 'live';
  constructor(private transport: ArmTransport, private subscriptions: string[]) {
    if (!subscriptions.length || subscriptions.some(s => !/^[a-f0-9-]{36}$/i.test(s))) throw new Error('Supply valid Azure subscription IDs.');
  }
  private async pages<T>(path: string, schema: z.ZodType<T>, signal?: AbortSignal): Promise<T[]> {
    const result: T[] = [];
    const seen = new Set<string>();
    let next: string | undefined = path;
    while (next) {
      if (seen.has(next) || seen.size >= 100) throw new Error('ARM pagination loop or page limit reached.');
      seen.add(next);
      const response: unknown = await this.transport(next, 'GET', undefined, signal);
      const page: { value: T[]; nextLink?: string } = z.object({ value: z.array(schema), nextLink: z.string().optional() }).parse(response);
      result.push(...page.value);
      if (page.nextLink) {
        const url = new URL(page.nextLink, 'https://management.azure.com');
        if (url.origin !== 'https://management.azure.com' || !url.pathname.toLowerCase().startsWith('/subscriptions/')) {
          throw new Error('Untrusted ARM pagination URL.');
        }
        next = `${url.pathname}${url.search}`;
      } else next = undefined;
    }
    return result;
  }
  async listClusters(signal?: AbortSignal): Promise<ClusterInventory> {
    const groups = await Promise.allSettled(this.subscriptions.map(async sub => {
      const values = await this.pages(`/subscriptions/${sub}/providers/Microsoft.ContainerService/managedClusters?api-version=${API_VERSION}`, clusterSchema, signal);
      return values.map(c => ({
        id: c.id, name: c.name, subscription: sub, resourceGroup: c.id.split('/')[4],
        location: c.location, kubernetesVersion: c.properties.currentKubernetesVersion ?? c.properties.kubernetesVersion,
        poolInventoryKnown: c.properties.agentPoolProfiles !== undefined,
        pools: (c.properties.agentPoolProfiles ?? []).map(p => ({
          name: p.name, version: p.currentOrchestratorVersion ?? p.orchestratorVersion, nodeImageVersion: p.nodeImageVersion,
        })),
      }));
    }));
    if (signal?.aborted) throw new DOMException('Aborted', 'AbortError');
    const clusters: Cluster[] = [], warnings: string[] = [];
    groups.forEach((group, index) => {
      if (group.status === 'fulfilled') clusters.push(...group.value);
      else warnings.push(`Subscription ${this.subscriptions[index]}: ${group.reason instanceof Error ? group.reason.message : 'Inventory request failed.'}`);
    });
    if (groups.every(g => g.status === 'rejected')) throw new Error(warnings.join('\n'));
    return { clusters, warnings };
  }
  listInsights(cluster: Cluster, signal?: AbortSignal): Promise<Insight[]> {
    return this.pages(`${clusterBase(cluster)}/upgradeInsights?api-version=${API_VERSION}`, insightSchema, signal);
  }
  async generate(cluster: Cluster, request: GenerateRequest, signal?: AbortSignal): Promise<Insight> {
    const response = await this.transport(`${clusterBase(cluster)}/generateUpgradeInsights?api-version=${API_VERSION}`, 'POST', request, signal);
    return insightSchema.parse(response);
  }
}
export function bridgeTransport(pairingKey: string): ArmTransport {
  return async (path, method, body, signal) => {
    const response = await fetch('http://127.0.0.1:4319/arm', {
      method: 'POST', signal, cache: 'no-store',
      headers: { 'Content-Type': 'application/json', 'X-Bridge-Key': pairingKey },
      body: JSON.stringify({ path, method, body }),
    });
    const data: unknown = await response.json();
    if (!response.ok) {
      const error = z.object({ error: z.string() }).safeParse(data);
      throw new Error(error.success ? error.data.error : `Bridge request failed (${response.status}).`);
    }
    return data;
  };
}
