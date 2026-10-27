// Page renderers. Each draws its charts and tables from the datasets its marks name.
import * as d3 from 'd3';

export function createPages(K, dash) {
  const f = K.fmt;
  const n = K.num;
  const $ = (id) => document.getElementById(id);
  const C = () => K.palette();
  const TEAL = '#326670';

  const byForm = (rows, key = 'survey_form_name', ord = 'survey_form_order') =>
    Array.from(d3.rollup(rows, (v) => n(v[0][ord]) || 0, (r) => r[key])).sort((a, b) => a[1] - b[1]).map((d) => d[0]);

  const mapColor = (rows) => {
    const countries = Array.from(new Set(rows.map((r) => r.country))).sort();
    const col = (c) => C()[countries.indexOf(c) % 8];
    return { color: (cell) => col(cell.country), legend: countries.map((c) => [c, col(c)]) };
  };
  function drawMap(el) {
    if (!K.state(el, ['p_map'])) return;
    const rows = K.rows('p_map');
    const mc = mapColor(rows);
    K.map(el, rows.map((r) => ({ lat: n(r.lat), lon: n(r.lon), n: n(r.interviews), country: r.country, label: `${r.country} · cell ${r.map_cell}` })),
      { color: mc.color, legend: mc.legend, height: Math.max(300, Math.min(460, el.clientWidth * 0.62)) });
  }
  const simpleBars = (el, id, labelField, valueField, color, fmt = f.int) => {
    if (!K.state(el, [id])) return;
    const rows = K.rows(id);
    K.barsH(el, {
      categories: rows.map((r) => ({ key: r[labelField], label: r[labelField], row: r })),
      series: [{ name: 'Interviews', color, value: (c) => n(c.row[valueField]) }],
      fmt,
    });
  };

  const P = {};

  P.exec = () => {
    drawMap($('exec-map'));
    simpleBars($('exec-stake'), 'p_stakeholder', 'stakeholder', 'interviews', C()[0]);
    simpleBars($('exec-crop'), 'p_crop', 'crop', 'interviews', C()[1]);
  };

  P.monitoring = () => {
    const cum = $('mon-cum');
    if (K.state(cum, ['p_cumulative'])) {
      const rows = K.rows('p_cumulative');
      const forms = byForm(rows);
      const series = forms.map((name, i) => {
        const pts = rows.filter((r) => r.survey_form_name === name).map((r) => ({
          x: new Date(r.day), y: n(r.cumulative_usable), extra: `(+${f.int(n(r.daily_usable))} · target ${r.target_status})`,
        }));
        return { name, color: C()[i % 8], points: pts };
      });
      K.lines(cum, series, { xType: 'date', xFmt: d3.utcFormat('%b %-d'), yFmt: f.int, step: true, height: 280 });
    }
    const geo = $('mon-geo');
    if (K.state(geo, ['p_geo'])) {
      const rows = K.rows('p_geo');
      const forms = byForm(rows);
      const geos = Array.from(d3.rollup(rows, (v) => d3.sum(v, (r) => n(r.usable)), (r) => r.geography_label)).sort((a, b) => b[1] - a[1]).map((d) => d[0]);
      const cell = (g, form) => rows.find((r) => r.geography_label === g && r.survey_form_name === form);
      K.barsH(geo, {
        categories: geos.map((g) => ({ key: g, label: g })),
        series: forms.map((form, i) => ({ name: form, color: C()[i % 8], value: (c) => { const r = cell(c.key, form); return r ? n(r.usable) : null; } })),
        mode: 'stack',
        tip: (c) => forms.map((form, i) => cell(c.key, form)).filter(Boolean).map((r) => [r.survey_form_name,
          `${f.int(n(r.usable))} usable · ${f.int(n(r.submissions))} submitted · ${f.pct(n(r.usable_rate))} · ${f.int(n(r.districts))} districts`, null]),
      });
    }
    const t = $('mon-enum');
    if (K.state(t, ['p_enumerators'])) {
      K.table(t, K.rows('p_enumerators'), [
        { field: 'survey_form_name', label: 'Survey form' },
        { field: 'enumerator_name', label: 'Enumerator / facilitator' },
        { field: 'loaded', label: 'Loaded', num: true, fmt: 'int' },
        { field: 'pilot_training', label: 'Pilot / training', num: true, fmt: 'int' },
        { field: 'usable', label: 'Usable', num: true, fmt: 'int' },
        { field: 'daily_average', label: 'Daily average', num: true, fmt: 'num1' },
        { field: 'median_min', label: 'Median min', num: true, fmt: 'num1' },
        { field: 'latest', label: 'Latest (EAT)' },
      ], 'row_key');
    }
    drawMap($('mon-map'));
  };

  P.demographics = () => {
    const gEl = $('dem-gender');
    if (K.state(gEl, ['p_gender_form'])) {
      const rows = K.rows('p_gender_form');
      const forms = byForm(rows);
      const genders = ['Female', 'Male', ...Array.from(new Set(rows.map((r) => r.respondent_gender))).filter((g) => g !== 'Female' && g !== 'Male').sort()];
      const gc = (g) => (g === 'Female' ? C()[2] : g === 'Male' ? C()[0] : K.var('--c7'));
      const val = (form, g) => { const r = rows.find((x) => x.survey_form_name === form && x.respondent_gender === g); return r ? n(r.usable) : null; };
      K.barsH(gEl, {
        categories: forms.map((form) => ({ key: form, label: form })),
        series: genders.filter((g) => rows.some((r) => r.respondent_gender === g)).map((g) => ({ name: g, color: gc(g), value: (c) => val(c.key, g) })),
        mode: 'stack100',
        tip: (c) => {
          const r0 = rows.find((x) => x.survey_form_name === c.key);
          return [...genders.filter((g) => val(c.key, g) != null).map((g) => [g, f.int(val(c.key, g)), gc(g)]),
            ['Female among known', f.pct(n(r0.female_share_known))], ['Gender coverage', f.pct(n(r0.gender_coverage))]];
        },
      });
    }
    const rEl = $('dem-role');
    if (K.state(rEl, ['p_segment'])) {
      const rows = K.rows('p_segment');
      const segs = Array.from(d3.rollup(rows, (v) => d3.sum(v, (r) => n(r.usable)), (r) => r.respondent_segment)).sort((a, b) => b[1] - a[1]);
      K.barsH(rEl, {
        categories: segs.map(([s, total]) => ({ key: s, label: s, total })),
        series: [{ name: 'Usable records', color: C()[0], value: (c) => c.total }],
        tip: (c) => rows.filter((r) => r.respondent_segment === c.key).map((r) => [r.survey_form_name, `${f.int(n(r.usable))} of ${f.int(n(r.submissions))} (${f.pct(n(r.usable_rate))})`]),
      });
    }
    const cEl = $('dem-crop');
    if (K.state(cEl, ['p_crop_form'])) {
      const rows = K.rows('p_crop_form');
      const crops = Array.from(d3.rollup(rows, (v) => d3.sum(v, (r) => n(r.interviews)), (r) => r.crop)).sort((a, b) => b[1] - a[1]);
      K.barsH(cEl, {
        categories: crops.map(([c, total]) => ({ key: c, label: c, total })),
        series: [{ name: 'Completed interviews', color: C()[1], value: (c) => c.total }],
        tip: (c) => rows.filter((r) => r.crop === c.key).map((r) => [r.survey_form_name, `${f.int(n(r.interviews))} · ${f.int(n(r.crop_role_alerts))} crop-role alerts`]),
      });
    }
    const geoEl = $('dem-geo');
    if (K.state(geoEl, ['p_geo_gender'])) {
      const rows = K.rows('p_geo_gender');
      const geos = Array.from(d3.rollup(rows, (v) => d3.sum(v, (r) => n(r.usable)), (r) => r.geography_label)).sort((a, b) => b[1] - a[1]).map((d) => d[0]);
      const genders = Array.from(new Set(rows.map((r) => r.respondent_gender))).sort((a, b) => (a === 'Female' ? -1 : b === 'Female' ? 1 : a === 'Male' ? -1 : b === 'Male' ? 1 : a.localeCompare(b)));
      const gc = (g) => (g === 'Female' ? C()[2] : g === 'Male' ? C()[0] : K.var('--c7'));
      const cell = (geo, g) => rows.find((r) => r.geography_label === geo && r.respondent_gender === g);
      K.barsH(geoEl, {
        categories: geos.map((g) => ({ key: g, label: g })),
        series: genders.map((g) => ({ name: g, color: gc(g), value: (c) => { const r = cell(c.key, g); return r ? n(r.usable) : null; } })),
        mode: 'stack',
        tip: (c) => {
          const rs = rows.filter((r) => r.geography_label === c.key);
          return [...rs.map((r) => [r.respondent_gender, `${f.int(n(r.usable))} usable · ${f.int(n(r.quality_alerts))} alerts`, gc(r.respondent_gender)]),
            ['Gender coverage', f.pct(n(rs[0].gender_coverage))]];
        },
      });
    }
    const t = $('dem-profile');
    if (K.state(t, ['p_profile'])) {
      K.table(t, K.rows('p_profile'), [
        { field: 'survey_form_name', label: 'Survey form' },
        { field: 'respondent_unit', label: 'Unit' },
        { field: 'usable', label: 'Usable n', num: true, fmt: 'int' },
        { field: 'female_share', label: 'Female share', num: true, fmt: 'pct' },
        { field: 'gender_coverage', label: 'Gender coverage', num: true, fmt: 'pct' },
        { field: 'average_age', label: 'Average age', num: true, fmt: 'num1' },
        { field: 'age_coverage', label: 'Age coverage', num: true, fmt: 'pct' },
        { field: 'regions', label: 'Regions', num: true, fmt: 'int' },
        { field: 'source_status', label: 'Source status' },
      ], 'survey_form_name');
    }
  };

  P['traits-et'] = () => {
    const groups = ['Yield & resilience', 'Plant & maturity', 'Input & labour', 'Grain & postharvest', 'Food & nutrition', 'Market value', 'Market & seed economics', 'Other / review'];
    const gcol = (g) => C()[Math.max(0, groups.indexOf(g)) % 8];
    const vEl = $('et-variety');
    if (K.state(vEl, ['et_tr_variety'])) {
      const rows = K.rows('et_tr_variety');
      const present = groups.filter((g) => rows.some((r) => r.trait_group === g));
      K.barsH(vEl, {
        categories: rows.map((r) => ({ key: r.trait_short, label: r.trait_short, row: r })),
        series: [{ name: 'Priority index', color: TEAL, value: (c) => n(c.row.priority_index) }],
        fmt: f.pct, axisPct: true,
        tip: (c) => [['Priority index', f.pct(n(c.row.priority_index))], ['First choice', f.pct(n(c.row.first_choice_share))],
          ['In top three', f.pct(n(c.row.top_three_share))], ['Named important', f.pct(n(c.row.importance_share))], ['Theme', c.row.trait_group]],
      });
      vEl.querySelectorAll('rect').forEach((r, i) => { if (rows[i]) r.setAttribute('fill', gcol(rows[i].trait_group)); });
      K.legend(vEl, present.map((g) => [g, gcol(g)]));
    }
    const sEl = $('et-scatter');
    if (K.state(sEl, ['et_tr_variety'])) {
      const rows = K.rows('et_tr_variety');
      const present = groups.filter((g) => rows.some((r) => r.trait_group === g));
      K.scatter(sEl, rows.map((r) => ({ x: n(r.importance_share), y: n(r.first_choice_share), r: n(r.mentions), color: gcol(r.trait_group), label: r.trait_short,
        tip: [['Named important', f.pct(n(r.importance_share))], ['First choice', f.pct(n(r.first_choice_share))], ['Priority index', f.pct(n(r.priority_index))], ['Mentions', f.int(n(r.mentions))]] })),
      { xLabel: 'Named important', yLabel: 'Ranked first', legend: present.map((g) => [g, gcol(g)]) });
    }
    const hEl = $('et-hybrid');
    if (K.state(hEl, ['et_tr_hybrid'])) {
      const rows = K.rows('et_tr_hybrid');
      K.barsH(hEl, {
        categories: rows.map((r) => ({ key: r.trait_short, label: r.trait_short, row: r })),
        series: [{ name: 'Interest share', color: C()[0], value: (c) => n(c.row.interest_share) }, { name: 'First choice', color: C()[1], value: (c) => n(c.row.first_choice_share) }],
        fmt: f.pct, axisPct: true, max: 1,
        tip: (c) => [['Interest share', f.pct(n(c.row.interest_share)), C()[0]], ['First choice', f.pct(n(c.row.first_choice_share)), C()[1]],
          ['Priority index', f.pct(n(c.row.priority_index))], ['Respondents', f.int(n(c.row.hybrid_respondents))]],
      });
    }
    const svEl = $('et-saved');
    if (K.state(svEl, ['et_tr_saved'])) {
      const rows = K.rows('et_tr_saved');
      K.barsH(svEl, {
        categories: rows.map((r) => ({ key: r.trait_short, label: r.trait_short, row: r })),
        series: [{ name: 'Evidence share', color: C()[3], value: (c) => n(c.row.evidence_share) }],
        fmt: f.pct, axisPct: true,
        tip: (c) => [['Evidence share', f.pct(n(c.row.evidence_share))], ['Mentions', f.int(n(c.row.evidence_mentions))], ['Saved-seed varieties', f.int(n(c.row.saved_seed_responses))]],
      });
    }
  };

  P['traits-tz'] = () => {
    const rows = K.rows('tz_tr_traits');
    const t3 = $('tz-top3');
    if (K.state(t3, ['tz_tr_traits'])) {
      K.barsH(t3, {
        categories: rows.map((r) => ({ key: r.trait, label: r.trait, row: r })),
        series: [{ name: 'Top-three share', color: TEAL, value: (c) => n(c.row.top3_share) }],
        fmt: f.pct, axisPct: true,
        tip: (c) => [['In top three', f.pct(n(c.row.top3_share))], ['Ranked first', f.pct(n(c.row.first_share))]],
      });
    }
    const fe = $('tz-first');
    if (K.state(fe, ['tz_tr_traits'])) {
      const fr = rows.filter((r) => n(r.first_share) > 0).sort((a, b) => n(b.first_share) - n(a.first_share));
      K.barsH(fe, {
        categories: fr.map((r) => ({ key: r.trait, label: r.trait, row: r })),
        series: [{ name: 'Ranked first', color: C()[1], value: (c) => n(c.row.first_share) }],
        fmt: f.pct, axisPct: true,
      });
    }
    const t = $('tz-table');
    if (K.state(t, ['tz_tr_table'])) {
      K.table(t, K.rows('tz_tr_table'), [
        { field: 'crop', label: 'Crop' }, { field: 'trait', label: 'Trait' },
        { field: 'actors', label: 'Actors n', num: true, fmt: 'int' }, { field: 'top3_share', label: 'Top-three %', num: true, fmt: 'pct' },
        { field: 'evidence', label: 'Evidence' },
      ], 'row_key');
    }
  };

  P['traits-la'] = () => {
    const hEl = $('la-heat');
    if (K.state(hEl, ['la_tr_heat'])) {
      const rows = K.rows('la_tr_heat');
      const traits = Array.from(d3.rollup(rows, (v) => n(v[0].trait_order), (r) => r.trait)).sort((a, b) => a[1] - b[1]).map((d) => d[0]);
      const concepts = Array.from(d3.rollup(rows, (v) => n(v[0].concept_code), (r) => r.concept)).sort((a, b) => a[1] - b[1]).map((d) => d[0]);
      K.heat(hEl, rows.map((r) => ({ row: r.trait, col: r.concept, v: n(r.attractive_share),
        tip: [['Attractive share', f.pct(n(r.attractive_share))], ['Exposures', f.int(n(r.exposures))], ['Theme', r.trait_group]] })),
      { rows: traits, cols: concepts, fmt: f.pct0 });
    }
    const pEl = $('la-pref');
    if (K.state(pEl, ['la_tr_pref'])) {
      const rows = K.rows('la_tr_pref');
      K.barsH(pEl, {
        categories: rows.map((r) => ({ key: r.concept, label: r.concept, row: r })),
        series: [{ name: 'Most preferred', color: C()[0], value: (c) => n(c.row.preferred_share) }, { name: 'Least preferred', color: K.var('--orange'), value: (c) => n(c.row.least_share) }],
        fmt: f.pct, axisPct: true,
        tip: (c) => [['Most preferred', f.pct(n(c.row.preferred_share)), C()[0]], ['Least preferred', f.pct(n(c.row.least_share)), K.var('--orange')], ['Saw this concept', f.int(n(c.row.respondents))]],
      });
    }
    const t = $('la-table');
    if (K.state(t, ['la_tr_table'])) {
      K.table(t, K.rows('la_tr_table'), [
        { field: 'country', label: 'Country' }, { field: 'concept', label: 'Concept' },
        { field: 'exposed', label: 'Exposed n', num: true, fmt: 'int' }, { field: 'preferred_share', label: 'Preferred %', num: true, fmt: 'pct' },
        { field: 'least_share', label: 'Least %', num: true, fmt: 'pct' }, { field: 'try_share', label: 'Try %', num: true, fmt: 'pct' },
        { field: 'replace_share', label: 'Replace %', num: true, fmt: 'pct' }, { field: 'evidence', label: 'Evidence' },
      ], 'row_key');
    }
  };

  const reach = (el, id, signed) => {
    if (!K.state(el, [id])) return;
    const rows = K.rows(id);
    const pts = rows.map((r) => ({ x: n(r.premium_threshold), y: n(r.reach_share), extra: r.farmers != null ? `(${f.int(n(r.farmers))})` : '' }));
    K.lines(el, [{ name: 'Share at or above', color: TEAL, points: pts }], {
      xType: 'linear', xFmt: (v) => (signed && v > 0 ? '+' : '') + d3.format('.0%')(v), yFmt: d3.format('.0%'), yMax: 1, dots: true, zeroX: signed,
      xTicks: pts.map((p) => p.x).filter((v, i, a) => a.length < 12 || i % 2 === 0),
      emptyText: 'No valid answers under the current filters.',
    });
  };
  const bands = (el, id, countField, color) => {
    if (!K.state(el, [id])) return;
    const rows = K.rows(id);
    K.barsH(el, {
      categories: rows.map((r) => ({ key: r.premium_band || r.yield_gain_band, label: r.premium_band || r.yield_gain_band, row: r })),
      series: [{ name: 'Share', color, value: (c) => n(c.row.band_share) }],
      fmt: f.pct, axisPct: true,
      tip: (c) => [['Share', f.pct(n(c.row.band_share))], ['Count', f.int(n(c.row[countField]))]],
    });
  };

  P['wtp-et'] = () => {
    reach($('ew-reach'), 'et_wtp_reach', false);
    bands($('ew-yield'), 'et_wtp_yield', 'farmers', C()[1]);
    const gEl = $('ew-gender');
    if (K.state(gEl, ['et_wtp_gender'])) {
      const rows = K.rows('et_wtp_gender');
      K.barsH(gEl, {
        categories: rows.map((r) => ({ key: r.gender, label: r.gender, row: r })),
        series: [{ name: 'Median premium', color: C()[0], value: (c) => n(c.row.median_premium) }, { name: 'Median required yield gain', color: C()[1], value: (c) => n(c.row.median_yield_gain) }],
        fmt: f.pct, axisPct: true,
        tip: (c) => [['Median premium', f.pct(n(c.row.median_premium)), C()[0]], ['Median yield gain', f.pct(n(c.row.median_yield_gain)), C()[1]],
          ['Median extra (ETB/qt)', f.num0(n(c.row.median_extra_wtp))], ['Complete trade-offs', f.int(n(c.row.complete_tradeoffs))]],
      });
    }
    const t = $('ew-region');
    if (K.state(t, ['et_wtp_region'])) {
      K.table(t, K.rows('et_wtp_region'), [
        { field: 'region', label: 'Region' }, { field: 'zone', label: 'Zone' },
        { field: 'valid_price_n', label: 'WTP n', num: true, fmt: 'int' }, { field: 'median_extra_wtp', label: 'Median extra ETB/qt', num: true, fmt: 'num0' },
        { field: 'median_premium', label: 'Median premium', num: true, fmt: 'pct' }, { field: 'share_25_plus', label: 'At least 25%', num: true, fmt: 'pct' },
        { field: 'median_yield_gain', label: 'Median yield gain', num: true, fmt: 'pct' }, { field: 'sample_note', label: 'Use' },
      ], 'row_key');
    }
  };

  P['wtp-tz'] = () => {
    reach($('tw-reach'), 'tz_wtp_reach', true);
    bands($('tw-bands'), 'tz_wtp_bands', 'actors', C()[1]);
    const sEl = $('tw-seg');
    if (K.state(sEl, ['tz_wtp_segment'])) {
      const rows = K.rows('tz_wtp_segment');
      if (!rows.length) K.empty(sEl);
      else K.barsSigned(sEl, rows.map((r) => ({ label: r.respondent_segment, value: n(r.median_premium), row: r })),
        { fmt: f.spct, color: TEAL, tip: (c) => [['Median', f.spct(c.value)], ['Complete pairs', f.int(n(c.row.pairs))]] });
    }
    const t = $('tw-table');
    if (K.state(t, ['tz_wtp_table'])) {
      K.table(t, K.rows('tz_wtp_table'), [
        { field: 'crop', label: 'Crop' }, { field: 'respondent_segment', label: 'Actor' },
        { field: 'pairs', label: 'Pairs n', num: true, fmt: 'int' }, { field: 'median_premium', label: 'Median', num: true, fmt: 'spct' },
        { field: 'p25', label: 'P25', num: true, fmt: 'spct' }, { field: 'p75', label: 'P75', num: true, fmt: 'spct' },
        { field: 'share_25_plus', label: '25%+', num: true, fmt: 'pct' }, { field: 'evidence', label: 'Evidence' },
      ], 'row_key');
    }
  };

  P['wtp-la'] = () => {
    reach($('lw-reach'), 'lw_reach', true);
    bands($('lw-bands'), 'lw_bands', 'respondents', C()[1]);
    const cEl = $('lw-concept');
    if (K.state(cEl, ['lw_concept'])) {
      const rows = K.rows('lw_concept');
      if (!rows.length) K.empty(cEl);
      else K.barsSigned(cEl, rows.map((r) => ({ label: r.concept_preferred, value: n(r.median_premium), row: r })),
        { fmt: f.spct, color: TEAL, tip: (c) => [['Median premium', f.spct(c.value)], ['Valid premiums', f.int(n(c.row.valid_premiums))]] });
    }
    const t = $('lw-trait');
    if (K.state(t, ['lw_trait'])) {
      K.table(t, K.rows('lw_trait'), [
        { field: 'trait_group', label: 'Trait group' }, { field: 'trait', label: 'Attractive trait of preferred concept' },
        { field: 'respondents', label: 'n', num: true, fmt: 'int' }, { field: 'median_premium', label: 'Median premium', num: true, fmt: 'spct' },
        { field: 'p25', label: 'P25', num: true, fmt: 'spct' }, { field: 'p75', label: 'P75', num: true, fmt: 'spct' },
        { field: 'share_25_plus', label: '25%+', num: true, fmt: 'pct' }, { field: 'evidence', label: 'Evidence' },
      ], 'trait');
    }
  };

  return P;
}
