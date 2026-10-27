// @vitest-environment jsdom
import React, { act } from 'react';
import { createRoot, Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { App } from './App';
import { Cluster, Insight, InsightsProvider } from './api/types';
import { ArmRequestError } from './api/arm';
import { demoClusters } from './api/demo';
import { getActiveProvider, setActiveProvider } from './api/session';

declare global { var IS_REACT_ACT_ENVIRONMENT: boolean; }
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
let container: HTMLDivElement, root: Root;
beforeEach(() => {
  vi.useFakeTimers();
  container = document.createElement('div'); document.body.appendChild(container);
  root = createRoot(container);
  HTMLDialogElement.prototype.showModal = function () { this.setAttribute('open', ''); };
  HTMLDialogElement.prototype.close = function () { this.removeAttribute('open'); };
});
afterEach(async () => {
  await act(async () => root.unmount());
  container.remove(); vi.useRealTimers();
});
async function render(context?: string, provider?: InsightsProvider) {
  await act(async () => root.render(<App singleClusterContext={context} initialProvider={provider} />));
  for (let i = 0; i < 4; i++) await act(async () => { await vi.advanceTimersByTimeAsync(1000); });
}
function button(label: string) {
  const result = [...container.querySelectorAll('button')].find(b => b.getAttribute('aria-label') === label || b.textContent?.trim() === label);
  if (!result) throw new Error(`Button not found: ${label}`);
  return result;
}
async function click(label: string) { await act(async () => button(label).click()); }
async function select(label: string, value: string) {
  const input = container.querySelector<HTMLSelectElement>(`select[aria-label="${label}"]`);
  if (!input) throw new Error(`Select not found: ${label}`);
  await act(async () => {
    input.value = value; input.dispatchEvent(new Event('change', { bubbles: true }));
    await Promise.resolve();
  });
}
function liveProvider(clusters: Cluster[] = demoClusters): InsightsProvider {
  return {
    mode: 'live',
    listClusters: vi.fn().mockResolvedValue({ clusters, warnings: [], fleetWarnings: [] }),
    listInsights: vi.fn().mockResolvedValue([]),
    getInsight: vi.fn(),
    listUpgradeTargets: vi.fn().mockResolvedValue(['1.35.1']),
    generate: vi.fn(),
  };
}

describe('source and context UI regressions', () => {
  it('reloads inventory when choosing the already-selected demo provider', async () => {
    await render();
    expect(container.querySelectorAll('tbody tr')).toHaveLength(8);
    await click('Data source settings');
    await click('Use demo data');
    for (let i = 0; i < 4; i++) await act(async () => { await vi.advanceTimersByTimeAsync(1000); });
    expect(container.querySelectorAll('tbody tr')).toHaveLength(8);
    expect(container.textContent).not.toContain('No AKS clusters found');
  });
  it('includes both stale and missing results in the needs-evaluation metric', async () => {
    await render();
    const metric = [...container.querySelectorAll('button')].find(b => b.textContent?.startsWith('Needs evaluation'));
    if (!metric) throw new Error('Metric not found.');
    await act(async () => metric.click());
    expect(container.querySelectorAll('tbody tr')).toHaveLength(2);
    expect(container.querySelector('tbody')?.textContent).toContain('aks-ml-stage');
    expect(container.querySelector('tbody')?.textContent).toContain('aks-sandbox-dev');
  });
  it('replaces the selected fixture when Headlamp context changes', async () => {
    await render('aks-checkout-prod');
    expect(container.querySelector('.cluster-hero h2')?.textContent).toBe('aks-checkout-prod');
    await render('aks-services-dev');
    expect(container.querySelector('.cluster-hero h2')?.textContent).toBe('aks-services-dev');
  });
  it('does not impersonate an arbitrary real kubeconfig context with demo data', async () => {
    await render('my-real-production-context');
    expect(container.querySelector('.cluster-hero')).toBeNull();
    expect(container.textContent).toContain('Choose a cluster');
    expect(container.textContent).toContain('Demo clusters are synthetic, not this connected context.');
  });
  it('pages large inventories and loads readiness only for the visible page', async () => {
    const clusters: Cluster[] = Array.from({ length: 31 }, (_, index) => ({
      id: `/subscriptions/00000000-0000-0000-0000-000000000000/resourceGroups/rg/providers/Microsoft.ContainerService/managedClusters/cluster-${index}`,
      name: `cluster-${String(index).padStart(2, '0')}`,
      subscription: 'Test subscription',
      resourceGroup: 'rg',
      location: 'eastus',
      pools: [],
    }));
    const provider: InsightsProvider = {
      mode: 'live',
      listClusters: vi.fn().mockResolvedValue({ clusters, warnings: [], fleetWarnings: [] }),
      listInsights: vi.fn().mockResolvedValue([]),
      getInsight: vi.fn(),
      listUpgradeTargets: vi.fn().mockResolvedValue(['1.35.1']),
      generate: vi.fn(),
    };
    await act(async () => root.render(<App initialProvider={provider} />));
    await act(async () => { await Promise.resolve(); });
    expect(container.querySelectorAll('tbody tr')).toHaveLength(25);
    expect(container.textContent).toContain('Page 1 of 2');
    expect(provider.listInsights).toHaveBeenCalledTimes(25);
    await act(async () => { button('Next cluster page').click(); await Promise.resolve(); });
    expect(container.querySelectorAll('tbody tr')).toHaveLength(6);
    expect(provider.listInsights).toHaveBeenCalledTimes(31);
  });
  it('reuses the active provider when a plugin route remounts in the same session', async () => {
    const original = getActiveProvider();
    const provider: InsightsProvider = {
      mode: 'live',
      listClusters: vi.fn().mockResolvedValue({ clusters: [], warnings: [], fleetWarnings: [] }),
      listInsights: vi.fn().mockResolvedValue([]),
      getInsight: vi.fn(),
      listUpgradeTargets: vi.fn().mockResolvedValue(['1.35.1']),
      generate: vi.fn(),
    };
    setActiveProvider(provider);
    try {
      await act(async () => { root.render(<App />); await Promise.resolve(); });
      expect(provider.listClusters).toHaveBeenCalledTimes(1);
      await act(async () => root.unmount());
      root = createRoot(container);
      await act(async () => { root.render(<App singleClusterContext="test-context" />); await Promise.resolve(); });
      expect(provider.listClusters).toHaveBeenCalledTimes(2);
      expect(container.textContent).toContain('Azure API');
    } finally {
      setActiveProvider(original);
    }
  });
  it('binds an explicit ARM ID to a live context and restores it only for the same provider', async () => {
    const first = { ...demoClusters[0], name: 'duplicate' };
    const second = { ...demoClusters[1], name: 'duplicate' };
    const provider = liveProvider([first, second]);
    await render('duplicate', provider);
    expect(container.querySelector('.cluster-hero')).toBeNull();
    await select('Select cluster', second.id);
    expect(container.querySelector('.context-note')?.textContent).toContain(second.id);
    await act(async () => root.unmount());
    root = createRoot(container);
    await render('duplicate', provider);
    expect(container.querySelector<HTMLSelectElement>('select[aria-label="Select cluster"]')?.value).toBe(second.id);
    await act(async () => root.unmount());
    root = createRoot(container);
    await render('duplicate', liveProvider([first, second]));
    expect(container.querySelector('.cluster-hero')).toBeNull();
  });
  it('reloads upgrade targets for the selected Kubernetes scope and pool', async () => {
    const provider = liveProvider();
    await render('live-context', provider);
    await select('Select cluster', demoClusters[0].id);
    await click('Evaluate a target');
    expect(provider.listUpgradeTargets).toHaveBeenLastCalledWith(demoClusters[0], { upgradeType: 'ControlPlaneAndAgentPools' }, expect.any(AbortSignal));
    const scope = container.querySelector<HTMLSelectElement>('dialog .form-grid select');
    if (!scope) throw new Error('Scope selector not found');
    await act(async () => { scope.value = 'AgentPool'; scope.dispatchEvent(new Event('change', { bubbles: true })); });
    expect(provider.listUpgradeTargets).toHaveBeenLastCalledWith(demoClusters[0], { upgradeType: 'AgentPool', agentPoolName: 'system' }, expect.any(AbortSignal));
  });
  it('generates NodeImage and verifies its exact GET even when Kubernetes target discovery fails', async () => {
    const provider = liveProvider();
    vi.mocked(provider.listUpgradeTargets).mockRejectedValue(new Error('Upgrade profile forbidden'));
    const insight: Insight = {
      id: `${demoClusters[0].id}/upgradeInsights/nodeImage-system-server-version`,
      name: 'nodeImage-system-server-version',
      properties: { upgradeType: 'NodeImage', agentPoolName: 'system', provisioningState: 'Succeeded' },
    };
    vi.mocked(provider.generate).mockResolvedValue(insight);
    vi.mocked(provider.getInsight).mockResolvedValue(insight);
    await render('live-context', provider);
    await select('Select cluster', demoClusters[0].id);
    await click('Evaluate a target');
    expect(container.textContent).toContain('Upgrade profile forbidden');
    const scope = container.querySelector<HTMLSelectElement>('dialog .form-grid select');
    if (!scope) throw new Error('Scope selector not found');
    await act(async () => { scope.value = 'NodeImage'; scope.dispatchEvent(new Event('change', { bubbles: true })); });
    expect(provider.listUpgradeTargets).toHaveBeenCalledTimes(1);
    expect(button('Generate evaluation').disabled).toBe(true);
    const confirmation = container.querySelector<HTMLInputElement>('dialog input[type="checkbox"]');
    if (!confirmation) throw new Error('Live confirmation not found');
    await act(async () => confirmation.click());
    expect(button('Generate evaluation').disabled).toBe(false);
    await click('Generate evaluation');
    expect(provider.generate).toHaveBeenCalledWith(demoClusters[0], { upgradeType: 'NodeImage', agentPoolName: 'system' });
    expect(provider.getInsight).toHaveBeenCalledWith(demoClusters[0], insight.id);
    expect(container.textContent).toContain('New evaluation completed');
  });
  it('surfaces a stale named GET instead of presenting an unverified generated snapshot', async () => {
    const provider = liveProvider();
    vi.mocked(provider.generate).mockResolvedValue({
      id: `${demoClusters[0].id}/upgradeInsights/controlPlane-server-target`,
      name: 'controlPlane-server-target', properties: { upgradeType: 'ControlPlane' },
    });
    vi.mocked(provider.getInsight).mockRejectedValue(new ArmRequestError(404, 'Snapshot is no longer current; refresh or re-evaluate.', 'NotFound', 'request-404'));
    await render('live-context', provider);
    await select('Select cluster', demoClusters[0].id);
    await click('Evaluate a target');
    const confirmation = container.querySelector<HTMLInputElement>('dialog input[type="checkbox"]');
    if (!confirmation) throw new Error('Live confirmation not found');
    await act(async () => confirmation.click());
    await click('Generate evaluation');
    expect(container.querySelector('dialog [role="alert"]')?.textContent).toContain('request-404');
    expect(container.textContent).not.toContain('New evaluation completed');
  });
});
