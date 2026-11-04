/* WAL Wedge client templates — controller for borrowerView.html and borrowerViewExpanded.html.
   Builds the mode-specific sentences from the case figures (clientKit.js) and draws every exhibit
   present on the page. No figure is typed by hand: all come from WW.figures(WW_CASE). */
(function () {
  'use strict';
  const cs = window.WW_CASE, F = WW.figures(cs), c = F.common, $ = id => document.getElementById(id);
  const X = { float: cs.marginFloatBp, fixed: cs.marginFixedBp };
  const xNote = md => X[md] ? ` plus the agreed ${X[md] > 0 ? '+' : '−'}${Math.abs(X[md])}bp` : '';
  const xLab = md => `${X[md] > 0 ? '+' : '−'}${Math.abs(X[md])}bp`;
  const abs = s => s.replace(/^[+−]/, '');

  function texts(md) {
    const f = F[md], restate = cs.couponFreq !== 2;
    const shared = {
      payDesc: X[md] ? `the average-life price, your curve read at the average life of ${c.wal} years (${f.avgLife}), plus the agreed ${xLab(md)}: ${f.charged}`
                     : `the average-life price, your curve read at the average life of ${c.wal} years: ${f.charged}`,
      xSentence: X[md] ? `The agreed margin, ${xLab(md)}, is added to the average-life price, so it changes your benefit by ${f.xEffect}.` : '',
      benefitLab: X[md] ? `Your benefit, after the agreed ${xLab(md)}` : 'Your benefit',
    };
    if (md === 'float') return { ...shared,
      curveName: 'bond Z-spread curve (Bloomberg YAS)', curveShort: 'Z-spread', cardTitle: 'Floating rate · priced off your YAS Z-spread curve', rateChip: `${c.ref} + margin`,
      payLab: 'Margin you pay', fairLab: 'Bond-equivalent margin',
      pillar1: `Your ${c.longYear}-year Z-spread of ${f.yearQuote} averages years 1 to ${c.longYear}. Year ${c.longYear} on its own costs about ${f.yearCost}.`,
      interest: `${c.refLong} plus a fixed margin, paid semi-annually`,
      pricingRef: X[md] ? `The average-life price, your YAS Z-spread at ${c.wal} years (${f.avgLife}), plus the agreed ${xLab(md)}: ${f.charged}`
                        : `The average-life price: your YAS Z-spread at ${c.wal} years, ${f.charged}`,
      ex2Title: `Your Z-spread curve and its reading at ${c.wal} years`,
      ex2Cap: `Your YAS Z-spreads against the ${c.swapName}. Hollow points are maturities without a quote, filled by straight-line interpolation between the nearest quotes. Read at the loan's average life, the curve gives ${f.quote}.`,
      priceSentence: `The proposed margin is <b>${f.charged}</b> over ${c.ref}: your Z-spread at ${c.wal} years, which this document calls the <b>average-life price</b>${X[md] ? `, plus the agreed ${xLab(md)}` : ''}.`,
      convText: `<b>Quote-convention effect, ${f.convention}.</b> Small, and it would arise even for a single bullet bond. The average-life price reads your Z-spread, a spread added to discount rates, as if it were a loan margin, which is paid period by period and only while you perform. At ${c.wal} years that charges ${abs(f.convention)} ${f.convention.startsWith('−') ? 'more' : 'less'} than the reference bond is worth on your curve: it works ${f.convention.startsWith('−') ? 'against you' : 'in your favour'}, and it is already netted in the benefit.`,
      p1: `Your ${c.longYear}-year Z-spread of ${f.yearQuote} is the average cost of lending to you over all of years 1 to ${c.longYear}. Because your curve rises, the later years carry more of that cost: year ${c.longYear} on its own costs about <b>${f.yearCost}</b>, ${f.yearRatio} times the quote.`,
      ex3Cap: `Each bar is the margin your curve implies for one six-month period of the loan; the line is the margin you pay. Where a bar sits below the line you pay more than that period implies; where it sits above, you pay less. The bars step up and down because a limited number of quoted maturities is turned into a cost for each year; a fitted issuer curve gives a smoother profile.`,
      fairSentence: `Priced period by period at your own curve, this repayment profile costs <b>${f.fair}</b>. At ${f.charged}, you pay <b>${f.wedge} a year less</b>.`,
      impl2: `The margin is set at signing for the life of the loan. The benefit shown is measured on your curve at signing; later moves in ${c.ref} do not change it.`,
    };
    return { ...shared,
      curveName: 'bond yield curve (Bloomberg YAS)', curveShort: 'yield', cardTitle: 'Fixed rate · priced off your YAS yield curve', rateChip: 'fixed rate, semi-annual',
      payLab: 'Rate you pay', fairLab: 'Bond-equivalent rate',
      pillar1: `Your ${c.longYear}-year yield of ${f.yearQuote} averages years 1 to ${c.longYear}. Year ${c.longYear} on its own costs about ${f.yearCost}.`,
      interest: 'Fixed rate, paid semi-annually',
      pricingRef: restate ? `The average-life price: your bond yield at ${c.wal} years, ${f.quote} (${c.freq}), paid semi-annually as ${f.avgLife}${xNote(md)}${X[md] ? ': ' + f.charged : ''}`
                          : `The average-life price: your bond yield at ${c.wal} years, ${f.avgLife}${xNote(md)}${X[md] ? ': ' + f.charged : ''}`,
      ex2Title: `Your bond yield curve and its reading at ${c.wal} years`,
      ex2Cap: `Your YAS bond yields (${c.freq} compounding). Hollow points are maturities without a quote, filled by straight-line interpolation. The dashed line is the swap curve, for reference. Read at the loan's average life, the curve gives ${f.quote}.`,
      priceSentence: restate ? (X[md] ? `The proposed fixed rate is <b>${f.charged}</b> paid semi-annually: your <b>${f.quote}</b> ${c.freq} bond yield at ${c.wal} years restated semi-annually, ${f.avgLife}, which this document calls the <b>average-life price</b>, plus the agreed ${xLab(md)}.`
                                     : `The proposed fixed rate is <b>${f.charged}</b> paid semi-annually: the same yield as your <b>${f.quote}</b> ${c.freq} bond yield at ${c.wal} years, which this document calls the <b>average-life price</b>.`)
                             : `The proposed fixed rate is <b>${f.charged}</b>: your bond yield at ${c.wal} years, which this document calls the <b>average-life price</b>${X[md] ? `, plus the agreed ${xLab(md)}` : ''}.`,
      convText: `<b>Quote-convention effect, ${f.convention}.</b> Small, and it would arise even for a single bullet bond. Your yield at ${c.wal} years, restated semi-annually, sits ${abs(f.convention)} ${f.convention.startsWith('−') ? 'above' : 'below'} the reference bond. A yield is one blended rate for all of a bond's payments; the reference bond values each half-year at its own rate, from the swap curve and the credit costs implied by your bond yields. The gap works ${f.convention.startsWith('−') ? 'against you' : 'in your favour'}, and it is already netted in the benefit.`,
      p1: `Your ${c.longYear}-year bond yield of ${f.yearQuote}${restate ? ` (${f.yearQuoteSA} on the loan's semi-annual basis)` : ''} is the average cost of lending to you over all of years 1 to ${c.longYear}. Because your curve rises, the later years carry more of that cost: year ${c.longYear} on its own costs about <b>${f.yearCost}</b>, on the same semi-annual basis.`,
      ex3Cap: `Each bar is the fixed rate your curve implies for one six-month period, combining the risk-free forward rate and your credit cost; the line is the rate you pay. Where a bar sits below the line you pay more than that period implies; where it sits above, you pay less. The bars step up and down because a limited number of quoted maturities is turned into a cost for each year.`,
      fairSentence: `Priced period by period at your own curve, this repayment profile costs <b>${f.fair}</b> semi-annual (${f.fairAnnual} annual). At ${f.charged}, you pay <b>${f.wedge} a year less</b>.`,
      impl2: `The rate is fixed at signing for the life of the loan. The benefit shown is measured on your curve at signing; later moves in rates do not change it.`,
      rfSentence: `For the fixed rate the benefit splits into a credit effect, <b>${f.creditEffect}</b>, from your credit curve, and an interest-rate effect, <b>${f.rfEffect}</b>, which depends only on the shape of the swap curve: ${f.rfNeg ? `here it peaks at ${c.swapPeak} years and falls after, while the loan still has principal outstanding.` : `here it keeps rising over the loan's life, which adds to the benefit.`}`,
      rfMsg: `Fixed or floating, the core of the benefit comes from your credit curve, and it is the same for both. Of the fixed rate's timing effect of ${f.timing}, <b>${f.creditTiming}</b> comes from your credit curve, the same as the floating loan's timing effect, and ${f.rfTiming} from the swap curve. Over the loan's whole life the swap curve gives an interest-rate effect of <b>${f.rfEffect}</b>, which depends only on its shape. ${f.rfNeg ? `Here the swap curve peaks at ${c.swapPeak} years and falls after, so the loan's later years carry lower swap rates than the ${c.wal}-year rate in the price; on a swap curve that kept rising, the effect would add to the benefit.` : `Here the swap curve keeps rising over the loan's life, so the loan's later years carry higher swap rates than the ${c.wal}-year rate in the price, which adds to the benefit.`}`,
    };
  }

  function inputsList(md) {
    const L = [];
    const zk = Object.keys(cs.zspreadBp).map(Number), yk = Object.keys(cs.ytmPct).map(Number);
    if (md === 'float') L.push(`Your bond YAS Z-spreads at ${zk.length} maturities from ${Math.min(...zk)} to ${Math.max(...zk)} years, measured against the ${c.swapName}.`);
    else L.push(`Your bond YAS yields at ${yk.length} maturities from ${Math.min(...yk)} to ${Math.max(...yk)} years, ${c.freq} compounding.`);
    L.push(`The ${c.swapName}, 1 to 30 years, and the 6-month fixing of ${c.fixing}, from the same Bloomberg snapshot as the bond quotes.`);
    L.push(`Recovery rate of ${c.recovery}, the market convention for senior unsecured debt.`);
    L.push('Maturities without a quote are filled by straight-line interpolation between the nearest quotes.');
    return L.map(t => `<li>${t}</li>`).join('');
  }
  function notesList(md) {
    const L = [];
    if (+c.belowSwaps > 0) L.push(`Your curve trades below swaps at maturities up to ${c.belowSwaps} year${c.belowSwaps === '1' ? '' : 's'}. The analysis uses it as quoted, which treats those years as cheaper than swaps.`);
    if (md === 'fixed' && cs.couponFreq !== 2) L.push(`Your bond yields are ${c.freq}. The loan pays semi-annually, so its rate is the semi-annual rate with the same yield: ${F.fixed.quote} ${c.freq} is ${F.fixed.charged} semi-annual.`);
    L.push('Each quoted level is read as a bond trading at par for that maturity. For bonds far from par, a fitted issuer curve is the cleaner input.');
    L.push('The whole spread of your bonds over swaps is treated as the price of your credit, as the market prices it, including any liquidity component.');
    L.push('Bond issuance costs, any new-issue premium and the loan\'s own fees are excluded from the headline figures.');
    return L.map(t => `<li>${t}</li>`).join('');
  }

  function profileTable(md) {
    const el = $('pf-body'); if (!el) return;
    const P = WW.profiles(cs), isF = md === 'float', sym = c.sym;
    el.innerHTML = P.map((p, i) => { const r = p[md], wb = r.wedge * 1e4;
      return `<tr${i === 0 ? ' class="hl"' : ''}><td>${p.lab}${p.beyond ? ' *' : ''}</td><td>${WW.fmt.yrs(r.maturity)}y</td><td>${WW.fmt.yrs(r.WAL)}y</td>` +
        `<td>${isF ? WW.fmt.bp(r.charged * 1e4, 1) : WW.fmt.pct(r.charged)}</td><td class="${wb >= 0 ? 'pos' : 'neg'}">${WW.fmt.bp(wb)}</td><td class="${wb >= 0 ? 'pos' : 'neg'}">${WW.fmt.money(r.pv * cs.amount, sym)}</td></tr>`; }).join('');
    const note = $('pf-note'); if (note) note.hidden = !P.some(p => p.beyond);
  }
  function prepayTable() {
    const el = $('pp-body'); if (!el) return;
    const at = (md, t) => { const r = F.R[md].run; let v = 0; for (const [tt, vv] of r) if (tt <= t + 1e-9) v = vv; return v * cs.amount; };
    const mat = F.R.float.maturity; const ys = [5, 10, 15, 20].filter(y => y < mat).concat([mat]);
    el.innerHTML = ys.map(y => `<tr${y === mat ? ' class="hl"' : ''}><td>${y === mat ? 'Held to maturity (year ' + c.maturity + ')' : 'Repaid at the end of year ' + y}</td>` +
      ['float', 'fixed'].map(md => { const v = at(md, y); return `<td class="${v >= 0 ? 'pos' : 'neg'}">${WW.fmt.money(v, c.sym)}</td>`; }).join('') + '</tr>').join('');
  }
  function slopeChart() {
    const el = $('c-slope'); if (!el) return;
    const wal = F.R.float.WAL, fs = []; for (let f = -1; f <= 2.0001; f += 0.25) fs.push(+f.toFixed(2));
    const pts = { float: [], fixed: [] };
    fs.forEach(f => { const r = WW.runCase(Object.assign({}, cs, { zspreadBp: WW.reshape(cs.zspreadBp, f, wal), ytmPct: WW.reshape(cs.ytmPct, f, wal) }));
      pts.float.push([f, r.float.wedge * 1e4]); pts.fixed.push([f, r.fixed.wedge * 1e4]); });
    const all = pts.float.concat(pts.fixed).map(p => p[1]), lo = Math.floor(Math.min(...all) / 5) * 5, hi = Math.ceil(Math.max(...all) / 5) * 5;
    WW.chart(el, { label: 'Benefit against the steepness of your curve', h: 280, x: { min: -1.1, max: 2.1, ticks: [-1, 0, 0.5, 1, 2], fmt: v => v === 1 ? 'today' : v === 0 ? 'flat' : v === -1 ? 'inverted' : '×' + v, label: 'Steepness of your curve around the average life (today = 1)' },
      y: { min: lo, max: hi, ticks: WW.ticks(lo, hi, 5), fmt: v => v + 'bp' },
      layers: [{ t: 'h', y: 0, c: 'var(--muted)', w: 1 }, { t: 'v', x: 1, c: 'var(--ink)' },
        { t: 'line', p: pts.float, c: 'var(--accent)', w: 2.4 }, { t: 'dots', c: 'var(--accent)', p: pts.float.filter(p => [-1, 0, .5, 1, 2].includes(p[0])).map(p => [p[0], p[1], false]) },
        { t: 'line', p: pts.fixed, c: 'var(--slate)', w: 2.4, dash: '6 4' }, { t: 'dots', c: 'var(--slate)', p: pts.fixed.filter(p => [-1, 0, .5, 1, 2].includes(p[0])).map(p => [p[0], p[1], true]) }] });
  }

  function setAudience(aud) {
    ['sovereign', 'corporate'].forEach(k => { const b = $('a-' + k); if (b) b.setAttribute('aria-pressed', k === aud ? 'true' : 'false'); });
    document.querySelectorAll('[data-borrower]').forEach(el => { el.hidden = el.dataset.borrower !== aud; });
    try { if (cs.showAudienceToggle !== false) localStorage.setItem('ww-client-aud', aud); } catch (e) {}
  }
  function setMode(md) {
    ['float', 'fixed'].forEach(k => { const b = $('m-' + k); if (b) b.setAttribute('aria-pressed', k === md ? 'true' : 'false'); });
    Object.assign(F.common, texts(md));
    WW.bind(F, md);
    const il = $('inputs-list'); if (il) il.innerHTML = inputsList(md);
    const nl = $('notes-list'); if (nl) nl.innerHTML = notesList(md);
    [['c-curve', WW.drawCurve], ['c-cost', WW.drawCost], ['c-run', WW.drawRunning], ['c-wf', WW.drawWaterfall]].forEach(([id, fn]) => { const el = $(id); if (el) fn(el, F, md); });
    const sg = $('c-sig'); if (sg) WW.drawSignature(sg, F, md);
    const sp = $('c-strip'); if (sp) WW.drawStrip(sp, F, md, { compact: !!sp.dataset.compact });
    profileTable(md);
    document.querySelectorAll('[data-xrow]').forEach(el => { el.hidden = !X[md]; });
    try { localStorage.setItem('ww-client-mode', md); } catch (e) {}
  }
  WW.ribbon(F);
  const prof = $('c-profile'); if (prof) WW.drawProfile(prof, F);
  prepayTable(); slopeChart();
  ['float', 'fixed'].forEach(k => { const b = $('m-' + k); if (b) b.addEventListener('click', () => setMode(k)); });
  let start = 'float'; try { if (localStorage.getItem('ww-client-mode') === 'fixed') start = 'fixed'; } catch (e) {}
  setMode(start);
  const audBar = $('aud-tog'), caseAud = cs.borrowerType === 'corporate' ? 'corporate' : 'sovereign';
  let aud = caseAud;
  if (cs.showAudienceToggle === false) { if (audBar) audBar.hidden = true; }
  else {
    try { const a = localStorage.getItem('ww-client-aud'); if (a === 'sovereign' || a === 'corporate') aud = a; } catch (e) {}
    ['sovereign', 'corporate'].forEach(k => { const b = $('a-' + k); if (b) b.addEventListener('click', () => setAudience(k)); });
  }
  setAudience(aud);
  window.WW_F = F;
})();
