import { beforeEach, describe, expect, it, vi } from 'vitest';
import { DemoProvider, demoClusters } from './api/demo';
import { ClusterRecord, Insight } from './api/types';
import { csvCell, freshness, issuesFor, latestCombined, readiness, recordReadiness, safeDocumentationUrl, scopes } from './domain';

const cluster = demoClusters[0];
function passed(): Insight {
  return {
    name: 'controlPlaneAndAgentPools',
    properties: {
      upgradeType: 'ControlPlaneAndAgentPools', provisioningState: 'Succeeded',
      lastEvaluatedAt: '2026-10-20T12:00:00Z', expiresAt: '2026-11-03T12:00:00Z',
      targetKubernetesVersion: '1.34.2',
      controlPlane: { currentKubernetesVersion: cluster.kubernetesVersion, evaluation: { status: 'Passed', evaluatedAt: '2026-10-20T12:00:00Z' } },
      agentPools: cluster.pools.map(p => ({ agentPoolName: p.name, currentKubernetesVersion: p.version, evaluation: { status: 'Passed', evaluatedAt: '2026-10-20T12:00:00Z' } })),
    },
  };
}
beforeEach(() => { vi.spyOn(Date, 'now').mockReturnValue(Date.parse('2026-10-20T12:15:00Z')); });
describe('conservative readiness', () => {
  it('marks a complete fresh combined result ready', () => expect(readiness(passed(), cluster)).toBe('Ready'));
  it('does not interpret absent results as ready', () => expect(readiness(undefined, cluster)).toBe('Not evaluated'));
  it('requires every expected pool', () => { const i = passed(); i.properties.agentPools?.pop(); expect(readiness(i, cluster)).toBe('Not evaluated'); });
  it('does not assume an omitted pool inventory is a complete empty inventory', () => expect(readiness(passed(), { ...cluster, poolInventoryKnown: false })).toBe('Not evaluated'));
  it('requires a control plane for combined results', () => { const i = passed(); delete i.properties.controlPlane; expect(readiness(i, cluster)).toBe('Not evaluated'); });
  it('requires an evaluation object', () => { const i = passed(); delete i.properties.controlPlane?.evaluation; expect(readiness(i, cluster)).toBe('Not evaluated'); });
  it('keeps provisioning failure separate from readiness failure', () => { const i = passed(); i.properties.provisioningState = 'Failed'; expect(readiness(i, cluster)).toBe('Unavailable'); });
  it('does not call an in-progress compute ready', () => { const i = passed(); i.properties.provisioningState = 'Updating'; expect(readiness(i, cluster)).toBe('Not evaluated'); });
  it('marks expired evaluations for re-checking', () => { const i = passed(); i.properties.expiresAt = '2026-10-20T10:00:00Z'; expect(readiness(i, cluster)).toBe('Re-check required'); });
  it('uses client 24-hour freshness policy, not API retention', () => { const i = passed(); i.properties.lastEvaluatedAt = '2026-10-18T12:00:00Z'; expect(readiness(i, cluster)).toBe('Re-check required'); });
  it('detects an independently stale scope', () => { const i = passed(); i.properties.controlPlane!.evaluation!.evaluatedAt = '2026-10-01T00:00:00Z'; expect(readiness(i, cluster)).toBe('Re-check required'); });
  it('detects changed control-plane source versions', () => { const i = passed(); i.properties.controlPlane!.currentKubernetesVersion = '1.32.0'; expect(freshness(i, cluster)).toContain('version changed'); });
  it('detects changed node-pool source versions', () => { const i = passed(); i.properties.agentPools![0].currentKubernetesVersion = '1.32.0'; expect(freshness(i, cluster)).toContain('version changed'); });
  it('never treats a future extension as ready', () => { const i = passed(); i.properties.upgradeType = 'FutureScope'; expect(readiness(i, cluster)).toBe('Unavailable'); });
  it('does not claim readiness when source versions are unknown', () => { const i = passed(); delete i.properties.controlPlane!.currentKubernetesVersion; expect(readiness(i, cluster)).toBe('Re-check required'); });
  it('requires a concrete evaluated target', () => { const i = passed(); delete i.properties.targetKubernetesVersion; expect(readiness(i, cluster)).toBe('Not evaluated'); });
  it('does not hide an undated failed evaluation behind a dated ready snapshot', () => {
    const good = passed(), failed = passed(); delete failed.properties.lastEvaluatedAt; failed.properties.provisioningState = 'Failed';
    expect(latestCombined({ cluster, insights: [good, failed] })).toBe(failed);
  });
  it('never treats unknown result states as ready', () => { const i = passed(); i.properties.controlPlane!.evaluation!.status = 'UnknownFutureState'; expect(readiness(i, cluster)).toBe('Unavailable'); });
  it('treats unknown severity conservatively', () => { const i = passed(); i.properties.controlPlane!.evaluation!.detectedIssues = [{ severity: 'NewSeverity' }]; expect(readiness(i, cluster)).toBe('Unavailable'); });
  it('honors blockers even when the server rollup incorrectly says passed', () => { const i = passed(); i.properties.controlPlane!.evaluation!.detectedIssues = [{ severity: 'Blocking' }]; expect(readiness(i, cluster)).toBe('Blocked'); });
  it('preserves warning rollups with no issue payload', () => { const i = passed(); i.properties.controlPlane!.evaluation!.status = 'Warning'; expect(readiness(i, cluster)).toBe('Review warnings'); });
  it('shows transport errors as unavailable', () => expect(recordReadiness({ cluster, insights: [passed()], error: 'Forbidden' })).toBe('Unavailable'));
  it('does not merge overlapping standalone and combined snapshots', () => {
    const i = passed(), other = passed(); other.name = 'nodeImage-workloads'; other.properties.upgradeType = 'NodeImage';
    other.properties.lastEvaluatedAt = '2026-10-20T12:10:00Z';
    expect(latestCombined({ cluster, insights: [other, i] })).toBe(i);
  });
  it('flattens nested issues without double counting', () => {
    const i = passed(); i.properties.agentPools![0].evaluation!.detectedIssues = [{ severity: 'Blocking', issueType: 'PDBConstraint' }];
    expect(scopes(i)).toHaveLength(3); expect(issuesFor(i)).toHaveLength(1); expect(issuesFor(i)[0].scope).toBe('system');
  });
});
describe('safe presentation', () => {
  it.each(['javascript:alert(1)', 'https://evil.example', 'http://learn.microsoft.com/a', 'not a URL'])('rejects unsafe documentation link %s', link => expect(safeDocumentationUrl(link)).toBeUndefined());
  it('allows official documentation links', () => expect(safeDocumentationUrl('https://learn.microsoft.com/azure/aks')).toBe('https://learn.microsoft.com/azure/aks'));
  it('escapes CSV delimiters, quotes, and spreadsheet formula prefixes', () => {
    expect(csvCell('hello,"world"')).toBe('"hello,""world"""');
    expect(csvCell('=HYPERLINK("bad")')).toBe('"\'=HYPERLINK(""bad"")"');
  });
});
describe('demo flow', () => {
  it('includes distinct ready, blocked, warning, stale, and missing states', async () => {
    const provider = new DemoProvider();
    const records: ClusterRecord[] = await Promise.all(demoClusters.map(async cluster => ({ cluster, insights: await provider.listInsights(cluster) })));
    expect(records.map(recordReadiness)).toEqual(['Blocked', 'Blocked', 'Review warnings', 'Review warnings', 'Ready', 'Ready', 'Re-check required', 'Not evaluated']);
  });
  it('keeps old results unchanged until explicitly regenerated', async () => {
    const provider = new DemoProvider();
    provider.simulateRemediation(cluster);
    const old = await provider.listInsights(cluster);
    expect(readiness(old[0], cluster)).toBe('Blocked');
    const next = await provider.generate(cluster, { upgradeType: 'ControlPlaneAndAgentPools', targetKubernetesVersion: '1.34.2' });
    expect(readiness(next, cluster)).toBe('Ready');
    provider.reset();
    expect(readiness((await provider.listInsights(cluster))[0], cluster)).toBe('Blocked');
  });
  it('does not incorrectly clear pool blockers for a newly selected scope', async () => {
    const provider = new DemoProvider();
    const next = await provider.generate(cluster, { upgradeType: 'AgentPool', agentPoolName: 'workloads', targetKubernetesVersion: '1.34.2' });
    expect(readiness(next, cluster)).toBe('Blocked');
  });
  it('keeps node-image and combined Kubernetes checks independent', async () => {
    const provider = new DemoProvider();
    const next = await provider.generate(cluster, { upgradeType: 'NodeImage', agentPoolName: 'workloads' });
    expect(next.properties.targetKubernetesVersion).toBeUndefined();
    expect(next.properties.targetNodeImageVersion).toBeTruthy();
  });
  it('supports aborted requests', async () => {
    const signal = new AbortController(); signal.abort();
    await expect(new DemoProvider().listClusters(signal.signal)).rejects.toMatchObject({ name: 'AbortError' });
  });
});
