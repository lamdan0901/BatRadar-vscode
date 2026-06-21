import { ProviderState } from '../providers/types';

export function getWebviewContent(initialStates: ProviderState[]): string {
  const providerCardsHtml = initialStates.map(s => buildProviderCard(s)).join('\n');

  return /* html */ `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>BatRadar — AI Usage</title>
<style>
:root {
  --bg-primary:    var(--vscode-editor-background, #0f0f1a);
  --bg-card:       var(--vscode-sideBar-background, #16213e);
  --bg-bar:        var(--vscode-input-background, #1a1a2e);
  --text-primary:  var(--vscode-foreground, #e2e8f0);
  --text-muted:    var(--vscode-descriptionForeground, #94a3b8);
  --text-dim:      var(--vscode-disabledForeground, #64748b);
  --border:        var(--vscode-widget-border, #2d3748);
  --color-green:   #22C55E;
  --color-yellow:  #EAB308;
  --color-orange:  #F97316;
  --color-red:     #EF4444;
  --accent-claude: #D97706;
  --accent-codex:  #10B981;
}
* { box-sizing: border-box; margin: 0; padding: 0; }
body {
  font-family: var(--vscode-font-family, 'Segoe UI', system-ui, sans-serif);
  font-size: var(--vscode-font-size, 13px);
  background: var(--bg-primary);
  color: var(--text-primary);
  line-height: 1.5;
  padding: 16px 20px;
}
h2 {
  font-size: 16px;
  font-weight: 700;
  margin-bottom: 16px;
  display: flex;
  align-items: center;
  gap: 8px;
}
.provider-card {
  background: var(--bg-card);
  border: 1px solid var(--border);
  border-radius: 10px;
  padding: 14px 16px;
  margin-bottom: 12px;
  transition: border-color 0.2s;
}
.provider-card.active { border-color: var(--accent-claude); }
.provider-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 12px;
}
.provider-name-row {
  display: flex;
  align-items: center;
  gap: 8px;
}
.provider-dot {
  width: 10px;
  height: 10px;
  border-radius: 50%;
}
.provider-name {
  font-size: 14px;
  font-weight: 700;
}
.plan-tag {
  font-size: 10px;
  font-weight: 600;
  padding: 2px 8px;
  border-radius: 99px;
  background: var(--bg-primary);
  color: var(--text-muted);
  border: 1px solid var(--border);
  text-transform: uppercase;
  letter-spacing: 0.03em;
}
.status-badge {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  font-size: 11px;
  padding: 3px 10px;
  border-radius: 99px;
  font-weight: 600;
}
.status-badge.connected    { background: #14532d; color: #4ade80; }
.status-badge.disconnected { background: #1c1c2e; color: var(--text-dim); }
.status-badge.disabled     { background: #1e293b; color: #94a3b8; }
.status-badge.expired      { background: #451a03; color: #fb923c; }
.status-badge.error        { background: #450a0a; color: #f87171; }
.usage-section {
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.usage-row {
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.usage-row-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
}
.usage-label {
  font-size: 12px;
  color: var(--text-muted);
  font-weight: 500;
}
.usage-right {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 11px;
}
.usage-pct {
  font-weight: 700;
  font-size: 13px;
}
.usage-reset {
  color: var(--text-dim);
  font-size: 10px;
}
.progress-bar-wrap {
  background: var(--bg-bar);
  border-radius: 99px;
  height: 8px;
  overflow: hidden;
}
.progress-bar-fill {
  height: 100%;
  border-radius: 99px;
  transition: width 0.6s ease, background-color 0.4s;
}
.extra-usage-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding-top: 8px;
  border-top: 1px solid var(--border);
  margin-top: 4px;
  font-size: 12px;
  color: var(--text-muted);
}
.extra-usage-val {
  font-weight: 600;
  color: var(--text-primary);
}
.last-updated {
  font-size: 10px;
  color: var(--text-dim);
  text-align: right;
  margin-top: 4px;
}
.no-data {
  color: var(--text-dim);
  font-size: 11px;
  padding: 8px 0;
  text-align: center;
}
.footer {
  margin-top: 16px;
  padding-top: 12px;
  border-top: 1px solid var(--border);
  display: flex;
  align-items: center;
  justify-content: space-between;
}
.footer-status {
  font-size: 11px;
  color: var(--text-dim);
}
.btn {
  cursor: pointer;
  font-family: inherit;
  font-size: 12px;
  border: 1px solid var(--border);
  border-radius: 6px;
  padding: 6px 14px;
  background: transparent;
  color: var(--text-muted);
  transition: background 0.15s, opacity 0.15s;
}
.btn:hover { background: var(--vscode-toolbar-hoverBackground, #1e2a45); color: var(--text-primary); }
</style>
</head>
<body>

<h2>⚡ BatRadar — AI Usage</h2>

<div id="providers">
  ${providerCardsHtml || '<div class="no-data">No providers enabled</div>'}
</div>

<div class="footer">
  <span class="footer-status" id="status-text">Live</span>
  <button class="btn" id="btn-refresh">↻ Refresh</button>
</div>

<script>
const vscode = acquireVsCodeApi();

document.getElementById('btn-refresh').addEventListener('click', () => {
  vscode.postMessage({ type: 'refresh' });
});

window.addEventListener('message', (event) => {
  const msg = event.data;
  if (msg.type === 'usage-update') {
    updateProviderUsage(msg.provider, msg.data);
  } else if (msg.type === 'provider-status-changed') {
    updateProviderStatus(msg.provider, msg.status);
  } else if (msg.type === 'full-update') {
    for (const s of msg.states) {
      updateProviderCard(s);
    }
  }
});

function updateProviderCard(state) {
  const card = document.getElementById('card-' + state.id);
  if (!card) return;
  const badge = card.querySelector('.status-badge');
  if (badge) {
    badge.className = 'status-badge ' + state.status;
    badge.textContent = statusLabel(state.status);
  }
  if (state.status === 'connected' && state.usage) {
    updateProviderUsage(state.id, state.usage);
    card.classList.add('active');
  } else if (['disconnected', 'disabled', 'expired', 'error'].includes(state.status)) {
    card.classList.remove('active');
    const sec = document.getElementById('usage-' + state.id);
    if (sec) sec.innerHTML = '<div class="no-data">' + hint(state.id, state.status) + '</div>';
  }
}

function updateProviderStatus(provider, status) {
  const card = document.getElementById('card-' + provider);
  if (!card) return;
  const badge = card.querySelector('.status-badge');
  if (badge) {
    badge.className = 'status-badge ' + status;
    badge.textContent = statusLabel(status);
  }
  if (['disconnected', 'disabled', 'expired', 'error'].includes(status)) {
    card.classList.remove('active');
    const sec = document.getElementById('usage-' + provider);
    if (sec) sec.innerHTML = '<div class="no-data">' + hint(provider, status) + '</div>';
  }
}

function updateProviderUsage(provider, data) {
  const card = document.getElementById('card-' + provider);
  if (!card) return;
  card.classList.add('active');
  const sec = document.getElementById('usage-' + provider);
  if (!sec) return;

  let html = '';
  if (data.session)       html += usageRow('Session (5h)',    data.session);
  if (data.weekly)        html += usageRow('Weekly (7d)',     data.weekly);
  if (data.weekly_sonnet) html += usageRow('Weekly Sonnet',   data.weekly_sonnet);
  if (data.weekly_opus)   html += usageRow('Weekly Opus',     data.weekly_opus);
  if (data.extra_usage) {
    const eu = data.extra_usage;
    html += '<div class="extra-usage-row"><span>Extra Usage</span>'
         +  '<span class="extra-usage-val">$' + eu.spend.toFixed(2) + ' / $' + eu.limit.toFixed(2) + ' ' + (eu.currency || 'USD') + '</span></div>';
  }
  if (data.last_updated) {
    html += '<div class="last-updated">Updated ' + new Date(data.last_updated).toLocaleTimeString() + '</div>';
  }
  sec.innerHTML = html || '<div class="no-data">No data</div>';
  document.getElementById('status-text').textContent = 'Updated just now';
}

function usageRow(label, w) {
  var u     = w.utilization;
  var rem   = 1 - u;
  var color = usageColor(u);
  var remPct = Math.round(rem * 100);
  var resetText = usageResetText(label, w.reset_at);
  return '<div class="usage-row">'
    + '<div class="usage-row-header">'
    +   '<span class="usage-label">' + label + '</span>'
    +   '<div class="usage-right">'
    +     '<span class="usage-pct" style="color:' + color + '">' + remPct + '%' + (u >= 0.95 ? ' ⚠' : '') + '</span>'
    +     '<span class="usage-reset">resets ' + resetText + '</span>'
    +   '</div>'
    + '</div>'
    + '<div class="progress-bar-wrap">'
    +   '<div class="progress-bar-fill" style="width:' + Math.round(u * 100) + '%;background:' + color + '"></div>'
    + '</div>'
    + '</div>';
}

function usageColor(u) {
  if (u >= 0.95) return '#EF4444';
  if (u >= 0.80) return '#F97316';
  if (u >= 0.60) return '#EAB308';
  return '#22C55E';
}

function secondsUntil(iso) {
  if (!iso) return 0;
  return Math.max(0, Math.floor((new Date(iso).getTime() - Date.now()) / 1000));
}

function formatDuration(seconds) {
  if (seconds <= 0) return 'now';
  var d = Math.floor(seconds / 86400);
  var h = Math.floor((seconds % 86400) / 3600);
  var m = Math.floor((seconds % 3600) / 60);
  if (d > 0) return 'in ' + d + 'd ' + h + 'h';
  if (h > 0) return 'in ' + h + 'h ' + m + 'm';
  return 'in ' + m + 'm';
}

function usageResetText(label, iso) {
  if (label.indexOf('Weekly') === 0) {
    return resetDateTimeLabel(iso);
  }
  var rst = formatDuration(secondsUntil(iso));
  var clock = resetClock(iso);
  return rst + ' until ' + clock;
}

function resetClock(iso) {
  if (!iso) return '—';
  var d = new Date(iso);
  var hours = d.getHours();
  var mins = d.getMinutes();
  var ampm = hours >= 12 ? 'PM' : 'AM';
  var h12 = hours % 12 || 12;
  var mm = mins < 10 ? '0' + mins : '' + mins;
  return h12 + ':' + mm + ' ' + ampm;
}

function resetDateTimeLabel(iso) {
  if (!iso) return '—';
  var d = new Date(iso);
  var months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  var hours = d.getHours();
  var mins = d.getMinutes();
  var ampm = hours >= 12 ? 'PM' : 'AM';
  var h12 = hours % 12 || 12;
  var hh = h12 < 10 ? '0' + h12 : '' + h12;
  var mm = mins < 10 ? '0' + mins : '' + mins;
  return hh + ':' + mm + ampm + ' on ' + d.getDate() + ' ' + months[d.getMonth()];
}

function statusLabel(s) {
  var map = { connected: '● Connected', disconnected: '○ Disconnected', disabled: '⏸ Disabled', expired: '⚠ Expired', error: '✕ Error' };
  return map[s] || s;
}

function hint(id, status) {
  if (status === 'disabled') return 'Provider disabled — enable in settings';
  if (status === 'expired') return 'Token expired — re-authenticate';
  if (status === 'error') return 'Connection error — retrying…';
  if (id === 'claude') return 'Not connected — run: claude login';
  if (id === 'codex') return 'Not connected — run: codex';
  return 'Not connected';
}
</script>
</body>
</html>`;
}

