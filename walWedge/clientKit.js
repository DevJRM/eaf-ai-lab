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
  // tailYears: beyond the last quote, λ = the average of the last tailYears quoted years, held flat; or an array of
  // λ by year (index 0 = year 1) whose entries beyond the last quote are used as they are (the 'blend' rule).
  // asEntered: the curve as entered, for the average-life reading and the last real quote, when `curve`
  // has been smoothed or extended (runCase); the bond-equivalent price uses `curve`.
  function model(curve, kind, dfg, R, x, y, Xbp, m, prof, tailYears = 5, asEntered) {
    const F = fill(curve); const last = F.last;
    const q = kind === 'float' ? F.out.map((v, i) => bridge(dfg, v, i + 1, m)) : F.out.slice();
    const a = 0.5; const fa = [null]; for (let i = 1; i <= 60; i++) fa.push(dfg[i - 1] / dfg[i] - 1);
    const S = [1]; const lam = []; let cumC = 0, cumAnn = 0, tail;
    for (let b = 1; b <= 30; b++) {
      let l;
      if (b <= last) {
        const c = q[b - 1], i1 = 2 * b - 1, i2 = 2 * b, Sp = S[S.length - 1];
        const K = cumC + c * cumAnn, g1 = m === 2 ? c / 2 : 0, g2 = c / m + 1, D1 = dfg[i1], D2 = dfg[i2];
        const q2 = D2 * Sp * (g2 - R), q1 = Sp * (D1 * (g1 - R) + D2 * R), q0 = K + D1 * Sp * R - 1;
        const u = (-q1 + Math.sqrt(q1 * q1 - 4 * q2 * q0)) / (2 * q2); l = -2 * Math.log(u);
      } else {   // beyond the last quote: the average λ of the last tailYears quoted years, held flat
        if (Array.isArray(tailYears)) l = tailYears[b - 1];
        else { if (tail === undefined) { const k = Math.min(tailYears, last); tail = -Math.log(S[2 * last] / S[2 * (last - k)]) / k; } l = tail; }
      }
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
    const Q = asEntered ? fill(asEntered) : F;
    const qq = Q.out, fl = Math.min(Math.max(WAL, 1), 30), lo = Math.max(1, Math.min(29, Math.floor(fl)));
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
             qfill: F.out, last: Q.last, bullet, timing: fair - bullet, convention: bullet - shortcut };
  }

  // The loan as a strip of mini-bonds: one bullet per repayment, drawn with the loan and repaid on its date.
  // Exact identity: the loan's bond-equivalent price is the weighted average of the mini-bond prices,
  // each weighted by its size (its share of the amount) times its credit-adjusted annuity A_j (how long,
  // and how safely, each unit of it is outstanding). It holds when every drawing comes before the first
  // repayment (linear and balloon profiles); `ok` is false for a custom schedule that overlaps them.
  function strip(r, cs) {
    const out = []; let drawn = 0, repaidAny = false, ok = true; const D = [];
    r.per.forEach(e => { if (e.DD > 0 && repaidAny) ok = false; drawn += e.DD; D.push(drawn); if (e.P > 0) repaidAny = true; });
    r.per.forEach((e0, n) => {
      if (!(e0.P > 0)) return;
      let A = 0, P = 0;
      for (let i = 0; i <= n; i++) { const e = r.per[i], wp = e.DF * e.S * 0.5 * D[i]; A += wp; P += wp * e.k; }
      out.push({ j: out.length + 1, T: e0.t, size: e0.P, A, p: P / A, value: (P / A - r.charged) * A * e0.P * cs.amount });
    });
    out.ok = ok;
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

  /* ---------------- tail rules and curve smoothing ----------------
     Beyond the last quote the curve is unknown; a tail rule decides how those years are priced.
     λ rules hold a default intensity flat (the average of the last 5, 3 or 1 quoted years: the ISDA
     convention of a flat hazard rate on the last quoted segment); flatZ holds the last Z-spread flat; blend gives each
     year the average of the default intensities the 5-year average, the last year and the flat Z-spread give it.
     (A Nelson–Siegel extension was tested and dropped: it missed by 15–35bp on long tails; a case saved
     with it prices with the 5-year average.) Smoothing replaces the Z-spreads up to the last quote by their
     Nelson–Siegel fit. Yields always follow the Z-spreads through the YAS bridge, so the floating and the
     fixed loan see one consistent curve. */
  const TAIL_RULES = { avg5: 5, avg3: 3, last: 1, flatZ: 5, blend: 5 };
  const NS_MIN = 5;   // Nelson–Siegel has four parameters: fewer quotes than this would only interpolate them
  // Nelson–Siegel fit of values (bp) at tenors (years): level, slope and curvature loadings, τ on a grid.
  function nsFit(tenors, values) {
    const basis = (t, tau) => { const x = t / tau, e = Math.exp(-x), g = (1 - e) / x; return [1, g, g - e]; };
    let best = null;
    for (let k = 0; k < 45; k++) {
      const tau = 1 + 11 * k / 44, X = tenors.map(t => basis(t, tau));
      const A = [0, 1, 2].map(i => [0, 1, 2].map(j => X.reduce((s, r) => s + r[i] * r[j], 0) + (i === j ? 1e-6 : 0)));
      const b = [0, 1, 2].map(i => X.reduce((s, r, n) => s + r[i] * values[n], 0));
      const beta = solve3(A, b);
      const sse = X.reduce((s, r, n) => s + Math.pow(r[0] * beta[0] + r[1] * beta[1] + r[2] * beta[2] - values[n], 2), 0);
      if (!best || sse < best.sse) best = { sse, tau, beta };
    }
    return t => { const r = basis(t, best.tau); return r[0] * best.beta[0] + r[1] * best.beta[1] + r[2] * best.beta[2]; };
  }
  function solve3(A, b) {   // Cramer's rule on a symmetric positive-definite 3×3 system
    const det = M => M[0][0] * (M[1][1] * M[2][2] - M[1][2] * M[2][1]) - M[0][1] * (M[1][0] * M[2][2] - M[1][2] * M[2][0]) + M[0][2] * (M[1][0] * M[2][1] - M[1][1] * M[2][0]);
    const d = det(A); return [0, 1, 2].map(c => det(A.map((row, i) => row.map((v, j) => j === c ? b[i] : v))) / d);
  }
  const quoted = a => a.reduce((o, v, i) => { if (v !== null) o.push(i + 1); return o; }, []);
  // The curves the model prices: smoothed and extended as chosen. z, y: decimals, null where not quoted.
  // pts: the points a Nelson–Siegel fit uses, [[years, bp]]: individual bonds at their own maturities (WW.effective);
  // without them, the whole-year Z-spread quotes.
  function prepare(z, y, dfg, m, rule, smooth, pts) {
    const zt = quoted(z), nZ = zt.length, zL = nZ ? zt[nZ - 1] : 0, yL = fill(y).last;
    if (!nZ) return { z, y, rule: TAIL_RULES[rule] ? rule : 'avg5' };
    const zf = fill(z).out, b = (v, t) => bridge(dfg, v, t, m);
    let zs = z.slice(), ys = y.slice();
    const P = pts && pts.length ? pts : zt.map(t => [t, z[t - 1] * 1e4]);
    const fit = P.length >= NS_MIN && smooth === 'ns' ? nsFit(P.map(p => p[0]), P.map(p => p[1])) : null;
    if (smooth === 'ns' && fit) {
      // only between the first and the last quote: before the first, the fit is an extrapolation (it can dive at
      // short maturities), so those years keep the first smoothed value, as unsmoothed quotes keep the first quote
      for (let t = zt[0]; t <= zL; t++) zs[t - 1] = fit(t) / 1e4;
      const yf = fill(y).out;   // yields follow the Z-spreads tenor by tenor, keeping each tenor's Z/YTM relation
      for (let t = zt[0]; t <= Math.min(yL, zL); t++) if (yf[t - 1] !== undefined) ys[t - 1] = yf[t - 1] + b(zs[t - 1], t) - b(zf[t - 1], t);
    }
    const used = TAIL_RULES[rule] ? rule : 'avg5';
    if (used === 'flatZ') {
      for (let t = zL + 1; t <= 30; t++) zs[t - 1] = zs[zL - 1];
      const zx = fill(zs).out, yx = fill(ys).out;
      if (yL) for (let t = yL + 1; t <= 30; t++) ys[t - 1] = yx[yL - 1] + b(zx[t - 1], t) - b(zx[yL - 1], yL);
    }
    return { z: zs, y: ys, rule: used };
  }

  function runCase(cs) {
    const cv = conventions(cs), m = cs.couponFreq;
    const s = arr(cs.swapPct, 100), z = arr(cs.zspreadBp, 1e4), y = arr(cs.ytmPct, 100);
    const r6 = cs.fixing6mPct === null || cs.fixing6mPct === undefined ? null : cs.fixing6mPct / 100;
    const dfg = swapDfs(s, cv.alpha, r6, cv.basis);
    const rule = TAIL_RULES[cs.tailRule] ? cs.tailRule : 'avg5', smooth = cs.smooth || 'off', plain = rule in { avg5: 1, avg3: 1, last: 1 } && smooth !== 'ns';
    const pts = cs.nsPts && cs.nsPts.length ? cs.nsPts : null;
    const P = plain ? { z, y, rule } : prepare(z, y, dfg, m, rule, smooth, pts);
    const run = (kind, c, tailYears, asEntered) => model(c, kind, dfg, cs.recovery, cs.drawdownYears, cs.repaymentYears, kind === 'float' ? cs.marginFloatBp : cs.marginFixedBp, m, cs.profile, tailYears, asEntered);
    // blend: λ beyond the last quote, year by year, the average of the 5-year average, last-year and flat Z-spread rules
    const blendLam = (kind, c, cz) => { const a = run(kind, c, 5).lam, b = run(kind, c, 1).lam, f = run(kind, cz, 5).lam; return a.map((v, i) => (v + b[i] + f[i]) / 3); };
    const Pf = P.rule === 'blend' ? prepare(z, y, dfg, m, 'flatZ', smooth, pts) : null, ty = TAIL_RULES[P.rule] || 5;
    return {
      float: run('float', P.z, Pf ? blendLam('float', P.z, Pf.z) : ty, plain ? undefined : z),
      fixed: run('fixed', P.y, Pf ? blendLam('fixed', P.y, Pf.y) : ty, plain ? undefined : y),
      dfg, cv, inputs: { s, z, y }, tailRule: P.rule, smooth: smooth === 'ns' && (pts ? pts.length : quoted(z).length) >= NS_MIN ? 'ns' : 'off'
    };
  }

  /* ---------------- inputs pipeline: individual bonds and derived quotes ----------------
     The engine prices one quote per whole year, read as a par bond's. WW.effective(cs) turns what was entered into
     that. Individual bonds (maturity, coupon, Z-spread and/or yield) are moved to the par bond of the same maturity
     (the coupon effect, measured on a smooth spread-by-date curve fitted to the bonds), then interpolated to whole
     years. With quoteBasis 'z' or 'y' one quote type is derived from the other through the YAS bridge, so floating
     and fixed price one credit curve. A fitted curve entered with both quote types is returned unchanged. */
  const numv = v => { if (v === null || v === undefined || v === '') return null; const x = typeof v === 'number' ? v : +String(v).trim().replace(',', '.').replace(/%$/, ''); return Number.isFinite(x) ? x : null; };
  const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'], YEAR_MS = 365.25 * 864e5;
  const SLASH = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2}|\d{4})$/;
  const ymd = (y, mo, d) => { const t = Date.UTC(y, mo, d), D = new Date(t); return mo >= 0 && mo <= 11 && D.getUTCDate() === d ? t : null; };
  const yy = s => s.length === 2 ? 2000 + +s : +s;
  // a date as UTC milliseconds: ISO, numeric with slashes (order 'dm' or 'md'), "15 Jun 2033", "15-Jun-33", "June 15, 2033"
  function parseDate(s, order) {
    s = String(s === null || s === undefined ? '' : s).trim(); let m;
    if ((m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/))) return ymd(+m[1], +m[2] - 1, +m[3]);
    if ((m = s.match(SLASH))) { const a = +m[1], b = +m[2]; return order === 'md' ? ymd(yy(m[3]), a - 1, b) : ymd(yy(m[3]), b - 1, a); }
    if ((m = s.match(/^(\d{1,2})[\s-]+([a-z]{3,})\.?[\s,-]+(\d{2}|\d{4})$/i))) return ymd(yy(m[3]), MONTHS.indexOf(m[2].slice(0, 3).toLowerCase()), +m[1]);
    if ((m = s.match(/^([a-z]{3,})\.?\s+(\d{1,2}),?\s+(\d{4})$/i))) return ymd(+m[3], MONTHS.indexOf(m[1].slice(0, 3).toLowerCase()), +m[2]);
    return null;
  }
  // the order of slash dates, read from all of them: a first field above 12 is a day, a second field above 12 too
  function dateOrder(list) {
    let dm = false, md = false, any = false;
    list.forEach(s => { const m = String(s === null || s === undefined ? '' : s).trim().match(SLASH); if (!m) return; any = true; if (+m[1] > 12) dm = true; if (+m[2] > 12) md = true; });
    return { order: md && !dm ? 'md' : 'dm', note: !any ? '' : dm && md ? 'mixed' : !dm && !md ? 'ambiguous' : '' };
  }
  // years from the market-data date to a maturity entered as decimal years or as a date (ACT/365.25)
  function yearsTo(mat, asOf, order) {
    if (typeof mat === 'number') return Number.isFinite(mat) ? { t: mat } : { err: 'maturity' };
    const s = String(mat === null || mat === undefined ? '' : mat).trim();
    if (/^\d+([.,]\d+)?$/.test(s)) { const v = +s.replace(',', '.'); return v < 100 ? { t: v } : { err: 'maturity' }; }
    const d = parseDate(s, order); if (d === null) return { err: 'maturity' };
    const a = parseDate(asOf, 'dm') ?? parseDate(asOf, 'md'); if (a === null) return { err: 'asOf' };
    return { t: (d - a) / YEAR_MS, date: true };
  }
  // swap discount factor at any time (years): log-linear between the half-year points of dfg
  const LOGD = new WeakMap();   // per discount curve: its logs (curves are never changed once built)
  function dfAt(dfg, t) {
    if (t <= 0) return 1; let L = LOGD.get(dfg); if (!L) { L = dfg.map(Math.log); LOGD.set(dfg, L); }
    const x = 2 * t, i = Math.min(59, Math.floor(x)), f = x - i;
    return Math.exp(L[i] * (1 - f) + L[i + 1] * f);
  }
  // a bond's payment dates, counted back from maturity, each with its swap term A = DF^(−1/(m·t)) (YAS bridge compounding)
  const BDC = new WeakMap();   // per discount curve: payment dates by maturity and frequency
  function bondDates(T, m, dfg) {
    let M = BDC.get(dfg); if (!M) { M = new Map(); BDC.set(dfg, M); } const key = T + '|' + m; let o = M.get(key); if (o) return o;
    o = []; for (let k = 0; T - k / m > 1e-9; k++) { const t = T - k / m; o.push([t, Math.pow(dfAt(dfg, t), -1 / (m * t))]); }
    if (M.size < 4000) M.set(key, o); return o;
  }
  // price and its slope: on the swap curve plus a Z-spread z (or a spread by date, a function), or at a yield
  function pvZ(bd, c, m, z) {
    let p = 0, d = 0; const fz = typeof z === 'function';
    for (let k = 0; k < bd.length; k++) { const [t, A] = bd[k], v = c / m + (k === 0 ? 1 : 0), b = A + (fz ? z(t) : z) / m, w = Math.pow(b, -m * t); p += v * w; d -= v * t * w / b; }
    return [p, d];
  }
  function pvY(bd, c, m, y) {
    let p = 0, d = 0; const b = 1 + y / m;
    for (let k = 0; k < bd.length; k++) { const t = bd[k][0], v = c / m + (k === 0 ? 1 : 0), w = Math.pow(b, -m * t); p += v * w; d -= v * t * w / b; }
    return [p, d];
  }
  // root of a decreasing price function: Newton steps kept inside a shrinking bracket
  function solveDec(f, target, lo, hi) {
    let x = 0.03;
    for (let k = 0; k < 60; k++) {
      const [v, d] = f(x), e = v - target; if (Math.abs(e) < 1e-15) return x;
      if (e > 0) lo = x; else hi = x;
      let n = d < 0 ? x - e / d : NaN; if (!(n > lo && n < hi)) n = (lo + hi) / 2;
      if (Math.abs(n - x) < 1e-16) return n; x = n;
    }
    return x;
  }
  const zOf = (bd, c, m, P) => solveDec(z => pvZ(bd, c, m, z), P, -0.2, 1);
  const yOf = (bd, c, m, P) => solveDec(y => pvY(bd, c, m, y), P, -0.2, 1);
  // Z-spread whose bridge coupon is the par yield y: the inverse of the YAS bridge (monotone in z)
  // Newton steps from yield minus the par swap rate (a few bridge evaluations); bisection if they ever stall
  // per discount curve and tenor: the swap terms DF^(−1/(m·t)) of bridge(), and the last Z-spread solved (a warm start)
  const BRC = new WeakMap();
  function bridgeTerms(dfg, T, m) {
    let M = BRC.get(dfg); if (!M) { M = new Map(); BRC.set(dfg, M); } const key = T + '|' + m; let A = M.get(key);
    if (!A) { A = { t: [], a: [], z: null }; for (let j = 1; j <= Math.round(m * T); j++) { const t = j / m; A.t.push(t); A.a.push(Math.pow(dfg[Math.round(2 * t)], -1 / (m * t))); } M.set(key, A); }
    return A;
  }
  // bridge(dfg, z, T, m) and its slope in z, in one pass
  function bridgeD(A, z, m) {
    let s = 0, ds = 0, pT = 0, dpT = 0;
    for (let j = 0; j < A.t.length; j++) { const t = A.t[j], b = A.a[j] + z / m, p = Math.pow(b, -m * t), dp = -t * p / b; s += p; ds += dp; pT = p; dpT = dp; }
    return [m * (1 - pT) / s, m * (-dpT * s - (1 - pT) * ds) / (s * s)];
  }
  function invBridge(dfg, y, T, m) {
    if (Math.abs(T - Math.round(m * T) / m) > 1e-9) return invBridgeSlow(dfg, y, T, m);
    const A = bridgeTerms(dfg, T, m); let z = A.z !== null ? A.z : y - bridgeD(A, 0, m)[0];
    for (let k = 0; k < 20; k++) {
      const [v, d] = bridgeD(A, z, m), e = v - y; if (Math.abs(e) < 1e-15) { A.z = z; return z; }
      if (!(d > 0)) break; const n = z - e / d; if (Math.abs(n - z) < 1e-15) { A.z = n; return n; } z = n;
    }
    return invBridgeSlow(dfg, y, T, m, z);
  }
  function invBridgeSlow(dfg, y, T, m, z) {
    if (z !== undefined) {
      if (Math.abs(bridge(dfg, z, T, m) - y) < 1e-13) return z; }
    let lo = -0.2, hi = 1; for (let k = 0; k < 90; k++) { const c = (lo + hi) / 2; if (bridge(dfg, c, T, m) < y) lo = c; else hi = c; } return (lo + hi) / 2;
  }
  // a smooth curve fitted to points (decimal), never forced through them, so the bonds' own errors do not drive its slope:
  // Nelson–Siegel from NS_MIN points, a least-squares straight line from 2, flat for 1
  function smoothFn(T, v) {
    if (T.length >= NS_MIN) { const f = nsFit(T, v.map(x => x * 1e4)); return t => f(t) / 1e4; }
    const n = T.length, mt = T.reduce((a, t) => a + t, 0) / n, mv = v.reduce((a, x) => a + x, 0) / n, sxx = T.reduce((a, t) => a + (t - mt) * (t - mt), 0);
    const b = n > 1 && sxx > 0 ? T.reduce((a, t, i) => a + (t - mt) * (v[i] - mv), 0) / sxx : 0;
    return t => mv + b * (t - mt);
  }
  // A bond's coupon effect on the spread-by-date curve s: its quotes minus those of the bond of the same maturity whose
  // coupon equals its own yield (the par bond the engine assumes); parZ is that par bond's Z-spread.
  function coupEffect(r, s, m) {
    let cr = 0.03; for (let k = 0; k < 4; k++) cr = yOf(r.bd, cr, m, pvZ(r.bd, cr, m, s)[0]);
    const Pb = pvZ(r.bd, cr, m, s)[0], parZ = zOf(r.bd, cr, m, Pb);
    if (r.par) return { z: 0, y: 0, parZ };
    const Pa = pvZ(r.bd, r.c, m, s)[0];
    return { z: zOf(r.bd, r.c, m, Pa) - parZ, y: yOf(r.bd, r.c, m, Pa) - cr, parZ };
  }
  // bonds closer than 0.05 years are averaged; then whole years from round(first) to round(last), straight lines in between
  function mergePts(P) {
    const s = P.slice().sort((a, b) => a[0] - b[0]), o = [];
    s.forEach(p => { const g = o[o.length - 1]; if (g && p[0] - g.t0 <= 0.05) { g.n++; g.t += (p[0] - g.t) / g.n; g.v += (p[1] - g.v) / g.n; } else o.push({ t0: p[0], t: p[0], v: p[1], n: 1 }); });
    return o.map(g => [g.t, g.v]);
  }
  function toYears(P, sc) {
    const o = {}; if (!P.length) return o;
    const a = P[0][0], b = P[P.length - 1][0];
    for (let Y = Math.max(1, Math.round(a)); Y <= Math.min(30, Math.round(b)); Y++) {
      let v; if (Y <= a) v = P[0][1]; else if (Y >= b) v = P[P.length - 1][1];
      else { let i = 1; while (P[i][0] < Y) i++; const [t0, v0] = P[i - 1], [t1, v1] = P[i]; v = v0 + (v1 - v0) * (Y - t0) / (t1 - t0); }
      o[Y] = v * sc;
    }
    return o;
  }
  const DFC = new Map();   // discount curves by their inputs: the same curve object across a reliability run's redraws
  function derive(cs, src, basis) {
    const cv = conventions(cs), m = cs.couponFreq, r6 = cs.fixing6mPct === null || cs.fixing6mPct === undefined ? null : cs.fixing6mPct / 100;
    const dk = JSON.stringify([cs.swapPct, r6, cv.alpha, cv.basis]); let dfg = DFC.get(dk);
    if (!dfg) { dfg = swapDfs(arr(cs.swapPct, 100), cv.alpha, r6, cv.basis); if (DFC.size >= 20) DFC.delete(DFC.keys().next().value); DFC.set(dk, dfg); }
    if (!dfg.every(Number.isFinite)) return { _src: { source: src, basis, err: 'swaps', tens: { float: [], fixed: [] }, rows: [], left: [] } };
    if (src === 'curve') {
      const z = {}, y = {};
      if (basis === 'z') Object.keys(cs.zspreadBp).forEach(T => { z[T] = cs.zspreadBp[T]; y[T] = bridge(dfg, cs.zspreadBp[T] / 1e4, +T, m) * 100; });
      else Object.keys(cs.ytmPct).forEach(T => { y[T] = cs.ytmPct[T]; z[T] = invBridge(dfg, cs.ytmPct[T] / 100, +T, m) * 1e4; });
      const t = Object.keys(z).map(Number).sort((a, b) => a - b);
      return { zspreadBp: z, ytmPct: y, _src: { source: src, basis, tens: { float: t, fixed: t } } };
    }
    const list = cs.bonds || [], ord = dateOrder(list.map(b => b.mat)), rows = [], left = [];
    list.forEach((b, i) => {
      const blank = v => v === null || v === undefined || String(v).trim() === '';
      if (blank(b.mat) && blank(b.cpn) && blank(b.z) && blank(b.y)) return;   // an empty row
      const name = String(b.name || '').trim() || `Bond ${i + 1}`, yt = yearsTo(b.mat, cs.asOf, ord.order);
      if (yt.err) return left.push({ i, name, why: yt.err });
      const T = yt.t; if (!(T >= 0.5)) return left.push({ i, name, why: 'short' }); if (T > 30) return left.push({ i, name, why: 'long' });
      const cp = String(b.cpn === null || b.cpn === undefined ? '' : b.cpn).trim().toLowerCase(), par = cp === 'par', c = par ? null : numv(cp);
      if (!par && (c === null || c < 0 || c > 30)) return left.push({ i, name, why: 'coupon' });
      const z = numv(b.z), y = numv(b.y), hasZ = z !== null && basis !== 'y', hasY = y !== null && basis !== 'z';
      if (!hasZ && !hasY) return left.push({ i, name, why: 'quote' });
      rows.push({ i, name, T, par, c: par ? null : c / 100, z: hasZ ? z / 1e4 : null, y: hasY ? y / 100 : null, e: b._e || null, bd: bondDates(T, m, dfg) });
    });
    // the Z-spread each bond implies: its own, or from its price at its yield (a par bond's coupon is its yield). A redraw
    // that carries its coupon effects (r.e) skips it unless smoothing fits the curve to it.
    const fast = rows.every(r => r.par || r.e), needZf = !fast || (basis === 'y' && cs.smooth === 'ns');
    rows.forEach(r => { r.zf = r.z !== null ? r.z : needZf ? zOf(r.bd, r.par ? r.y : r.c, m, pvY(r.bd, r.par ? r.y : r.c, m, r.y)[0]) : null; });
    if (!fast) {
      // spread by date: a smooth curve through the bonds, refitted twice so the par Z-spreads it implies match the corrected quotes
      const T = rows.map(r => r.T); let s = smoothFn(T, rows.map(r => r.zf)), E;
      for (let pass = 0; pass < 2; pass++) {
        E = rows.map(r => coupEffect(r, s, m));
        const d = smoothFn(T, rows.map((r, k) => r.zf - E[k].z - E[k].parZ)), s0 = s; s = t => s0(t) + d(t);
      }
      E = rows.map(r => coupEffect(r, s, m));
      rows.forEach((r, k) => { if (!r.e) r.e = { z: E[k].z, y: E[k].y }; });
    }
    rows.forEach(r => { const e = r.e || { z: 0, y: 0 }; r.zp = r.z !== null ? r.z - e.z : null; r.yp = r.y !== null ? r.y - e.y : null; r.zfp = r.zf === null ? null : r.zf - e.z; });
    const side = k => mergePts(rows.filter(r => r[k] !== null).map(r => [r.T, r[k]]));
    // yields are interpolated as a spread over the par swap rate of the same maturity, so the swap curve keeps its own bend between bonds
    const SP = new Map(), swapPar = T => { if (SP.has(T)) return SP.get(T); const ts = bondDates(T, m, dfg).map(d => d[0]).reverse(); let A = 0, p = 0; ts.forEach(t => { A += (t - p) * dfAt(dfg, t); p = t; }); const v = (1 - dfAt(dfg, T)) / A; SP.set(T, v); return v; };   // short first period accrues its own length
    const zP = basis === 'y' ? [] : side('zp'), yP = basis === 'z' ? [] : side('yp'), z = toYears(zP, 1e4);
    const y = toYears(yP.map(([t, v]) => [t, v - swapPar(t)]), 1); Object.keys(y).forEach(T => { y[T] = (y[T] + swapPar(+T)) * 100; });
    if (basis === 'z') Object.keys(z).forEach(T => { y[T] = bridge(dfg, z[T] / 1e4, +T, m) * 100; });
    if (basis === 'y') Object.keys(y).forEach(T => { z[T] = invBridge(dfg, y[T] / 100, +T, m) * 1e4; });
    const zs = basis === 'y' ? (needZf ? side('zfp') : []) : zP, tz = (basis === 'y' ? yP : zP).map(p => p[0]), ty = (basis === 'z' ? zP : yP).map(p => p[0]);
    return { zspreadBp: z, ytmPct: y, nsPts: zs.map(([t, v]) => [t, v * 1e4]),
             _src: { source: src, basis, order: ord, left, tens: { float: tz, fixed: ty }, corr: rows.some(r => !r.par),
                     rows: rows.map(r => ({ i: r.i, name: r.name, T: r.T, par: r.par, c: r.c, z: r.z, y: r.y, zp: r.zp, yp: r.yp, zfp: r.zfp, e: r.e })) } };
  }
  const EFF = new Map();
  function effective(cs) {
    const src = cs.quoteSource === 'bonds' ? 'bonds' : 'curve', basis = cs.quoteBasis === 'z' || cs.quoteBasis === 'y' ? cs.quoteBasis : 'both';
    if (src === 'curve' && basis === 'both') return cs;
    const key = JSON.stringify([src, basis, src === 'bonds' ? [cs.bonds, cs.asOf] : [cs.zspreadBp, cs.ytmPct], cs.swapPct, cs.fixing6mPct, cs.currency, cs.swapBasis, cs.couponFreq]);
    let q = EFF.get(key);
    if (!q) { q = derive(cs, src, basis); if (EFF.size >= 80) EFF.delete(EFF.keys().next().value); EFF.set(key, q); }
    return Object.assign({}, cs, q, { quoteSource: 'curve', quoteBasis: 'both' });
  }
  // Curve-shape family: every quote moved to q(WAL) + f·(q − q(WAL)); f = 1 is the base case.
  const atWal = (obj, wal) => { const F = fill(arr(obj, 1)).out, fl = Math.min(Math.max(wal, 1), 30), lo = Math.max(1, Math.min(29, Math.floor(fl))); return F[lo - 1] + (F[lo] - F[lo - 1]) * (fl - lo); };
  function reshape(obj, f, wal) {
    const q = atWal(obj, wal), o = {};
    Object.keys(obj).map(Number).forEach(k => { o[k] = q + f * (obj[k] - q); }); return o;
  }
  // the Nelson–Siegel points of a bond case follow the same reshaping as its whole-year Z-spreads
  const reshapePts = (pts, obj, f, wal) => { if (!pts) return pts; const q = atWal(obj, wal); return pts.map(([t, v]) => [t, q + f * (v - q)]); };
  function scenarios(cs, base) {
    const wal = base.float.WAL, out = {};
    // a stressed curve that cannot be priced (default probability outside 0–100%) gives NaN, shown as n/a
    const go = (name, c2) => { let w = null; try { const r = runCase(c2); w = { float: r.float.wedge * 1e4, fixed: r.fixed.wedge * 1e4 }; } catch (e) { /* not priceable */ } out[name] = w || { float: NaN, fixed: NaN }; };
    go('base', cs);
    const sw = {}; Object.keys(cs.swapPct).forEach(k => { sw[k] = cs.swapPct[k] + 0.30; });
    go('swap30', Object.assign({}, cs, { swapPct: sw, fixing6mPct: cs.fixing6mPct === null ? null : cs.fixing6mPct + 0.30 }));
    go('rec20', Object.assign({}, cs, { recovery: 0.20 }));
    go('rec60', Object.assign({}, cs, { recovery: 0.60 }));
    [[-1, 'inv'], [0, 'flat'], [0.5, 'half'], [2, 'double']].forEach(([f, nm]) =>
      go(nm, Object.assign({}, cs, { zspreadBp: reshape(cs.zspreadBp, f, wal), ytmPct: reshape(cs.ytmPct, f, wal), nsPts: reshapePts(cs.nsPts, cs.zspreadBp, f, wal) })));
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

  /* ---------------- reliability of the result ----------------
     How far to trust the benefit. Four sources of uncertainty are measured on the case and combined into one
     predictive distribution of the true benefit (an uncertainty budget, the sources taken as independent):
       random quote errors: the quotes redrawn 400 times and the loan priced again; the error size is the setting,
         or for bonds on Auto a Bayesian estimate from their scatter around a smooth curve;
       beyond the last quote: the tail rule's error, from a validation study on simulated issuer curves (TAIL_MODEL);
       gaps between quotes: straight lines against the curve's own bend;
       Z-spread vs yield: the other quote type driving the curve.
     Stress tests, leave-one-out and diagnostics come with it. The simulator's Reliability view explains each part. */
  const RULE_IDS = ['avg5', 'avg3', 'last', 'flatZ', 'blend'];
  const GRADE = [0.05, 0.15];   // tail reliance: low up to 5% of the exposure beyond the last quote, moderate to 15%, high beyond
  // Tail error by rule and version, fitted on the tail-rule study: 34,600 simulated
  // loans on 21 issuer-curve shapes, 3 swap curves, last quote 8–25 years, noise-free and gap-free quotes. error = b·share + scale·Z,
  // scale = exp(beta · [1, ln share, ln max(|Z-spread at the last quote|, 5), ln(|slope over the last 3 years| + 0.5),
  // ln(spread across the rules + 0.3)]), Z from the standardised errors' quantiles at TAIL_Q. TAIL_K widens it: with each
  // shape left out of the fit in turn, the tail's 90% ranges then held the truth 91% of the time on the shape left out.
  const TAIL_K = 1.1;
  const TAIL_Q = [0.005, 0.025, 0.05, 0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9, 0.95, 0.975, 0.995];
  const TAIL_MODEL = {float:{avg5:{b:-6.789,beta:[0.006812,0.5956,0.2644,-0.01898,0.5129],z:[-9.718,-4.821,-3.374,-2.129,-1.043,-0.4068,0.07162,0.4419,0.7572,1.089,1.494,2.042,2.52,3.009,4.458]},avg3:{b:-3.718,beta:[-0.3232,0.5324,0.2212,-0.01881,0.6851],z:[-12.45,-5.852,-3.772,-2.274,-1.189,-0.5765,-0.09294,0.2814,0.5862,0.9089,1.32,1.944,2.507,3.113,4.988]},last:{b:-0.8009,beta:[-0.7106,0.4069,0.1145,-0.1591,1.051],z:[-19.91,-7.958,-4.812,-2.758,-1.457,-0.8856,-0.4288,-0.05595,0.196,0.4535,0.8749,1.629,2.284,3.011,5.701]},flatZ:{b:-16.34,beta:[0.9089,0.6919,0.2475,0.2046,0.2232],z:[-7.13,-4.35,-3.304,-2.258,-1.182,-0.5135,0.01431,0.452,0.8098,1.148,1.521,2.004,2.394,2.726,3.436]},blend:{b:-7.819,beta:[0.1801,0.6101,0.2412,0.06584,0.4399],z:[-9.546,-4.732,-3.425,-2.225,-1.147,-0.49,0.009897,0.4255,0.7595,1.072,1.422,1.908,2.326,2.715,3.797]}},fixed:{avg5:{b:2.911,beta:[1.417,0.7323,0.03488,0.07621,0.6161],z:[-10.18,-5.355,-3.767,-2.543,-1.599,-1.141,-0.8455,-0.5875,-0.3564,-0.02247,0.5396,1.598,2.914,4.742,10.4]},avg3:{b:5.966,beta:[1.922,0.7949,-0.0116,0.1176,0.4724],z:[-9.448,-4.891,-3.502,-2.352,-1.485,-1.099,-0.8972,-0.7312,-0.5467,-0.253,0.3183,1.394,2.646,3.978,7.679]},last:{b:8.866,beta:[2.189,0.8371,-0.01666,0.04925,0.3999],z:[-8.765,-4.373,-3.158,-2.163,-1.356,-1.068,-0.9271,-0.815,-0.678,-0.4377,0.09578,1.218,2.517,3.607,6.286]},flatZ:{b:-6.632,beta:[0.8585,0.6992,0.2171,0.2088,0.4935],z:[-7.265,-4.269,-3.274,-2.377,-1.552,-1.059,-0.6091,-0.1894,0.2384,0.6583,1.117,1.691,2.953,5.149,12.13]},blend:{b:1.873,beta:[1.284,0.6823,0.01552,0.1244,0.6677],z:[-10.81,-5.451,-3.829,-2.612,-1.693,-1.23,-0.9017,-0.607,-0.3471,-0.04409,0.4438,1.4,2.742,4.974,12.11]}}};
  // Bayesian quote-error size for bonds on Auto: scaled-inverse-χ² prior with 4 degrees of freedom, its median σ set to a prior
  // guess (2bp sovereign, 4bp company): the median of σ is 1.0916 × the prior scale at 4 degrees of freedom
  const PRIOR_DF = 4, PRIOR_MED = 1.0916, PRIOR_GUESS = { sovereign: 2, corporate: 4 };
  const DEFAULT_SIGMA = 2;
  const BRIDGE_K = 0.0285;   // between two quotes the curve wanders from the straight line like a Brownian bridge: sd = BRIDGE_K × spread level × √((t−a)(b−t)/(b−a)) (study curves)
  const BOND_T_DF = 4;       // individual bonds' errors: Student-t with 4 degrees of freedom (occasional bad quotes), scaled to sd σ
  const ERR_CORR = 2;        // years over which a fitted curve's errors stay correlated (validation study: 85–88% coverage for 0.5–5 years)   // a fitted curve: its error cannot be read from its own scatter; 2bp unless set otherwise
  const MATERIAL = (d, est) => { const a = Math.abs(d); return a >= 1 || (a >= 0.3 && a >= 0.2 * Math.abs(est)) ? 'material' : a >= 0.3 ? 'minor' : 'negligible'; };
  function mulberry32(a) { return () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
  const pctl = (a, p) => { const s = a.slice().sort((x, y) => x - y), h = (s.length - 1) * p, i = Math.floor(h); return s[i] + (s[Math.min(i + 1, s.length - 1)] - s[i]) * (h - i); };
  const sortedP = (s, p) => { const h = (s.length - 1) * p, i = Math.floor(h); return s[i] + (s[Math.min(i + 1, s.length - 1)] - s[i]) * (h - i); };
  const variance = a => { if (a.length < 2) return 0; const m = a.reduce((x, y) => x + y, 0) / a.length; return a.reduce((x, y) => x + (y - m) * (y - m), 0) / (a.length - 1); };
  // χ² quantile by Wilson–Hilferty (z: the normal quantile), and a gamma draw by Marsaglia–Tsang (shape ≥ 1)
  const chi2q = (df, z) => df * Math.pow(1 - 2 / (9 * df) + z * Math.sqrt(2 / (9 * df)), 3);
  function gammaRand(a, rand, gauss) { const d = a - 1 / 3, c = 1 / Math.sqrt(9 * d); for (;;) { let x, v; do { x = gauss(); v = 1 + c * x; } while (v <= 0); v = v * v * v; const u = rand(); if (u < 1 - 0.0331 * x * x * x * x || Math.log(u) < 0.5 * x * x + d * (1 - v + Math.log(v))) return d * v; } }
  // monotone cubic through points (Fritsch–Carlson), for the curve's bend between 3 or 4 quotes
  function pchipFn(x, y) {
    const n = x.length, h = [], d = [], m = new Array(n);
    for (let i = 0; i < n - 1; i++) { h.push(x[i + 1] - x[i]); d.push((y[i + 1] - y[i]) / h[i]); }
    m[0] = d[0]; m[n - 1] = d[n - 2];
    for (let i = 1; i < n - 1; i++) m[i] = d[i - 1] * d[i] <= 0 ? 0 : 3 * (h[i - 1] + h[i]) / ((2 * h[i] + h[i - 1]) / d[i - 1] + (h[i] + 2 * h[i - 1]) / d[i]);
    return t => { if (t <= x[0]) return y[0]; if (t >= x[n - 1]) return y[n - 1]; let i = 0; while (t > x[i + 1]) i++;
      const s = (t - x[i]) / h[i]; return (1 + 2 * s) * (1 - s) * (1 - s) * y[i] + s * (1 - s) * (1 - s) * h[i] * m[i] + s * s * (3 - 2 * s) * y[i + 1] + s * s * (s - 1) * h[i] * m[i + 1]; };
  }
  const tailQ = (Q, u) => { const P = TAIL_Q; if (u <= P[0]) return Q[0]; if (u >= P[P.length - 1]) return Q[Q.length - 1]; let i = 1; while (P[i] < u) i++; return Q[i - 1] + (Q[i] - Q[i - 1]) * (u - P[i - 1]) / (P[i] - P[i - 1]); };
  // Coverage of the loan by the quotes as entered: the share of its exposure (risky-annuity weight) beyond the last quote
  // drives how much the tail rule can matter; tail reliance low / moderate / high. R = runCase(cs).
  function coverage(R, cs) {
    // individual bonds count at their own maturities (WW.effective), not the whole years derived from them
    const out = {}, tens = cs._src && cs._src.tens ? cs._src.tens : { float: Object.keys(cs.zspreadBp).map(Number).sort((a, b) => a - b), fixed: Object.keys(cs.ytmPct).map(Number).sort((a, b) => a - b) };
    ['float', 'fixed'].forEach(v => {
      const r = R[v], ts = tens[v], last = ts.length ? ts[ts.length - 1] : 0, W = r.per.reduce((a, e) => a + e.w, 0);
      const share = W > 0 ? r.per.reduce((a, e) => a + (e.t > last ? e.w : 0), 0) / W : 0;
      let maxGap = ts.length ? ts[0] : 0; for (let i = 1; i < ts.length; i++) maxGap = Math.max(maxGap, ts[i] - ts[i - 1]);
      out[v] = { last, maturity: r.maturity, gap: Math.max(0, r.maturity - last), share, n: ts.length, maxGap, tailApplies: r.maturity > last,
                 grade: share <= GRADE[0] + 1e-12 ? 'green' : share <= GRADE[1] + 1e-12 ? 'amber' : 'red' };
    });
    return out;
  }
  // raw: the case as entered (curve or bonds); opt.prep: raw → the case priced (WW.effective, plus the simulator's scenario)
  function reliability(raw, opt) {
    opt = opt || {};
    const prep = opt.prep || effective, N = opt.draws || 400, V = ['float', 'fixed'], seed = opt.seed || 20261112, rand = mulberry32(seed);
    const gauss = () => { let u = 0; while (u === 0) u = rand(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * rand()); };
    const run = c => { try { const R = runCase(prep(c)), w = { float: R.float.wedge * 1e4, fixed: R.fixed.wedge * 1e4 }; return Number.isFinite(w.float) && Number.isFinite(w.fixed) ? w : null; } catch (e) { return null; } };
    const P0 = prep(raw), R0 = runCase(P0), est = { float: R0.float.wedge * 1e4, fixed: R0.fixed.wedge * 1e4 }, chosen = R0.tailRule, m = P0.couponFreq;
    const bonds = raw.quoteSource === 'bonds', basis = raw.quoteBasis === 'z' || raw.quoteBasis === 'y' ? raw.quoteBasis : 'both', src = P0._src;
    const zPts = (P0.nsPts && P0.nsPts.length ? P0.nsPts : Object.keys(P0.zspreadBp).map(T => [+T, P0.zspreadBp[T]])).slice().sort((a, b) => a[0] - b[0]);
    // the tail rules compared
    const rules = {}, failed = [];
    RULE_IDS.forEach(id => { const w = id === chosen ? est : run(Object.assign({}, raw, { tailRule: id })); if (w) rules[id] = w; else failed.push(id); });
    const cover = coverage(R0, P0);
    // the quotes as entered, each with its maturity: bonds, or whole years; only the driving quote types move
    const moveZ = basis !== 'y', moveY = basis !== 'z', eOf = {}, rowT = {};
    if (src && src.rows) src.rows.forEach(r => { eOf[r.i] = r.e; rowT[r.i] = r; });
    const items = bonds ? (raw.bonds || []).map((b, i) => rowT[i] ? { k: 'b' + i, i, t: rowT[i].T, name: rowT[i].name, z: rowT[i].z !== null, y: rowT[i].y !== null } : null).filter(Boolean)
      : [...new Set(Object.keys(raw.zspreadBp).concat(Object.keys(raw.ytmPct)).map(Number))].sort((a, b) => a - b).map(t => ({ k: 't' + t, t, name: t + 'y', z: t in raw.zspreadBp, y: t in raw.ytmPct }));
    const byK = {}; items.forEach(it => { byK[it.k] = it; });
    // a copy of the raw case with every driving quote moved by d(item) bp; an item is dropped where d returns null
    function moved(d, extra) {
      if (bonds) {
        const bl = []; (raw.bonds || []).forEach((b, i) => { const it = byK['b' + i]; if (!it) { bl.push(b); return; } const x = d(it); if (x === null) return;
          const z = numv(b.z), y = numv(b.y); bl.push(Object.assign({}, b, { z: moveZ && z !== null ? z + x : b.z, y: moveY && y !== null ? y + x / 100 : b.y, _e: eOf[i] || null })); });
        return Object.assign({}, raw, { bonds: bl }, extra);
      }
      const z = {}, y = {};
      Object.keys(raw.zspreadBp).forEach(T => { const x = d(byK['t' + T]); if (x !== null) z[T] = raw.zspreadBp[T] + (moveZ ? x : 0); });
      Object.keys(raw.ytmPct).forEach(T => { const x = d(byK['t' + T]); if (x !== null) y[T] = raw.ytmPct[T] + (moveY ? x / 100 : 0); });
      return Object.assign({}, raw, { zspreadBp: z, ytmPct: y }, extra);
    }
    // diagnostics: scatter of the (par-equivalent) Z-spreads around a Nelson–Siegel fit, robust flags
    // a robust fit: fitted once, then again without clear outliers (beyond 3.5 × the typical scatter and 6bp), which would bend it
    let resid = [], rms = null;
    if (zPts.length >= 7) {
      const fitOn = P => nsFit(P.map(p => p[0]), P.map(p => p[1])), resOf = f => zPts.map(([t, v]) => ({ t, res: v - f(t) }));
      resid = resOf(fitOn(zPts));
      const r0 = 1.4826 * pctl(resid.map(q => Math.abs(q.res)), 0.5), kept = zPts.filter((p, i) => Math.abs(resid[i].res) <= Math.max(3.5 * r0, 6));
      if (kept.length < zPts.length && kept.length >= 7) resid = resOf(fitOn(kept));
    }
    const robust = resid.length ? 1.4826 * pctl(resid.map(q => Math.abs(q.res)), 0.5) : 0;
    resid.forEach(q => { q.flag = Math.abs(q.res) > Math.max(2.5 * robust, 4); });
    if (resid.length) rms = Math.sqrt(resid.reduce((a, q) => a + q.res * q.res, 0) / Math.max(1, resid.length - 4));
    const near = t => items.reduce((b, it) => (it.z || it.y) && (!b || Math.abs(it.t - t) < Math.abs(b.t - t)) ? it : b, null);
    const flagged = resid.filter(q => q.flag).map(q => { const it = near(q.t); return { t: q.t, res: q.res, k: it && it.k, name: it ? it.name : q.t.toFixed(1) + 'y' }; });
    // random quote errors: σ (bp) — the setting, or for bonds on Auto the Bayesian posterior
    const auto = bonds && !(raw.noiseBp > 0), guess = PRIOR_GUESS[raw.borrowerType] || 2;
    let sig;
    if (auto) {
      // clear outliers (beyond 3.5 × the typical scatter and 6bp) are left out; other flagged quotes count at the flag threshold
      // (winsorised): a bad quote cannot inflate the estimate, and clean data are not trimmed
      const thr = Math.max(2.5 * robust, 4), far = q => Math.abs(q.res) > Math.max(3.5 * robust, 6), keep = resid.filter(q => !far(q));
      const s0 = guess / PRIOR_MED, nu = resid.length ? Math.max(0, keep.length - 4) : 0, rss = keep.reduce((a, q) => a + Math.min(q.res * q.res, thr * thr), 0);
      const df = PRIOR_DF + nu, sc = Math.sqrt((PRIOR_DF * s0 * s0 + (nu ? rss : 0)) / df), at = z => Math.sqrt(df * sc * sc / chi2q(df, z));
      sig = { mode: 'bayes', guess, s0, nu, rss, df, sc, med: at(0), lo: at(1.6449), hi: at(-1.6449), data: nu ? Math.sqrt(rss / nu) : null, prior: { lo: s0 * Math.sqrt(PRIOR_DF / chi2q(PRIOR_DF, 1.6449)), hi: s0 * Math.sqrt(PRIOR_DF / chi2q(PRIOR_DF, -1.6449)) } };
    } else sig = { mode: 'set', med: raw.noiseBp > 0 ? +raw.noiseBp : DEFAULT_SIGMA };
    // a fitted curve's errors run together along the curve: correlated over about ERR_CORR years (each tenor's error
    // keeps exp(−gap / ERR_CORR) of its neighbour's); individual bonds' errors are independent
    const errModel = bonds ? 'bonds' : 'correlated', order = items.slice().sort((a, b) => a.t - b.t);
    const pairs = [];
    for (let k = 0; k < N / 2; k++) {
      const s = auto ? Math.sqrt(sig.df * sig.sc * sig.sc / (2 * gammaRand(sig.df / 2, rand, gauss))) : sig.med;
      let err;
      if (bonds) { const e = {}; items.forEach(it => { e[it.k] = s * gauss() / Math.sqrt(2 * gammaRand(BOND_T_DF / 2, rand, gauss) / (BOND_T_DF - 2)); }); err = it => e[it.k]; }
      else { const e = {}; let prev = null, tp = 0; order.forEach(it => { const a = prev === null ? 0 : Math.exp(-(it.t - tp) / ERR_CORR); prev = prev === null ? s * gauss() : a * prev + Math.sqrt(1 - a * a) * s * gauss(); tp = it.t; e[it.k] = prev; }); err = it => e[it.k]; }
      const w1 = run(moved(it => err(it))), w2 = run(moved(it => -err(it)));
      if (w1 && w2) pairs.push([w1, w2]);
    }
    // stress tests and what the result leans on
    const tz = items.map(it => it.t), t0 = Math.min(...tz), t1 = Math.max(...tz), tm = (t0 + t1) / 2, span = Math.max(t1 - t0, 1e-9);
    const sw = {}; Object.keys(raw.swapPct).forEach(T => { sw[T] = raw.swapPct[T] + 0.10; });
    const lastIt = v => items.filter(it => (v === 'float' ? (moveZ ? it.z : it.y) : (moveY ? it.y : it.z))).reduce((b, it) => !b || it.t > b.t ? it : b, null);
    const stress = { level: run(moved(() => 5)), tilt: run(moved(it => 5 * (it.t - t0) / span)), bend: run(moved(it => 5 * Math.max(0, 1 - Math.abs(it.t - tm) / (span / 2)))),
                     stale: run(Object.assign({}, raw, { swapPct: sw, fixing6mPct: raw.fixing6mPct === null || raw.fixing6mPct === undefined ? raw.fixing6mPct : raw.fixing6mPct + 0.10 })) };
    const memo = new Map(), once = (key, f) => { if (!memo.has(key)) memo.set(key, f()); return memo.get(key); };
    const shiftOne = (it, d) => once(it.k + '|' + d, () => run(moved(x => x.k === it.k ? d : 0)));
    const dropOne = it => once('drop|' + it.k, () => run(moved(x => x.k === it.k ? null : 0)));
    // gaps between quotes: the curve's own bend (Nelson–Siegel from 5 points, a monotone cubic from 3) against straight lines
    // two readings of the bend: a Nelson–Siegel curve (stiff) and a monotone cubic through the quotes (local); the larger effect counts
    const bendFns = []; if (zPts.length >= NS_MIN) bendFns.push(nsFit(zPts.map(p => p[0]), zPts.map(p => p[1]))); if (zPts.length >= 3) bendFns.push(pchipFn(zPts.map(p => p[0]), zPts.map(p => p[1])));
    let gapW = null;
    for (const bendFn of bendFns) {
      const pts = zPts.map(p => p[0]), alt = Object.assign({}, P0, { zspreadBp: Object.assign({}, P0.zspreadBp), ytmPct: Object.assign({}, P0.ytmPct), smooth: 'off' });
      const zF = fill(arr(P0.zspreadBp, 1)).out, yF = fill(arr(P0.ytmPct, 1)).out; let any = false;
      for (let Y = Math.ceil(pts[0]); Y <= Math.floor(pts[pts.length - 1]); Y++) {
        let i = 1; while (i < pts.length - 1 && pts[i] < Y) i++;
        const a = pts[i - 1], b = pts[i]; if (!(Y > a + 1e-9 && Y < b - 1e-9)) continue;
        const bend = bendFn(Y) - (bendFn(a) + (bendFn(b) - bendFn(a)) * (Y - a) / (b - a)); if (Math.abs(bend) < 1e-9) continue;
        if (bonds || !(Y in P0.zspreadBp)) { alt.zspreadBp[Y] = zF[Y - 1] + bend; any = true; }
        if ((bonds || !(Y in P0.ytmPct)) && Object.keys(P0.ytmPct).length) alt.ytmPct[Y] = yF[Y - 1] + bend / 100;
      }
      let w = { float: 0, fixed: 0 };
      if (any) { try { const Ra = runCase(alt), Rb = runCase(Object.assign({}, P0, { smooth: 'off' })); w = { float: (Ra.float.wedge - Rb.float.wedge) * 1e4, fixed: (Ra.fixed.wedge - Rb.fixed.wedge) * 1e4 }; if (!Number.isFinite(w.float) || !Number.isFinite(w.fixed)) w = null; } catch (e) { w = null; } }
      if (w) gapW = gapW ? { float: Math.abs(w.float) > Math.abs(gapW.float) ? w.float : gapW.float, fixed: Math.abs(w.fixed) > Math.abs(gapW.fixed) ? w.fixed : gapW.fixed } : w;
    }
    // ...and how far the curve can wander between two quotes: a Brownian bridge per gap, propagated through the benefit's
    // sensitivity to each whole year inside it (one repricing per year, the quotes around it held)
    const bridgeVar = { float: 0, fixed: 0 }, gapYears = [];
    if (zPts.length >= 2) {
      const base = Object.assign({}, P0, { zspreadBp: Object.assign({}, P0.zspreadBp), ytmPct: Object.assign({}, P0.ytmPct), smooth: 'off' });
      const zF = fill(arr(P0.zspreadBp, 1)).out, yF = fill(arr(P0.ytmPct, 1)).out, hasY = Object.keys(P0.ytmPct).length > 0;
      for (let j = 1; j < zPts.length; j++) { const a = zPts[j - 1][0], b = zPts[j][0], lv = Math.max(10, (Math.abs(zPts[j - 1][1]) + Math.abs(zPts[j][1])) / 2);
        for (let Y = Math.floor(a) + 1; Y < b - 1e-9; Y++) if (Y > a + 1e-9 && Y >= 1 && Y <= 30) gapYears.push({ Y, a, b, k: BRIDGE_K * lv }); }
      gapYears.forEach(g => { base.zspreadBp[g.Y] = zF[g.Y - 1]; if (hasY) base.ytmPct[g.Y] = yF[g.Y - 1]; });
      if (gapYears.length) {
        let R1; try { R1 = runCase(base); } catch (e) { R1 = null; }
        if (R1) {
          const w0 = { float: R1.float.wedge, fixed: R1.fixed.wedge }, ok = g => Number.isFinite(g.float) && Number.isFinite(g.fixed) ? g : { float: 0, fixed: 0 };
          const grad = !Number.isFinite(w0.float) || !Number.isFinite(w0.fixed) ? gapYears.map(() => ({ float: 0, fixed: 0 })) : gapYears.map(g => { try { const c = Object.assign({}, base, { zspreadBp: Object.assign({}, base.zspreadBp, { [g.Y]: base.zspreadBp[g.Y] + 1 }), ytmPct: hasY ? Object.assign({}, base.ytmPct, { [g.Y]: base.ytmPct[g.Y] + 0.01 }) : base.ytmPct });
            const R = runCase(c); return ok({ float: (R.float.wedge - w0.float) * 1e4, fixed: (R.fixed.wedge - w0.fixed) * 1e4 }); } catch (e) { return { float: 0, fixed: 0 }; } });
          gapYears.forEach((g1, i) => gapYears.forEach((g2, j) => { if (g1.a !== g2.a) return; const lo = Math.min(g1.Y, g2.Y), hi = Math.max(g1.Y, g2.Y), cv = g1.k * g1.k * (lo - g1.a) * (g1.b - hi) / (g1.b - g1.a);
            V.forEach(v => { bridgeVar[v] += grad[i][v] * grad[j][v] * cv; }); }));
        }
      }
    }
    // Z-spread vs yield (basis 'both', both quote types entered): the other quote type driving the curve
    const both = basis === 'both' && Object.keys(P0.zspreadBp).length && Object.keys(P0.ytmPct).length;
    let cons = null;
    if (both) { const wz = run(Object.assign({}, raw, { quoteBasis: 'z' })), wy = run(Object.assign({}, raw, { quoteBasis: 'y' })); cons = { float: wy ? wy.float - est.float : 0, fixed: wz ? wz.fixed - est.fixed : 0 }; }
    const gaps = !both ? [] : Object.keys(P0.zspreadBp).filter(T => T in P0.ytmPct).map(T => ({ t: +T, gap: (bridge(R0.dfg, P0.zspreadBp[T] / 1e4, +T, m) - P0.ytmPct[T] / 100) * 1e4 }));
    let gapSplit = null;
    if (gaps.length >= 2) {
      const n = gaps.length, mt = gaps.reduce((a, g) => a + g.t, 0) / n, mg = gaps.reduce((a, g) => a + g.gap, 0) / n, sxx = gaps.reduce((a, g) => a + (g.t - mt) * (g.t - mt), 0);
      const slope = sxx > 0 ? gaps.reduce((a, g) => a + (g.t - mt) * (g.gap - mg), 0) / sxx : 0, line = t => mg + slope * (t - mt);
      gapSplit = { level: mg, slope, spikes: gaps.filter(g => Math.abs(g.gap - line(g.t)) > 3).map(g => ({ t: g.t, off: g.gap - line(g.t) })), max: Math.max(...gaps.map(g => Math.abs(g.gap))), line: [line(gaps[0].t), line(gaps[n - 1].t)] };
    }
    const smoothOff = raw.smooth === 'ns' ? run(Object.assign({}, raw, { smooth: 'off' })) : null;
    // combine: 20,000 draws of the true benefit = figure − noise error − tail error + gap and Z/yield bounds
    const r2 = mulberry32(seed + 7), NC = 20000, gauss2 = () => { let u = 0; while (u === 0) u = r2(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * r2()); };
    // a curve so close to where the model breaks that most redrawn quotes cannot be priced: the noise is not measurable
    const priced = pairs.length * 2 / N, fragile = priced < 0.5;
    const out = { chosen, est, rules, failed, cover, sigma: sig, errModel, draws: pairs.length * 2, drawsAsked: N, priced, fragile, resid, robust, rms, flagged, gaps, gapSplit, both: !!both, bonds, basis,
                  stress: {}, version: {}, zPts, bridge: gapYears, notFitted: !bonds && rms !== null && rms > 2 };
    V.forEach(v => {
      const c = cover[v], nd = []; pairs.forEach(([a, b]) => { nd.push(a[v] - est[v], b[v] - est[v]); });
      let T = null;
      if (c.tailApplies && c.share > 0.002) {
        const M = (TAIL_MODEL[v] || {})[chosen] || TAIL_MODEL[v].avg5, zW = fill(arr(P0.zspreadBp, 1)).out, L = Math.max(1, Math.min(30, Math.round(c.last))), k = Math.min(3, L - 1);
        const zL = zW[L - 1], slope = k > 0 ? (zW[L - 1] - zW[L - 1 - k]) / k : 0, rv = Object.values(rules).map(w => w[v]), spread = rv.length ? Math.max(...rv) - Math.min(...rv) : 0;
        const x = [1, Math.log(c.share), Math.log(Math.max(Math.abs(zL), 5)), Math.log(Math.abs(slope) + 0.5), Math.log(spread + 0.3)];
        T = { bias: M.b * c.share, scale: TAIL_K * Math.exp(x.reduce((a, xi, j) => a + xi * M.beta[j], 0)), z: M.z, zL, slope, spread };
      }
      const dg = gapW ? gapW[v] : 0, dc = cons ? cons[v] : 0, sb = Math.sqrt(bridgeVar[v]), tot = new Float64Array(NC), tl = new Float64Array(NC), ni = new Int32Array(NC), gd = new Float64Array(NC), cd = new Float64Array(NC);
      for (let k = 0; k < NC; k++) {
        const j = nd.length ? Math.floor(r2() * nd.length) : 0, n = nd.length ? nd[j] : 0, t = T ? T.bias + T.scale * tailQ(T.z, r2()) : 0; ni[k] = j;
        const g = (dg ? (2 * r2() - 1) * Math.abs(dg) : 0) + (sb ? sb * gauss2() : 0), cc = dc ? (2 * r2() - 1) * Math.abs(dc) : 0;
        tl[k] = t; gd[k] = g; cd[k] = cc; tot[k] = est[v] - n - t + g + cc;
      }
      const s = Float64Array.from(tot).sort(), uN = Math.sqrt(variance(nd)), uT = Math.sqrt(variance(Array.from(tl))), uG = Math.sqrt(dg * dg / 3 + bridgeVar[v]), uC = Math.abs(dc) / Math.sqrt(3);
      const sum = uN * uN + uT * uT + uG * uG + uC * uC, uTot = Math.sqrt(sum), sh = x => sum > 0 ? x * x / sum : 0;
      const p5 = sortedP(s, 0.05), p95 = sortedP(s, 0.95), med = sortedP(s, 0.5), pPos = tot.reduce((a, x) => a + (x > 0 ? 1 : 0), 0) / NC;
      // Monte Carlo precision of the range ends: bootstrap over the antithetic pairs
      const bs5 = [], bs95 = [], rb = mulberry32(seed + 11);
      if (pairs.length > 2) for (let b = 0; b < 30; b++) {
        const pick = new Float64Array(2 * pairs.length); for (let j = 0; j < pairs.length; j++) { const p = pairs[Math.floor(rb() * pairs.length)]; pick[2 * j] = p[0][v] - est[v]; pick[2 * j + 1] = p[1][v] - est[v]; }
        const t2 = new Float64Array(2000); for (let k = 0; k < 2000; k++) { const j = Math.floor(rb() * NC); t2[k] = tot[j] + nd[ni[j]] - pick[Math.floor(rb() * pick.length)]; }
        t2.sort(); bs5.push(sortedP(t2, 0.05)); bs95.push(sortedP(t2, 0.95));
      }
      const hw = (p95 - p5) / 2, excl = p5 > 0 || p95 < 0;
      const verdict = !excl || fragile ? 'uncertain' : hw <= Math.max(2, 0.25 * Math.abs(med)) ? 'solid' : 'indicative';
      // histogram of the predictive distribution, for the verdict chart
      const lo = sortedP(s, 0.005), hi = sortedP(s, 0.995), nb = 48, bw = (hi - lo) / nb || 1, bins = new Array(nb).fill(0);
      tot.forEach(x => { if (x >= lo && x <= hi) bins[Math.min(nb - 1, Math.floor((x - lo) / bw))]++; });
      // each source's own spread, as its effect on the benefit: the central 68%, 90% and 95% of its draws
      const spanOf = a => { const x = Float64Array.from(a).sort(); return { p68: [sortedP(x, 0.16), sortedP(x, 0.84)], p90: [sortedP(x, 0.05), sortedP(x, 0.95)], p95: [sortedP(x, 0.025), sortedP(x, 0.975)] }; };
      const spans = { noise: spanOf(nd.length ? nd.map(x => -x) : [0]), tail: spanOf(Array.from(tl, x => -x)), gap: spanOf(gd), cons: spanOf(cd) };
      const lt = lastIt(v), up = lt ? shiftOne(lt, 5) : null, dn = lt ? shiftOne(lt, -5) : null;
      // each driving quote 5bp higher on its own: where an error in the data would move the benefit most
      const sens = items.filter(it => (v === 'float' ? (moveZ ? it.z : it.y) : (moveY ? it.y : it.z))).map(it => { const w = shiftOne(it, 5); return { k: it.k, t: it.t, name: it.name, d: w ? w[v] - est[v] : null }; });
      const infl = items.length - 1 >= 5 ? items.filter(it => (v === 'float' ? (moveZ ? it.z : it.y) : (moveY ? it.y : it.z))).map(it => { const w = dropOne(it); return { k: it.k, t: it.t, name: it.name, d: w ? w[v] - est[v] : null }; }) : [];
      const st = {}; Object.entries(stress).forEach(([key, w]) => { st[key] = w ? w[v] - est[v] : null; });
      out.version[v] = Object.assign({}, c, {
        est: est[v], median: med, p5, p25: sortedP(s, 0.25), p75: sortedP(s, 0.75), p95, pPos, p2_5: sortedP(s, 0.025), p16: sortedP(s, 0.16), p84: sortedP(s, 0.84), p97_5: sortedP(s, 0.975), spans, sens, shift: med - est[v], verdict, sdDraws: Math.sqrt(variance(Array.from(tot))),
        reliance: c.grade === 'green' ? 'low' : c.grade === 'amber' ? 'moderate' : 'high',
        u: { noise: uN, tail: uT, gap: uG, cons: uC, total: uTot }, shares: { noise: sh(uN), tail: sh(uT), gap: sh(uG), cons: sh(uC) },
        mcPrec: bs5.length ? Math.max(Math.sqrt(variance(bs5)), Math.sqrt(variance(bs95))) : null,
        noiseDraws: nd, noiseP5: nd.length ? est[v] - pctl(nd, 0.95) : est[v], noiseP95: nd.length ? est[v] - pctl(nd, 0.05) : est[v],
        tail: T, gapDelta: gapW ? dg : null, gapBridge: sb, gapYears: gapYears.length, consDelta: cons ? dc : null, hist: { lo, bw, bins },
        ruleLo: Math.min(...Object.values(rules).map(w => w[v])), ruleHi: Math.max(...Object.values(rules).map(w => w[v])),
        last: c.last, lastName: lt ? lt.name : null, lastUp: up ? up[v] - est[v] : null, lastDown: dn ? dn[v] - est[v] : null, influence: infl, stress: st,
        smoothEffect: smoothOff ? est[v] - smoothOff[v] : null,
      });
      // bias items: what each one does to this case, graded material / minor / negligible
      const B = [], q = out.version[v], add = (key, d, data) => B.push({ key, d, cls: d === null ? 'material' : MATERIAL(d, est[v]), data: data || {} });
      if (q.tailApplies && Object.keys(rules).length > 1) { const far = Object.entries(rules).reduce((b, [id, w]) => !b || Math.abs(w[v] - est[v]) > Math.abs(b[1] - est[v]) ? [id, w[v]] : b, null);
        add('tailRule', far[1] - est[v], { rule: far[0], slope: T ? T.slope : null }); }
      if (q.tailApplies && c.share > GRADE[0]) add('reliance', 1.645 * uT, { share: c.share });
      if (cons) add('consistency', dc, gapSplit || {});
      if (gapW || sb) add('gaps', Math.sign(dg || 1) * 1.645 * uG, { maxGap: c.maxGap, bend: dg, bridge: sb });
      flagged.forEach(f => { const it = f.k && byK[f.k], w = it ? dropOne(it) : null; add('flagged', w ? w[v] - est[v] : f.res, { name: f.name, res: f.res }); });
      if (bonds && src && src.left && src.left.length) add('left', null, { rows: src.left });
      if (smoothOff) add('smoothing', q.smoothEffect, {});
      if (q.lastUp !== null) add('lastQuote', Math.max(Math.abs(q.lastUp), Math.abs(q.lastDown)), { name: q.lastName });
      if (!auto) { const rest = sum - uN * uN; add('noiseSetting', 1.645 * (Math.sqrt(4 * uN * uN + rest) - uTot), { sigma: sig.med }); }
      if (out.notFitted) add('notFitted', null, { rms });
      if (priced < 0.8) add('fragile', null, { priced, draws: pairs.length * 2, asked: N });
      if (st.level !== null) add('level', st.level, {});
      if (st.stale !== null) add('stale', st.stale, {});
      const rk = { material: 0, minor: 1, negligible: 2 }, mag = x => x.d === null ? Infinity : Math.abs(x.d);
      q.biases = B.sort((a, b) => rk[a.cls] - rk[b.cls] || mag(b) - mag(a));
    });
    out.stress = stress;
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
    const yr = zKeys.length ? zKeys[zKeys.length - 1] : Math.max(1, Math.floor(mat));   // a loan shorter than a year still reads year 1
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
      maxMove: (() => { const b = sc.base; let mv = 0; ['swap30', 'rec20', 'rec60'].forEach(n => ['float', 'fixed'].forEach(k => { const d = Math.abs(sc[n][k] - b[k]); if (Number.isFinite(d)) mv = Math.max(mv, d); })); return mv.toFixed(1) + 'bp'; })(),
      strategy: cs.borrowerType === 'corporate' ? 'funding plan' : 'debt management strategy',
    };
    const scb = v => Number.isFinite(v) ? fmt.bp(v) : 'n/a';   // a stressed curve that cannot be priced
    function loan(r, isF) {
      const unit = v => isF ? fmt.bp(v * 1e4, 1) : fmt.pct(v);
      let minV = 0, minT = 0, be = null;
      for (const [t, v] of r.run) { if (v < minV) { minV = v; minT = t; } }
      if (minV < 0) { for (const [t, v] of r.run) if (t > minT && v >= 0) { be = t; break; } } else be = 0;
      const own = isF ? cs.zspreadBp[yr] : cs.ytmPct[yr], ycQ = own === undefined ? r.qfill[yr - 1] : isF ? own / 1e4 : own / 100, ycC = yearCost(r, yr);
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
        sc_base: scb(sc.base[key]), sc_swap30: scb(sc.swap30[key]), sc_rec20: scb(sc.rec20[key]), sc_rec60: scb(sc.rec60[key]),
        sc_inv: scb(sc.inv[key]), sc_flat: scb(sc.flat[key]), sc_half: scb(sc.half[key]), sc_double: scb(sc.double[key]),
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
    const cp = !!(opt && opt.compact), wd = !!(opt && opt.wide);   // wide: a full-width card, so a wider canvas and a lower one
    const r = F.R[mode], cs = F.cs, isF = mode === 'float', sc = isF ? 1e4 : 100, st = strip(r, cs), n = st.length, mat = r.maturity;
    if (!st.ok) { el.innerHTML = '<p class="cap">This custom schedule draws money after repayments have started, so the loan does not split into a strip of mini-bonds. The other charts are unaffected.</p>'; return; }
    // each mini-bond's bar is as thick as its share of the amount (equal for a linear loan, larger for a balloon)
    const W = wd ? 1100 : 760, l = 58, rr = 16, top = 30, rowH = Math.max(wd ? 1.6 : 2.4, Math.min(wd ? 2.6 : cp ? 3.4 : 5.2, (wd ? 110 : cp ? 160 : 240) / n)), H1 = n * rowH, gap = 40, H2 = wd ? 100 : cp ? 120 : 170, bot = 40, H = top + H1 + gap + H2 + bot;
    const sz = st.map(m => m.size), eq = Math.max(...sz) - Math.min(...sz) < 1e-9, yAt = []; let acc = 0; st.forEach(m => { yAt.push(top + acc * H1); acc += m.size; });
    const X = v => l + v / (mat + 0.5) * (W - l - rr);
    const ch = r.charged * sc, ps = st.map(m => m.p * sc), stp = isF ? 20 : 0.25;
    const lo = Math.floor((Math.min(ch, ...ps) - stp / 2) / stp) * stp, hi = Math.ceil((Math.max(ch, ...ps) + stp / 4) / stp) * stp;
    const y2 = v => top + H1 + gap + H2 - (v - lo) / (hi - lo) * H2, fmtv = v => (isF ? Math.round(v) + 'bp' : v.toFixed(2) + '%').replace('-', '−');
    const wt = m => m.A * m.size, Amax = Math.max(...st.map(wt)), col = m => m.p > r.charged ? 'var(--accent)' : 'var(--slate)';
    let s = `<svg class="ch" viewBox="0 0 ${W} ${H}" role="img" aria-label="The loan as ${n} mini-bonds and the price of each on your curve">`;
    s += `<text class="pt" x="${l}" y="16">THE LOAN AS ${n} MINI-BONDS${eq ? ' OF ' + F.common.peak.toUpperCase() : ''}, EACH REPAID ON ITS OWN DATE${eq ? '' : ' (BAR THICKNESS = SIZE)'}</text>`;
    st.forEach((m, k) => { const h = Math.max(1, m.size * H1 - 1); s += `<rect x="${X(0)}" y="${yAt[k] + .5}" width="${X(m.T) - X(0)}" height="${h}" style="fill:${col(m)};opacity:${m.p > r.charged ? .88 : .5}"/>`; });
    const yT = top + H1 + gap - 14;
    s += `<text class="pt" x="${l}" y="${yT}">EACH MINI-BOND'S OWN PRICE ON YOUR CURVE, AGAINST THE ONE PRICE THE LOAN CHARGES</text>`;
    for (let v = lo; v <= hi + 1e-9; v += stp) { const y = y2(v); s += `<line class="grid" x1="${l}" x2="${W - rr}" y1="${y}" y2="${y}"/><text class="tk" x="${l - 8}" y="${y + 4}" text-anchor="end">${fmtv(v)}</text>`; }
    st.forEach(m => { s += `<line x1="${X(m.T)}" x2="${X(m.T)}" y1="${y2(ch)}" y2="${y2(m.p * sc)}" style="stroke:${col(m)};stroke-width:2;opacity:.45"/>`; });
    s += `<line x1="${l}" x2="${W - rr}" y1="${y2(ch)}" y2="${y2(ch)}" style="stroke:var(--ink);stroke-width:2"/>`;
    st.forEach(m => { s += `<circle cx="${X(m.T)}" cy="${y2(m.p * sc)}" r="${(1.6 + 4.2 * Math.sqrt(wt(m) / Amax)).toFixed(2)}" style="fill:${col(m)};stroke:var(--panel);stroke-width:1"/>`; });
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
  // opt.pts: individual bonds [[years, value]] in the chart's unit, drawn at their own maturities
  function drawCurve(el, F, mode, opt) {
    const r = F.R[mode], isF = mode === 'float', raw = isF ? F.R.inputs.z : F.R.inputs.y, sc = isF ? 1e4 : 100, pts = (opt && opt.pts) || [];
    const q = r.qfill.map(v => v * sc), L = Math.max(r.last, Math.ceil(r.maturity), ...pts.map(p => Math.ceil(p[0]))), WAL = r.WAL;
    const vals = q.slice(0, L).concat([r.quote * sc], pts.map(p => p[1])); let layers = [];
    if (!isF) { const sw = fill(F.R.inputs.s).out.map(v => v * 100).slice(0, L); vals.push(...sw); layers.push({ t: 'line', p: sw.map((v, i) => [i + 1, v]), c: C.muted, w: 1.6, dash: '5 4' }); }
    const st = isF ? 20 : 0.25, lo = Math.floor(Math.min(...vals) / st) * st - (isF ? 10 : 0), hi = Math.ceil(Math.max(...vals) / st) * st;
    if (isF) layers.push({ t: 'h', y: 0, c: C.muted, w: 1 });
    layers.push({ t: 'line', p: q.slice(0, L).map((v, i) => [i + 1, v]), c: C.acc, w: 2.4 }, pts.length ? { t: 'dots', c: C.slate, r: 3, p: pts.map(([a, b]) => [a, b, false]) } : { t: 'dots', c: C.acc, p: q.slice(0, L).map((v, i) => [i + 1, v, raw[i] === null]) },
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

  window.WW = { fill, swapDfs, bridge, invBridge, schedule, model, conventions, runCase, scenarios, reshape, profiles, strip, figures, bind, ribbon, fmt,
                effective, yearsTo, parseDate, dateOrder, nsFit, reliability, coverage, RULE_IDS, NS_MIN, GRADE, TAIL_K, PRIOR_GUESS, DEFAULT_SIGMA,
                chart, ticks, drawStrip, drawSignature, drawProfile, drawCurve, drawCost, drawRunning, drawWaterfall };
})();
