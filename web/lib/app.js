// Navigation, filters and drawing, ported from the Claude dashboard. mountApp() wires one page tree.
import * as d3 from 'd3';
import { TEMPLATES } from './templates';

export function mountApp(rootEl, dash, K, P, navigate) {
  const host = rootEl.querySelector('#pages');
  const nav = rootEl.querySelector('#nav');
  const document_ = rootEl.ownerDocument;

  const STUDIES = [['et', 'Ethiopia farmers'], ['tz', 'Tanzania market actors'], ['la', 'LATAM maize concepts']];
  const TABS = {
    exec: { page: 'exec' },
    monitoring: { page: 'monitoring' },
    demographics: { page: 'demographics' },
    traits: { title: 'Trait preferences', blurb: 'What farmers and market actors want from new varieties, study by study.', sub: 'traits' },
    wtp: { title: 'Willingness to pay', blurb: 'How much more respondents would pay for improved seed or grain, study by study.', sub: 'wtp' },
  };
  const state = { tab: 'exec', study: { traits: 'et', wtp: 'et' } };
  const mounted = {};

  // ------------------------------------------------------------- filters
  const DEF = {
    country: 'Country', studyform: 'Study / survey form', stakeholder: 'Stakeholder', gender: 'Gender', crop: 'Crop',
    region: 'Region', zone: 'Zone', role: 'Respondent role', typology: 'Typology', district: 'District',
    segment: 'Market actor', product: 'Product', dept: 'Department', concept: 'Concept', pref: 'Preferred concept', currency: 'Currency',
  };
  const LABEL = { la: { segment: 'Respondent role' }, lw: { segment: 'Respondent role' } };
  const REQUIRED = { tw_product: 'Orange Plus Maize' };

  const paramsOf = (bar) => {
    const g = bar.dataset.group;
    return bar.dataset.controls.split(',').flatMap((c) => (c === 'studyform' ? [`${g}_study`, `${g}_form`] : c === 'dates' ? [`${g}_start`, `${g}_end`] : [`${g}_${c}`]));
  };

  function buildBar(bar) {
    const g = bar.dataset.group;
    bar.replaceChildren();
    bar.dataset.controls.split(',').forEach((c) => {
      if (c === 'dates') {
        ['start', 'end'].forEach((which) => {
          const lab = document.createElement('label');
          lab.append(which === 'start' ? 'Interview date from' : 'Interview date to');
          const inp = document.createElement('input');
          inp.type = 'date';
          inp.min = '2026-01-01';
          inp.max = '2099-12-31';
          inp.dataset.param = `${g}_${which}`;
          inp.addEventListener('change', () => {
            if (!inp.value) dash.setParams({ [inp.dataset.param]: null });
            else if (inp.validity.valid) dash.setParams({ [inp.dataset.param]: inp.value });
          });
          inp.addEventListener('blur', () => syncBar(bar));
          lab.append(inp);
          bar.append(lab);
        });
        return;
      }
      const lab = document.createElement('label');
      lab.append((LABEL[g] && LABEL[g][c]) || DEF[c]);
      const sel = document.createElement('select');
      sel.dataset.control = c;
      sel.dataset.source = bar.dataset.opts;
      sel.addEventListener('change', () => {
        if (c === 'studyform') {
          const [kind, id] = sel.value ? sel.value.split(':') : [null, null];
          dash.setParams({ [`${g}_study`]: kind === 'study' ? id : null, [`${g}_form`]: kind === 'form' ? id : null });
        } else dash.setParams({ [`${g}_${c}`]: sel.value || REQUIRED[`${g}_${c}`] || null });
      });
      lab.append(sel);
      bar.append(lab);
    });
    const clear = document.createElement('button');
    clear.type = 'button';
    clear.className = 'cc-clear';
    clear.textContent = 'Clear filters';
    clear.addEventListener('click', () => {
      const reset = {};
      paramsOf(bar).forEach((p) => (reset[p] = REQUIRED[p] || null));
      dash.setParams(reset);
    });
    bar.append(clear);
  }

  function fillSelect(sel, bar, rows) {
    const g = bar.dataset.group;
    const c = sel.dataset.control;
    const p = dash.getParams();
    const opt = (value, label) => new Option(label, value);
    const keep = document.activeElement === sel;
    if (keep) return;
    if (c === 'studyform') {
      sel.replaceChildren(opt('', 'All studies and forms'));
      const studies = rows.filter((r) => r.field === 'study');
      studies.forEach((s) => {
        const og = document.createElement('optgroup');
        og.label = s.label;
        og.append(opt(`study:${s.value}`, `All ${s.label} forms`));
        rows.filter((r) => r.field === 'form' && r.grp === s.label).forEach((fr) => og.append(opt(`form:${fr.value}`, fr.label)));
        sel.append(og);
      });
      sel.value = p[`${g}_form`] ? `form:${p[`${g}_form`]}` : p[`${g}_study`] ? `study:${p[`${g}_study`]}` : '';
      sel.classList.toggle('cc-set', !!sel.value);
      return;
    }
    const field = c;
    const mine = rows.filter((r) => r.field === field && r.value != null);
    const required = REQUIRED[`${g}_${c}`];
    sel.replaceChildren(...(required ? [] : [opt('', 'All')]));
    const grouped = mine.some((r) => r.grp);
    if (grouped) {
      d3.groups(mine, (r) => r.grp || '').forEach(([grp, items]) => {
        const og = document.createElement('optgroup');
        og.label = grp || 'Other';
        items.forEach((r) => og.append(opt(r.value, r.label || r.value)));
        sel.append(og);
      });
    } else mine.forEach((r) => sel.append(opt(r.value, r.label || r.value)));
    const cur = p[`${g}_${c}`];
    if (cur != null && !mine.some((r) => r.value === cur)) sel.append(opt(cur, cur));
    sel.value = cur ?? '';
    sel.classList.toggle('cc-set', cur != null && !required);
  }

  function syncBar(bar) {
    const d = dash.data(bar.dataset.opts);
    const rows = d.status === 'ok' ? d.data : [];
    bar.querySelectorAll('select').forEach((sel) => fillSelect(sel, bar, rows));
    const p = dash.getParams();
    bar.querySelectorAll('input[type=date]').forEach((inp) => {
      if (inp !== document.activeElement) inp.value = p[inp.dataset.param] ?? '';
      inp.classList.toggle('cc-set', !!p[inp.dataset.param]);
    });
    const clear = bar.querySelector('.cc-clear');
    if (clear) clear.disabled = !paramsOf(bar).some((q) => p[q] != null && p[q] !== REQUIRED[q]);
  }

  // ------------------------------------------------------------- pages
  function mount(pageId, into) {
    if (mounted[pageId]) return mounted[pageId];
    const wrap = document.createElement('div');
    wrap.innerHTML = TEMPLATES[pageId];
    into.append(...Array.from(wrap.childNodes));
    const el = rootEl.querySelector('#' + CSS.escape(pageId));
    el.querySelectorAll('.cc-filters').forEach(buildBar);
    mounted[pageId] = el;
    return el;
  }

  function studyShell(tab) {
    const id = 'shell-' + tab;
    let shell = document.getElementById(id);
    if (shell) return shell;
    const cfg = TABS[tab];
    shell = document.createElement('section');
    shell.className = 'cc-page';
    shell.id = id;
    const head = document.createElement('div');
    head.className = 'cc-title';
    const h = document.createElement('h2');
    h.textContent = cfg.title;
    const sw = document.createElement('div');
    sw.className = 'cc-switch';
    sw.setAttribute('role', 'group');
    sw.setAttribute('aria-label', 'Study');
    STUDIES.forEach(([key, label]) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.dataset.study = key;
      b.textContent = label;
      b.addEventListener('click', () => go(tab, key));
      sw.append(b);
    });
    const p = document.createElement('p');
    p.textContent = cfg.blurb;
    head.append(h, sw, p);
    const body = document.createElement('div');
    body.className = 'cc-sub';
    shell.append(head, body);
    host.append(shell);
    return shell;
  }

  function currentPageId() {
    const cfg = TABS[state.tab];
    return cfg.sub ? `${cfg.sub}-${state.study[state.tab]}` : cfg.page;
  }

  function go(tab, study, quiet) {
    state.tab = tab;
    if (study) state.study[tab] = study;
    nav.querySelectorAll('button').forEach((b) => b.setAttribute('aria-selected', String(b.dataset.tab === tab)));
    host.querySelectorAll(':scope > .cc-page').forEach((s) => (s.hidden = true));
    const cfg = TABS[tab];
    let page;
    if (cfg.sub) {
      const shell = studyShell(tab);
      shell.hidden = false;
      shell.querySelectorAll('.cc-switch button').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.study === state.study[tab])));
      const body = shell.querySelector('.cc-sub');
      body.querySelectorAll(':scope > .cc-page').forEach((s) => (s.hidden = true));
      page = mount(currentPageId(), body);
    } else page = mount(cfg.page, host);
    page.hidden = false;
    if (!quiet) navigate(currentPageId());
    draw();
  }

  nav.addEventListener('click', (e) => {
    const b = e.target.closest('button[data-tab]');
    if (b) go(b.dataset.tab);
  });

  // ------------------------------------------------------------- draw
  function draw() {
    const id = currentPageId();
    const page = mounted[id];
    K.fillMarks(rootEl.querySelector('.cc-head'));
    const r = dash.data('refresh');
    const stale = r.status === 'ok' && r.data[0] && String(r.data[0].last_run_ok) === 'false';
    rootEl.querySelector('#loaded').classList.toggle('cc-stale', !!stale);
    if (!page || page.hidden) return;
    page.querySelectorAll('.cc-filters').forEach(syncBar);
    K.fillMarks(page);
    try {
      P[id] && P[id]();
    } catch (err) {
      console.error(err);
      throw err;
    }
  }

  // light / dark mode, as the report's twin pages; remembered per browser when storage allows
  const root = rootEl;
  const modeBtn = rootEl.querySelector('#mode');
  const setMode = (dark) => {
    root.classList.toggle('cc-dark', dark);
    root.classList.toggle('cc-light', !dark);
    modeBtn.textContent = dark ? '☀ Light' : '☾ Dark';
    modeBtn.setAttribute('aria-pressed', String(dark));
    try { localStorage.setItem('cc-mode', dark ? 'dark' : 'light'); } catch (e) { /* storage unavailable */ }
    draw();
  };
  let startDark = false;
  try {
    const saved = localStorage.getItem('cc-mode');
    startDark = saved ? saved === 'dark' : window.matchMedia('(prefers-color-scheme: dark)').matches;
  } catch (e) { startDark = false; }
  modeBtn.addEventListener('click', () => setMode(!root.classList.contains('cc-dark')));
  root.classList.toggle('cc-dark', startDark);
  root.classList.toggle('cc-light', !startDark);
  modeBtn.textContent = startDark ? '☀ Light' : '☾ Dark';
  modeBtn.setAttribute('aria-pressed', String(startDark));

  const unsubscribe = dash.onData(draw);

  const open = (place) => {
    const m = /^(traits|wtp)-(et|tz|la)$/.exec(place || '');
    if (m) go(m[1], m[2], true);
    else if (['exec', 'monitoring', 'demographics'].includes(place)) go(place, null, true);
    else go('exec', null, true);
  };
  return { open, draw, destroy: () => unsubscribe() };
}
