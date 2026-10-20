import React, { useEffect, useState } from 'react';
import { ArmProvider, bridgeTransport, clusterBase } from './api/arm';
import { DemoProvider } from './api/demo';
import { API_VERSION, ClusterRecord, GenerateRequest, Insight, InsightsProvider, issueLabels, scopeLabels, UpgradeType, upgradeTypes } from './api/types';
import { csvCell, formatTime, freshness, issuesFor, latestCombined, readiness, readinessOrder, Readiness, recordReadiness, safeDocumentationUrl, ScopedIssue, scopes } from './domain';
import { Icon } from './components/Icon';
import { Modal } from './components/Modal';
import './styles.css';

const demo = new DemoProvider();
const statuses: Readiness[] = ['Blocked', 'Review warnings', 'Ready', 'Re-check required', 'Not evaluated', 'Unavailable'];
const tone = (status: string) => status === 'Ready' || status === 'Passed' ? 'success'
  : status === 'Blocked' || status === 'Blocking' || status === 'Failed' ? 'danger'
  : status === 'Review warnings' || status === 'Warning' || status === 'Re-check required' ? 'warning' : 'neutral';
function Badge({ value }: { value: string }) {
  return <span className={`badge ${tone(value)}`}><span className="status-dot" />{value}</span>;
}
const errorText = (error: unknown) => error instanceof Error ? error.message : 'Unexpected error. Please retry.';

