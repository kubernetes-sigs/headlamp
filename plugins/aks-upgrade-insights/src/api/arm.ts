import { z } from 'zod';
import { API_VERSION, Cluster, ClusterInventory, GenerateRequest, Insight, InsightsProvider, insightSchema, UpgradeTargetScope } from './types';

const FLEET_API_VERSION = '2025-03-01';
const UPGRADE_PROFILE_API_VERSION = '2024-10-01';
const INSIGHT_CACHE_TTL_MS = 60_000;
export type ArmTransport = (path: string, method: 'GET' | 'POST', body?: GenerateRequest, signal?: AbortSignal) => Promise<unknown>;
const fleetSchema = z.object({ id: z.string(), name: z.string() }).passthrough();
const fleetMemberSchema = z.object({
  properties: z.object({ clusterResourceId: z.string() }).passthrough(),
}).passthrough();
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
const targetProfileSchema = z.object({
  upgrades: z.array(z.object({ kubernetesVersion: z.string() }).passthrough()).nullish(),
}).passthrough();
const upgradeProfileSchema = z.object({
  properties: z.object({ controlPlaneProfile: targetProfileSchema }).passthrough(),
}).passthrough();
const agentPoolUpgradeProfileSchema = z.object({ properties: targetProfileSchema }).passthrough();
export class ArmRequestError extends Error {
  constructor(
    readonly status: number,
    message: string,
    readonly code?: string,
    readonly requestId?: string,
    readonly retryAfter?: string
  ) {
    super(`${code ? `${code}: ` : ''}${message} (HTTP ${status})${requestId ? ` Request ID: ${requestId}` : ''}`);
    this.name = 'ArmRequestError';
  }
}
export function clusterBase(cluster: Cluster) {
  if (!/^\/subscriptions\/[a-zA-Z0-9-]+\/resourceGroups\/[^/]+\/providers\/Microsoft\.ContainerService\/managedClusters\/[^/?#]+$/i.test(cluster.id)) {
    throw new Error('Invalid AKS resource ID.');
  }
  return cluster.id.split('/').map(segment => encodeURIComponent(segment)).join('/');
}
export class ArmProvider implements InsightsProvider {
  readonly mode = 'live';
  private insightCache = new Map<string, { expiresAt: number; insights: Insight[] }>();
  private upgradeTargetCache = new Map<string, { expiresAt: number; targets: string[] }>();
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
    const loadSubscription = async (sub: string) => {
      const values = await this.pages(`/subscriptions/${sub}/providers/Microsoft.ContainerService/managedClusters?api-version=${API_VERSION}`, clusterSchema, signal);
      const memberships = new Map<string, { id: string; name: string }[]>();
      const fleetWarnings: string[] = [];
      let fleetMembershipKnown = true;
      try {
        const fleets = await this.pages(
          `/subscriptions/${sub}/providers/Microsoft.ContainerService/fleets?api-version=${FLEET_API_VERSION}`,
          fleetSchema,
          signal
        );
        for (const fleet of fleets) {
          try {
            const members = await this.pages(`${fleet.id}/members?api-version=${FLEET_API_VERSION}`, fleetMemberSchema, signal);
            for (const member of members) {
              const key = member.properties.clusterResourceId.toLowerCase();
              const clusterFleets = memberships.get(key) ?? [];
              clusterFleets.push({ id: fleet.id, name: fleet.name });
              memberships.set(key, clusterFleets);
            }
          } catch (error) {
            if (signal?.aborted) throw error;
            fleetMembershipKnown = false;
            fleetWarnings.push(`Fleet ${fleet.name} in subscription ${sub}: ${error instanceof Error ? error.message : 'Membership request failed.'}`);
          }
        }
      } catch (error) {
        if (signal?.aborted) throw error;
        fleetMembershipKnown = false;
        fleetWarnings.push(`Subscription ${sub}: ${error instanceof Error ? error.message : 'Fleet discovery failed.'}`);
      }
      return {
        clusters: values.map(c => ({
          id: c.id, name: c.name, subscription: sub, resourceGroup: c.id.split('/')[4],
          location: c.location, kubernetesVersion: c.properties.currentKubernetesVersion ?? c.properties.kubernetesVersion,
          poolInventoryKnown: c.properties.agentPoolProfiles !== undefined,
          pools: (c.properties.agentPoolProfiles ?? []).map(p => ({
            name: p.name, version: p.currentOrchestratorVersion ?? p.orchestratorVersion, nodeImageVersion: p.nodeImageVersion,
          })),
        })),
        memberships,
        fleetMembershipKnown,
        fleetWarnings,
      };
    };
    const groups: PromiseSettledResult<Awaited<ReturnType<typeof loadSubscription>>>[] = [];
    for (let index = 0; index < this.subscriptions.length; index += 4) {
      groups.push(...await Promise.allSettled(this.subscriptions.slice(index, index + 4).map(loadSubscription)));
    }
    if (signal?.aborted) throw new DOMException('Aborted', 'AbortError');
    const clusters: Cluster[] = [], warnings: string[] = [], fleetWarnings: string[] = [];
    const memberships = new Map<string, { id: string; name: string }[]>();
    let fleetMembershipKnown = true;
    groups.forEach((group, index) => {
      if (group.status === 'fulfilled') {
        clusters.push(...group.value.clusters);
        group.value.memberships.forEach((fleets, id) => memberships.set(id, [...(memberships.get(id) ?? []), ...fleets]));
        fleetWarnings.push(...group.value.fleetWarnings);
        fleetMembershipKnown &&= group.value.fleetMembershipKnown;
      } else {
        warnings.push(`Subscription ${this.subscriptions[index]}: ${group.reason instanceof Error ? group.reason.message : 'Inventory request failed.'}`);
        fleetWarnings.push(`Subscription ${this.subscriptions[index]}: fleet membership coverage is incomplete because inventory access failed.`);
        fleetMembershipKnown = false;
      }
    });
    if (groups.every(g => g.status === 'rejected')) throw new Error(warnings.join('\n'));
    clusters.forEach(cluster => {
      cluster.fleets = memberships.get(cluster.id.toLowerCase()) ?? [];
      cluster.fleetMembershipKnown = fleetMembershipKnown;
    });
    return { clusters, warnings, fleetWarnings };
  }
  async listInsights(cluster: Cluster, signal?: AbortSignal, forceRefresh = false): Promise<Insight[]> {
    if (signal?.aborted) throw new DOMException('Aborted', 'AbortError');
    const key = cluster.id.toLowerCase();
    const cached = this.insightCache.get(key);
    if (!forceRefresh && cached && cached.expiresAt > Date.now()) return structuredClone(cached.insights);
    const insights = await this.pages(`${clusterBase(cluster)}/upgradeInsights?api-version=${API_VERSION}`, insightSchema, signal);
    if (signal?.aborted) throw new DOMException('Aborted', 'AbortError');
    const now = Date.now();
    for (const [cacheKey, entry] of this.insightCache) {
      if (entry.expiresAt <= now) this.insightCache.delete(cacheKey);
    }
    this.insightCache.set(key, { expiresAt: now + INSIGHT_CACHE_TTL_MS, insights });
    return structuredClone(insights);
  }
  async getInsight(cluster: Cluster, resourceId: string, signal?: AbortSignal): Promise<Insight> {
    const prefix = `${cluster.id}/upgradeInsights/`;
    const name = resourceId.slice(prefix.length);
    if (!resourceId.toLowerCase().startsWith(prefix.toLowerCase()) || !name ||
        /[/?#\\]/.test(name) || name === '.' || name === '..') {
      throw new Error('Insight resource ID must belong to the selected AKS cluster.');
    }
    try {
      return insightSchema.parse(await this.transport(
        `${clusterBase(cluster)}/upgradeInsights/${encodeURIComponent(name)}?api-version=${API_VERSION}`,
        'GET', undefined, signal
      ));
    } catch (error) {
      if (error instanceof ArmRequestError && error.status === 404) {
        this.insightCache.delete(cluster.id.toLowerCase());
      }
      throw error;
    }
  }
  async listUpgradeTargets(cluster: Cluster, scope: UpgradeTargetScope, signal?: AbortSignal): Promise<string[]> {
    if (signal?.aborted) throw new DOMException('Aborted', 'AbortError');
    const key = `${cluster.id.toLowerCase()}/${scope.upgradeType}/${scope.upgradeType === 'AgentPool' ? scope.agentPoolName : ''}`;
    const cached = this.upgradeTargetCache.get(key);
    if (cached && cached.expiresAt > Date.now()) return structuredClone(cached.targets);
    let selected: z.infer<typeof targetProfileSchema>;
    if (scope.upgradeType === 'AgentPool') {
      if (!cluster.pools.some(pool => pool.name === scope.agentPoolName)) {
        throw new Error('The selected node pool is not present in the cluster inventory.');
      }
      selected = agentPoolUpgradeProfileSchema.parse(await this.transport(
        `${clusterBase(cluster)}/agentPools/${encodeURIComponent(scope.agentPoolName)}/upgradeProfiles/default?api-version=${UPGRADE_PROFILE_API_VERSION}`,
        'GET', undefined, signal
      )).properties;
    } else {
      selected = upgradeProfileSchema.parse(await this.transport(
        `${clusterBase(cluster)}/upgradeProfiles/default?api-version=${UPGRADE_PROFILE_API_VERSION}`,
        'GET', undefined, signal
      )).properties.controlPlaneProfile;
    }
    const targets = new Set((selected.upgrades ?? []).map(upgrade => upgrade.kubernetesVersion));
    const sorted = [...targets].sort((left, right) => left.localeCompare(right, undefined, { numeric: true }));
    const now = Date.now();
    for (const [cacheKey, entry] of this.upgradeTargetCache) {
      if (entry.expiresAt <= now) this.upgradeTargetCache.delete(cacheKey);
    }
    this.upgradeTargetCache.set(key, { expiresAt: now + INSIGHT_CACHE_TTL_MS, targets: sorted });
    return structuredClone(sorted);
  }
  async generate(cluster: Cluster, request: GenerateRequest, signal?: AbortSignal): Promise<Insight> {
    const response = await this.transport(`${clusterBase(cluster)}/generateUpgradeInsights?api-version=${API_VERSION}`, 'POST', request, signal);
    this.insightCache.delete(cluster.id.toLowerCase());
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
      const detailSchema = z.object({ code: z.string().optional(), message: z.string() }).passthrough();
      const envelope = z.object({
        error: z.union([z.string(), detailSchema]),
      }).passthrough().safeParse(data);
      const bare = detailSchema.safeParse(data);
      const detail = envelope.success ? envelope.data.error : bare.success ? bare.data : undefined;
      throw new ArmRequestError(
        response.status,
        typeof detail === 'string' ? detail : detail?.message ?? 'ARM bridge request failed.',
        typeof detail === 'object' ? detail.code : undefined,
        response.headers.get('x-ms-request-id') ?? response.headers.get('x-ms-correlation-request-id') ?? undefined,
        response.headers.get('retry-after') ?? undefined
      );
    }
    return data;
  };
}
