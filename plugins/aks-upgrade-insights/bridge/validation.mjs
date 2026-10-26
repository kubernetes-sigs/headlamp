import { z } from 'zod';

const kubernetesTarget = z.string().regex(/^\d+\.\d+\.\d+$/);
const pool = z.string().regex(/^[a-z][a-z0-9-]{0,63}$/);
const generationSchema = z.discriminatedUnion('upgradeType', [
  z.object({ upgradeType: z.literal('ControlPlaneAndAgentPools'), targetKubernetesVersion: kubernetesTarget }).strict(),
  z.object({ upgradeType: z.literal('ControlPlane'), targetKubernetesVersion: kubernetesTarget }).strict(),
  z.object({ upgradeType: z.literal('AgentPool'), agentPoolName: pool, targetKubernetesVersion: kubernetesTarget }).strict(),
  z.object({ upgradeType: z.literal('NodeImage'), agentPoolName: pool, targetNodeImageVersion: z.string().min(1).max(256).optional() }).strict(),
]);
const envelopeSchema = z.object({
  path: z.string().max(4096),
  method: z.enum(['GET', 'POST']),
  body: generationSchema.optional(),
}).strict();
const escape = value => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

export function validateRequest(input, subscriptions, allowGenerate = false) {
  const request = envelopeSchema.parse(input);
  const allowedSubscriptions = subscriptions.map(escape).join('|');
  const prefix = `/subscriptions/(${allowedSubscriptions})`;
  const clusterList = new RegExp(`^${prefix}/providers/Microsoft\\.ContainerService/managedClusters$`, 'i');
  const clusterPath = `${prefix}/resourceGroups/[^/]+/providers/Microsoft\\.ContainerService/managedClusters/[^/]+`;
  const insightList = new RegExp(`^${clusterPath}/upgradeInsights$`, 'i');
  const insightGet = new RegExp(`^${clusterPath}/upgradeInsights/[^/]+$`, 'i');
  const upgradeProfile = new RegExp(`^${clusterPath}/upgradeProfiles/default$`, 'i');
  const poolUpgradeProfile = new RegExp(`^${clusterPath}/agentPools/[^/]+/upgradeProfiles/default$`, 'i');
  const generate = new RegExp(`^${clusterPath}/generateUpgradeInsights$`, 'i');
  const fleetList = new RegExp(`^${prefix}/providers/Microsoft\\.ContainerService/fleets$`, 'i');
  const fleetMembers = new RegExp(`^${prefix}/resourceGroups/[^/]+/providers/Microsoft\\.ContainerService/fleets/[^/]+/members$`, 'i');
  const url = new URL(request.path, 'https://management.azure.com');
  if (!request.path.startsWith('/subscriptions/') || url.origin !== 'https://management.azure.com' ||
      url.hash || [...url.searchParams.keys()].some(k => !['api-version', '$skiptoken', '$skipToken', 'skipToken', '$top'].includes(k))) {
    throw new Error('Only approved ARM API paths and API version are permitted.');
  }
  const apiVersion = url.searchParams.get('api-version');
  if (/%(?:2f|5c)/i.test(url.pathname) || /\\/.test(request.path) ||
      /\/(?:\.|%2e){1,2}(?:\/|\?|$)/i.test(request.path)) {
    throw new Error('Encoded path separators and traversal are not permitted.');
  }
  const upgradeRead = (apiVersion === '2026-08-02-preview' && (clusterList.test(url.pathname) || insightList.test(url.pathname) || insightGet.test(url.pathname)))
    || (apiVersion === '2024-10-01' && (upgradeProfile.test(url.pathname) || poolUpgradeProfile.test(url.pathname)));
  const fleetRead = apiVersion === '2025-03-01' && (fleetList.test(url.pathname) || fleetMembers.test(url.pathname));
  if (request.method === 'GET' && !request.body && (upgradeRead || fleetRead)) return request;
  if (request.method === 'POST' && allowGenerate && request.body && generate.test(url.pathname) && apiVersion === '2026-08-02-preview') return request;
  throw new Error('Request denied. Bridge is read-only unless started with --allow-generate. Cluster upgrades and resource changes are never supported.');
}