function download(name: string, content: string, type: string) {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const link = document.createElement('a');
  link.href = url; link.download = name; link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function App({ singleClusterContext, hostTheme, embedded = false }: { singleClusterContext?: string; hostTheme?: 'light' | 'dark'; embedded?: boolean }) {
  const [provider, setProvider] = useState<InsightsProvider>(demo);
  const [records, setRecords] = useState<ClusterRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [inventoryWarnings, setInventoryWarnings] = useState<string[]>([]);
  const [reload, setReload] = useState(0);
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState('all');
  const [environment, setEnvironment] = useState('all');
  const [category, setCategory] = useState('all');
  const [sort, setSort] = useState('risk');
  const [selected, setSelected] = useState<string>();
  const [view, setView] = useState<'fleet' | 'cluster'>(singleClusterContext ? 'cluster' : 'fleet');
  const [settings, setSettings] = useState(false);
  const [about, setAbout] = useState(false);
  const [generateFor, setGenerateFor] = useState<ClusterRecord>();
  const [issue, setIssue] = useState<ScopedIssue>();
  const [toast, setToast] = useState('');
  const [theme, setTheme] = useState<'light' | 'dark'>(hostTheme ?? (document.documentElement.dataset.theme === 'dark' ? 'dark' : 'light'));
  const [, tick] = useState(0);
  useEffect(() => { if (hostTheme) setTheme(hostTheme); }, [hostTheme]);
  useEffect(() => { setSelected(undefined); }, [singleClusterContext]);
  useEffect(() => { const timer = setInterval(() => tick(t => t + 1), 60_000); return () => clearInterval(timer); }, []);
  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(''), 6500); return () => clearTimeout(timer);
  }, [toast]);
  useEffect(() => {
    const controller = new AbortController();
    setLoading(true); setLoadError(''); setInventoryWarnings([]);
    async function load() {
      try {
        const { clusters, warnings } = await provider.listClusters(controller.signal);
        const results: ClusterRecord[] = [];
        for (let index = 0; index < clusters.length; index += 4) {
          results.push(...await Promise.all(clusters.slice(index, index + 4).map(async cluster => {
            try { return { cluster, insights: await provider.listInsights(cluster, controller.signal) }; }
            catch (error) {
              if (controller.signal.aborted) throw error;
              return { cluster, insights: [], error: errorText(error) };
            }
          })));
        }
        if (controller.signal.aborted) return;
        setRecords(results);
        setInventoryWarnings(warnings);
        if (singleClusterContext) {
          const match = provider.mode === 'demo' ? results.find(r => r.cluster.contextName === singleClusterContext) : undefined;
          setSelected(previous => previous ?? match?.cluster.id);
        }
      } catch (error) {
        if (!controller.signal.aborted) { setRecords([]); setLoadError(errorText(error)); }
      } finally { if (!controller.signal.aborted) setLoading(false); }
    }
    void load();
    return () => controller.abort();
  }, [provider, reload, singleClusterContext]);

  const selectedRecord = records.find(r => r.cluster.id === selected);
  const counts = Object.fromEntries(statuses.map(status => [status, records.filter(r => recordReadiness(r) === status).length]));
  const filtered = records.filter(record => {
    const insight = latestCombined(record);
    return (filter === 'all' || recordReadiness(record) === filter ||
        (filter === 'needs-evaluation' && ['Re-check required', 'Not evaluated', 'Unavailable'].includes(recordReadiness(record))))
      && (environment === 'all' || (record.cluster.environment ?? 'Unspecified') === environment)
      && (category === 'all' || issuesFor(insight).some(i => i.issue.issueType === category))
      && `${record.cluster.name} ${record.cluster.subscription} ${record.cluster.location} ${record.cluster.resourceGroup}`.toLowerCase().includes(query.toLowerCase());
  }).sort((a, b) => sort === 'name' ? a.cluster.name.localeCompare(b.cluster.name)
    : sort === 'region' ? a.cluster.location.localeCompare(b.cluster.location)
    : readinessOrder[recordReadiness(a)] - readinessOrder[recordReadiness(b)] || a.cluster.name.localeCompare(b.cluster.name));
  const categoryCounts = Object.entries(issueLabels).map(([name, label]) => ({
    name, label, count: records.filter(r => issuesFor(latestCombined(r)).some(i => i.issue.issueType === name)).length,
  })).filter(c => c.count);
  const filteredSelected = selectedRecord && filtered.some(r => r.cluster.id === selectedRecord.cluster.id) ? selectedRecord : undefined;
  const changeProvider = (next: InsightsProvider) => {
    setProvider(next); setLoading(true); setReload(r => r + 1); setRecords([]); setSelected(undefined); setQuery(''); setFilter('all');
    setEnvironment('all'); setCategory('all'); setSettings(false);
  };
  const openCluster = (record: ClusterRecord) => { setSelected(record.cluster.id); setView('cluster'); };
  const exportFleet = () => {
    const rows = [['Cluster', 'Subscription', 'Region', 'Current Kubernetes version', 'Evaluated target', 'Readiness', 'Blocking issues', 'Warnings', 'Last evaluated']];
    filtered.forEach(record => {
      const insight = latestCombined(record), issues = issuesFor(insight);
      rows.push([record.cluster.name, record.cluster.subscription, record.cluster.location, record.cluster.kubernetesVersion ?? '',
        insight?.properties.targetKubernetesVersion ?? '', recordReadiness(record),
        String(issues.filter(i => i.issue.severity === 'Blocking').length), String(issues.filter(i => i.issue.severity === 'Warning').length),
        insight?.properties.lastEvaluatedAt ?? '']);
    });
    download('aks-upgrade-readiness.csv', rows.map(row => row.map(csvCell).join(',')).join('\r\n'), 'text/csv;charset=utf-8');
  };

  return <div className={`upgrade-insights ${embedded ? 'embedded' : ''}`} data-theme={theme}>
    <header className="app-bar">
      <div className="brand"><span className="brand-mark"><Icon name="layers" size={24} /></span><strong>{embedded ? 'Upgrade Insights' : 'AKS Desktop'}</strong>{!embedded && <><span className="brand-divider" /><span>Upgrade Insights</span></>}<span className="preview-label">PREVIEW</span></div>
      {embedded && !singleClusterContext && <nav className="embedded-nav" aria-label="Upgrade Insights navigation"><button className={view === 'fleet' ? 'active' : ''} onClick={() => setView('fleet')}>Fleet readiness</button><button className={view === 'cluster' ? 'active' : ''} onClick={() => { setView('cluster'); if (!selected && records.length) setSelected(records[0].cluster.id); }}>Cluster insights</button></nav>}
      <div className="toolbar">
        <span className={`source-indicator ${provider.mode}`}><span className="status-dot" />{provider.mode === 'demo' ? 'Demo data' : 'Azure API'}</span>
        <button className="icon-button" title="Switch appearance" aria-label="Switch appearance" onClick={() => setTheme(t => t === 'light' ? 'dark' : 'light')}><Icon name="sun" /></button>
        <button className="icon-button" title="Data source settings" aria-label="Data source settings" onClick={() => setSettings(true)}><Icon name="settings" /></button>
      </div>
    </header>
    <div className="app-body">
      {!singleClusterContext && !embedded && <nav className="rail" aria-label="Upgrade Insights navigation">
        <span className="rail-label">OPERATIONS</span>
        <button className={view === 'fleet' ? 'active' : ''} onClick={() => setView('fleet')}><Icon name="layers" />Fleet readiness</button>
        <button className={view === 'cluster' ? 'active' : ''} onClick={() => { setView('cluster'); if (!selected && records.length) setSelected(records[0].cluster.id); }}><Icon name="shield" />Cluster insights</button>
        <div className="rail-bottom"><div className="rail-note"><Icon name="shield" size={18} /><strong>Know before you upgrade.</strong><p>Surface risk. Resolve blockers. Re-check readiness.</p></div><button onClick={() => setAbout(true)}><Icon name="code" />API & demo guide</button></div>
      </nav>}
      <main className="main-content">
        <div className="breadcrumbs">Operations <span>/</span> Upgrade Insights {view === 'cluster' && <><span>/</span> {selectedRecord?.cluster.name ?? 'Select a cluster'}</>}</div>
        <div className="page-heading">
          <div><div className="eyebrow">UPGRADE WITH CONFIDENCE</div><h1>{view === 'fleet' ? 'Your fleet, ready for what’s next.' : 'Cluster upgrade readiness'}</h1><p>{view === 'fleet' ? 'Find what needs attention before your next Kubernetes upgrade.' : 'Understand the risk, the affected resources, and the next best action.'}</p></div>
          <div className="toolbar"><button className="button" onClick={() => setReload(r => r + 1)} disabled={loading}><Icon name="refresh" />{loading ? 'Refreshing…' : 'Refresh stored results'}</button>{view === 'fleet' && <button className="button" onClick={exportFleet} disabled={loading || !filtered.length}><Icon name="download" />Export</button>}</div>
        </div>
        <div className="notice source-notice"><Icon name={provider.mode === 'demo' ? 'layers' : 'shield'} size={18} /><span>{provider.mode === 'demo'
          ? <><strong>Synthetic demo.</strong> No clusters are connected or changed. All evaluations and remediation are simulated.</>
          : <><strong>Live, stored evaluations.</strong> Refresh only reads the API. Generating a new evaluation requires review; this plugin never starts upgrades.</>}</span><button className="text-button" onClick={() => setSettings(true)}>Data source <Icon name="arrow" size={16} /></button></div>
        {singleClusterContext && <div className="context-note">Headlamp context: <code>{singleClusterContext}</code>. {provider.mode === 'demo' ? 'Demo clusters are synthetic, not this connected context.' : 'Select the matching ARM cluster below; context names are not authoritative ARM identifiers.'}</div>}
        {loadError && <div className="notice error" role="alert"><Icon name="alert" /><div><strong>Could not load clusters</strong><p>{loadError}</p><button className="text-button" onClick={() => setReload(r => r + 1)}>Retry</button></div></div>}
        {!!inventoryWarnings.length && <div className="notice error" role="alert"><Icon name="alert" /><div><strong>Partial fleet inventory — some subscriptions could not be read</strong>{inventoryWarnings.map(warning => <p key={warning}>{warning}</p>)}<p>Counts cover reachable subscriptions only. Refresh to retry.</p></div></div>}
        {loading ? <div className="loading-panel" role="status"><span className="spinner" /><h2>Gathering upgrade readiness</h2><p>Reading each cluster’s stored evaluations. No checks or upgrades are triggered.</p></div>
          : view === 'fleet' ? <>
            <section className="metrics" aria-label="Fleet readiness filters">
              <Metric label="Total clusters" value={records.length} note="Latest combined evaluations" selected={filter === 'all'} onClick={() => setFilter('all')} />
              <Metric label="Blocked" value={counts.Blocked} note="Resolve before upgrading" variant="danger" selected={filter === 'Blocked'} onClick={() => setFilter(filter === 'Blocked' ? 'all' : 'Blocked')} />
              <Metric label="Review warnings" value={counts['Review warnings']} note="Potential workload risk" variant="warning" selected={filter === 'Review warnings'} onClick={() => setFilter(filter === 'Review warnings' ? 'all' : 'Review warnings')} />
              <Metric label="Ready" value={counts.Ready} note="No issues in the snapshot" variant="success" selected={filter === 'Ready'} onClick={() => setFilter(filter === 'Ready' ? 'all' : 'Ready')} />
              <Metric label="Needs evaluation" value={counts['Re-check required'] + counts['Not evaluated'] + counts.Unavailable} note="Stale, missing, or unavailable" selected={filter === 'needs-evaluation'} onClick={() => setFilter(filter === 'needs-evaluation' ? 'all' : 'needs-evaluation')} />
            </section>
            <section className="category-bar" aria-label="Filter by issue category"><span>RISK SIGNALS</span>{categoryCounts.map(c => <button key={c.name} className={category === c.name ? 'active' : ''} aria-pressed={category === c.name} onClick={() => setCategory(category === c.name ? 'all' : c.name)}>{c.label}<strong>{c.count}</strong></button>)}{!categoryCounts.length && <span>No issues in available snapshots</span>}</section>
            <div className={`fleet-workspace ${filteredSelected ? 'with-inspector' : ''}`}>
              <section className="panel cluster-list" aria-label="Cluster readiness list">
                <div className="panel-heading"><div><h2>Cluster readiness <span className="count">{filtered.length}</span></h2><p>Kubernetes version upgrades · latest combined check per cluster · targets may differ</p></div></div>
                <div className="filter-bar">
                  <div className="search-field"><Icon name="search" size={18} /><input aria-label="Search clusters" placeholder="Search clusters, regions, subscriptions…" value={query} onChange={e => setQuery(e.target.value)} /></div>
                  <select aria-label="Readiness filter" value={filter} onChange={e => setFilter(e.target.value)}><option value="all">All readiness</option><option value="needs-evaluation">Needs evaluation</option>{statuses.map(s => <option key={s}>{s}</option>)}</select>
                  <select aria-label="Environment filter" value={environment} onChange={e => setEnvironment(e.target.value)}><option value="all">All environments</option>{[...new Set(records.map(r => r.cluster.environment ?? 'Unspecified'))].map(e => <option key={e}>{e}</option>)}</select>
                  <select aria-label="Sort clusters" value={sort} onChange={e => setSort(e.target.value)}><option value="risk">Risk first</option><option value="name">Name</option><option value="region">Region</option></select>
                </div>
                {(filter !== 'all' || environment !== 'all' || category !== 'all' || query) && <div className="active-filters"><span>Filtered results{category !== 'all' ? ` · ${issueLabels[category] ?? category}` : ''}</span><button className="text-button" onClick={() => { setFilter('all'); setEnvironment('all'); setCategory('all'); setQuery(''); }}>Clear filters</button></div>}
                <div className="table-scroll"><table><thead><tr><th>Cluster</th><th>Readiness</th><th>Version → target</th><th>Issues</th><th>Last evaluated</th></tr></thead><tbody>{filtered.map(record => {
                  const insight = latestCombined(record), issues = issuesFor(insight);
                  const blocking = issues.filter(i => i.issue.severity === 'Blocking').length;
                  const warnings = issues.filter(i => i.issue.severity === 'Warning').length;
                  return <tr key={record.cluster.id} className={selected === record.cluster.id ? 'selected-row' : ''}>
                    <td><button className="cluster-name" aria-label={`Inspect ${record.cluster.name}`} onClick={() => setSelected(selected === record.cluster.id ? undefined : record.cluster.id)}><span className="cluster-icon"><Icon name="layers" size={18} /></span><span><strong>{record.cluster.name}</strong><small>{record.cluster.location} <span>·</span> {record.cluster.environment ?? record.cluster.resourceGroup}</small></span></button></td>
                    <td><Badge value={recordReadiness(record)} /></td><td><span className="version-path">{record.cluster.kubernetesVersion ?? 'Unknown'}<span>→</span>{insight?.properties.targetKubernetesVersion ?? 'Not evaluated'}</span></td>
                    <td><div className="issue-counts"><span className={blocking ? 'danger-text' : 'muted'}>{blocking} blockers</span><span className={warnings ? 'warning-text' : 'muted'}>{warnings} warnings</span></div></td>
                    <td><span className="small muted">{insight ? formatTime(insight.properties.lastEvaluatedAt) : 'No stored result'}</span></td>
                  </tr>;
                })}</tbody></table></div>
                {!filtered.length && <Empty title={records.length ? 'No clusters match your filters' : 'No AKS clusters found'} text={records.length ? 'Try a different readiness state, category, or search.' : 'Check the selected subscriptions and access, or switch to demo data.'} />}
                <div className="table-footer"><span>{filtered.length} of {records.length} clusters</span><span>Readiness is a snapshot, not an upgrade guarantee.</span></div>
              </section>
              {filteredSelected && <aside className="panel inspector" aria-label={`Insights for ${filteredSelected.cluster.name}`}>
                <div className="inspector-header"><span className="eyebrow">CLUSTER SNAPSHOT</span><button className="icon-button" aria-label="Close cluster inspector" onClick={() => setSelected(undefined)}><Icon name="close" size={18} /></button></div>
                <h2>{filteredSelected.cluster.name}</h2><p className="muted small">{filteredSelected.cluster.location} · {filteredSelected.cluster.subscription}</p>
                <ReadinessSummary record={filteredSelected} insight={latestCombined(filteredSelected)} compact />
                <h3>What needs attention</h3><IssueList insight={latestCombined(filteredSelected)} onIssue={setIssue} limit={3} />
                <div className="inspector-actions"><button className="button primary" onClick={() => openCluster(filteredSelected)}>Explore cluster <Icon name="arrow" size={18} /></button><button className="button" onClick={() => setGenerateFor(filteredSelected)}><Icon name="refresh" size={18} />Re-check readiness</button></div>
              </aside>}
            </div>
          </> : <>
            <div className="cluster-nav">{!singleClusterContext && <button className="text-button" onClick={() => setView('fleet')}><Icon name="back" size={18} />Fleet readiness</button>}
              <label>Cluster <select aria-label="Select cluster" value={selected ?? ''} onChange={e => setSelected(e.target.value)}><option value="" disabled>Select a {provider.mode === 'demo' ? 'demo ' : ''}cluster</option>{records.map(r => <option key={r.cluster.id} value={r.cluster.id}>{r.cluster.name} · {r.cluster.location}</option>)}</select></label>
            </div>
            {selectedRecord ? <ClusterDetail key={selectedRecord.cluster.id} record={selectedRecord} onIssue={setIssue} onGenerate={() => setGenerateFor(selectedRecord)} onToast={setToast} /> : <Empty title="Choose a cluster" text="Select a cluster to inspect readiness for its control plane, node pools, and node OS images." />}
          </>}
        <footer className="page-footer"><span>AKS Upgrade Insights <span>·</span> API {API_VERSION}</span><button className="text-button" onClick={() => setAbout(true)}>How readiness works <Icon name="external" size={14} /></button></footer>
      </main>
    </div>
    {toast && <div className="toast" role="status"><Icon name="check" size={18} />{toast}<button className="icon-button" aria-label="Dismiss notification" onClick={() => setToast('')}><Icon name="close" size={16} /></button></div>}
    {settings && <Settings mode={provider.mode} onClose={() => setSettings(false)} onDemo={() => changeProvider(demo)} onLive={(subscriptions, key) => changeProvider(new ArmProvider(bridgeTransport(key), subscriptions))} onReset={() => { demo.reset(); setReload(r => r + 1); setSettings(false); setToast('Demo scenarios reset. No live resources were changed.'); }} />}
    {about && <Modal title="Know before you upgrade" onClose={() => setAbout(false)} wide><div className="modal-body guide-grid"><div><span className="step-number">01</span><h3>Scan the fleet</h3><p>Start with blocked clusters. Filter by risk signal, then inspect a cluster without losing your place.</p></div><div><span className="step-number">02</span><h3>Understand the impact</h3><p>Open an issue for the affected resources and recommended actions. Kubernetes version and node OS image readiness are separate.</p></div><div><span className="step-number">03</span><h3>Resolve, then re-check</h3><p>In demo mode, simulate remediation and generate a fresh evaluation. A clean snapshot is not a guarantee of a successful upgrade.</p></div></div><div className="modal-body api-note"><h3>Grounded in the API</h3><p>Fleet readiness aggregates each cluster’s latest combined evaluation. There is no assumed fleet endpoint. GET/LIST read stored results; POST <code>generateUpgradeInsights</code> computes and stores a new result, but does not upgrade a cluster. Results expire at the server-provided <code>expiresAt</code>. This UI also marks snapshots older than 24 hours for re-checking; that is a client policy, not the API retention period.</p><p>Upstream <a href="https://github.com/kubernetes-sigs/headlamp/pull/5747" target="_blank" rel="noreferrer">Headlamp PR #5747</a> visualizes node upgrade execution from Kubernetes Events. That is separate from pre-upgrade readiness and is not fabricated here.</p><p className="muted">Demo walkthrough: inspect aks-checkout-prod → open Disruption budgets → simulate remediation → re-check readiness → review the newly generated result.</p></div></Modal>}
    {generateFor && <GenerateDialog record={generateFor} provider={provider} onClose={() => setGenerateFor(undefined)} onComplete={insight => {
      setRecords(previous => previous.map(r => r.cluster.id !== generateFor.cluster.id ? r : { ...r, error: undefined, insights: [...r.insights.filter(i => i.name !== insight.name), insight] }));
      setGenerateFor(undefined); setToast(`${provider.mode === 'demo' ? 'Simulated' : 'New'} evaluation completed. No upgrade was started.`);
    }} />}
    {issue && <IssueDialog item={issue} onClose={() => setIssue(undefined)} canSimulate={provider instanceof DemoProvider && !!selectedRecord} onSimulate={() => {
      if (!(provider instanceof DemoProvider) || !selectedRecord) return;
      provider.simulateRemediation(selectedRecord.cluster); setIssue(undefined);
      setToast('Demo remediation simulated for this cluster. Re-check readiness to see the new result.');
    }} />}
  </div>;
}

