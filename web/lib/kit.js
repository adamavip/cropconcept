// CropConcept dashboard kit: formatting, marks, tooltips, charts and tables.
import * as d3 from 'd3';
import basemap from './basemap';

export function createKit(dash) {
  const K = {};
  const nf = d3.format(',');
  K.fmt = {
    int: (v) => (v == null || isNaN(v) ? '—' : nf(Math.round(v))),
    pct: (v) => (v == null || isNaN(v) ? '—' : d3.format('.1%')(v)),
    spct: (v) => (v == null || isNaN(v) ? '—' : (v > 0 ? '+' : '') + d3.format('.1%')(v)),
    pct0: (v) => (v == null || isNaN(v) ? '—' : d3.format('.0%')(v)),
    num1: (v) => (v == null || isNaN(v) ? '—' : d3.format(',.1f')(v)),
    num0: (v) => (v == null || isNaN(v) ? '—' : nf(Math.round(v))),
    text: (v) => (v == null || v === '' ? '—' : String(v)),
  };
  const F = (k) => K.fmt[k] || K.fmt.text;

  const num = (v) => (v == null || v === '' ? null : Number(v));
  K.num = num;
  K.rows = (id) => {
    const d = dash.data(id);
    return d.status === 'ok' && Array.isArray(d.data) ? d.data : [];
  };
  K.ok = (id) => dash.data(id).status === 'ok';

  // Fill every single-value mark ([data-source][data-field][data-row]) inside root.
  K.fillMarks = (root) => {
    root.querySelectorAll('[data-source][data-field][data-row]').forEach((el) => {
      if (el.closest('table')) return;
      const d = dash.data(el.dataset.source);
      if (d.status !== 'ok') {
        el.textContent = '—';
        el.classList.toggle('dash-skeleton', d.status === 'loading');
        return;
      }
      el.classList.remove('dash-skeleton');
      const row = (d.data || [])[Number(el.dataset.row)];
      const next = row ? F(el.dataset.fmt)(el.dataset.fmt && el.dataset.fmt !== 'text' ? num(row[el.dataset.field]) : row[el.dataset.field]) : '—';
      if (el.textContent !== next) {
        el.textContent = next;
        el.classList.remove('cc-bump');
        void el.offsetWidth;
        el.classList.add('cc-bump');
      }
    });
  };

  // State of a chart box: returns true when it should draw.
  K.state = (el, ids) => {
    const st = ids.map((id) => dash.data(id).status);
    if (st.every((s) => s === 'ok')) {
      el.classList.remove('dash-skeleton');
      return true;
    }
    el.replaceChildren();
    if (st.includes('error') || st.includes('missing')) {
      el.classList.remove('dash-skeleton');
      const box = document.createElement('div');
      box.className = 'cc-empty';
      const dot = document.createElement('span');
      dot.className = 'bad';
      box.append(dot, 'Failed to load');
      el.append(box);
    } else el.classList.add('dash-skeleton');
    return false;
  };
  K.empty = (el, text) => {
    el.replaceChildren();
    const box = document.createElement('div');
    box.className = 'cc-empty';
    box.textContent = text || 'No records match the current filters.';
    el.append(box);
  };

  // tooltip inside the chart's card
  K.tip = (el) => {
    const card = el.closest('.cc-card') || el;
    let t = card.querySelector(':scope > .cc-tip');
    if (!t) {
      t = document.createElement('div');
      t.className = 'cc-tip';
      card.append(t);
    }
    return {
      show(event, title, lines) {
        t.replaceChildren();
        const b = document.createElement('b');
        b.textContent = title;
        t.append(b);
        lines.forEach(([name, value, color]) => {
          const row = document.createElement('div');
          const left = document.createElement('span');
          if (color) {
            const i = document.createElement('i');
            i.style.background = color;
            left.append(i);
          }
          left.append(name);
          const right = document.createElement('span');
          right.textContent = value;
          row.append(left, right);
          t.append(row);
        });
        t.style.display = 'block';
        const r = card.getBoundingClientRect();
        let x = event.clientX - r.left + 12;
        let y = event.clientY - r.top + 12;
        const w = t.offsetWidth;
        const h = t.offsetHeight;
        if (x + w > r.width - 4) x = Math.max(4, event.clientX - r.left - w - 12);
        if (y + h > r.height - 4) y = Math.max(4, event.clientY - r.top - h - 12);
        t.style.left = x + 'px';
        t.style.top = y + 'px';
      },
      hide() {
        t.style.display = 'none';
      },
    };
  };

  const textWidth = (svg, texts, size = 11) => {
    const probe = svg.append('text').attr('font-size', size).attr('font-family', 'var(--font-anthropic-sans)');
    let w = 0;
    texts.forEach((s) => {
      probe.text(s);
      w = Math.max(w, probe.node().getComputedTextLength());
    });
    probe.remove();
    return w;
  };
  K.textWidth = textWidth;
  const trunc = (s, n) => (s && s.length > n ? s.slice(0, n - 1) + '…' : s);

  K.legend = (el, items) => {
    let lg = el.parentElement.querySelector(':scope > .cc-legend');
    if (!lg) {
      lg = document.createElement('div');
      lg.className = 'cc-legend';
      el.after(lg);
    }
    lg.replaceChildren(
      ...items.map(([name, color]) => {
        const s = document.createElement('span');
        const i = document.createElement('i');
        i.style.background = color;
        s.append(i, name);
        return s;
      })
    );
  };
  K.noLegend = (el) => {
    const lg = el.parentElement.querySelector(':scope > .cc-legend');
    if (lg) lg.remove();
  };

  /* Horizontal bars.
     opts: {categories:[{key,label}], series:[{name,color,value:(cat)=>num, rows:(cat)=>row}], mode:'group'|'stack'|'stack100',
            fmt, tip:(cat)=>[[name,value,color]], max, onClick} */
  K.barsH = (el, opts) => {
    el.replaceChildren();
    const cats = opts.categories;
    if (!cats.length) return K.empty(el, opts.emptyText);
    const W = Math.max(280, el.clientWidth);
    const mode = opts.mode || 'group';
    const ns = opts.series.length;
    const band = mode === 'group' && ns > 1 ? Math.max(14, 10 * ns + 8) : 22;
    const H = cats.length * (band + 8) + 24;
    const svg = d3.select(el).append('svg').attr('width', '100%').attr('viewBox', `0 0 ${W} ${H}`).attr('role', 'img');
    const labels = cats.map((c) => trunc(c.label, 38));
    const lw = Math.min(W * 0.42, textWidth(svg, labels) + 8);
    const fmt = opts.fmt || K.fmt.int;
    const totals = cats.map((c) => d3.sum(opts.series, (s) => Math.max(0, s.value(c) || 0)));
    let max = opts.max;
    if (max == null) max = mode === 'stack100' ? 1 : mode === 'stack' ? d3.max(totals) : d3.max(cats, (c) => d3.max(opts.series, (s) => s.value(c) || 0));
    max = max || 1;
    const vw = textWidth(svg, [fmt(max)]) + 10;
    const x = d3.scaleLinear([0, max], [lw, W - vw]);
    const y = d3.scaleBand(d3.range(cats.length), [4, H - 20]).paddingInner(0.25);
    svg.append('g').attr('class', 'grid').selectAll('line').data(x.ticks(4)).join('line')
      .attr('x1', (d) => x(d)).attr('x2', (d) => x(d)).attr('y1', 0).attr('y2', H - 20);
    svg.append('g').attr('class', 'axis tick').attr('transform', `translate(0,${H - 18})`)
      .selectAll('text').data(x.ticks(4)).join('text').attr('class', 'lbl').attr('x', (d) => x(d)).attr('y', 10)
      .attr('text-anchor', 'middle').text((d) => (mode === 'stack100' || opts.axisPct ? d3.format('.0%')(d) : d3.format('~s')(d)));
    svg.append('g').selectAll('text').data(cats).join('text').attr('class', 'lbl')
      .attr('x', lw - 6).attr('y', (d, i) => y(i) + y.bandwidth() / 2).attr('dy', '0.35em').attr('text-anchor', 'end')
      .text((d, i) => labels[i]).append('title').text((d) => d.label);
    const tip = K.tip(el);
    const g = svg.append('g');
    const anim = opts.animate !== false && K.animFlag(el, cats.map((c) => opts.series.map((s) => s.value(c))));
    cats.forEach((c, i) => {
      let x0 = 0;
      const total = totals[i] || 1;
      opts.series.forEach((s, j) => {
        let v = s.value(c);
        if (v == null || isNaN(v)) return;
        let a;
        let b;
        let yy = y(i);
        let hh = y.bandwidth();
        if (mode === 'group') {
          hh = y.bandwidth() / ns;
          yy = y(i) + j * hh;
          a = 0;
          b = v;
        } else {
          const vv = mode === 'stack100' ? Math.max(0, v) / total : Math.max(0, v);
          a = x0;
          b = x0 + vv;
          x0 = b;
        }
        const lo = Math.min(x(a), x(b));
        const rect = g.append('rect').attr('x', lo).attr('y', yy + 1).attr('height', Math.max(2, hh - 2))
          .attr('width', Math.max(0.5, Math.abs(x(b) - x(a)))).attr('rx', mode === 'group' ? 4 : 0)
          .attr('fill', s.color).style('cursor', opts.onClick ? 'pointer' : null);
        rect.on('mousemove', (event) => tip.show(event, c.label, opts.tip ? opts.tip(c) : opts.series.map((s2) => [s2.name, fmt(s2.value(c)), ns > 1 ? s2.color : null])))
          .on('mouseleave', () => tip.hide());
        if (opts.onClick) rect.on('click', () => opts.onClick(c));
        if (anim) rect.classed('cc-anim-bar-h', true).style('transform-origin', `${x(Math.min(a, b, 0) < 0 ? 0 : a)}px center`).style('animation-delay', `${i * 30 + j * 15}ms`);
      });
      if (mode !== 'stack100') {
        const end = mode === 'stack' ? totals[i] : d3.max(opts.series, (s) => s.value(c) || 0);
        if (mode === 'stack' || ns === 1)
          g.append('text').attr('class', anim ? 'val cc-anim-fade' : 'val').style('animation-delay', `${i * 30 + 350}ms`).attr('x', x(Math.max(0, end)) + 4).attr('y', y(i) + y.bandwidth() / 2).attr('dy', '0.35em')
            .text(fmt(mode === 'stack' ? totals[i] : opts.series[0].value(c)));
      }
    });
    if (opts.zero && x.domain()[0] < 0) svg.append('line').attr('x1', x(0)).attr('x2', x(0)).attr('y1', 0).attr('y2', H - 20).attr('stroke', 'var(--chart-axis)');
    if (ns > 1 || opts.legend) K.legend(el, opts.series.map((s) => [s.name, s.color]));
    else K.noLegend(el);
  };

  /* Diverging/signed horizontal bars: one series, domain includes 0 */
  K.barsSigned = (el, cats, opts) => {
    el.replaceChildren();
    if (!cats.length) return K.empty(el);
    const W = Math.max(280, el.clientWidth);
    const H = cats.length * 30 + 24;
    const svg = d3.select(el).append('svg').attr('width', '100%').attr('viewBox', `0 0 ${W} ${H}`);
    const labels = cats.map((c) => trunc(c.label, 34));
    const lw = Math.min(W * 0.4, textWidth(svg, labels) + 8);
    const vals = cats.map((c) => c.value);
    const lo = Math.min(0, d3.min(vals));
    const hi = Math.max(0, d3.max(vals));
    const pad = textWidth(svg, [opts.fmt(hi), opts.fmt(lo)]) + 10;
    const x = d3.scaleLinear([lo, hi || 0.01], [lw + (lo < 0 ? pad : 0), W - pad]).nice();
    const y = d3.scaleBand(d3.range(cats.length), [4, H - 20]).paddingInner(0.3);
    svg.append('g').attr('class', 'grid').selectAll('line').data(x.ticks(5)).join('line')
      .attr('x1', (d) => x(d)).attr('x2', (d) => x(d)).attr('y1', 0).attr('y2', H - 20);
    svg.append('g').selectAll('text').data(x.ticks(5)).join('text').attr('class', 'lbl').attr('x', (d) => x(d)).attr('y', H - 6)
      .attr('text-anchor', 'middle').text((d) => d3.format('.0%')(d));
    svg.append('g').selectAll('text').data(cats).join('text').attr('class', 'lbl').attr('x', lw - 6)
      .attr('y', (d, i) => y(i) + y.bandwidth() / 2).attr('dy', '0.35em').attr('text-anchor', 'end').text((d, i) => labels[i]);
    const tip = K.tip(el);
    const anim = K.animFlag(el, cats.map((c) => c.value));
    cats.forEach((c, i) => {
      if (c.value == null) return;
      svg.append('rect').classed('cc-anim-bar-h', anim).style('transform-origin', `${x(0)}px center`).style('animation-delay', `${i * 40}ms`).attr('x', Math.min(x(0), x(c.value))).attr('width', Math.max(1, Math.abs(x(c.value) - x(0))))
        .attr('y', y(i)).attr('height', y.bandwidth()).attr('rx', 4)
        .attr('fill', c.value < 0 ? K.var('--orange') : opts.color)
        .on('mousemove', (event) => tip.show(event, c.label, opts.tip(c))).on('mouseleave', () => tip.hide());
      svg.append('text').attr('class', anim ? 'val cc-anim-fade' : 'val').style('animation-delay', `${i * 40 + 400}ms`).attr('y', y(i) + y.bandwidth() / 2).attr('dy', '0.35em')
        .attr('x', c.value < 0 ? x(c.value) - 4 : x(c.value) + 4).attr('text-anchor', c.value < 0 ? 'end' : 'start').text(opts.fmt(c.value));
    });
    svg.append('line').attr('x1', x(0)).attr('x2', x(0)).attr('y1', 0).attr('y2', H - 20).attr('stroke', 'var(--chart-axis)');
  };

  /* Lines. series: [{name,color,points:[{x,y,row}]}], opts: {xType:'date'|'linear', xFmt, yFmt, step, yMax, tipTitle} */
  K.lines = (el, series, opts) => {
    el.replaceChildren();
    const pts = series.flatMap((s) => s.points);
    if (!pts.length) return K.empty(el, opts.emptyText);
    const W = Math.max(280, el.clientWidth);
    const H = opts.height || 260;
    const svg = d3.select(el).append('svg').attr('width', '100%').attr('viewBox', `0 0 ${W} ${H}`);
    const yMax = opts.yMax != null ? opts.yMax : d3.max(pts, (p) => p.y) || 1;
    const y = d3.scaleLinear([0, yMax], [H - 26, 10]).nice();
    const yt = y.ticks(5);
    const ml = textWidth(svg, yt.map(opts.yFmt)) + 10;
    const endLabels = opts.endLabels ? series.map((s) => trunc(s.name, 26)) : [];
    const mr = opts.endLabels ? Math.min(W * 0.35, textWidth(svg, endLabels) + 14) : 12;
    const xd = d3.extent(pts, (p) => p.x);
    const x = (opts.xType === 'date' ? d3.scaleUtc(xd, [ml, W - mr]) : d3.scaleLinear(xd, [ml, W - mr]));
    svg.append('g').attr('class', 'grid').selectAll('line').data(yt).join('line').attr('x1', ml).attr('x2', W - mr).attr('y1', y).attr('y2', y);
    svg.append('g').selectAll('text').data(yt).join('text').attr('class', 'lbl').attr('x', ml - 6).attr('y', y).attr('dy', '0.35em').attr('text-anchor', 'end').text(opts.yFmt);
    const xt = opts.xTicks || x.ticks(Math.max(2, Math.floor((W - ml - mr) / 90)));
    svg.append('g').selectAll('text').data(xt).join('text').attr('class', 'lbl').attr('x', x).attr('y', H - 8).attr('text-anchor', 'middle').text(opts.xFmt);
    if (opts.zeroX && xd[0] < 0) svg.append('line').attr('x1', x(0)).attr('x2', x(0)).attr('y1', 10).attr('y2', H - 26).attr('stroke', 'var(--chart-axis)').attr('stroke-dasharray', '4 3');
    const line = d3.line().x((p) => x(p.x)).y((p) => y(p.y)).defined((p) => p.y != null).curve(opts.step ? d3.curveStepAfter : d3.curveLinear);
    const anim = K.animFlag(el, series.map((s) => s.points.map((p) => p.y)));
    series.forEach((s, i) => {
      const path = svg.append('path').attr('class', 'cc-series').attr('d', line(s.points)).attr('fill', 'none').attr('stroke', s.color).attr('stroke-width', 3)
        .attr('stroke-linecap', 'round').attr('stroke-linejoin', 'round');
      if (anim) {
        const len = path.node().getTotalLength();
        path.attr('stroke-dasharray', len).attr('stroke-dashoffset', len).classed('cc-anim-line', true).style('animation-delay', `${i * 120}ms`);
      }
      if (opts.dots) {
        const dots = svg.append('g').selectAll('circle').data(s.points.filter((p) => p.y != null)).join('circle')
          .attr('cx', (p) => x(p.x)).attr('cy', (p) => y(p.y)).attr('r', 4).attr('fill', s.color);
        if (anim) K.stagger(dots, 'cc-anim-dot', 60, 300);
      }
    });
    if (opts.endLabels) {
      const ends = series.map((s, i) => {
        const last = [...s.points].reverse().find((p) => p.y != null);
        return { s, i, y: last ? y(last.y) : null, v: last ? last.y : null };
      }).filter((e) => e.y != null).sort((a, b) => a.y - b.y);
      for (let k = 1; k < ends.length; k++) if (ends[k].y - ends[k - 1].y < 13) ends[k].y = ends[k - 1].y + 13;
      ends.forEach((e) => svg.append('text').attr('class', 'lbl').attr('x', W - mr + 6).attr('y', e.y).attr('dy', '0.35em')
        .attr('fill', e.s.color).text(`${trunc(e.s.name, 26)}`));
    }
    const tip = K.tip(el);
    const xs = Array.from(new Set(pts.map((p) => +p.x))).sort((a, b) => a - b);
    const rule = svg.append('line').attr('y1', 10).attr('y2', H - 26).attr('stroke', 'var(--chart-axis)').style('display', 'none');
    svg.append('rect').attr('x', ml).attr('y', 0).attr('width', Math.max(0, W - mr - ml)).attr('height', H - 20).attr('fill', 'transparent')
      .on('mousemove', (event) => {
        const [mx] = d3.pointer(event);
        const xv = x.invert(mx);
        const near = xs[d3.minIndex(xs, (v) => Math.abs(v - +xv))];
        rule.attr('x1', x(near)).attr('x2', x(near)).style('display', null);
        const lines = series.map((s) => {
          const p = s.points.find((q) => +q.x === near);
          return [s.name, p && p.y != null ? opts.yFmt(p.y) + (p.extra ? ' ' + p.extra : '') : '—', series.length > 1 ? s.color : null];
        });
        tip.show(event, opts.xFmt(opts.xType === 'date' ? new Date(near) : near), lines);
      })
      .on('mouseleave', () => {
        rule.style('display', 'none');
        tip.hide();
      });
    if (series.length > 1 && !opts.endLabels) K.legend(el, series.map((s) => [s.name, s.color]));
    else if (opts.legendItems) K.legend(el, opts.legendItems);
    else K.noLegend(el);
  };

  /* Scatter: points [{x,y,r,color,label,tip}] */
  K.scatter = (el, pts, opts) => {
    el.replaceChildren();
    if (!pts.length) return K.empty(el);
    const W = Math.max(280, el.clientWidth);
    const H = opts.height || 260;
    const svg = d3.select(el).append('svg').attr('width', '100%').attr('viewBox', `0 0 ${W} ${H}`);
    const x = d3.scaleLinear([0, Math.max(0.05, d3.max(pts, (p) => p.x))], [44, W - 16]).nice();
    const y = d3.scaleLinear([0, Math.max(0.05, d3.max(pts, (p) => p.y))], [H - 34, 12]).nice();
    const r = d3.scaleSqrt([0, d3.max(pts, (p) => p.r) || 1], [3, 14]);
    svg.append('g').attr('class', 'grid').selectAll('line').data(y.ticks(4)).join('line').attr('x1', 44).attr('x2', W - 16).attr('y1', y).attr('y2', y);
    svg.append('g').selectAll('text').data(y.ticks(4)).join('text').attr('class', 'lbl').attr('x', 38).attr('y', y).attr('dy', '0.35em').attr('text-anchor', 'end').text(d3.format('.0%'));
    svg.append('g').selectAll('text').data(x.ticks(5)).join('text').attr('class', 'lbl').attr('x', x).attr('y', H - 18).attr('text-anchor', 'middle').text(d3.format('.0%'));
    svg.append('text').attr('class', 'lbl').attr('x', W - 16).attr('y', H - 3).attr('text-anchor', 'end').text(opts.xLabel);
    svg.append('text').attr('class', 'lbl').attr('x', 44).attr('y', 8).text(opts.yLabel);
    const tip = K.tip(el);
    const animS = K.animFlag(el, pts.map((p) => [p.x, p.y]));
    const dotsS = svg.append('g').selectAll('circle').data(pts).join('circle').attr('cx', (p) => x(p.x)).attr('cy', (p) => y(p.y)).attr('r', (p) => r(p.r))
      .attr('fill', (p) => p.color).attr('fill-opacity', 0.85);
    if (animS) K.stagger(dotsS, 'cc-anim-dot', 25);
    dotsS
      .on('mousemove', (event, p) => tip.show(event, p.label, p.tip)).on('mouseleave', () => tip.hide());
    const top = [...pts].sort((a, b) => b.y + b.x - (a.y + a.x)).slice(0, opts.labelTop || 5);
    const placed = [];
    top.forEach((p) => {
      let ly = y(p.y) - r(p.r) - 4;
      while (placed.some((q) => Math.abs(q - ly) < 12)) ly -= 12;
      placed.push(ly);
      svg.append('text').attr('class', 'val').attr('x', Math.min(x(p.x), W - 80)).attr('y', ly).attr('text-anchor', 'middle').text(trunc(p.label, 22));
    });
    if (opts.legend) K.legend(el, opts.legend);
  };

  /* Heatmap: rows (y) x cols (x) */
  K.heat = (el, cells, opts) => {
    el.replaceChildren();
    if (!cells.length) return K.empty(el);
    const rows = opts.rows;
    const cols = opts.cols;
    const W = Math.max(300, el.clientWidth);
    const svg = d3.select(el).append('svg');
    const lw = Math.min(W * 0.42, textWidth(svg, rows.map((r) => trunc(r, 34))) + 8);
    const cw = Math.max(26, (W - lw - 4) / cols.length);
    const ch = 22;
    const top = 70;
    const H = top + rows.length * ch + 4;
    svg.attr('width', '100%').attr('viewBox', `0 0 ${W} ${H}`);
    const max = d3.max(cells, (c) => c.v) || 1;
    const css = getComputedStyle(el);
    const c0 = K.var('--panel') || '#ffffff';
    const mix = d3.interpolateRgb(c0, K.var('--teal') || '#326670');
    const color = (v) => mix(Math.max(0, Math.min(1, v / max)));
    cols.forEach((c, i) => {
      svg.append('text').attr('class', 'lbl').attr('transform', `translate(${lw + i * cw + cw / 2},${top - 6}) rotate(-40)`).text(trunc(c, 16));
    });
    rows.forEach((r, j) => svg.append('text').attr('class', 'lbl').attr('x', lw - 6).attr('y', top + j * ch + ch / 2).attr('dy', '0.35em').attr('text-anchor', 'end').text(trunc(r, 34)));
    const tip = K.tip(el);
    const animH = K.animFlag(el, cells.map((c) => c.v));
    cells.forEach((c, idx) => {
      const i = cols.indexOf(c.col);
      const j = rows.indexOf(c.row);
      if (i < 0 || j < 0) return;
      svg.append('rect').classed('cc-anim-fade', animH).style('animation-delay', `${(i + j) * 35}ms`).attr('x', lw + i * cw + 1).attr('y', top + j * ch + 1).attr('width', cw - 2).attr('height', ch - 2).attr('rx', 3)
        .attr('fill', c.v == null ? 'transparent' : color(c.v)).attr('stroke', 'var(--border)').attr('stroke-width', 1)
        .on('mousemove', (event) => tip.show(event, `${c.row} · ${c.col}`, c.tip)).on('mouseleave', () => tip.hide());
      if (cw >= 34 && c.v != null)
        svg.append('text').attr('x', lw + i * cw + cw / 2).attr('y', top + j * ch + ch / 2).attr('dy', '0.35em').attr('text-anchor', 'middle')
          .attr('font-size', 10).attr('fill', c.v > max * 0.55 ? '#fff' : 'var(--fg)').attr('pointer-events', 'none').text(opts.fmt(c.v));
    });
  };

  /* Map of grid cells over country outlines */
  K.map = (el, cells, opts) => {
    el.replaceChildren();
    if (!cells.length) return K.empty(el, 'No map cell has 5 or more usable interviews under the current filters.');
    const W = Math.max(280, el.clientWidth);
    const H = opts.height || 360;
    const svg = d3.select(el).append('svg').attr('width', '100%').attr('viewBox', `0 0 ${W} ${H}`).style('overflow', 'hidden');
    const lons = cells.map((c) => c.lon);
    const lats = cells.map((c) => c.lat);
    let [x0, x1] = d3.extent(lons);
    let [y0, y1] = d3.extent(lats);
    const padX = Math.max(6, (x1 - x0) * 0.15);
    const padY = Math.max(5, (y1 - y0) * 0.15);
    // Equirectangular projection with a cosine correction at the map's middle latitude.
    // Written here so the map needs no geo module.
    const lon0 = x0 - padX, lon1 = x1 + padX, lat0 = y0 - padY, lat1 = y1 + padY;
    const k = Math.cos(((lat0 + lat1) / 2) * Math.PI / 180);
    const spanX = (lon1 - lon0) * k, spanY = lat1 - lat0;
    const sc = Math.min((W - 16) / spanX, (H - 16) / spanY);
    const ox = (W - spanX * sc) / 2, oy = (H - spanY * sc) / 2;
    const proj = ([lon, lat]) => [ox + (lon - lon0) * k * sc, oy + (lat1 - lat) * sc];
    const ring = (r) => 'M' + r.map((c) => proj(c).map((v) => v.toFixed(1)).join(',')).join('L') + 'Z';
    const path = (f) => {
      const g = f.geometry;
      const polys = g.type === 'Polygon' ? [g.coordinates] : g.type === 'MultiPolygon' ? g.coordinates : [];
      return polys.map((poly) => poly.map(ring).join('')).join('');
    };
    svg.append('rect').attr('width', W).attr('height', H).attr('rx', 6).attr('fill', 'color-mix(in srgb, var(--sky) 18%, var(--panel))');
    svg.append('g').selectAll('path').data(basemap.features).join('path').attr('d', path).attr('fill-rule', 'evenodd')
      .attr('fill', 'var(--panel-2)').attr('stroke', 'var(--chart-axis)').attr('stroke-width', 0.6);
    const r = d3.scaleSqrt([0, d3.max(cells, (c) => c.n)], [4, 22]);
    const tip = K.tip(el);
    const animM = K.animFlag(el, cells.map((c) => [c.lat, c.lon, c.n]));
    const dotsM = svg.append('g').selectAll('circle').data([...cells].sort((a, b) => b.n - a.n)).join('circle')
      .attr('cx', (c) => proj([c.lon, c.lat])[0]).attr('cy', (c) => proj([c.lon, c.lat])[1]).attr('r', (c) => r(c.n))
      .attr('fill', (c) => opts.color(c)).attr('fill-opacity', 0.85);
    if (animM) K.stagger(dotsM, 'cc-anim-dot', 20);
    dotsM
      .on('mousemove', (event, c) => tip.show(event, c.label, [['Usable interviews', K.fmt.int(c.n)]])).on('mouseleave', () => tip.hide());
    if (opts.legend) K.legend(el, opts.legend);
  };

  /* Table: cols [{field, label, fmt, num, source}] ; table carries data-source + data-row-key */
  K.table = (table, rows, cols, keyField) => {
    table.replaceChildren();
    const thead = table.createTHead();
    const hr = thead.insertRow();
    const state = table._sort || { field: null, dir: 1 };
    cols.forEach((c) => {
      const th = document.createElement('th');
      th.dataset.field = c.field;
      if (c.source) th.dataset.source = c.source;
      if (c.num) th.className = 'n';
      th.setAttribute('aria-sort', state.field === c.field ? (state.dir > 0 ? 'ascending' : 'descending') : 'none');
      const b = document.createElement('button');
      b.textContent = c.label;
      b.addEventListener('click', () => {
        table._sort = { field: c.field, dir: state.field === c.field ? -state.dir : c.num ? -1 : 1 };
        K.table(table, rows, cols, keyField);
      });
      th.append(b);
      hr.append(th);
    });
    let sorted = rows;
    if (state.field) {
      const c = cols.find((q) => q.field === state.field);
      sorted = [...rows].sort((a, b) => {
        const va = c.num ? num(a[c.field]) : a[c.field];
        const vb = c.num ? num(b[c.field]) : b[c.field];
        if (va == null) return 1;
        if (vb == null) return -1;
        return (va > vb ? 1 : va < vb ? -1 : 0) * state.dir;
      });
    }
    const tb = table.createTBody();
    sorted.forEach((r) => {
      const tr = tb.insertRow();
      tr.dataset.key = r[keyField];
      cols.forEach((c) => {
        const td = tr.insertCell();
        if (c.num) td.className = 'n';
        const v = c.num ? num(r[c.field]) : r[c.field];
        td.textContent = F(c.fmt)(v);
      });
    });
    if (!rows.length) {
      const tr = tb.insertRow();
      const td = tr.insertCell();
      td.colSpan = cols.length;
      td.textContent = 'No records match the current filters.';
      td.style.color = 'var(--fg-muted)';
    }
  };

  // The report's data colours, read from the theme so dark mode can adjust them.
  K.palette = () => {
    const cs = getComputedStyle(document.getElementById('cc'));
    return ['--c1', '--c2', '--c3', '--c4', '--c5', '--c6', '--c7', '--c8'].map((v) => cs.getPropertyValue(v).trim() || '#326670');
  };
  K.colors = () => K.palette();
  // Animate only when a chart's data changed, so a resize or theme switch doesn't replay the entrance.
  K.animFlag = (el, rows) => {
    let sig;
    try { sig = JSON.stringify(rows).length + ':' + (rows && rows.length) + ':' + JSON.stringify(rows && rows[0]); } catch (e) { sig = String(Math.random()); }
    const changed = el._ccSig !== sig;
    el._ccSig = sig;
    return changed;
  };
  K.stagger = (sel, cls, step = 25, start = 0) => {
    sel.classed(cls, true).style('animation-delay', (d, i) => start + i * step + 'ms');
  };
  K.var = (name) => getComputedStyle(document.getElementById('cc')).getPropertyValue(name).trim();
  return K;
}