function buildProviderCard(state: ProviderState): string {
  const color = state.id === 'claude' ? '#D97706' : '#10B981';
  const name = state.id === 'claude' ? 'Claude' : 'Codex';
  const isActive = state.status === 'connected';
  const statusLabel = getStatusLabel(state.status);
  const planTag = state.usage?.plan_type
    ? `<span class="plan-tag">${escapeHtml(state.usage.plan_type)}</span>`
    : '';

  let usageHtml: string;
  if (isActive && state.usage) {
    usageHtml = buildUsageHtml(state.usage);
  } else {
    usageHtml = `<div class="no-data">${getHint(state.id, state.status)}</div>`;
  }

  return `
  <div class="provider-card ${isActive ? 'active' : ''}" id="card-${state.id}">
    <div class="provider-header">
      <div class="provider-name-row">
        <div class="provider-dot" style="background:${color}"></div>
        <span class="provider-name">${name}</span>
        ${planTag}
      </div>
      <span class="status-badge ${state.status}">${statusLabel}</span>
    </div>
    <div class="usage-section" id="usage-${state.id}">
      ${usageHtml}
    </div>
  </div>`;
}

function buildUsageHtml(data: import('../providers/types').ProviderUsageData): string {
  let html = '';
  if (data.session)       { html += buildUsageRow('Session (5h)', data.session); }
  if (data.weekly)        { html += buildUsageRow('Weekly (7d)', data.weekly); }
  if (data.weekly_sonnet) { html += buildUsageRow('Weekly Sonnet', data.weekly_sonnet); }
  if (data.weekly_opus)   { html += buildUsageRow('Weekly Opus', data.weekly_opus); }
  if (data.extra_usage) {
    const eu = data.extra_usage;
    html += `<div class="extra-usage-row"><span>Extra Usage</span>`
         +  `<span class="extra-usage-val">$${eu.spend.toFixed(2)} / $${eu.limit.toFixed(2)} ${eu.currency || 'USD'}</span></div>`;
  }
  if (data.last_updated) {
    html += `<div class="last-updated">Updated ${new Date(data.last_updated).toLocaleTimeString()}</div>`;
  }
  return html || '<div class="no-data">No data</div>';
}