function Metric({ label, value, note, variant = '', selected, onClick }: { label: string; value: number; note: string; variant?: string; selected: boolean; onClick: () => void }) {
  return <button className={`metric ${variant} ${selected ? 'selected' : ''}`} aria-pressed={selected} onClick={onClick}><span>{label}</span><strong>{value.toLocaleString()}</strong><small>{note}</small></button>;
}
function Empty({ title, text }: { title: string; text: string }) {
  return <div className="empty"><Icon name="shield" size={34} /><h3>{title}</h3><p>{text}</p></div>;
}
function ReadinessSummary({ record, insight, compact = false }: { record: ClusterRecord; insight?: Insight; compact?: boolean }) {
  const status = record.error ? 'Unavailable' : readiness(insight, record.cluster);
  const stale = insight ? freshness(insight, record.cluster) : undefined;
  const messages: Record<Readiness, string> = {
    Blocked: 'Resolve blocking issues, then generate a new evaluation before upgrading.',
    'Review warnings': 'No blocking issues reported. Review warnings for potential workload impact.',
    Ready: 'No issues detected for this scope and target in the stored snapshot. Re-check before upgrading.',
    'Re-check required': stale ?? 'Generate a fresh evaluation before relying on this result.',
    'Not evaluated': 'A complete evaluation is not available for this scope. Missing results never mean ready.',
    Unavailable: record.error ?? 'The evaluation could not complete or contains an unsupported result. Retry or inspect the API response.',
  };
  return <div className={`readiness-summary ${tone(status)} ${compact ? 'compact' : ''}`}><div className="summary-symbol"><Icon name={status === 'Ready' ? 'shield' : status === 'Blocked' ? 'alert' : 'clock'} size={compact ? 22 : 28} /></div><div><Badge value={status} /><p>{messages[status]}</p>{insight && <small>Evaluated {formatTime(insight.properties.lastEvaluatedAt)}{!compact && <> · Expires {formatTime(insight.properties.expiresAt)}</>}</small>}</div></div>;
}
function IssueList({ insight, onIssue, limit }: { insight?: Insight; onIssue: (issue: ScopedIssue) => void; limit?: number }) {
  const issues = issuesFor(insight).sort((a, b) => (a.issue.severity === 'Blocking' ? 0 : 1) - (b.issue.severity === 'Blocking' ? 0 : 1));
  if (!issues.length) return <div className="no-issues"><Icon name={insight ? 'check' : 'clock'} size={18} /><span>{insight ? 'No detected issues in this snapshot. Check readiness and freshness above.' : 'No evaluation available yet.'}</span></div>;
  return <div className="issue-list">{issues.slice(0, limit ?? issues.length).map(item => <button key={item.key} className="issue-card" onClick={() => onIssue(item)}><span className={`issue-symbol ${tone(item.issue.severity ?? '')}`}><Icon name="alert" size={19} /></span><span className="issue-copy"><span className="issue-title">{issueLabels[item.issue.issueType ?? ''] ?? item.issue.issueType ?? 'Unclassified issue'}<span className={`severity ${tone(item.issue.severity ?? '')}`}>{item.issue.severity ?? 'Unknown severity'}</span></span><span className="issue-description">{item.issue.message ?? 'No description was returned by the API.'}</span><span className="issue-meta">{item.scope} <span>·</span> {item.issue.impactedResources?.length ?? 0} affected resources</span></span><Icon name="arrow" size={17} /></button>)}</div>;
}

