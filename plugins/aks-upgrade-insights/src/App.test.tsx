// @vitest-environment jsdom
import React, { act } from 'react';
import { createRoot, Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { App } from './App';

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
async function render(context?: string) {
  await act(async () => root.render(<App singleClusterContext={context} />));
  await act(async () => { await vi.advanceTimersByTimeAsync(1600); });
}
function button(label: string) {
  const result = [...container.querySelectorAll('button')].find(b => b.getAttribute('aria-label') === label || b.textContent?.trim() === label);
  if (!result) throw new Error(`Button not found: ${label}`);
  return result;
}
async function click(label: string) { await act(async () => button(label).click()); }

describe('source and context UI regressions', () => {
  it('reloads inventory when choosing the already-selected demo provider', async () => {
    await render();
    expect(container.querySelectorAll('tbody tr')).toHaveLength(8);
    await click('Data source settings');
    await click('Use demo data');
    await act(async () => { await vi.advanceTimersByTimeAsync(1600); });
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
});
