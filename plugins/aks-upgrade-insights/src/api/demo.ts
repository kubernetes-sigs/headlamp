import { Cluster, GenerateRequest, Insight, InsightsProvider, Issue, Scope } from './types';

const subscriptionId = '00000000-0000-0000-0000-000000000000';
const hour = 3_600_000;
const armId = (name: string) => `/subscriptions/${subscriptionId}/resourceGroups/rg-demo/providers/Microsoft.ContainerService/managedClusters/${name}`;
export const demoClusters: Cluster[] = [
  ['aks-checkout-prod', 'eastus2', 'Production', '1.33.5'],
  ['aks-platform-prod', 'westeurope', 'Production', '1.33.5'],
  ['aks-payments-prod', 'eastus2', 'Production', '1.33.5'],
  ['aks-analytics-prod', 'swedencentral', 'Production', '1.33.5'],
  ['aks-storefront-stage', 'westeurope', 'Staging', '1.34.1'],
  ['aks-services-dev', 'eastus2', 'Development', '1.34.1'],
  ['aks-ml-stage', 'westus3', 'Staging', '1.33.5'],
  ['aks-sandbox-dev', 'westus3', 'Development', '1.33.5'],
].map(([name, location, environment, version]) => ({
  id: armId(name), name, contextName: name, location, environment,
  subscription: 'KubeCon demo', resourceGroup: 'rg-demo', kubernetesVersion: version,
  pools: [{ name: 'system', version, nodeImageVersion: 'AKSUbuntu-2204gen2containerd-202609.01.0' }, { name: 'workloads', version, nodeImageVersion: 'AKSUbuntu-2204gen2containerd-202609.01.0' }],
}));