function ClusterDetail({ record, onIssue, onGenerate, onToast }: { record: ClusterRecord; onIssue: (issue: ScopedIssue) => void; onGenerate: () => void; onToast: (message: string) => void }) {
  const [tab, setTab] = useState('readiness');
  const [insightName, setInsightName] = useState('');
  const insight = record.insights.find(i => i.name === insightName) ?? latestCombined(record) ?? record.insights[0];
  const scopeResults = insight ? scopes(insight) : [];
  const context = scopeResults.find(s => s.name === 'Control plane')?.result.context ?? scopeResults[0]?.result.context;
  const issueItems = issuesFor(insight);
  const p = insight?.properties;
  return <div className="cluster-detail">
    <section className="panel cluster-hero">
      <div className="cluster-hero-heading"><span className="cluster-icon large"><Icon name="layers" size={28} /></span><div><h2>{record.cluster.name}</h2><p>{record.cluster.resourceGroup} <span>·</span> {record.cluster.location}</p></div><button className="button primary" onClick={onGenerate}><Icon name="refresh" size={18} />Evaluate a target</button></div>
      <div className="cluster-facts"><div><span>Current Kubernetes</span><strong>{record.cluster.kubernetesVersion ?? 'Unknown'}</strong></div><div><span>Node pools</span><strong>{record.cluster.pools.length}</strong></div><div><span>Subscription</span><strong>{record.cluster.subscription}</strong></div><div><span>Environment</span><strong>{record.cluster.environment ?? 'Not provided'}</strong></div></div>
    </section>
    <div className="detail-tabs" role="tablist" aria-label="Cluster insight sections">{[['readiness', 'Readiness & actions'], ['scopes', 'Scope breakdown'], ['api', 'API response']].map(([id, label]) => <button key={id} role="tab" id={`tab-${id}`} aria-controls={`panel-${id}`} aria-selected={tab === id} tabIndex={tab === id ? 0 : -1} onKeyDown={e => {
      const ids = ['readiness', 'scopes', 'api'];
      if (['ArrowRight', 'ArrowLeft', 'Home', 'End'].includes(e.key)) {
        e.preventDefault();
        const next = e.key === 'Home' ? 'readiness' : e.key === 'End' ? 'api' : ids[(ids.indexOf(tab) + (e.key === 'ArrowRight' ? 1 : 2)) % ids.length];
        setTab(next); document.getElementById(`tab-${next}`)?.focus();
      }
    }} onClick={() => setTab(id)}>{label}</button>)}</div>
    <div className="evaluation-selector"><label>Stored evaluation <select aria-label="Stored evaluation" value={insight?.name ?? ''} onChange={e => setInsightName(e.target.value)}>{!record.insights.length && <option>No stored evaluations</option>}{record.insights.map(i => <option key={i.name} value={i.name}>{scopeLabels[i.properties.upgradeType as UpgradeType] ?? i.properties.upgradeType}{i.properties.agentPoolName ? ` · ${i.properties.agentPoolName}` : ''} → {i.properties.targetKubernetesVersion ?? i.properties.targetNodeImageVersion ?? 'Unknown target'}</option>)}</select></label><span className="muted small">Node OS image checks are separate from Kubernetes version checks.</span></div>
    <div role="tabpanel" id={`panel-${tab}`} aria-labelledby={`tab-${tab}`}>
      {tab === 'readiness' && <div className="detail-grid"><div><ReadinessSummary record={record} insight={insight} /><section className="panel issues-panel"><div className="panel-heading"><div><h2>Detected issues <span className="count">{issueItems.length}</span></h2><p>Prioritized by severity. Open an issue for impact and recommended actions.</p></div></div><IssueList insight={insight} onIssue={onIssue} /></section></div><aside className="panel upgrade-context"><span className="eyebrow">EVALUATION CONTEXT</span><h3>{p?.upgradeType === 'NodeImage' ? 'Node OS image update' : 'Kubernetes version upgrade'}</h3><div className="target-journey"><span>{p?.upgradeType === 'NodeImage' ? p.currentNodeImageVersion ?? 'Unknown' : scopeResults[0]?.result.currentKubernetesVersion ?? record.cluster.kubernetesVersion ?? 'Unknown'}</span><Icon name="arrow" size={22} /><strong>{p?.targetKubernetesVersion ?? p?.targetNodeImageVersion ?? 'Choose a target'}</strong></div><dl><dt>Evaluation scope</dt><dd>{p ? scopeLabels[p.upgradeType as UpgradeType] ?? p.upgradeType : 'Not evaluated'}</dd><dt>Upgrade strategy</dt><dd>{context?.currentUpgradeStrategy ?? 'Not provided'}</dd><dt>Next maintenance window</dt><dd>{formatTime(context?.nextMaintenanceWindow?.startTime)}{context?.nextMaintenanceWindow?.endTime && <small>Ends {formatTime(context.nextMaintenanceWindow.endTime)}</small>}</dd><dt>Last successful upgrade</dt><dd>{formatTime(context?.lastSuccessfulUpgradeTime)}</dd><dt>Stored evaluations</dt><dd>{record.insights.length}</dd></dl><div className="context-callout"><Icon name="shield" size={18} /><p>Evaluation only. This plugin does not start upgrades, alter disruption budgets, or change cluster settings.</p></div></aside></div>}
      {tab === 'scopes' && <section className="panel"><div className="panel-heading"><div><h2>Scope breakdown</h2><p>Per-scope results for the selected evaluation. Combined readiness does not include node OS image readiness.</p></div></div><div className="table-scroll"><table><thead><tr><th>Scope</th><th>Evaluated from</th><th>Result</th><th>Issues</th><th>Evaluated</th><th>Version support</th></tr></thead><tbody>{scopeResults.map(({ name, result }) => <tr key={name}><td><strong>{name}</strong></td><td>{p?.upgradeType === 'NodeImage' ? p.currentNodeImageVersion : result.currentKubernetesVersion ?? 'Not provided'}</td><td><Badge value={result.evaluation?.status ?? 'Not evaluated'} /></td><td>{result.evaluation?.detectedIssues?.length ?? 0}</td><td>{formatTime(result.evaluation?.evaluatedAt)}</td><td>{result.kubernetesVersionSupportStatus ?? 'Not provided'}{result.kubernetesVersionEndOfSupportDate && <small className="block muted">Ends {result.kubernetesVersionEndOfSupportDate}</small>}</td></tr>)}</tbody></table></div>{!scopeResults.length && <Empty title="No scope results" text="Generate an evaluation to inspect scope-level results." />}</section>}
      {tab === 'api' && <section className="panel api-panel"><div className="panel-heading"><div><h2>Stored API response</h2><p>Exact {API_VERSION} resource shape. {record.cluster.subscription === 'KubeCon demo' ? 'This payload is synthetic.' : 'This payload may contain private resource identifiers.'}</p></div><button className="button" disabled={!insight} onClick={() => { if (insight) { download('upgrade-insight.json', JSON.stringify(insight, null, 2), 'application/json'); onToast('API response saved locally. Review resource identifiers before sharing.'); } }}><Icon name="download" size={18} />Save JSON</button></div><div className="request-line"><span>GET</span><code>{clusterBase(record.cluster)}/upgradeInsights?api-version={API_VERSION}</code></div><pre>{JSON.stringify(insight ?? { message: record.error ?? 'No stored evaluation. GET/LIST do not compute readiness.' }, null, 2)}</pre></section>}
    </div>
  </div>;
}