function buildUsageRow(label: string, w: import('../providers/types').UsageWindow): string {
  const u = w.utilization;
  const rem = 1 - u;
  const color = getUsageColor(u);
  const remPct = Math.round(rem * 100);
  const usedPct = Math.round(u * 100);
  const resetText = formatUsageResetText(label, w.reset_at);

  return `<div class="usage-row">
    <div class="usage-row-header">
      <span class="usage-label">${label}</span>
      <div class="usage-right">
        <span class="usage-pct" style="color:${color}">${remPct}%${u >= 0.95 ? ' ⚠' : ''}</span>
        <span class="usage-reset">resets ${resetText}</span>
      </div>
    </div>
    <div class="progress-bar-wrap">
      <div class="progress-bar-fill" style="width:${usedPct}%;background:${color}"></div>
    </div>
  </div>`;
}

function getUsageColor(u: number): string {
  if (u >= 0.95) return '#EF4444';
  if (u >= 0.80) return '#F97316';
  if (u >= 0.60) return '#EAB308';
  return '#22C55E';
}

function fmtResetTime(iso: string | null): string {
  if (!iso) return '—';
  const seconds = Math.max(0, Math.floor((new Date(iso).getTime() - Date.now()) / 1000));
  if (seconds <= 0) return 'now';
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  if (h > 0) return `in ${h}h ${m}m`;
  return `in ${m}m`;
}

