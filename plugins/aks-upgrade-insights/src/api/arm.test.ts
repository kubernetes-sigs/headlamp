import { describe, expect, it, vi } from 'vitest';
import { ArmProvider, ArmRequestError, clusterBase, bridgeTransport } from './arm';
import { demoClusters } from './demo';
import { API_VERSION, insightListSchema, insightSchema } from './types';

const subscription = '00000000-0000-0000-0000-000000000000';
const resource = { name: 'controlPlane', properties: { upgradeType: 'ControlPlane', provisioningState: 'Succeeded', targetKubernetesVersion: '1.34.2' } };
describe('ARM contract', () => {
  it('uses the preview API and follows paginated insight responses', async () => {
    const transport = vi.fn().mockResolvedValueOnce({ value: [resource], nextLink: `https://management.azure.com${demoClusters[0].id}/upgradeInsights?api-version=${API_VERSION}&$skiptoken=abc` }).mockResolvedValueOnce({ value: [resource] });
    const provider = new ArmProvider(transport, [subscription]);
    expect(await provider.listInsights(demoClusters[0])).toHaveLength(2);
    expect(transport.mock.calls[0][0]).toBe(`${demoClusters[0].id}/upgradeInsights?api-version=${API_VERSION}`);
    expect(transport.mock.calls[0][1]).toBe('GET');
    expect(transport.mock.calls[1][0]).toContain('$skiptoken=abc');
  });
  it('aggregates clusters client-side with source versions and pools', async () => {
    const transport = vi.fn(async (path: string) => path.includes('/managedClusters?') ? { value: [{
      id: demoClusters[0].id, name: 'test', location: 'eastus',
      properties: { kubernetesVersion: '1.33.1', currentKubernetesVersion: '1.33.2', agentPoolProfiles: [{ name: 'system', orchestratorVersion: '1.33.2', nodeImageVersion: 'old-image' }] },
    }] } : { value: [] });
    const { clusters } = await new ArmProvider(transport, [subscription]).listClusters();
    expect(clusters[0].kubernetesVersion).toBe('1.33.2'); expect(clusters[0].pools[0].name).toBe('system');
    expect(transport.mock.calls[0][0]).toContain(`/subscriptions/${subscription}/providers/Microsoft.ContainerService/managedClusters?`);
    expect(clusters[0].fleetMembershipKnown).toBe(true);
    expect(clusters[0].fleets).toEqual([]);
  });
  it('associates clusters with optional Fleet members across subscriptions', async () => {
    const fleetId = `/subscriptions/${subscription}/resourceGroups/rg-fleet/providers/Microsoft.ContainerService/fleets/production`;
    const transport = vi.fn(async (path: string) => {
      if (path.includes('/managedClusters?')) return { value: [{ id: demoClusters[0].id, name: 'test', location: 'eastus', properties: {} }] };
      if (path.includes('/fleets?')) return { value: [{ id: fleetId, name: 'production' }] };
      if (path.includes('/members?')) return { value: [{ properties: { clusterResourceId: demoClusters[0].id } }] };
      throw new Error(`Unexpected path: ${path}`);
    });
    const { clusters, fleetWarnings } = await new ArmProvider(transport, [subscription]).listClusters();
    expect(clusters[0].fleets).toEqual([{ id: fleetId, name: 'production' }]);
    expect(clusters[0].fleetMembershipKnown).toBe(true);
    expect(fleetWarnings).toEqual([]);
  });
  it('does not report standalone when Fleet membership cannot be read', async () => {
    const transport = vi.fn(async (path: string) => {
      if (path.includes('/managedClusters?')) return { value: [{ id: demoClusters[0].id, name: 'test', location: 'eastus', properties: {} }] };
      throw new Error('Forbidden');
    });
    const result = await new ArmProvider(transport, [subscription]).listClusters();
    expect(result.clusters[0].fleetMembershipKnown).toBe(false);
    expect(result.clusters[0].fleets).toEqual([]);
    expect(result.fleetWarnings[0]).toContain('Forbidden');
  });
  it('caches stored insight reads briefly and supports explicit refresh', async () => {
    const cacheCluster = {
      ...demoClusters[0],
      id: `${demoClusters[0].id}-cache-test`,
      name: 'cache-test',
    };
    const transport = vi.fn().mockResolvedValue({ value: [resource] });
    const provider = new ArmProvider(transport, [subscription]);
    const first = await provider.listInsights(cacheCluster);
    const cached = await provider.listInsights(cacheCluster);
    expect(cached).toEqual(first);
    expect(transport).toHaveBeenCalledTimes(1);
    await provider.listInsights(cacheCluster, undefined, true);
    expect(transport).toHaveBeenCalledTimes(2);
  });
  it('loads available Kubernetes upgrade targets for dropdown selection', async () => {
    const clusterProfile = {
      id: `${demoClusters[0].id}/upgradeProfiles/default`, name: 'default',
      properties: {
        controlPlaneProfile: { upgrades: [{ kubernetesVersion: '1.35.1' }, { kubernetesVersion: '1.34.2' }] },
        agentPoolProfiles: null,
      },
    };
    const transport = vi.fn(async (path: string) => path.includes('/agentPools/')
      ? { properties: { upgrades: [{ kubernetesVersion: path.includes('/workloads/') ? '1.36.0' : '1.34.2' }] } }
      : clusterProfile);
    const provider = new ArmProvider(transport, [subscription]);
    const targets = await provider.listUpgradeTargets(demoClusters[0], { upgradeType: 'ControlPlane' });
    expect(targets).toEqual(['1.34.2', '1.35.1']);
    expect(await provider.listUpgradeTargets(demoClusters[0], { upgradeType: 'ControlPlaneAndAgentPools' })).toEqual(targets);
    expect(await provider.listUpgradeTargets(demoClusters[0], { upgradeType: 'AgentPool', agentPoolName: 'workloads' })).toEqual(['1.36.0']);
    expect(await provider.listUpgradeTargets(demoClusters[0], { upgradeType: 'AgentPool', agentPoolName: 'system' })).toEqual(['1.34.2']);
    expect(transport.mock.calls[0][0]).toBe(`${demoClusters[0].id}/upgradeProfiles/default?api-version=2024-10-01`);
    expect(transport).toHaveBeenCalledWith(`${demoClusters[0].id}/agentPools/workloads/upgradeProfiles/default?api-version=2024-10-01`, 'GET', undefined, undefined);
  });
  it('rejects flattened or incomplete upgrade profiles instead of silently returning no targets', async () => {
    for (const response of [
      { controlPlaneProfile: { upgrades: [] } }, { properties: {} },
    ]) {
      const provider = new ArmProvider(vi.fn().mockResolvedValue(response), [subscription]);
      await expect(provider.listUpgradeTargets(demoClusters[0], { upgradeType: 'ControlPlane' })).rejects.toThrow();
    }
  });
  it('reports a missing selected pool without falling back to another scope', async () => {
    const provider = new ArmProvider(vi.fn().mockResolvedValue({
      properties: { controlPlaneProfile: { upgrades: [{ kubernetesVersion: '1.35.1' }] } },
    }), [subscription]);
    await expect(provider.listUpgradeTargets(demoClusters[0], { upgradeType: 'AgentPool', agentPoolName: 'missing' })).rejects.toThrow('selected node pool');
  });
  it('treats nullable upgrade arrays as no available targets, not a wire-shape failure', async () => {
    const transport = vi.fn(async (path: string) => path.includes('/agentPools/')
      ? { properties: { kubernetesVersion: '1.35.8', upgrades: null } }
      : { properties: { controlPlaneProfile: { upgrades: null }, agentPoolProfiles: null } });
    const provider = new ArmProvider(transport, [subscription]);
    expect(await provider.listUpgradeTargets(demoClusters[0], { upgradeType: 'ControlPlane' })).toEqual([]);
    expect(await provider.listUpgradeTargets(demoClusters[0], { upgradeType: 'AgentPool', agentPoolName: 'system' })).toEqual([]);
  });
  it('caches upgrade targets briefly per cluster', async () => {
    const transport = vi.fn().mockResolvedValue({ properties: { controlPlaneProfile: { upgrades: [{ kubernetesVersion: '1.35.1' }] } } });
    const provider = new ArmProvider(transport, [subscription]);
    await provider.listUpgradeTargets(demoClusters[0], { upgradeType: 'ControlPlane' });
    await provider.listUpgradeTargets(demoClusters[0], { upgradeType: 'ControlPlane' });
    expect(transport).toHaveBeenCalledTimes(1);
  });
  it('GETs the exact server-returned insight ID without inventing a name', async () => {
    const id = `${demoClusters[0].id}/upgradeInsights/server-controlled-name`;
    const transport = vi.fn().mockResolvedValue({ ...resource, id });
    const provider = new ArmProvider(transport, [subscription]);
    expect((await provider.getInsight(demoClusters[0], id)).id).toBe(id);
    expect(transport).toHaveBeenCalledWith(`${id}?api-version=${API_VERSION}`, 'GET', undefined, undefined);
    for (const invalid of [
      `${demoClusters[1].id}/upgradeInsights/name`, `${demoClusters[0].id}/upgradeInsights/name/child`,
      `${demoClusters[0].id}/upgradeInsights/..`, `${id}?override=true`, 'https://evil.example/name',
    ]) {
      await expect(provider.getInsight(demoClusters[0], invalid)).rejects.toThrow('selected AKS cluster');
    }
    expect(transport).toHaveBeenCalledTimes(1);
  });
  it('invalidates the LIST cache when a stored GET is no longer current', async () => {
    const transport = vi.fn().mockResolvedValueOnce({ value: [resource] })
      .mockRejectedValueOnce(new ArmRequestError(404, 'Snapshot is no longer current.', 'NotFound'))
      .mockResolvedValueOnce({ value: [] });
    const provider = new ArmProvider(transport, [subscription]);
    await provider.listInsights(demoClusters[0]);
    await expect(provider.getInsight(demoClusters[0], `${demoClusters[0].id}/upgradeInsights/stale`)).rejects.toMatchObject({ status: 404 });
    expect(await provider.listInsights(demoClusters[0])).toEqual([]);
    expect(transport).toHaveBeenCalledTimes(3);
  });
  it('preserves reachable subscriptions and reports partial inventory failures', async () => {
    const transport = vi.fn().mockResolvedValueOnce({ value: [] }).mockRejectedValueOnce(new Error('Forbidden'));
    const result = await new ArmProvider(transport, [subscription, '11111111-1111-1111-1111-111111111111']).listClusters();
    expect(result.clusters).toEqual([]);
    expect(result.warnings).toHaveLength(1);
    expect(result.warnings[0]).toContain('Forbidden');
  });
  it('uses exact synchronous generation body and preserves server-generated names', async () => {
    const transport = vi.fn().mockResolvedValue({ ...resource, name: 'server-controls-name' });
    const request = { upgradeType: 'ControlPlane' as const, targetKubernetesVersion: '1.34.2' };
    const next = await new ArmProvider(transport, [subscription]).generate(demoClusters[0], request);
    expect(next.name).toBe('server-controls-name');
    expect(transport.mock.calls[0]).toEqual([`${demoClusters[0].id}/generateUpgradeInsights?api-version=${API_VERSION}`, 'POST', request, undefined]);
  });
  it('does not swallow 403 failures or substitute mock results', async () => {
    const transport = vi.fn().mockRejectedValue(new Error('Forbidden'));
    await expect(new ArmProvider(transport, [subscription]).listInsights(demoClusters[0])).rejects.toThrow('Forbidden');
  });
  it('rejects hostile pagination destinations', async () => {
    const transport = vi.fn().mockResolvedValue({ value: [], nextLink: 'https://evil.example/steal' });
    await expect(new ArmProvider(transport, [subscription]).listInsights(demoClusters[0])).rejects.toThrow('Untrusted');
    expect(transport).toHaveBeenCalledTimes(1);
  });
  it('rejects cyclic pagination', async () => {
    const path = `${demoClusters[0].id}/upgradeInsights?api-version=${API_VERSION}`;
    const transport = vi.fn().mockResolvedValue({ value: [], nextLink: path });
    await expect(new ArmProvider(transport, [subscription]).listInsights(demoClusters[0])).rejects.toThrow('loop');
  });
  it('rejects invalid payloads rather than counting missing data as ready', () => {
    expect(insightListSchema.safeParse({ value: [{ properties: {} }] }).success).toBe(false);
    expect(insightSchema.safeParse({ ...resource, properties: { ...resource.properties, evaluation: { evaluatedAt: 'now' } } }).success).toBe(false);
  });
  it('allows forward-compatible enum values for conservative presentation', () => expect(insightSchema.parse({ name: 'future', properties: { upgradeType: 'NewScope' } }).properties.upgradeType).toBe('NewScope'));
  it('validates cluster resource IDs', () => expect(() => clusterBase({ ...demoClusters[0], id: 'https://evil.example' })).toThrow('Invalid AKS'));
  it('validates subscription IDs', () => expect(() => new ArmProvider(vi.fn(), ['invalid'])).toThrow('valid Azure'));
  it('surfaces pairing and CLI errors', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({ error: 'Pairing expired' }), { status: 401 })));
    try { await expect(bridgeTransport('key')('/subscriptions/x', 'GET')).rejects.toThrow('Pairing expired'); }
    finally { vi.unstubAllGlobals(); }
  });
  it.each([400, 403, 404, 429, 500])('preserves ARM status %s, code, request ID and retry metadata', async status => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({
      error: { code: 'ArmTestError', message: 'The ARM operation could not complete.' },
    }), { status, headers: { 'x-ms-request-id': 'request-123', 'retry-after': '15' } })));
    try {
      await expect(bridgeTransport('key')('/subscriptions/x', 'GET')).rejects.toMatchObject({
        name: 'ArmRequestError', status, code: 'ArmTestError', requestId: 'request-123', retryAfter: '15',
      });
    } finally { vi.unstubAllGlobals(); }
  });
  it('preserves a bare RP error body as well as the standard ARM error envelope', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({
      code: 'NotFound', message: 'The stored evaluation was not found.',
      subcode: 'MissingStoredEvaluation', details: [{ code: 'Unspecified', message: 'entity not found' }],
    }), { status: 404, headers: { 'x-ms-request-id': 'bare-rp-error-request' } })));
    try {
      await expect(bridgeTransport('key')('/subscriptions/x', 'GET')).rejects.toMatchObject({
        status: 404, code: 'NotFound', requestId: 'bare-rp-error-request',
        message: expect.stringContaining('The stored evaluation was not found.'),
      });
    } finally { vi.unstubAllGlobals(); }
  });
});
