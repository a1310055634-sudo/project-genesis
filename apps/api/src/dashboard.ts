/** Dashboard (GEN-112): a dependency-free single page reading REAL simulation
 * state via the API (guide §29: overview, person inspector, controls). */
export function dashboardHtml(): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>Project Genesis — Dashboard</title>
<style>
  :root { color-scheme: dark; }
  body { font-family: Consolas, monospace; background: #0d1117; color: #c9d1d9; margin: 0; padding: 16px; }
  h1 { font-size: 18px; color: #58a6ff; margin: 0 0 12px; }
  h2 { font-size: 13px; color: #8b949e; text-transform: uppercase; letter-spacing: 1px; margin: 18px 0 6px; }
  .row { display: flex; flex-wrap: wrap; gap: 8px; align-items: center; }
  .card { background: #161b22; border: 1px solid #30363d; border-radius: 6px; padding: 10px 14px; min-width: 140px; }
  .card .k { color: #8b949e; font-size: 11px; }
  .card .v { font-size: 20px; color: #e6edf3; }
  button { background: #21262d; color: #c9d1d9; border: 1px solid #30363d; border-radius: 6px; padding: 6px 12px; cursor: pointer; }
  button:hover { background: #30363d; }
  button.primary { background: #1f6feb; border-color: #1f6feb; color: #fff; }
  input, select { background: #0d1117; color: #c9d1d9; border: 1px solid #30363d; border-radius: 6px; padding: 6px 8px; width: 90px; }
  input.wide { width: 180px; }
  table { border-collapse: collapse; width: 100%; font-size: 12px; }
  td, th { border-bottom: 1px solid #21262d; padding: 3px 8px; text-align: left; }
  th { color: #8b949e; }
  .grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 8px; }
  .cols { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; }
  #state { font-weight: bold; }
  .RUNNING { color: #3fb950; } .PAUSED { color: #d29922; } .DONE { color: #58a6ff; } .IDLE { color: #8b949e; }
  pre { background: #161b22; border: 1px solid #30363d; border-radius: 6px; padding: 8px; font-size: 11px; overflow: auto; max-height: 320px; }
  .bar { height: 8px; background: #21262d; border-radius: 4px; overflow: hidden; margin: 6px 0 0; }
  .bar > div { height: 100%; background: #1f6feb; width: 0; }
  svg { background: #161b22; border: 1px solid #30363d; border-radius: 6px; width: 100%; height: 90px; }
</style>
</head>
<body>
<h1>Project Genesis — Dashboard <span id="state" class="IDLE">IDLE</span></h1>

<h2>Controls (guide §29)</h2>
<div class="row">
  seed <input id="seed" value="42"> population <input id="population" value="1000"> years <input id="years" value="2">
  <button class="primary" onclick="sim('start', readInputs())">start</button>
  <button onclick="sim('pause')">pause</button>
  <button onclick="sim('resume')">resume</button>
  <button onclick="sim('step')">step (+1 month)</button>
  <button onclick="sim('stop')">reset</button>
  speed
  <select id="speed" onchange="sim('speed', {ticksPerChunk: Number(this.value)})">
    <option value="720">1 month/chunk</option>
    <option value="2880">4 months/chunk</option>
    <option value="8640">1 year/chunk</option>
  </select>
  <a href="/api/export" target="_blank"><button>export</button></a>
</div>
<div class="bar"><div id="progress"></div></div>
<div id="error" style="color:#f85149; font-size:12px;"></div>

<h2>Overview</h2>
<div class="grid" id="overview"></div>

<h2>Trends</h2>
<div class="row">
  <div style="flex:1"><div class="k">mean stress</div><svg id="svg-stress" preserveAspectRatio="none" viewBox="0 0 100 40"></svg></div>
  <div style="flex:1"><div class="k">mean wellbeing</div><svg id="svg-wellbeing" preserveAspectRatio="none" viewBox="0 0 100 40"></svg></div>
  <div style="flex:1"><div class="k">population</div><svg id="svg-population" preserveAspectRatio="none" viewBox="0 0 100 40"></svg></div>
</div>

<h2>Person inspector</h2>
<div class="row">
  <input id="personId" class="wide" placeholder="person-000001">
  <button onclick="loadPerson()">inspect</button>
</div>
<pre id="person">—</pre>

<div class="cols">
  <div><h2>Key metrics</h2><table id="metrics"><tbody></tbody></table></div>
  <div><h2>Recent events</h2><table id="events"><tbody></tbody></table></div>
</div>

<script>
const KEY_METRICS = ['stress.mean','wellbeing.mean','employment_rate','mean_wealth','mean_income','social_edges','social_mean_degree','family.avg_household_size','family.marriages','family.divorces'];
const fmt = v => v === undefined || v === null ? '—' : (Math.round(v * 1000) / 1000).toLocaleString();

async function api(path, body) {
  const res = await fetch(path, body ? { method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify(body) } : undefined);
  const json = await res.json();
  if (!res.ok) throw new Error(json.error || res.status);
  return json;
}
function readInputs() {
  return {
    seed: isNaN(Number(document.getElementById('seed').value)) ? document.getElementById('seed').value : Number(document.getElementById('seed').value),
    population: Number(document.getElementById('population').value),
    years: Number(document.getElementById('years').value)
  };
}
async function sim(action, body) {
  try { document.getElementById('error').textContent = ''; await api('/api/sim/' + action, body); refresh(); }
  catch (e) { document.getElementById('error').textContent = e.message; }
}
function sparkline(id, values, color) {
  const svg = document.getElementById(id);
  const pts = values.filter(v => v !== null);
  if (pts.length < 2) { svg.innerHTML = '<text x="4" y="24" fill="#8b949e" font-size="5">waiting for data…</text>'; return; }
  const min = Math.min(...pts), max = Math.max(...pts);
  const span = (max - min) || 1;
  const step = 100 / (pts.length - 1);
  const path = pts.map((v, i) => (i ? 'L' : 'M') + (i * step).toFixed(2) + ',' + (38 - ((v - min) / span) * 36).toFixed(2)).join(' ');
  svg.innerHTML = '<path d="' + path + '" fill="none" stroke="' + color + '" stroke-width="0.8"/>' +
    '<text x="2" y="7" fill="#8b949e" font-size="4">max ' + (Math.round(max*1000)/1000) + '</text>' +
    '<text x="2" y="38" fill="#8b949e" font-size="4">min ' + (Math.round(min*1000)/1000) + '</text>';
}
function render(s) {
  const st = document.getElementById('state');
  st.textContent = s.state.toUpperCase() + (s.error ? ' (ERROR)' : '');
  st.className = s.state.toUpperCase();
  document.getElementById('progress').style.width = (s.progress * 100).toFixed(1) + '%';
  document.getElementById('error').textContent = s.error || '';
  const p = s.population || {};
  const m = s.metrics || {};
  const cards = [
    ['population', p.alive], ['ever-born', p.persons], ['households', p.households],
    ['employers', p.employers], ['employed', p.employed], ['unemployment', p.unemploymentRate === undefined ? null : (p.unemploymentRate*100).toFixed(1) + '%'],
    ['children / adults / seniors', p.children === undefined ? null : p.children + ' / ' + p.adults + ' / ' + p.seniors],
    ['mean stress', m['stress.mean']], ['mean wellbeing', m['wellbeing.mean']],
    ['relationships', m['social_edges']], ['employment rate', m['employment_rate']],
    ['mean wealth', m['mean_wealth'] === undefined ? null : '$' + fmt(m['mean_wealth']/100)],
    ['tick', s.tick], ['progress', (s.progress*100).toFixed(1) + '%']
  ];
  document.getElementById('overview').innerHTML = cards.map(([k, v]) =>
    '<div class="card"><div class="k">' + k + '</div><div class="v">' + (v === undefined || v === null ? '—' : v) + '</div></div>').join('');
  const tbody = document.querySelector('#metrics tbody');
  tbody.innerHTML = KEY_METRICS.map(k => '<tr><td>' + k + '</td><td>' + fmt(m[k]) + '</td></tr>').join('');
  const hist = s.history || [];
  sparkline('svg-stress', hist.map(h => h.stress), '#f85149');
  sparkline('svg-wellbeing', hist.map(h => h.wellbeing), '#3fb950');
  sparkline('svg-population', hist.map(h => h.population), '#58a6ff');
}
async function loadPerson() {
  const id = document.getElementById('personId').value.trim();
  try {
    const person = await api('/api/persons/' + id);
    document.getElementById('person').textContent = JSON.stringify(person, null, 2);
  } catch (e) { document.getElementById('person').textContent = 'error: ' + e.message; }
}
let eventsTick = -1;
async function refresh() {
  try {
    const s = await api('/api/status');
    render(s);
    if (s.tick !== eventsTick && s.tick > 0) {
      eventsTick = s.tick;
      const events = await api('/api/events?limit=15');
      document.querySelector('#events tbody').innerHTML = events.map(e =>
        '<tr><td>' + e.tick + '</td><td>' + e.type + '</td><td>' + (e.actorIds || []).join(', ') + '</td></tr>').join('');
    }
  } catch (_) { /* server not up yet */ }
}
setInterval(refresh, 1000);
refresh();
</script>
</body>
</html>`
}
