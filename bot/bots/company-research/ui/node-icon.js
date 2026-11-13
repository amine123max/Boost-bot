import { html } from '/boost-bot/amb/botapp/kit/kit.js';

// Identity and execution state are separate. Never encode a role as a status dot.
const ROLES = {
  financial_analyst: ['blue', 'M4 19h16M7 15V9m5 6V5m5 10v-4'],
  news_scanner: ['amber', 'M5 4h14v16H5ZM8 8h8M8 12h3m3 0h2M8 16h8'],
  industry_analyst: ['violet', 'M9 3h6v5H9ZM3 16h6v5H3Zm12 0h6v5h-6ZM12 8v4M6 16v-4h12v4'],
  company_analyst: ['cyan', 'M4 21V7l8-4v18M12 10h8v11M2 21h20M8 8v1m0 3v1m0 3v1m8-3v1m0 3v1'],
  grounding: ['slate', 'M5 5h14v14H5ZM9 9h6v6H9ZM12 2v3m0 14v3M2 12h3m14 0h3'],
  collector: ['blue', 'M4 5h16v5H4ZM6 10v10h12V10m-9 4h6'],
  curator: ['violet', 'M4 5h16l-6 7v7l-4 2v-9Z'],
  enricher: ['cyan', 'M12 3v18M3 12h18M6 6l12 12M6 18 18 6'],
  briefing: ['amber', 'M5 3h14v18H5ZM8 7h8M8 11h8M8 15h4'],
  editor: ['slate', 'm4 16 12-12 4 4L8 20H4ZM13 7l4 4'],
};
const STATES = { done: 'm5 12 4 4L19 6', failed: 'M12 7v6m0 4h.01M22 12a10 10 0 1 1-20 0 10 10 0 0 1 20 0Z', running: 'M12 3a9 9 0 1 1-9 9', pending: 'M12 7v5l3 2M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z' };

export function NodeIcon({ node }) {
  const [color, path] = ROLES[node] || ROLES.grounding;
  return html`<span class=${`cr-role-icon cr-role-${color}`} aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" focusable="false"><path d=${path}/></svg></span>`;
}
export function NodeState({ status, label }) {
  return html`<span class=${`cr-node-state is-${status}`}><svg aria-hidden="true" focusable="false" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d=${STATES[status] || STATES.pending}/></svg><span>${label}</span></span>`;
}