function IssueDialog({ item, onClose, canSimulate, onSimulate }: { item: ScopedIssue; onClose: () => void; canSimulate: boolean; onSimulate: () => void }) {
  return <Modal title={issueLabels[item.issue.issueType ?? ''] ?? item.issue.issueType ?? 'Issue details'} onClose={onClose}>
    <div className="modal-body"><div className="issue-dialog-meta"><Badge value={item.issue.severity ?? 'Unknown severity'} /><span>{item.scope}</span></div><h3>Why this matters</h3><p>{item.issue.message ?? 'The API returned no description.'}</p><h3>Affected resources</h3><div className="resource-list">{(item.issue.impactedResources ?? []).map((r, index) => <div className="resource-card" key={index}><Icon name={r.kind === 'Kubernetes' ? 'layers' : 'external'} size={18} /><div><strong>{r.resourceType ?? r.kind}</strong><code>{r.kind === 'Arm' ? r.resourceId ?? 'Identifier not provided' : `${r.namespace ? `${r.namespace}/` : ''}${r.name ?? 'Name not provided'}`}</code><small>{r.kind === 'Arm' ? 'Azure resource' : 'Kubernetes resource'}</small></div></div>)}{!item.issue.impactedResources?.length && <p className="muted">No affected resource identifiers were returned.</p>}</div><h3>Recommended actions</h3>{(item.issue.recommendedActions ?? []).map((action, index) => <div className="recommended-action" key={index}><span className="step-number">{String(index + 1).padStart(2, '0')}</span><div><strong>{action.title ?? 'Review remediation guidance'}</strong><p>{action.details ?? 'No additional detail was returned.'}</p>{safeDocumentationUrl(action.documentationLink) && <a href={safeDocumentationUrl(action.documentationLink)} target="_blank" rel="noreferrer">Read documentation <Icon name="external" size={14} /></a>}</div></div>)}{!item.issue.recommendedActions?.length && <p className="muted">No recommended actions were returned. Consult the cluster administrator.</p>}</div>
    <div className="modal-actions">{canSimulate && <div className="simulation-control"><p><strong>Demo only:</strong> simulate all issue remediations for this cluster. Existing snapshots stay unchanged until you re-check.</p><button className="button primary" onClick={onSimulate}>Simulate remediation</button></div>}<button className="button" onClick={onClose}>Close</button></div>
  </Modal>;
}