function formatUsageResetText(label: string, iso: string | null): string {
  if (label.startsWith('Weekly')) {
    return fmtResetDateTime(iso);
  }
  const resetIn = fmtResetTime(iso);
  const clock = fmtResetClock(iso);
  return `${resetIn} until ${clock}`;
}

function fmtResetClock(iso: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  const hours = d.getHours();
  const mins = d.getMinutes();
  const ampm = hours >= 12 ? 'PM' : 'AM';
  const h12 = hours % 12 || 12;
  const mm = mins.toString().padStart(2, '0');
  return `${h12}:${mm} ${ampm}`;
}

function fmtResetDateTime(iso: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const hours = d.getHours();
  const mins = d.getMinutes();
  const ampm = hours >= 12 ? 'PM' : 'AM';
  const h12 = hours % 12 || 12;
  const hh = h12.toString().padStart(2, '0');
  const mm = mins.toString().padStart(2, '0');
  return `${hh}:${mm}${ampm} on ${d.getDate()} ${months[d.getMonth()]}`;
}

function getStatusLabel(status: string): string {
  const map: Record<string, string> = {
    connected: '● Connected',
    disconnected: '○ Disconnected',
    disabled: '⏸ Disabled',
    expired: '⚠ Expired',
    error: '✕ Error',
  };
  return map[status] || status;
}

function getHint(id: string, status: string): string {
  if (status === 'disabled') return 'Provider disabled — enable in settings';
  if (status === 'expired') return 'Token expired — re-authenticate';
  if (status === 'error') return 'Connection error — retrying…';
  if (id === 'claude') return 'Not connected — run: claude login';
  if (id === 'codex') return 'Not connected — run: codex';
  return 'Not connected';
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