const issues: Issue[] = [
  {
    issueType: 'PDBConstraint', severity: 'Blocking',
    message: 'checkout-api allows 0 disruptions. A surge node does not make these pods evictable; the workloads pool cannot drain safely.',
    impactedResources: [{ kind: 'Kubernetes', resourceType: 'PodDisruptionBudget', namespace: 'storefront', name: 'checkout-api' }],
    recommendedActions: [{
      title: 'Restore a safe disruption allowance',
      details: 'Check replica health and topology first. Add healthy replicas or revise the disruption budget with the workload owner so at least one pod can be evicted. Do not delete the budget or force-drain a production workload.',
      documentationLink: 'https://learn.microsoft.com/azure/aks/upgrade-cluster',
    }],
  },
  {
    issueType: 'SubnetIPExhausted', severity: 'Blocking',
    message: 'The node subnet has 2 free IP addresses; the configured surge requires 6. New upgrade nodes cannot be allocated.',
    impactedResources: [{ kind: 'Arm', resourceType: 'Microsoft.Network/virtualNetworks/subnets', resourceId: `/subscriptions/${subscriptionId}/resourceGroups/rg-demo/providers/Microsoft.Network/virtualNetworks/demo-vnet/subnets/nodes` }],
    recommendedActions: [{
      title: 'Make room for surge nodes',
      details: 'Review subnet allocation and the pool surge setting. Free unused addresses, provide additional subnet capacity where supported, or choose a surge value that fits the available capacity and your availability requirements.',
      documentationLink: 'https://learn.microsoft.com/azure/aks/upgrade-cluster',
    }],
  },
  {
    issueType: 'QuotaExceeded', severity: 'Blocking',
    message: 'The regional DSv5 vCPU quota cannot accommodate the requested surge capacity.',
    impactedResources: [{ kind: 'Arm', resourceType: 'Microsoft.ContainerService/managedClusters/agentPools', resourceId: `${armId('aks-platform-prod')}/agentPools/workloads` }],
    recommendedActions: [{
      title: 'Request capacity before the maintenance window',
      details: 'Review available regional family quota, request an increase, or reduce surge within the agreed availability budget. A successful quota increase is not a guarantee of physical capacity.',
      documentationLink: 'https://learn.microsoft.com/azure/quotas/view-quotas',
    }],
  },
  {
    issueType: 'ComponentVersionMismatch', severity: 'Warning',
    message: 'A workload admission webhook has not been validated for the requested Kubernetes version.',
    impactedResources: [{ kind: 'Kubernetes', resourceType: 'ValidatingWebhookConfiguration', name: 'policy-validator' }],
    recommendedActions: [{
      title: 'Validate the admission component',
      details: 'Check the component vendor support matrix, update if required, and test admission requests on a staging cluster running the target version.',
      documentationLink: 'https://kubernetes.io/docs/reference/access-authn-authz/extensible-admission-controllers/',
    }],
  },
  {
    issueType: 'NodeImageOutOfSLA', severity: 'Warning',
    message: 'The workloads pool node image is older than the configured compliance interval.',
    impactedResources: [{ kind: 'Arm', resourceType: 'Microsoft.ContainerService/managedClusters/agentPools', resourceId: `${armId('aks-payments-prod')}/agentPools/workloads` }],
    recommendedActions: [{
      title: 'Evaluate a node OS image update separately',
      details: 'Generate a Node OS image readiness evaluation for this pool. Combined Kubernetes-version readiness does not include node image updates.',
      documentationLink: 'https://learn.microsoft.com/azure/aks/node-image-upgrade',
    }],
  },
];
function scope(cluster: Cluster, detectedIssues: Issue[], evaluatedAt: string, pool?: string, nodeImage = false): Scope {
  return {
    ...(pool ? { agentPoolName: pool } : {}),
    currentKubernetesVersion: cluster.kubernetesVersion,
    kubernetesVersionSupportStatus: 'InSupport',
    kubernetesVersionEndOfSupportDate: '2027-03-31',
    context: {
      currentUpgradeStrategy: cluster.environment === 'Development' ? 'Manual' : 'Auto',
      lastSuccessfulUpgradeTime: new Date(Date.now() - 18 * 24 * hour).toISOString(),
      nextMaintenanceWindow: cluster.environment === 'Development' ? undefined : {
        source: nodeImage ? 'NodeOSUpgradeSchedule' : 'ClusterAutoUpgradeSchedule',
        maintenanceConfigurationName: nodeImage ? 'aksManagedNodeOSUpgradeSchedule' : 'aksManagedAutoUpgradeSchedule',
        startTime: new Date(Date.now() + 36 * hour).toISOString(),
        endTime: new Date(Date.now() + 40 * hour).toISOString(),
      },
    },
    evaluation: {
      status: detectedIssues.some(i => i.severity === 'Blocking') ? 'Failed' : detectedIssues.length ? 'Warning' : 'Passed',
      evaluatedAt, detectedIssues: structuredClone(detectedIssues),
    },
  };
}
function createInsight(cluster: Cluster, request: GenerateRequest, detectedIssues: Issue[], stale = false, newEvaluation = false): Insight {
  const evaluatedAt = new Date(Date.now() - (stale ? 15 * 24 * hour : newEvaluation ? 0 : 8 * 60_000)).toISOString();
  const name = request.upgradeType === 'ControlPlaneAndAgentPools' ? 'controlPlaneAndAgentPools'
    : request.upgradeType === 'ControlPlane' ? 'controlPlane'
    : `${request.upgradeType === 'AgentPool' ? 'agentPool' : 'nodeImage'}-${request.agentPoolName}`;
  const shared = {
    upgradeType: request.upgradeType, provisioningState: 'Succeeded',
    lastEvaluatedAt: evaluatedAt,
    expiresAt: new Date(Date.parse(evaluatedAt) + 14 * 24 * hour).toISOString(),
  };
  const properties = request.upgradeType === 'ControlPlaneAndAgentPools' ? {
    ...shared, targetKubernetesVersion: request.targetKubernetesVersion,
    controlPlane: scope(cluster, [], evaluatedAt),
    agentPools: cluster.pools.map(pool => scope(cluster, pool.name === 'workloads' ? detectedIssues : [], evaluatedAt, pool.name)),
  } : request.upgradeType === 'NodeImage' ? {
    ...shared, ...scope(cluster, detectedIssues, evaluatedAt, request.agentPoolName, true),
    currentKubernetesVersion: undefined,
    kubernetesVersionSupportStatus: undefined,
    kubernetesVersionEndOfSupportDate: undefined,
    agentPoolName: request.agentPoolName, currentNodeImageVersion: 'AKSUbuntu-2204gen2containerd-202609.01.0',
    targetNodeImageVersion: request.targetNodeImageVersion || 'AKSUbuntu-2204gen2containerd-202610.15.0',
  } : {
    ...shared, ...scope(cluster, detectedIssues, evaluatedAt, request.upgradeType === 'AgentPool' ? request.agentPoolName : undefined),
    targetKubernetesVersion: request.targetKubernetesVersion,
  };
  return { id: `${cluster.id}/upgradeInsights/${name}`, name, type: 'Microsoft.ContainerService/managedClusters/upgradeInsights', properties };
}
function wait(signal?: AbortSignal) {
  return new Promise<void>((resolve, reject) => {
    if (signal?.aborted) { reject(new DOMException('Aborted', 'AbortError')); return; }
    const abort = () => { clearTimeout(timer); reject(new DOMException('Aborted', 'AbortError')); };
    const timer = setTimeout(() => { signal?.removeEventListener('abort', abort); resolve(); }, 350);
    signal?.addEventListener('abort', abort, { once: true });
  });
}
export class DemoProvider implements InsightsProvider {
  readonly mode = 'demo';
  private records = new Map<string, Insight[]>();
  private resolved = new Set<string>();
  constructor() { this.reset(); }
  reset() {
    this.resolved.clear();
    demoClusters.forEach((cluster, index) => {
      const detected = index === 0 ? [issues[0], issues[1]] : index === 1 ? [issues[2]]
        : index === 2 || index === 3 ? [issues[3]] : [];
      const combined = createInsight(cluster, { upgradeType: 'ControlPlaneAndAgentPools', targetKubernetesVersion: '1.34.2' }, detected, index === 6);
      this.records.set(cluster.id, index === 7 ? [] : [
        combined,
        createInsight(cluster, { upgradeType: 'NodeImage', agentPoolName: 'workloads' }, index === 2 ? [issues[4]] : []),
      ]);
    });
  }
  simulateRemediation(cluster: Cluster) { this.resolved.add(cluster.id); }
  async listClusters(signal?: AbortSignal) { await wait(signal); return { clusters: structuredClone(demoClusters), warnings: [] }; }
  async listInsights(cluster: Cluster, signal?: AbortSignal) {
    await wait(signal); return structuredClone(this.records.get(cluster.id) ?? []);
  }
  async generate(cluster: Cluster, request: GenerateRequest, signal?: AbortSignal) {
    await wait(signal);
    const existing = this.records.get(cluster.id) ?? [];
    const previous = existing.find(i => i.properties.upgradeType === request.upgradeType &&
      i.properties.agentPoolName === ('agentPoolName' in request ? request.agentPoolName : undefined));
    const combined = existing.find(i => i.properties.upgradeType === 'ControlPlaneAndAgentPools');
    const fallbackIssues = request.upgradeType === 'AgentPool'
      ? combined?.properties.agentPools?.find(p => p.agentPoolName === request.agentPoolName)?.evaluation?.detectedIssues
      : request.upgradeType === 'ControlPlane' ? combined?.properties.controlPlane?.evaluation?.detectedIssues : undefined;
    const detected = this.resolved.has(cluster.id) ? [] : previous
      ? (previous.properties.evaluation?.detectedIssues ?? previous.properties.agentPools?.flatMap(p => p.evaluation?.detectedIssues ?? []) ?? [])
      : fallbackIssues ?? [];
    const next = createInsight(cluster, request, detected, false, true);
    this.records.set(cluster.id, [...existing.filter(i => i.name !== next.name), next]);
    return structuredClone(next);
  }
}