function GenerateDialog({ record, provider, onClose, onComplete }: { record: ClusterRecord; provider: InsightsProvider; onClose: () => void; onComplete: (insight: Insight) => void }) {
  const [type, setType] = useState<UpgradeType>('ControlPlaneAndAgentPools');
  const [target, setTarget] = useState(latestCombined(record)?.properties.targetKubernetesVersion ?? '');
  const [pool, setPool] = useState(record.cluster.pools[0]?.name ?? '');
  const [image, setImage] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [confirmed, setConfirmed] = useState(false);
  const request: GenerateRequest = type === 'NodeImage' ? { upgradeType: type, agentPoolName: pool, ...(image.trim() ? { targetNodeImageVersion: image.trim() } : {}) }
    : type === 'AgentPool' ? { upgradeType: type, agentPoolName: pool, targetKubernetesVersion: target.trim() }
    : { upgradeType: type, targetKubernetesVersion: target.trim() };
  const valid = (type === 'NodeImage' || /^\d+\.\d+\.\d+$/.test(target.trim())) &&
    (!['AgentPool', 'NodeImage'].includes(type) || record.cluster.pools.some(p => p.name === pool));
  const path = `${clusterBase(record.cluster)}/generateUpgradeInsights?api-version=${API_VERSION}`;
  const submit = async () => {
    setBusy(true); setError('');
    try { onComplete(await provider.generate(record.cluster, request)); }
    catch (error) { setError(errorText(error)); setBusy(false); }
  };
  return <Modal title="Evaluate upgrade readiness" onClose={() => { if (!busy) onClose(); }} wide>
    <div className="modal-body"><div className="notice"><Icon name="shield" size={20} /><span>{provider.mode === 'demo' ? 'Simulated evaluation. No Azure API calls are made.' : 'This POST computes and stores readiness. It does not upgrade your cluster, but it does update the stored insight.'}</span></div><p>Cluster: <strong>{record.cluster.name}</strong></p><div className="form-grid"><label>Upgrade scope<select disabled={busy} value={type} onChange={e => { setType(e.target.value as UpgradeType); setConfirmed(false); }}>{upgradeTypes.map(t => <option key={t} value={t}>{scopeLabels[t]}</option>)}</select></label>{['AgentPool', 'NodeImage'].includes(type) && <label>Node pool<select disabled={busy} value={pool} onChange={e => { setPool(e.target.value); setConfirmed(false); }}>{record.cluster.pools.map(p => <option key={p.name}>{p.name}</option>)}</select></label>}{type !== 'NodeImage' ? <label>Target Kubernetes version<input disabled={busy} value={target} onChange={e => { setTarget(e.target.value); setConfirmed(false); }} placeholder="e.g. 1.34.2" /><small>Enter an available upgrade target. The API validates eligibility.</small></label> : <label>Target node image (optional)<input disabled={busy} value={image} onChange={e => { setImage(e.target.value); setConfirmed(false); }} placeholder="Latest available image" /><small>When omitted, the server resolves the latest image and returns the actual target.</small></label>}</div><h3>Review the exact request</h3><div className="request-line"><span>POST</span><code>{path}</code></div><pre className="request-json">{JSON.stringify(request, null, 2)}</pre>{provider.mode === 'live' && <label className="confirm-check"><input type="checkbox" checked={confirmed} disabled={busy} onChange={e => setConfirmed(e.target.checked)} /><span>I approve sending this request to Azure for <strong>{record.cluster.name}</strong>. It contains a private resource identifier and will update the stored evaluation.</span></label>}{error && <div className="notice error" role="alert">{error}</div>}</div>
    <div className="modal-actions"><button className="button" disabled={busy} onClick={onClose}>Cancel</button><button className="button primary" disabled={busy || !valid || (provider.mode === 'live' && !confirmed)} onClick={() => void submit()}>{busy ? <><span className="spinner small-spinner" />Evaluating…</> : <><Icon name="shield" size={18} />{provider.mode === 'demo' ? 'Run simulated evaluation' : 'Generate evaluation'}</>}</button></div>
  </Modal>;
}

