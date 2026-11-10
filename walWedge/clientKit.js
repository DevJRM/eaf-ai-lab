/* WAL Wedge client templates — shared engine, figures, charts and binding.
   Used by walWedgePitch.html, borrowerPitch.html, borrowerQA.html and simulator.html.
   The engine is a port of WAL_Wedge_Loan_vs_Bond_Calculator.xlsx (Python mirror:
   wal_wedge_engine.py); keep the three in step. Rates are decimals inside the engine. */
(function () {
  'use strict';

  /* ---------------- engine ---------------- */
  function fill(vals) {
    const k = []; vals.forEach((v, i) => { if (v !== null && v !== undefined && !Number.isNaN(v)) k.push(i); });
    const out = vals.map((v, i) => {
      if (v !== null && v !== undefined && !Number.isNaN(v)) return v;
      let p = -1, n = -1;
      for (const j of k) { if (j < i) p = j; if (j > i && n < 0) n = j; }
      if (p >= 0 && n >= 0) return vals[p] + (vals[n] - vals[p]) * (i - p) / (n - p);
      if (p >= 0) return vals[p];
      return vals[n];
    });
    return { out, last: k.length ? k[k.length - 1] + 1 : 0 };
  }
  // Swap bootstrap (annual fixed leg, accrual alpha) and half-year discount factors (Curves!Q, W).
  function swapDfs(rates, alpha, r6, basis) {
    const r = fill(rates).out; const D = [1]; let ann = 0;
    for (let k = 0; k < 30; k++) { const d = (1 - r[k] * alpha * ann) / (1 + r[k] * alpha); ann += d; D.push(d); }
    const g = [1];
    for (let i = 1; i <= 60; i++) g.push(i % 2 === 0 ? D[i / 2] : Math.sqrt(D[(i - 1) / 2] * D[(i + 1) / 2]));
    if (r6 !== null && r6 !== undefined) g[1] = 1 / (1 + r6 * 182.5 / basis);
    return g;
  }
  // YAS bridge: par coupon of the T-year bond (coupon frequency m) whose YAS Z-spread is z.
  function bridge(dfg, z, T, m) {
    const dfz = t => Math.pow(Math.pow(dfg[Math.round(2 * t)], -1 / (m * t)) + z / m, -m * t);
    let s = 0; for (let j = 1; j <= Math.round(m * T); j++) s += dfz(j / m);
    return m * (1 - dfz(T)) / s;
  }
  // Share of the amount drawn and repaid in each half-year i = 1..60 (index 0 unused); Schedule tab and
  // wal_wedge_engine.schedule(). prof: {type: 'linear' | 'balloon' | 'custom', balloon, draw: [...], repay: [...]}.
  function schedule(x, y, prof) {
    const p = prof || { type: 'linear' }, kind = p.type || 'linear', draw = new Array(61).fill(0), repay = new Array(61).fill(0);
    if (kind === 'linear' || kind === 'balloon') {
      const D = Math.round(2 * x), Rn = Math.round(2 * y), Dd = Math.max(D, 1), b = kind === 'balloon' ? (p.balloon || 0) : 0;
      if (Rn < 1 || D + Rn > 60) throw new Error('Drawdown plus repayment period must fit in 30 years, with at least one instalment.');
      if (!(b >= 0 && b <= 1)) throw new Error('The balloon must be between 0% and 100% of the amount.');
      for (let i = 1; i <= Dd; i++) draw[i] = 1 / Dd;
      for (let i = D + 1; i <= D + Rn; i++) repay[i] = (1 - b) / Rn;
      repay[D + Rn] += b;
    } else if (kind === 'custom') {
      const dl = p.draw || [], rl = p.repay || [];
      if (dl.length > 60 || rl.length > 60) throw new Error('A custom schedule has at most 60 half-years (30 years).');
      dl.forEach((v, i) => { draw[i + 1] = +v || 0; }); rl.forEach((v, i) => { repay[i + 1] = +v || 0; });
    } else throw new Error(`Unknown profile type '${kind}': use linear, balloon or custom.`);
    if (Math.min(...draw, ...repay) < 0) throw new Error('Drawings and repayments cannot be negative.');
    const sd = draw.reduce((a, v) => a + v, 0), sr = repay.reduce((a, v) => a + v, 0);
    if (Math.abs(sd - 1) > 1e-9 || Math.abs(sr - 1) > 1e-9)
      throw new Error(`Drawings sum to ${(sd * 100).toFixed(4)}% and repayments to ${(sr * 100).toFixed(4)}%; both must be 100%.`);
    let bal = 0;
    for (let i = 1; i <= 60; i++) { bal += draw[i] - repay[i]; if (bal < -1e-12) throw new Error(`Half-year ${i} repays more than is outstanding.`); }
    return { draw, repay };
  }
  // kind 'float': curve = YAS Z-spreads; 'fixed': curve = YAS YTMs (decimals). m = bond coupon frequency.
  function model(curve, kind, dfg, R, x, y, Xbp, m, prof) {
    const F = fill(curve); const last = F.last;
    const q = kind === 'float' ? F.out.map((v, i) => bridge(dfg, v, i + 1, m)) : F.out.slice();
    const a = 0.5; const fa = [null]; for (let i = 1; i <= 60; i++) fa.push(dfg[i - 1] / dfg[i] - 1);
    const S = [1]; const lam = []; let cumC = 0, cumAnn = 0;
    for (let b = 1; b <= 30; b++) {
      let l;
      if (b <= last) {
        const c = q[b - 1], i1 = 2 * b - 1, i2 = 2 * b, Sp = S[S.length - 1];
        const K = cumC + c * cumAnn, g1 = m === 2 ? c / 2 : 0, g2 = c / m + 1, D1 = dfg[i1], D2 = dfg[i2];
        const q2 = D2 * Sp * (g2 - R), q1 = Sp * (D1 * (g1 - R) + D2 * R), q0 = K + D1 * Sp * R - 1;
        const u = (-q1 + Math.sqrt(q1 * q1 - 4 * q2 * q0)) / (2 * q2); l = -2 * Math.log(u);
      } else l = lam[lam.length - 1];
      lam.push(l);
      for (const i of [2 * b - 1, 2 * b]) {
        const Sprev = S[S.length - 1], Si = Sprev * Math.exp(-l * a);
        cumC += dfg[i] * R * (Sprev - Si);
        if (m === 2 || i % 2 === 0) cumAnn += dfg[i] * Si / m;
        S.push(Si);
      }
    }
    const sch = schedule(x, y, prof); let n = 0; for (let i = 1; i <= 60; i++) if (sch.repay[i] > 0) n = i;
    const per = []; let WAL = 0, B = 0, sk = 0, sf = 0, cg = 0, drawn = 0, repaid = 0;
    for (let i = 1; i <= 60; i++) {
      drawn += sch.draw[i];
      let O = i <= n ? drawn - repaid : 0; if (Math.abs(O) < 1e-12) O = 0;   // drawn at the start of i, repaid at its end
      repaid += sch.repay[i];
      const w = dfg[i] * S[i] * a * O, p = S[i] / S[i - 1];
      const c = (1 - p) * (1 + fa[i] - R) / (p * a), f = fa[i] / a, k = kind === 'float' ? c : f + c;
      per.push({ i, t: i / 2, O, P: sch.repay[i], DD: sch.draw[i], DF: dfg[i], S: S[i], w, c, f, k });
      WAL += O * a; B += w; sk += w * k; sf += w * f; cg += (i / 2 - 0.25) * O * a;
    }
    const fair = sk / B, wf = sf / B;
    const qq = F.out, fl = Math.min(Math.max(WAL, 1), 30), lo = Math.max(1, Math.min(29, Math.floor(fl)));
    const quote = qq[lo - 1] + (qq[lo] - qq[lo - 1]) * (fl - lo);
    const shortcut = kind === 'fixed' ? 2 * (Math.pow(1 + quote / m, m / 2) - 1) : quote;
    const charged = shortcut + Xbp / 1e4, wedge = fair - charged;
    let tot = 0, after = 0, pyAfter = 0; const run = [[0, 0]];
    for (const e of per) {
      const g = e.w * (e.k - charged), af = Math.max(0, Math.min(1, (e.t - WAL) / a));
      tot += g; after += g * af; pyAfter += e.O * a * af; e.gain = g; run.push([e.t, tot]);
    }
    const upto = nn => { let num = 0, den = 0; for (let i = 0; i < nn; i++) { num += per[i].DF * per[i].S * per[i].k; den += per[i].DF * per[i].S; } return num / den; };
    const n0 = Math.max(1, Math.min(59, Math.floor(2 * WAL)));
    const bullet = upto(n0) + (2 * WAL - n0) * (upto(n0 + 1) - upto(n0));
    // risk-free par yield on the half-year grid, read at the WAL (Calc_*!E25)
    const Z = [null]; let cw = 0; for (let i = 1; i <= 60; i++) { cw += dfg[i]; Z.push((1 - dfg[i]) / (0.5 * cw)); }
    const tt = 2 * Math.min(30, Math.max(0.5, WAL)), zl = Math.max(1, Math.min(59, Math.floor(tt)));
    const rfPar = Z[zl] + (Z[zl + 1] - Z[zl]) * (tt - zl);
    return { kind, lam, S, per, run, WAL, B, fair, wf, rfPar, quote, shortcut, charged, wedge,
             pv: tot, pvAfter: after, pvBefore: tot - after, pyAfter, cg: cg / WAL, maturity: n / 2,
             qfill: qq, last, bullet, timing: fair - bullet, convention: bullet - shortcut };
  }

  // The loan as a strip of mini-bonds: one bullet per instalment, drawn with the loan and repaid on its date.
  // Exact identity: the loan's bond-equivalent price is the weighted average of the mini-bond prices,
  // each weighted by its credit-adjusted annuity A_j (how long, and how safely, it is outstanding).
  function strip(r, cs) {
    const D = Math.round(2 * cs.drawdownYears), Rn = Math.round(2 * cs.repaymentYears), DDc = Math.max(D, 1), out = [];
    for (let j = 1; j <= Rn; j++) {
      const n = D + j; let A = 0, P = 0;
      for (let i = 1; i <= n; i++) { const e = r.per[i - 1], wp = e.DF * e.S * 0.5 * Math.min(i, DDc) / DDc; A += wp; P += wp * e.k; }
      out.push({ j, T: n / 2, A, p: P / A, value: (P / A - r.charged) * A * cs.amount / Rn });
    }
    return out;
  }

  /* ---------------- conventions by currency (workbook Inputs C16, Curves W6) ---------------- */
  function conventions(cs) {
    const c = cs.currency;
    if (c === 'USD') return { alpha: 365.25 / 360, basis: 360, ref: 'SOFR', refLong: 'SOFR', swapName: 'USD SOFR swap curve', sym: 'USD', glyph: '$' };
    if (c === 'GBP') return { alpha: 365.25 / 365, basis: 365, ref: 'SONIA', refLong: 'compounded SONIA', swapName: 'GBP SONIA swap curve', sym: 'GBP', glyph: '£' };
    if (cs.swapBasis === 'ESTR') return { alpha: 365.25 / 360, basis: 360, ref: '€STR', refLong: '€STR', swapName: 'EUR €STR swap curve', sym: 'EUR', glyph: '€' };
    return { alpha: 1, basis: 360, ref: '6-month EURIBOR', refLong: '6-month EURIBOR', swapName: 'EUR swap curve against 6-month EURIBOR', sym: 'EUR', glyph: '€' };
  }
  const arr = (obj, sc) => { const o = []; for (let k = 1; k <= 30; k++) o.push(obj && (k in obj) && obj[k] !== null ? obj[k] / sc : null); return o; };

  function runCase(cs) {
    const cv = conventions(cs), m = cs.couponFreq;
    const s = arr(cs.swapPct, 100), z = arr(cs.zspreadBp, 1e4), y = arr(cs.ytmPct, 100);
    const r6 = cs.fixing6mPct === null || cs.fixing6mPct === undefined ? null : cs.fixing6mPct / 100;
    const dfg = swapDfs(s, cv.alpha, r6, cv.basis);
    return {
      float: model(z, 'float', dfg, cs.recovery, cs.drawdownYears, cs.repaymentYears, cs.marginFloatBp, m, cs.profile),
      fixed: model(y, 'fixed', dfg, cs.recovery, cs.drawdownYears, cs.repaymentYears, cs.marginFixedBp, m, cs.profile),
      dfg, cv, inputs: { s, z, y }
    };
  }
  // Curve-shape family: every quote moved to q(WAL) + f·(q − q(WAL)); f = 1 is the base case.
  function reshape(obj, f, wal) {
    const keys = Object.keys(obj).map(Number); const F = fill(arr(obj, 1)).out;
    const fl = Math.min(Math.max(wal, 1), 30), lo = Math.max(1, Math.min(29, Math.floor(fl)));
    const q = F[lo - 1] + (F[lo] - F[lo - 1]) * (fl - lo); const o = {};
    keys.forEach(k => { o[k] = q + f * (obj[k] - q); }); return o;
  }
  function scenarios(cs, base) {
    const wal = base.float.WAL, out = {};
    const go = (name, c2) => { const r = runCase(c2); out[name] = { float: r.float.wedge * 1e4, fixed: r.fixed.wedge * 1e4 }; };
    go('base', cs);
    const sw = {}; Object.keys(cs.swapPct).forEach(k => { sw[k] = cs.swapPct[k] + 0.30; });
    go('swap30', Object.assign({}, cs, { swapPct: sw, fixing6mPct: cs.fixing6mPct === null ? null : cs.fixing6mPct + 0.30 }));
    go('rec20', Object.assign({}, cs, { recovery: 0.20 }));
    go('rec60', Object.assign({}, cs, { recovery: 0.60 }));
    [[-1, 'inv'], [0, 'flat'], [0.5, 'half'], [2, 'double']].forEach(([f, nm]) =>
      go(nm, Object.assign({}, cs, { zspreadBp: reshape(cs.zspreadBp, f, wal), ytmPct: reshape(cs.ytmPct, f, wal) })));
    return out;
  }

  // Alternative repayment profiles on the same curve: the profile is a lever, in both directions.
  function profiles(cs) {
    const x = cs.drawdownYears, y = cs.repaymentYears, out = [];
    const add = (lab, xx, yy) => { if (yy <= 0 || xx < 0 || xx + yy > 30) return; const r = runCase(Object.assign({}, cs, { drawdownYears: xx, repaymentYears: yy }));
      out.push({ lab, x: xx, y: yy, float: r.float, fixed: r.fixed, beyond: xx + yy > Math.max(...Object.keys(cs.zspreadBp).map(Number)) }); };
    add('As proposed', x, y);
    add('Repayment 5 years shorter', x, y - 5);
    add('Repayment 4 years longer', x, y + 4);
    add(`Drawdown over ${fmt.yrs(x + 2)} years instead of ${fmt.yrs(x)}, same final maturity`, x + 2, y - 2);
    if (x > 0) add('Fully drawn at signing, same final maturity', 0, x + y);
    return out;
  }

  /* ---------------- formatting ---------------- */
  const MINUS = '−';
  const fmt = {
    bp: (v, d = 2) => (v < 0 ? MINUS : '') + Math.abs(v).toFixed(d) + 'bp',
    sbp: (v, d = 2) => (v < 0 ? MINUS : '+') + Math.abs(v).toFixed(d) + 'bp',
    pct: (v, d = 4) => (v * 100).toFixed(d) + '%',
    money: (v, sym) => (v < 0 ? MINUS : '') + sym + ' ' + (Math.abs(v) / 1e6).toFixed(1) + 'm',
    smoney: (v, sym) => (v < 0 ? MINUS : '+') + sym + ' ' + (Math.abs(v) / 1e6).toFixed(1) + 'm',
    amount: (v, sym) => sym + ' ' + (v >= 1e9 ? +(v / 1e9).toFixed(2) + 'bn' : +(v / 1e6).toFixed(0) + 'm'),
    yrs: v => (+v.toFixed(2)).toString(),
  };

  /* ---------------- figures: every number the documents quote ---------------- */
  function figures(cs) {
    const R = runCase(cs), sc = scenarios(cs, R), cv = R.cv, sym = cv.sym, N = cs.amount;
    const f = R.float, x = R.fixed, m = cs.couponFreq;
    const WAL = f.WAL, mat = f.maturity, nInst = Math.round(2 * cs.repaymentYears), nDraw = Math.round(2 * cs.drawdownYears);
    // representative long year: the longest quoted Z-spread tenor within the loan's life
    const zKeys = Object.keys(cs.zspreadBp).map(Number).filter(k => k <= mat).sort((a, b) => a - b);
    const yr = zKeys.length ? zKeys[zKeys.length - 1] : Math.floor(mat);
    const yearCost = (r, Y) => (r.per[2 * Y - 2].k + r.per[2 * Y - 1].k) / 2;
    const balAt = Y => { const e = f.per[2 * Y - 1]; return e ? e.O : 0; };
    let below = 0; for (let k = 0; k < 30 && f.qfill[k] < 0; k++) below = k + 1;
    const common = {
      client: cs.client || '[Client name]', asOf: cs.asOf, dataNote: cs.illustrative ? ' (simulated, template)' : '',
      xYears: fmt.yrs(cs.drawdownYears), yYears: fmt.yrs(cs.repaymentYears), xPlural: cs.drawdownYears === 1 ? '' : 's', ccy: cs.currency, sym, glyph: cv.glyph,
      amount: fmt.amount(N, sym), amountFull: sym + ' ' + N.toLocaleString('en-GB'),
      wal: fmt.yrs(WAL), maturity: fmt.yrs(mat), avgRepay: fmt.yrs(WAL + (nDraw > 1 ? (nDraw - 1) / 4 : 0)), cg: f.cg.toFixed(2), bondCg: (WAL / 2).toFixed(2),
      shareAfter: Math.round(f.pyAfter / WAL * 100) + '%',
      tailYears: fmt.yrs(mat - WAL),
      drawdown: nDraw === 0 ? 'Fully drawn at signing' : nDraw === 1 ? 'Single drawing at signing'
        : nDraw === 2 ? 'Two equal tranches, at signing and at month 6'
        : `${nDraw} equal semi-annual drawings, from signing to month ${(nDraw - 1) * 6}`,
      repayment: `${nInst} equal semi-annual instalments of about ${fmt.money(N / nInst, sym).replace(/\.0m$/, 'm')}, from month ${Math.round((cs.drawdownYears + 0.5) * 12)} to year ${fmt.yrs(mat)}`,
      nInst: String(nInst), peak: fmt.money(N / nInst, sym), peakPct: (100 / nInst).toFixed(1) + '%', ref: cv.ref, refLong: cv.refLong, swapName: cv.swapName,
      recovery: Math.round(cs.recovery * 100) + '%',
      fixing: cs.fixing6mPct === null ? 'none' : cs.fixing6mPct.toFixed(3) + '%',
      freq: m === 2 ? 'semi-annual' : 'annual', belowSwaps: String(below),
      longYear: String(yr), balLongYear: fmt.amount(N * balAt(yr), sym).replace(/ (\d+)m$/, ' $1m'),
      lastQuote: String(Math.max(...Object.keys(cs.zspreadBp).map(Number))),
      borrower: cs.borrowerType === 'corporate' ? 'company' : 'sovereign',
      gapBp: (() => { let g = 0; const W = R.dfg; Object.keys(cs.zspreadBp).forEach(k => { if (k in cs.ytmPct) g = Math.max(g, Math.abs(bridge(W, cs.zspreadBp[k] / 1e4, +k, m) - cs.ytmPct[k] / 100) * 1e4); }); return g.toFixed(2) + 'bp'; })(),
      swapPeak: (() => { const sw = fill(R.inputs.s).out; let k = 0; for (let i = 1; i < 30; i++) if (sw[i] > sw[k]) k = i; return String(k + 1); })(),
      swapTail: (() => { const sw = fill(R.inputs.s).out, a = sw[Math.min(29, Math.max(0, Math.round(WAL) - 1))], b = sw[Math.min(29, Math.ceil(mat) - 1)]; return b < a ? 'lower' : 'higher'; })(),
      yrsShort: t => fmt.yrs(t) + '-year',
      maxMove: (() => { const b = sc.base; let mv = 0; ['swap30', 'rec20', 'rec60'].forEach(n => ['float', 'fixed'].forEach(k => { mv = Math.max(mv, Math.abs(sc[n][k] - b[k])); })); return mv.toFixed(1) + 'bp'; })(),
      strategy: cs.borrowerType === 'corporate' ? 'funding plan' : 'debt management strategy',
    };
    function loan(r, isF) {
      const unit = v => isF ? fmt.bp(v * 1e4, 1) : fmt.pct(v);
      let minV = 0, minT = 0, be = null;
      for (const [t, v] of r.run) { if (v < minV) { minV = v; minT = t; } }
      if (minV < 0) { for (const [t, v] of r.run) if (t > minT && v >= 0) { be = t; break; } } else be = 0;
      const ycQ = isF ? cs.zspreadBp[yr] / 1e4 : cs.ytmPct[yr] / 100, ycC = yearCost(r, yr);
      const wb = r.wedge * 1e4, key = isF ? 'float' : 'fixed';
      let dear = 0; for (const e of r.per) if (e.O > 0 && e.k > r.charged) dear += e.O * 0.5;
      return {
        wedge: fmt.bp(wb), wedgeP: fmt.sbp(wb), wedgeN: wb.toFixed(2), wedgeS: (wb < 0 ? MINUS : '+') + Math.abs(wb).toFixed(2), pv: fmt.money(r.pv * N, sym), nominal: fmt.money(r.wedge * N * WAL, sym),
        perYear: sym + ' ' + (Math.abs(r.wedge * N * WAL / mat) / 1e6).toFixed(2) + 'm',
        fee: Math.round(wb * r.B) + 'bp', annuity: r.B.toFixed(2),
        breakEven: be === null ? 'never' : fmt.yrs(be), minPV: fmt.money(minV * N, sym), minYear: fmt.yrs(minT),
        lossPV: fmt.money(r.pvBefore * N, sym), gainPV: fmt.smoney(r.pvAfter * N, sym),
        lossBp: fmt.sbp(r.pvBefore / r.B * 1e4), gainBp: fmt.sbp(r.pvAfter / r.B * 1e4),
        quote: isF ? fmt.bp(r.quote * 1e4, 1) : fmt.pct(r.quote), charged: unit(r.charged), fair: unit(r.fair),
        charged2: isF ? fmt.bp(r.charged * 1e4) : fmt.pct(r.charged), fair2: isF ? fmt.bp(r.fair * 1e4) : fmt.pct(r.fair),
        bullet: unit(r.bullet), timing: fmt.sbp(r.timing * 1e4), convention: fmt.sbp(r.convention * 1e4),
        rfEffect: fmt.sbp((r.wf - r.rfPar) * 1e4), creditEffect: fmt.sbp(wb - (r.wf - r.rfPar) * 1e4), rfNeg: r.wf < r.rfPar,
        // the average-life price (the curve read at the WAL, before any agreed margin X) and X itself
        avgLife: unit(r.shortcut), xBp: (r.charged - r.shortcut) * 1e4, xEffect: fmt.sbp(-(r.charged - r.shortcut) * 1e4),
        // fixed loan, split by component: risk-free (interest-rate) part and credit part of each price
        rfFair: fmt.pct(r.wf), rfPaid: fmt.pct(r.rfPar), crFair: fmt.bp((r.fair - r.wf) * 1e4), crPaid: fmt.bp((r.charged - r.rfPar) * 1e4),
        creditPremium: fmt.bp((r.shortcut - r.rfPar) * 1e4),
        ...(() => { // the timing effect split into its credit and risk-free shares: fair price against reference bullet, part by part
          const upto = n => { let a = 0, b = 0; for (let i = 0; i < n; i++) { const e = r.per[i]; a += e.DF * e.S * e.f; b += e.DF * e.S; } return a / b; };
          const n0 = Math.max(1, Math.min(59, Math.floor(2 * r.WAL))), bRF = upto(n0) + (2 * r.WAL - n0) * (upto(n0 + 1) - upto(n0));
          const cr = (r.fair - r.wf) - (r.bullet - bRF);
          return { creditTiming: fmt.sbp(cr * 1e4), rfTiming: fmt.sbp((r.timing - cr) * 1e4) }; })(),
        fairAnnual: isF ? '' : fmt.pct(Math.pow(1 + r.fair / 2, 2) - 1),
        yearQuote: isF ? fmt.bp(ycQ * 1e4, 0) : fmt.pct(ycQ, 3), yearCost: isF ? fmt.bp(ycC * 1e4, 0) : fmt.pct(ycC, 2),
        yearQuoteSA: isF ? '' : fmt.pct(m === 2 ? ycQ : 2 * (Math.pow(1 + ycQ / m, m / 2) - 1), 2),
        yearRatio: (ycC / ycQ).toFixed(1),
        sc_base: fmt.bp(sc.base[key]), sc_swap30: fmt.bp(sc.swap30[key]), sc_rec20: fmt.bp(sc.rec20[key]), sc_rec60: fmt.bp(sc.rec60[key]),
        sc_inv: fmt.bp(sc.inv[key]), sc_flat: fmt.bp(sc.flat[key]), sc_half: fmt.bp(sc.half[key]), sc_double: fmt.bp(sc.double[key]),
        dearShare: Math.round(dear / r.WAL * 100) + '%',
        ...(() => { const st = strip(r, cs), lo = st[0], hi = st[st.length - 1], u = v => isF ? fmt.bp(v * 1e4, 0) : fmt.pct(v, 2);
          const below = st.filter(m => m.p <= r.charged), above = st.filter(m => m.p > r.charged);
          return { miniN: String(st.length), miniShortT: fmt.yrs(lo.T), miniShortP: u(lo.p), miniLongT: fmt.yrs(hi.T), miniLongP: u(hi.p),
            miniBelow: String(below.length), miniAbove: String(above.length), miniBelowV: fmt.money(below.reduce((a, m) => a + m.value, 0), sym),
            miniAboveV: fmt.smoney(above.reduce((a, m) => a + m.value, 0), sym), miniSwitch: above.length ? fmt.yrs(above[0].T) : '–',
            miniWeight: (hi.A / lo.A).toFixed(1) }; })(),
        positive: wb > 0,
      };
    }
    return { R, sc, common, float: loan(f, true), fixed: loan(x, false), cs };
  }

  /* ---------------- binding ---------------- */
  // data-v="key" (mode-free or current mode) or data-v="float.key" / data-v="fixed.key".
  function bind(F, mode, root) {
    (root || document).querySelectorAll('[data-v]').forEach(el => {
      const k = el.dataset.v; let v;
      if (k.indexOf('.') > 0) { const [md, kk] = k.split('.'); v = F[md] && F[md][kk]; }
      else v = (k in F.common) ? F.common[k] : (mode && F[mode] ? F[mode][k] : undefined);
      if (v !== undefined) el.innerHTML = v;
    });
    (root || document).querySelectorAll('[data-mode]').forEach(el => { el.hidden = !!mode && el.dataset.mode !== mode; });
  }
  function ribbon(F, opts) {
    const host = document.querySelector('[data-ribbon]'); if (!host) return;
    const notes = [];
    if (!F.float.positive || !F.fixed.positive) notes.push('<b>Check before use:</b> on this curve average-life pricing does not favour the borrower for at least one loan type; the narrative of this template does not apply as written.');
    host.innerHTML = notes.map(n => `<p>${n}</p>`).join(''); host.hidden = notes.length === 0;
    document.querySelectorAll('[data-illus]').forEach(el => { el.hidden = !F.cs.illustrative; });
  }

  /* ---------------- charts ---------------- */
  function chart(el, o) {
    const W = o.w || 760, H = o.h || 300, m = Object.assign({ l: 58, r: 20, t: 18, b: 42 }, o.m || {});
    const X = v => m.l + (v - o.x.min) / (o.x.max - o.x.min) * (W - m.l - m.r), Y = v => H - m.b - (v - o.y.min) / (o.y.max - o.y.min) * (H - m.t - m.b);
    let s = `<svg class="ch" viewBox="0 0 ${W} ${H}" role="img" aria-label="${o.label}">`;
    for (const t of o.y.ticks) s += `<line class="grid" x1="${m.l}" x2="${W - m.r}" y1="${Y(t)}" y2="${Y(t)}"/><text class="tk" x="${m.l - 8}" y="${Y(t) + 4}" text-anchor="end">${o.y.fmt(t)}</text>`;
    for (const t of o.x.ticks) s += `<text class="tk" x="${X(t)}" y="${H - m.b + 17}" text-anchor="middle">${o.x.fmt ? o.x.fmt(t) : t}</text>`;
    if (o.x.label) s += `<text class="al" x="${(m.l + W - m.r) / 2}" y="${H - 6}" text-anchor="middle">${o.x.label}</text>`;
    for (const L of o.layers) {
      if (L.t === 'bars') for (const b of L.d) { const a = Math.min(b.y0, b.y1), c = Math.max(b.y0, b.y1); s += `<rect x="${X(b.x0) + .5}" y="${Y(c)}" width="${Math.max(.5, X(b.x1) - X(b.x0) - 1)}" height="${Math.max(.5, Y(a) - Y(c))}" style="fill:${b.f};opacity:${b.o ?? 1}"/>`; }
      else if (L.t === 'rect') s += `<rect x="${X(L.x0)}" y="${Y(L.y1)}" width="${X(L.x1) - X(L.x0)}" height="${Y(L.y0) - Y(L.y1)}" style="fill:${L.f};opacity:${L.o ?? 1}"/>`;
      else if (L.t === 'area') s += `<polygon points="${[[L.p[0][0], L.base]].concat(L.p, [[L.p[L.p.length - 1][0], L.base]]).map(([a, b]) => X(a) + ',' + Y(b)).join(' ')}" style="fill:${L.f};opacity:${L.o ?? .15}"/>`;
      else if (L.t === 'line') s += `<polyline points="${L.p.map(([a, b]) => X(a) + ',' + Y(b)).join(' ')}" style="fill:none;stroke:${L.c};stroke-width:${L.w || 2};${L.dash ? 'stroke-dasharray:' + L.dash : ''}" stroke-linejoin="round"/>`;
      else if (L.t === 'dots') for (const [a, b, h] of L.p) s += `<circle cx="${X(a)}" cy="${Y(b)}" r="${L.r || 3.5}" style="fill:${h ? 'var(--panel)' : L.c};stroke:${L.c};stroke-width:1.6"/>`;
      else if (L.t === 'h') s += `<line x1="${m.l}" x2="${W - m.r}" y1="${Y(L.y)}" y2="${Y(L.y)}" style="stroke:${L.c};stroke-width:${L.w || 1.8};${L.dash ? 'stroke-dasharray:' + L.dash : ''}"/>` + (L.lab ? `<text class="lb" x="${m.l + 6}" y="${Y(L.y) + (L.dy || -7)}" style="fill:${L.c}">${L.lab}</text>` : '');
      else if (L.t === 'v') s += `<line x1="${X(L.x)}" x2="${X(L.x)}" y1="${m.t}" y2="${H - m.b}" style="stroke:${L.c};stroke-width:1.5;stroke-dasharray:4 4"/>` + (L.lab ? `<text class="lb" x="${X(L.x) + (L.end ? -6 : 6)}" y="${m.t + 12 + (L.dy || 0)}" text-anchor="${L.end ? 'end' : 'start'}" style="fill:${L.c}">${L.lab}</text>` : '');
      else if (L.t === 'txt') s += `<text class="lb" x="${X(L.x)}" y="${Y(L.y) + (L.dy || 0)}" text-anchor="${L.anchor || 'middle'}" style="fill:${L.c}">${L.s}</text>`;
      else if (L.t === 'seg') s += `<line x1="${X(L.x0)}" x2="${X(L.x1)}" y1="${Y(L.y)}" y2="${Y(L.y)}" style="stroke:${L.c};stroke-width:1.2;stroke-dasharray:3 3"/>`;
    }
    el.innerHTML = s + '</svg>';
  }
  const ticks = (a, b, st) => { const r = []; for (let v = Math.ceil(a / st - 1e-9) * st; v <= b + 1e-9; v += st) r.push(+v.toFixed(10)); return r; };
  const C = { acc: 'var(--accent)', brass: 'var(--brass)', slate: 'var(--slate)', ink: 'var(--ink)', muted: 'var(--muted)', gain: 'var(--gain)' };
  const niceStep = span => { const mg = Math.pow(10, Math.floor(Math.log10(span))); const r = span / mg; return (r > 5 ? 2 : r > 2 ? 1 : 0.5) * mg; };

  // Cornerstone exhibit: the loan as mini-bonds (top), and each mini-bond's own price against the single price charged (bottom).
  function drawStrip(el, F, mode, opt) {
    const cp = !!(opt && opt.compact);
    const r = F.R[mode], cs = F.cs, isF = mode === 'float', sc = isF ? 1e4 : 100, st = strip(r, cs), n = st.length, mat = r.maturity;
    const W = 760, l = 58, rr = 16, top = 30, rowH = Math.max(2.4, Math.min(cp ? 3.4 : 5.2, (cp ? 160 : 240) / n)), H1 = n * rowH, gap = 40, H2 = cp ? 120 : 170, bot = 40, H = top + H1 + gap + H2 + bot;
    const X = v => l + v / (mat + 0.5) * (W - l - rr);
    const ch = r.charged * sc, ps = st.map(m => m.p * sc), stp = isF ? 20 : 0.25;
    const lo = Math.floor((Math.min(ch, ...ps) - stp / 2) / stp) * stp, hi = Math.ceil((Math.max(ch, ...ps) + stp / 4) / stp) * stp;
    const y2 = v => top + H1 + gap + H2 - (v - lo) / (hi - lo) * H2, fmtv = v => (isF ? Math.round(v) + 'bp' : v.toFixed(2) + '%').replace('-', '−');
    const Amax = Math.max(...st.map(m => m.A)), col = m => m.p > r.charged ? 'var(--accent)' : 'var(--slate)';
    let s = `<svg class="ch" viewBox="0 0 ${W} ${H}" role="img" aria-label="The loan as ${n} mini-bonds and the price of each on your curve">`;
    s += `<text class="pt" x="${l}" y="16">THE LOAN AS ${n} MINI-BONDS OF ${F.common.peak.toUpperCase()}, EACH REPAID ON ITS OWN DATE</text>`;
    st.forEach((m, k) => { const y = top + k * rowH; s += `<rect x="${X(0)}" y="${y + .5}" width="${X(m.T) - X(0)}" height="${rowH - 1}" style="fill:${col(m)};opacity:${m.p > r.charged ? .88 : .5}"/>`; });
    const yT = top + H1 + gap - 14;
    s += `<text class="pt" x="${l}" y="${yT}">EACH MINI-BOND'S OWN PRICE ON YOUR CURVE, AGAINST THE ONE PRICE THE LOAN CHARGES</text>`;
    for (let v = lo; v <= hi + 1e-9; v += stp) { const y = y2(v); s += `<line class="grid" x1="${l}" x2="${W - rr}" y1="${y}" y2="${y}"/><text class="tk" x="${l - 8}" y="${y + 4}" text-anchor="end">${fmtv(v)}</text>`; }
    st.forEach(m => { s += `<line x1="${X(m.T)}" x2="${X(m.T)}" y1="${y2(ch)}" y2="${y2(m.p * sc)}" style="stroke:${col(m)};stroke-width:2;opacity:.45"/>`; });
    s += `<line x1="${l}" x2="${W - rr}" y1="${y2(ch)}" y2="${y2(ch)}" style="stroke:var(--ink);stroke-width:2"/>`;
    st.forEach(m => { s += `<circle cx="${X(m.T)}" cy="${y2(m.p * sc)}" r="${(1.6 + 4.2 * Math.sqrt(m.A / Amax)).toFixed(2)}" style="fill:${col(m)};stroke:var(--panel);stroke-width:1"/>`; });
    s += `<text class="lb" x="${X(0.3)}" y="${y2(ch) - 8}" style="fill:var(--ink)">Price charged on every mini-bond: ${F[mode].charged}</text>`;
    const f = st[0], g = st[n - 1];
    s += `<text class="lb" x="${X(f.T) - 4}" y="${Math.min(y2(f.p * sc) + 20, top + H1 + gap + H2 + 2)}" style="fill:var(--slate)">${F.common.yrsShort(f.T)} mini-bond: ${fmtv(f.p * sc)}</text>`;
    s += `<text class="lb" x="${X(g.T) + 4}" y="${y2(g.p * sc) - 12}" text-anchor="end" style="fill:var(--accent)">${F.common.yrsShort(g.T)} mini-bond: ${fmtv(g.p * sc)}</text>`;
    const xw = X(r.WAL); s += `<line x1="${xw}" x2="${xw}" y1="${top - 4}" y2="${top + H1 + gap + H2}" style="stroke:var(--ink);stroke-width:1.4;stroke-dasharray:4 4"/>`;
    s += `<text class="lb" x="${xw + 6}" y="${top + 12}" style="fill:var(--ink)">Average life ${F.common.wal}y: where the one price is read</text>`;
    for (let t = 0; t <= mat + 1e-9; t += mat > 16 ? 2 : 1) s += `<text class="tk" x="${X(t)}" y="${H - bot + 17}" text-anchor="middle">${t}y</text>`;
    s += `<text class="al" x="${(l + W - rr) / 2}" y="${H - 6}" text-anchor="middle">Years from signing · repayment date of each mini-bond · dot size = how much each mini-bond counts</text>`;
    el.innerHTML = s + '</svg>';
  }
  // Signature exhibit: the balance in each period, coloured by whether your curve prices that period above or below the price paid.
  function drawSignature(el, F, mode, opt) {
    const r = F.R[mode], N = F.cs.amount / 1e6, mat = r.maturity, st = niceStep(N / 1.25);
    chart(el, { label: 'Loan balance by period, coloured by what your curve charges for it', w: opt && opt.w, h: (opt && opt.h) || 230, m: Object.assign({ l: 58, r: 14, t: 22, b: 38 }, opt && opt.m),
      x: { min: 0, max: mat + 0.5, ticks: ticks(0, mat, mat > 16 ? 2 : 1), fmt: v => v + 'y', label: 'Years from signing' },
      y: { min: 0, max: N * 1.14, ticks: ticks(0, N, st), fmt: v => F.common.glyph + (v >= 1000 ? (v / 1000) + 'bn' : v + 'm') },
      layers: [{ t: 'bars', d: r.per.filter(e => e.O > 0).map(e => ({ x0: e.t - .5, x1: e.t, y0: 0, y1: e.O * N, f: e.k > r.charged ? C.acc : C.slate, o: e.k > r.charged ? .9 : .55 })) },
        { t: 'v', x: r.WAL, c: C.ink, lab: 'Average life ' + F.common.wal + 'y: where the price is read' }] });
  }
  // Exhibit: loan balance against a bullet bond with the same average life.
  function drawProfile(el, F, opt) {
    const f = F.R.float, N = F.cs.amount / 1e6, mat = f.maturity, WAL = f.WAL, top = N * 1.12, st = niceStep(N / 1.25);
    chart(el, { label: 'Loan balance against a bond with the same average life', w: opt && opt.w, h: opt && opt.h, m: opt && opt.m, x: { min: 0, max: mat + 0.5, ticks: ticks(0, mat, mat > 16 ? 2 : 1), fmt: v => v + 'y', label: 'Years from signing' },
      y: { min: 0, max: top, ticks: ticks(0, N, st), fmt: v => F.common.glyph + (v >= 1000 ? (v / 1000) + 'bn' : v + 'm') },
      layers: [{ t: 'rect', x0: 0, x1: WAL, y0: 0, y1: N, f: C.brass, o: .16 }, { t: 'line', p: [[0, N], [WAL, N], [WAL, 0]], c: C.brass, w: 1.5 },
        { t: 'bars', d: f.per.filter(e => e.O > 0).map(e => ({ x0: e.t - .5, x1: e.t, y0: 0, y1: e.O * N, f: C.acc, o: .8 })) },
        { t: 'v', x: WAL, c: C.ink, lab: (opt && opt.short ? 'Average life ' : 'Average life ') + F.common.wal + (opt && opt.short ? 'y' : ' years') }] });
  }
  // Exhibit: the borrower's curve and the reading at the average life.
  function drawCurve(el, F, mode) {
    const r = F.R[mode], isF = mode === 'float', raw = isF ? F.R.inputs.z : F.R.inputs.y, sc = isF ? 1e4 : 100;
    const q = r.qfill.map(v => v * sc), L = Math.max(r.last, Math.ceil(r.maturity)), WAL = r.WAL;
    const vals = q.slice(0, L).concat([r.quote * sc]); let layers = [];
    if (!isF) { const sw = fill(F.R.inputs.s).out.map(v => v * 100).slice(0, L); vals.push(...sw); layers.push({ t: 'line', p: sw.map((v, i) => [i + 1, v]), c: C.muted, w: 1.6, dash: '5 4' }); }
    const st = isF ? 20 : 0.25, lo = Math.floor(Math.min(...vals) / st) * st - (isF ? 10 : 0), hi = Math.ceil(Math.max(...vals) / st) * st;
    if (isF) layers.push({ t: 'h', y: 0, c: C.muted, w: 1 });
    layers.push({ t: 'line', p: q.slice(0, L).map((v, i) => [i + 1, v]), c: C.acc, w: 2.4 }, { t: 'dots', c: C.acc, p: q.slice(0, L).map((v, i) => [i + 1, v, raw[i] === null]) },
      { t: 'seg', x0: 0, x1: WAL, y: r.quote * sc, c: C.brass }, { t: 'v', x: WAL, c: C.brass, lab: F.common.wal + ' years: ' + F[mode].quote, end: true });
    chart(el, { label: isF ? 'Z-spread curve' : 'Bond yield curve', x: { min: 0, max: L + 0.5, ticks: ticks(0, L, L > 16 ? 4 : 2), fmt: v => v + 'y', label: 'Maturity (years)' },
      y: { min: lo, max: hi, ticks: ticks(lo, hi, st), fmt: v => isF ? v + 'bp' : v.toFixed(2) + '%' }, layers });
  }
  // Exhibit: what the curve implies for each six-month period, against the price charged.
  function drawCost(el, F, mode) {
    const r = F.R[mode], isF = mode === 'float', sc = isF ? 1e4 : 100, ch = r.charged * sc, per = r.per.filter(e => e.O > 0);
    const v = per.map(e => e.k * sc).concat([ch]); const st = isF ? 40 : 0.25;
    const lo = Math.floor(Math.min(...v) / st) * st, hi = Math.ceil((Math.max(...v) + 0.6 * st) / st) * st, mat = r.maturity; // headroom for the 'Average life' label
    chart(el, { label: 'Implied cost per period against the price paid', x: { min: 0, max: mat + 0.5, ticks: ticks(0, mat, mat > 16 ? 2 : 1), fmt: v => v + 'y', label: 'Years from signing' },
      y: { min: lo, max: hi, ticks: ticks(lo, hi, st), fmt: v => isF ? v + 'bp' : v.toFixed(2) + '%' },
      layers: [{ t: 'bars', d: per.map(e => ({ x0: e.t - .5, x1: e.t, y0: ch, y1: e.k * sc, f: e.k * sc >= ch ? C.acc : C.slate, o: .75 })) },
        { t: 'h', y: ch, c: C.ink, w: 2, lab: 'Price you pay: ' + F[mode].charged, dy: -8 }, { t: 'v', x: r.WAL, c: C.ink, lab: 'Average life' }] });
  }
  // Exhibit: running present value of the benefit, period by period.
  function drawRunning(el, F, mode) {
    const r = F.R[mode], N = F.cs.amount, sym = F.common.sym, mat = r.maturity;
    const p = r.run.filter(([t]) => t <= mat + 1e-9).map(([t, v]) => [t, v * N / 1e6]); const vs = p.map(q => q[1]);
    const st = niceStep(Math.max(...vs) - Math.min(...vs)); const lo = Math.floor((Math.min(0, ...vs) - st / 3) / st) * st, hi = Math.ceil((Math.max(0, ...vs) + st / 3) / st) * st;
    const be = F[mode].breakEven, layers = [{ t: 'area', p, base: 0, f: C.acc, o: .12 }, { t: 'h', y: 0, c: C.muted, w: 1 }, { t: 'line', p, c: C.acc, w: 2.4 },
      { t: 'v', x: r.WAL, c: C.ink, lab: 'Average life' }];
    // break-even label below the zero line, right of the marker: the curve is above zero there, so the space is free
    if (be !== 'never' && +be > 0) layers.push({ t: 'v', x: +be, c: C.gain }, { t: 'txt', x: +be + 0.35, y: lo / 2, s: 'Break-even, year ' + be, c: C.gain, anchor: 'start' });
    layers.push({ t: 'dots', c: C.acc, r: 4, p: [[+F[mode].minYear, Math.min(...vs), false], [p[p.length - 1][0], vs[vs.length - 1], false]] });
    chart(el, { label: 'Running present value of the benefit', x: { min: 0, max: mat + 0.5, ticks: ticks(0, mat, mat > 16 ? 2 : 1), fmt: v => v + 'y', label: 'Years from signing' },
      y: { min: lo, max: hi, ticks: ticks(lo, hi, st), fmt: v => (v < 0 ? '−' : '') + F.common.glyph + Math.abs(v) + 'm' }, layers });
  }
  // Exhibit: present value before and after the average life, and the net.
  function drawWaterfall(el, F, mode) {
    const r = F.R[mode], N = F.cs.amount, a = r.pvBefore * N / 1e6, b = r.pvAfter * N / 1e6, n = a + b, sym = F.common.sym;
    const st = niceStep(Math.abs(a) + Math.abs(b)); const lo = Math.floor((Math.min(0, a) - st / 2) / st) * st, hi = Math.ceil((Math.max(0, a + b, b) + st / 2) / st) * st;
    const lab = ['Signing to year ' + F.common.wal, 'Year ' + F.common.wal + ' to ' + F.common.maturity, 'Net benefit'];
    chart(el, { label: 'Benefit before and after the average life', h: 300, m: { l: 74, b: 34 }, x: { min: 0, max: 3, ticks: [.5, 1.5, 2.5], fmt: v => lab[Math.floor(v)] },
      y: { min: lo, max: hi, ticks: ticks(lo, hi, st), fmt: v => (v < 0 ? '−' : '') + F.common.glyph + Math.abs(v) + 'm' },
      layers: [{ t: 'h', y: 0, c: C.muted, w: 1 },
        { t: 'bars', d: [{ x0: .15, x1: .85, y0: 0, y1: a, f: C.slate, o: .85 }, { x0: 1.15, x1: 1.85, y0: a, y1: a + b, f: C.acc, o: .85 }, { x0: 2.15, x1: 2.85, y0: 0, y1: n, f: C.ink, o: .85 }] },
        { t: 'seg', x0: .85, x1: 1.15, y: a, c: C.muted }, { t: 'seg', x0: 1.85, x1: 2.15, y: a + b, c: C.muted },
        { t: 'txt', x: .5, y: a, dy: 18, s: fmt.money(a * 1e6, sym), c: C.slate }, { t: 'txt', x: 1.5, y: a + b, dy: -8, s: fmt.smoney(b * 1e6, sym), c: C.acc }, { t: 'txt', x: 2.5, y: n, dy: n >= 0 ? -8 : 18, s: fmt.money(n * 1e6, sym), c: C.ink }] });
  }

  window.WW = { fill, swapDfs, bridge, schedule, model, conventions, runCase, scenarios, reshape, profiles, strip, figures, bind, ribbon, fmt,
                chart, ticks, drawStrip, drawSignature, drawProfile, drawCurve, drawCost, drawRunning, drawWaterfall };
})();
