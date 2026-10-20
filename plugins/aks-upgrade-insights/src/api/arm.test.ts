import { describe, expect, it, vi } from 'vitest';
import { ArmProvider, clusterBase, bridgeTransport } from './arm';
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
    const transport = vi.fn().mockResolvedValue({ value: [{
      id: demoClusters[0].id, name: 'test', location: 'eastus',
      properties: { kubernetesVersion: '1.33.1', currentKubernetesVersion: '1.33.2', agentPoolProfiles: [{ name: 'system', orchestratorVersion: '1.33.2', nodeImageVersion: 'old-image' }] },
    }] });
    const { clusters } = await new ArmProvider(transport, [subscription]).listClusters();
    expect(clusters[0].kubernetesVersion).toBe('1.33.2'); expect(clusters[0].pools[0].name).toBe('system');
    expect(transport.mock.calls[0][0]).toContain(`/subscriptions/${subscription}/providers/Microsoft.ContainerService/managedClusters?`);
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
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 401, json: async () => ({ error: 'Pairing expired' }) }));
    await expect(bridgeTransport('key')('/subscriptions/x', 'GET')).rejects.toThrow('Pairing expired');
    vi.unstubAllGlobals();
  });
});