function Settings({ mode, onClose, onDemo, onLive, onReset }: { mode: 'demo' | 'live'; onClose: () => void; onDemo: () => void; onLive: (subscriptions: string[], key: string) => void; onReset: () => void }) {
  const [subscription, setSubscription] = useState('');
  const [key, setKey] = useState('');
  const [error, setError] = useState('');
  return <Modal title="Data source" onClose={onClose}><div className="modal-body"><h3>Synthetic demo</h3><p>Eight clusters with blockers, warnings, ready, expired, and missing evaluations. Works without Azure, Kubernetes, or authentication.</p><div className="toolbar"><button className="button" onClick={onDemo}>Use demo data</button>{mode === 'demo' && <button className="text-button" onClick={onReset}>Reset demo scenarios</button>}</div><hr /><h3>Live Azure API <span className="preview-label">OPT-IN</span></h3><p>Use the included loopback bridge with your existing Azure CLI sign-in. Azure access tokens stay in the CLI; the pairing key stays in memory and is not saved.</p><label>Subscription IDs (comma-separated)<input value={subscription} onChange={e => setSubscription(e.target.value)} placeholder="00000000-0000-0000-0000-000000000000" autoComplete="off" /></label><label>Local bridge pairing key<input type="password" value={key} onChange={e => setKey(e.target.value)} placeholder="Key printed by npm run bridge" autoComplete="off" /></label><p className="small muted">Bridge: http://127.0.0.1:4319. See SETUP.txt for allowed origins, RBAC, preview access, and read-only defaults. No automatic fallback to demo data.</p>{error && <div role="alert" className="notice error">{error}</div>}<button className="button primary" onClick={() => {
    const subscriptions = subscription.split(',').map(s => s.trim()).filter(Boolean);
    if (!subscriptions.length || subscriptions.some(s => !/^[a-f0-9-]{36}$/i.test(s)) || !/^[a-f0-9]{64}$/i.test(key.trim())) { setError('Enter valid subscription IDs and the 64-character local bridge key.'); return; }
    onLive(subscriptions, key.trim());
  }}>Connect read-only data</button></div></Modal>;
}
