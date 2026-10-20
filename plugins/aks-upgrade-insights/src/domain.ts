import { Cluster, ClusterRecord, Insight, Issue, Scope } from './api/types';

export type Readiness = 'Blocked' | 'Review warnings' | 'Ready' | 'Re-check required' | 'Not evaluated' | 'Unavailable';
export interface ScopedIssue { key: string; scope: string; issue: Issue }
export const readinessOrder: Record<Readiness, number> = {
  Blocked: 0, Unavailable: 1, 'Re-check required': 2, 'Not evaluated': 3, 'Review warnings': 4, Ready: 5,
};
export function scopes(insight: Insight): { name: string; result: Scope }[] {
  const p = insight.properties;
  if (p.upgradeType === 'ControlPlaneAndAgentPools') {
    return [
      ...(p.controlPlane ? [{ name: 'Control plane', result: p.controlPlane }] : []),
      ...(p.agentPools ?? []).map(result => ({ name: result.agentPoolName ?? 'Unnamed pool', result })),
    ];
  }
  return [{ name: p.agentPoolName ?? 'Control plane', result: p }];
}
export function issuesFor(insight?: Insight): ScopedIssue[] {
  if (!insight) return [];
  return scopes(insight).flatMap(({ name, result }) =>
    (result.evaluation?.detectedIssues ?? []).map((issue, index) => ({
      key: `${insight.name}/${name}/${index}`, scope: name, issue,
    }))
  );
}
export function latestCombined(record: ClusterRecord): Insight | undefined {
  const combined = record.insights.filter(i => i.properties.upgradeType === 'ControlPlaneAndAgentPools');
  const undated = combined.find(i => !Number.isFinite(Date.parse(i.properties.lastEvaluatedAt ?? '')));
  if (undated) return undated;
  return combined
    .sort((a, b) => (Date.parse(b.properties.lastEvaluatedAt ?? '') || 0) - (Date.parse(a.properties.lastEvaluatedAt ?? '') || 0))[0];
}
export function freshness(insight: Insight, cluster: Cluster, now = Date.now()): string | undefined {
  const p = insight.properties;
  const evaluated = Date.parse(p.lastEvaluatedAt ?? '');
  const expires = Date.parse(p.expiresAt ?? '');
  if (!Number.isFinite(evaluated) || !Number.isFinite(expires)) return 'Evaluation freshness is unknown.';
  if (expires <= now) return 'Stored evaluation has expired.';
  if (evaluated > now + 60_000) return 'Evaluation timestamp is in the future.';
  if (now - evaluated > 24 * 60 * 60 * 1000) return 'Snapshot is more than 24 hours old. Re-check before upgrading.';
  if (scopes(insight).some(({ result }) => result.evaluation &&
      (!Number.isFinite(Date.parse(result.evaluation.evaluatedAt)) ||
       now - Date.parse(result.evaluation.evaluatedAt) > 24 * 60 * 60 * 1000 ||
       Date.parse(result.evaluation.evaluatedAt) > now + 60_000))) return 'A scope snapshot is stale or has an invalid evaluation time.';
  if (p.upgradeType !== 'NodeImage' && scopes(insight).some(({ name, result }) => {
    const current = name === 'Control plane' ? cluster.kubernetesVersion : cluster.pools.find(pool => pool.name === name)?.version;
    return !current || !result.currentKubernetesVersion;
  })) return 'Current and evaluated source versions cannot be compared.';
  if (scopes(insight).some(({ name, result }) => {
    const current = name === 'Control plane' ? cluster.kubernetesVersion : cluster.pools.find(pool => pool.name === name)?.version;
    return current && result.currentKubernetesVersion && current !== result.currentKubernetesVersion;
  })) return 'Cluster version changed since this evaluation.';
  if (p.upgradeType === 'NodeImage') {
    const pool = cluster.pools.find(pool => pool.name === p.agentPoolName);
    if (!pool?.nodeImageVersion || !p.currentNodeImageVersion) return 'Current and evaluated node image versions cannot be compared.';
    if (pool?.nodeImageVersion && p.currentNodeImageVersion && pool.nodeImageVersion !== p.currentNodeImageVersion) {
      return 'Node image changed since this evaluation.';
    }
  }
}
export function readiness(insight: Insight | undefined, cluster: Cluster, now = Date.now()): Readiness {
  if (!insight) return 'Not evaluated';
  const p = insight.properties;
  if (!['ControlPlane', 'ControlPlaneAndAgentPools', 'AgentPool', 'NodeImage'].includes(p.upgradeType)) return 'Unavailable';
  if (p.upgradeType === 'NodeImage' ? !p.targetNodeImageVersion : !p.targetKubernetesVersion) return 'Not evaluated';
  if (['AgentPool', 'NodeImage'].includes(p.upgradeType) && (!p.agentPoolName || !cluster.pools.some(pool => pool.name === p.agentPoolName))) return 'Not evaluated';
  if (p.provisioningState === 'Failed' || p.provisioningState === 'Canceled') return 'Unavailable';
  if (p.provisioningState !== 'Succeeded') return 'Not evaluated';
  if (freshness(insight, cluster, now)) return 'Re-check required';
  const results = scopes(insight);
  if (!results.length || results.some(s => !s.result.evaluation)) return 'Not evaluated';
  if (p.upgradeType === 'ControlPlaneAndAgentPools' &&
      (!p.controlPlane || !p.agentPools || cluster.poolInventoryKnown === false || cluster.pools.some(pool => !p.agentPools?.some(s => s.agentPoolName === pool.name)))) return 'Not evaluated';
  const evaluations = results.flatMap(s => s.result.evaluation ? [s.result.evaluation] : []);
  if (evaluations.some(e => !['Passed', 'Warning', 'Failed'].includes(e.status) || !Number.isFinite(Date.parse(e.evaluatedAt)))) return 'Unavailable';
  const issues = issuesFor(insight);
  if (issues.some(i => !['Blocking', 'Warning'].includes(i.issue.severity ?? ''))) return 'Unavailable';
  if (issues.some(i => i.issue.severity === 'Blocking') || evaluations.some(e => e.status === 'Failed')) return 'Blocked';
  if (issues.length || evaluations.some(e => e.status === 'Warning')) return 'Review warnings';
  return 'Ready';
}
export function recordReadiness(record: ClusterRecord): Readiness {
  return record.error ? 'Unavailable' : readiness(latestCombined(record), record.cluster);
}
export function safeDocumentationUrl(value?: string): string | undefined {
  if (!value) return;
  try {
    const url = new URL(value);
    if (url.protocol === 'https:' && ['learn.microsoft.com', 'aka.ms', 'kubernetes.io'].includes(url.hostname)) return url.href;
  } catch { /* Malformed server-provided documentation links are not rendered as links. */ }
}
export function formatTime(value?: string): string {
  if (!value || !Number.isFinite(Date.parse(value))) return 'Not available';
  return new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value));
}
export function csvCell(value: string): string {
  const safe = /^[=+\-@\t\r]/.test(value) ? `'${value}` : value;
  return `"${safe.replaceAll('"', '""')}"`;
}
