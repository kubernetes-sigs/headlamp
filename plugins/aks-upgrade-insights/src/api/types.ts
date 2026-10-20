import { z } from 'zod';

export const API_VERSION = '2026-08-02-preview';
export const upgradeTypes = ['ControlPlaneAndAgentPools', 'ControlPlane', 'AgentPool', 'NodeImage'] as const;
export type UpgradeType = (typeof upgradeTypes)[number];

const impactedResourceSchema = z.object({
  kind: z.string(),
  resourceType: z.string().optional(),
  resourceId: z.string().optional(),
  namespace: z.string().optional(),
  name: z.string().optional(),
}).passthrough();
export const issueSchema = z.object({
  issueType: z.string().optional(),
  severity: z.string().optional(),
  message: z.string().optional(),
  impactedResources: z.array(impactedResourceSchema).optional(),
  recommendedActions: z.array(z.object({
    title: z.string().optional(),
    details: z.string().optional(),
    documentationLink: z.string().optional(),
  }).passthrough()).optional(),
}).passthrough();
const contextSchema = z.object({
  currentUpgradeStrategy: z.string().optional(),
  lastSuccessfulUpgradeTime: z.string().optional(),
  nextMaintenanceWindow: z.object({
    maintenanceConfigurationName: z.string().optional(),
    source: z.string().optional(),
    startTime: z.string().optional(),
    endTime: z.string().optional(),
  }).passthrough().optional(),
}).passthrough();
export const scopeSchema = z.object({
  agentPoolName: z.string().optional(),
  currentKubernetesVersion: z.string().optional(),
  kubernetesVersionSupportStatus: z.string().optional(),
  kubernetesVersionEndOfSupportDate: z.string().optional(),
  context: contextSchema.optional(),
  evaluation: z.object({
    status: z.string(),
    evaluatedAt: z.string(),
    detectedIssues: z.array(issueSchema).optional(),
  }).passthrough().optional(),
}).passthrough();
export const insightSchema = z.object({
  id: z.string().optional(),
  name: z.string(),
  type: z.string().optional(),
  properties: scopeSchema.extend({
    upgradeType: z.string(),
    provisioningState: z.string().optional(),
    lastEvaluatedAt: z.string().optional(),
    expiresAt: z.string().optional(),
    targetKubernetesVersion: z.string().optional(),
    currentNodeImageVersion: z.string().optional(),
    targetNodeImageVersion: z.string().optional(),
    controlPlane: scopeSchema.optional(),
    agentPools: z.array(scopeSchema).optional(),
  }),
}).passthrough();
export const insightListSchema = z.object({
  value: z.array(insightSchema),
  nextLink: z.string().optional(),
});
export type Insight = z.infer<typeof insightSchema>;
export type Scope = z.infer<typeof scopeSchema>;
export type Issue = z.infer<typeof issueSchema>;
export type GenerateRequest =
  | { upgradeType: 'ControlPlane'; targetKubernetesVersion: string }
  | { upgradeType: 'ControlPlaneAndAgentPools'; targetKubernetesVersion: string }
  | { upgradeType: 'AgentPool'; agentPoolName: string; targetKubernetesVersion: string }
  | { upgradeType: 'NodeImage'; agentPoolName: string; targetNodeImageVersion?: string };

export interface Cluster {
  id: string;
  name: string;
  contextName?: string;
  subscription: string;
  resourceGroup: string;
  location: string;
  environment?: string;
  kubernetesVersion?: string;
  poolInventoryKnown?: boolean;
  fleetMembershipKnown?: boolean;
  fleets?: { id: string; name: string }[];
  pools: { name: string; version?: string; nodeImageVersion?: string }[];
}
export interface ClusterRecord {
  cluster: Cluster;
  insights: Insight[];
  error?: string;
}
export interface ClusterInventory {
  clusters: Cluster[];
  warnings: string[];
  fleetWarnings: string[];
}
export interface InsightsProvider {
  readonly mode: 'demo' | 'live';
  listClusters(signal?: AbortSignal): Promise<ClusterInventory>;
  listInsights(cluster: Cluster, signal?: AbortSignal, forceRefresh?: boolean): Promise<Insight[]>;
  listUpgradeTargets(cluster: Cluster, signal?: AbortSignal): Promise<string[]>;
  generate(cluster: Cluster, request: GenerateRequest, signal?: AbortSignal): Promise<Insight>;
}

export const scopeLabels: Record<UpgradeType, string> = {
  ControlPlaneAndAgentPools: 'Control plane + all node pools',
  ControlPlane: 'Control plane',
  AgentPool: 'Node pool',
  NodeImage: 'Node OS image',
};
export const issueLabels: Record<string, string> = {
  PDBConstraint: 'Disruption budgets',
  SubnetIPExhausted: 'Subnet IP capacity',
  QuotaExceeded: 'Compute quota',
  APIBreakingChange: 'Removed APIs',
  ComponentVersionMismatch: 'Component compatibility',
  UnsupportedKubernetesVersion: 'Version support',
  NodeImageOutOfSLA: 'Node image freshness',
};
