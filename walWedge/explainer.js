/* The WAL Wedge in ten minutes (explainer.html): a short internal guide.
   Every number on the page is computed by the client engine (clientKit.js, the port of the calculator workbook) on the
   illustrative case below: a copy of the sample case, the same EUR 1bn case as the tutorial. It is embedded here so that
   this page keeps teaching with the example when clientCase.js is replaced by a real client's case. */
(function () {
  'use strict';
  const $ = id => document.getElementById(id), WW = window.WW, fmt = WW.fmt;
  const CASE = {
    illustrative: true, client: '', borrowerType: 'sovereign', showAudienceToggle: false, asOf: "26 October 2026",
    currency: 'EUR', swapBasis: 'EURIBOR6M', amount: 1000000000, drawdownYears: 1, repaymentYears: 23,
    marginFloatBp: 0, marginFixedBp: 0, recovery: 0.4, couponFreq: 1, fixing6mPct: 3.019,
    zspreadBp: {1: -19, 2: -15, 3: -14, 4: -2, 5: 6, 6: 13, 7: 24, 8: 30, 9: 37, 10: 42, 11: 46, 14: 61, 15: 65, 18: 74, 20: 78, 25: 89, 28: 92},
    ytmPct: {1: 3.032, 2: 3.242, 3: 3.349, 4: 3.431, 5: 3.522, 6: 3.597, 7: 3.726, 8: 3.804, 9: 3.888, 10: 3.942, 11: 3.995, 14: 4.198, 15: 4.256, 18: 4.32, 20: 4.349, 25: 4.349, 28: 4.376},
    swapPct: {1: 3.222, 2: 3.3919, 3: 3.4888, 4: 3.451, 5: 3.462, 6: 3.4671, 7: 3.4863, 8: 3.5045, 9: 3.5188, 10: 3.5229, 11: 3.5362, 12: 3.5545, 13: 3.5728, 14: 3.5913, 15: 3.6103, 16: 3.6011, 17: 3.5919, 18: 3.5826, 19: 3.5767, 20: 3.5707, 21: 3.5467, 22: 3.5225, 23: 3.4981, 24: 3.4735, 25: 3.4487, 26: 3.4477, 27: 3.4467, 28: 3.4456, 29: 3.4458, 30: 3.446},
  };

  const F = WW.figures(CASE), N = CASE.amount / 1e6, WAL = F.R.float.WAL;
  const legend = (id, items) => { $(id).innerHTML = items.map(([t, c, s]) => t === 'd' ? `<span><i class="dl" style="border-top:2px dashed ${c}"></i>${s}</span>`
    : `<span><i class="${t === 'b' ? 'b' : ''}" style="background:${c}"></i>${s}</span>`).join(''); };

  // the variants of section 5, for both loans, computed once
  const run = o => { const q = WW.runCase(Object.assign({}, CASE, o)); return { float: q.float.wedge * 1e4, fixed: q.fixed.wedge * 1e4, wal: q.float.WAL }; };
  const sc = F.sc, SHAPE = [['Twice as steep', sc.double], ["Today's curve", sc.base, true], ['Half as steep', sc.half], ['Flat', sc.flat], ['Inverted', sc.inv]];
  const bd = Array(60).fill(0), bp = Array(60).fill(0); bd[0] = 1; bp[Math.round(2 * WAL) - 1] = 1;   // a bullet with the loan's average life
  const PROF = [['Repaid over 8 years', { repaymentYears: 8 }], ['Repaid over 15 years', { repaymentYears: 15 }], ['Repaid over 23 years', {}, true],
    ['Same, drawn in full at signing', { drawdownYears: 0, repaymentYears: CASE.drawdownYears + CASE.repaymentYears }], [`A ${F.common.wal}-year bullet`, { profile: { type: 'custom', draw: bd, repay: bp } }]]
    .map(([l, o, now]) => { const q = run(o); return [`${l} <span class="xp-wal">(average life ${fmt.yrs(q.wal)}y)</span>`, q, now]; });

  // one column of benefits with a bar centred on zero, for the loan shown
  function rows(el, list, md) {
    const m = Math.max(1, ...list.map(x => Math.abs(x[1][md])));
    $(el).innerHTML = `<span class="h"></span><span class="h">${md === 'float' ? 'Floating' : 'Fixed'}, a year</span>` + list.map(([l, v, now]) => {
      const x = v[md], w = (Math.abs(x) / m * 50).toFixed(1), c = x >= 0 ? 'var(--gain)' : 'var(--accent)';
      return `<span class="lbl"><span>${l}${now ? ' · <b>this case</b>' : ''}</span><div class="bar2"><i style="${x >= 0 ? 'left:50%' : 'right:50%'};width:${w}%;background:${c}"></i></div></span>`
        + `<span class="n ${x > 0.05 ? 'up' : x < -0.05 ? 'dn' : ''}">${fmt.sbp(x)}</span>`;
    }).join('');
  }

  // idea 2 does not depend on the loan type: a bullet and the loan, and where their money sits on average
  (function shape() {
    const r = F.R.float, top = N * 1.18;
    WW.chart($('c-shape'), { label: 'A bond and the loan with the same average life, and where their money sits on average', w: 540, h: 250, m: { l: 46, r: 8, t: 16, b: 38 },
      x: { min: 0, max: r.maturity + 0.5, ticks: WW.ticks(0, r.maturity, 4), fmt: v => v + 'y', label: 'Years from signing' },
      y: { min: 0, max: top, ticks: WW.ticks(0, N, N / 2), fmt: v => F.common.glyph + (v >= 1000 ? v / 1000 + 'bn' : v + 'm') },
      layers: [{ t: 'rect', x0: 0, x1: WAL, y0: 0, y1: N, f: 'var(--brass)', o: 0.18 }, { t: 'line', p: [[0, N], [WAL, N], [WAL, 0]], c: 'var(--brass)', w: 1.6 },
        { t: 'bars', d: r.per.filter(e => e.O > 0).map(e => ({ x0: e.t - 0.5, x1: e.t, y0: 0, y1: e.O * N, f: 'var(--accent)', o: 0.75 })) },
        { t: 'v', x: +F.common.bondCg, c: 'var(--brass)', lab: 'bond: ' + F.common.bondCg + 'y', end: true }, { t: 'v', x: +F.common.cg, c: 'var(--accent)', lab: 'loan: ' + F.common.cg + 'y' }] });
    legend('lg-shape', [['b', 'var(--brass)', `${F.common.wal}-year bond`], ['b', 'var(--accent)', 'Our loan'], ['d', 'var(--ink)', 'Where the money sits, on average']]);
  })();

  function render(md) {
    const isF = md === 'float', r = F.R[md], u = isF ? 1e4 : 100;
    WW.bind(F, md);
    document.querySelectorAll('[data-xmode]').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.xmode === md)));

    // 1 · the curve and the one reading at the average life
    WW.drawCurve($('c-curve'), F, md);
    legend('lg-curve', isF ? [['l', 'var(--accent)', 'Z-spread (YAS)'], ['d', 'var(--brass)', 'Reading at the average life']]
      : [['l', 'var(--accent)', 'Bond yield (YAS)'], ['d', 'var(--muted)', 'Swap curve'], ['d', 'var(--brass)', 'Reading at the average life']]);

    // 2 · idea 1: each year's own cost (the engine's bootstrap) against the quote to that maturity
    const mat = Math.ceil(r.maturity), yrs = Array.from({ length: mat }, (_, i) => i + 1);
    const cost = Y => (r.per[2 * Y - 2].k + r.per[2 * Y - 1].k) / 2 * u, quote = Y => r.qfill[Y - 1] * u;
    const show = v => isF ? Math.round(v) + 'bp' : v.toFixed(2) + '%';
    $('y10q').textContent = show(quote(10)); $('y10c').textContent = show(cost(10));
    const st = isF ? 40 : 0.5, vy = yrs.map(cost).concat(yrs.map(quote));
    const lo = Math.floor(Math.min(isF ? 0 : Infinity, ...vy) / st) * st, hi = Math.ceil(Math.max(...vy) / st) * st + (isF ? 0 : st / 2);
    WW.chart($('c-year'), { label: 'Quoted ' + (isF ? 'spread' : 'yield') + ' against the cost of each single year', w: 540, h: 250, m: { l: isF ? 50 : 54, r: 8, t: 16, b: 38 },
      x: { min: 0.3, max: mat + 0.7, ticks: WW.ticks(0, mat, 4).filter(v => v > 0), fmt: v => v + 'y', label: 'Year' },
      y: { min: lo, max: hi, ticks: WW.ticks(lo, hi, st), fmt: v => isF ? v + 'bp' : v.toFixed(1) + '%' },
      layers: [{ t: 'bars', d: yrs.map(Y => ({ x0: Y - 0.42, x1: Y + 0.42, y0: isF ? 0 : lo, y1: cost(Y), f: 'var(--accent)', o: Y === 10 ? 0.95 : 0.45 })) }]
        .concat(isF ? [{ t: 'h', y: 0, c: 'var(--muted)', w: 1 }] : [])
        .concat([{ t: 'line', p: yrs.map(Y => [Y, quote(Y)]), c: 'var(--slate)', w: 2.4 }, { t: 'dots', c: 'var(--slate)', r: 3, p: yrs.map(Y => [Y, quote(Y), false]) },
          { t: 'txt', x: 10.4, y: cost(10), dy: -8, s: 'year 10 alone: ' + show(cost(10)) + ' → ', c: 'var(--accent)', anchor: 'end' }]) });
    legend('lg-year', [['l', 'var(--slate)', `Quoted ${isF ? 'spread' : 'yield'}: the average to that maturity`], ['b', 'var(--accent)', 'Cost of that single year']]);

    // 3 · the loan as mini-bonds; 4 · when the benefit arrives
    WW.drawStrip($('c-strip'), F, md, { compact: true });
    WW.drawRunning($('c-run'), F, md);

    // 5 · what moves it, for the loan shown
    rows('v-shape', SHAPE.map(([l, v, now]) => [l, v, now]), md);
    rows('v-prof', PROF, md);
    $('v-dd').textContent = `${fmt.sbp(PROF[2][1][md])} with a one-year drawdown, ${fmt.sbp(PROF[3][1][md])} drawn at signing`;
    reprice();
  }

  // 5 · try it: the curve tilted around its average-life reading, repriced live for the loan shown
  const tilt = $('tilt'), say = f => f === 1 ? "today's curve" : f === 0 ? 'flat' : f === -1 ? 'inverted (mirror image)' : f < 0 ? 'partly inverted' : `${f}× as steep`;
  function reprice() {
    const f = +tilt.value, q = WW.runCase(Object.assign({}, CASE, { zspreadBp: WW.reshape(CASE.zspreadBp, f, WAL), ytmPct: WW.reshape(CASE.ytmPct, f, WAL) }));
    const v = q[mode].wedge * 1e4;
    $('tilt-v').textContent = say(f);
    $('tilt-out').innerHTML = `<span>${mode === 'float' ? 'Floating' : 'Fixed'}: <b>${fmt.sbp(v)}</b> a year</span><span>${v > 0.5 ? 'the borrower gains' : v < -0.5 ? 'the borrower pays more: do not pitch' : 'about nothing either way'}</span>`;
  }
  tilt.addEventListener('input', reprice);

  let mode = 'float';
  try { if (localStorage.getItem('ww_xp_mode') === 'fixed') mode = 'fixed'; } catch (e) { /* no storage: start with floating */ }
  document.querySelectorAll('[data-xmode]').forEach(b => b.addEventListener('click', () => {
    mode = b.dataset.xmode; try { localStorage.setItem('ww_xp_mode', mode); } catch (e) { /* not remembered */ }
    render(mode);
  }));
  render(mode);
})();
