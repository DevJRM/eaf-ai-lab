/* WAL Wedge decks — builds the client pitch and the teaser as PowerPoint files from the case file.
   Every figure, table and chart comes from the same engine as the web pages (clientCase.js + clientKit.js),
   so the decks always match borrowerPitch.html and walWedgePitch.html. Speaker notes carry the Meeting
   Playbook's answers.

   Usage:  node buildDecks.js [--rate fixed|float] [--aud sovereign|corporate]
   Output: WAL_Wedge_Pitch_<rate>_<aud>.pptx and WAL_Wedge_Teaser_<rate>.pptx in this folder, and decks.json listing
           the decks present (the download buttons of borrowerPitch.html and walWedgePitch.html read it).
   Needs:  pptxgenjs (npm install pptxgenjs), and the pptx skill's apply_theme.js for theme colours. */
'use strict';
const path = require('path');
const pptxgen = require('pptxgenjs');
const arg = k => { const i = process.argv.indexOf('--' + k); return i > 0 ? process.argv[i + 1] : null; };
const RATE = arg('rate') || 'fixed', AUD = arg('aud') || 'sovereign', OUT = arg('out') || __dirname;
const APPLY_THEME = process.env.APPLY_THEME || null;   // path to the pptx skill's scripts/apply_theme.js

global.window = global;
require(path.join(__dirname, '..', 'clientCase.js'));
require(path.join(__dirname, '..', 'clientKit.js'));
const cs = global.WW_CASE, F = WW.figures(cs), c = F.common, f = F[RATE], r = F.R[RATE], fmt = WW.fmt;
delete global.window;   // the client scripts need a window; pptxgenjs must not see one, or it tries to save through a browser
const isF = RATE === 'float', SOV = AUD !== 'corporate';

/* ---------- palette and theme (the Tool Set's client palette) ---------- */
const HEX = { deep: '5A0E1C', accent: '800020', ink: '26151A', muted: '6F5B60', rule: 'E4D7D7', soft: 'F2E9E8', accentSoft: 'F6E3E7',
  slate: '5F6F83', slateSoft: 'E6EAF0', brass: 'A86A12', gain: '0E7F56', gainSoft: 'DCF2E8', white: 'FFFFFF' };
const THEME = { name: 'WAL Wedge', headFontFace: 'Cambria', bodyFontFace: 'Calibri',
  colors: { dk1: HEX.ink, lt1: HEX.white, dk2: HEX.muted, lt2: HEX.soft, accent1: HEX.accent, accent2: HEX.slate,
    accent3: HEX.brass, accent4: HEX.gain, accent5: HEX.accentSoft, accent6: HEX.slateSoft, hlink: HEX.accent, folHlink: HEX.muted } };

/* ---------- wording shared by both decks ---------- */
const unitLong = isF ? 'margin' : 'rate';
const rateName = isF ? `${c.ref} + margin` : 'fixed rate, paid semi-annually';
const payLab = isF ? 'Margin you pay' : 'Rate you pay', fairLab = isF ? 'Bond-equivalent margin' : 'Bond-equivalent rate';
const curveName = isF ? 'YAS Z-spread curve' : 'YAS yield curve';
const footer = (cs.illustrative ? 'Illustrative template: simulated market data, not an indication of terms. ' : '') + 'Indicative, for discussion only.';
const restate = cs.couponFreq !== 2;

/* ---------- deck scaffolding ---------- */
const W = 13.333, H = 7.5, MX = 0.6;
function newDeck(title) {
  const pres = new pptxgen();
  pres.layout = 'LAYOUT_WIDE'; pres.title = title; pres.author = 'WAL Wedge Tool Set'; pres.company = 'EAF AI Lab';
  pres.theme = { headFontFace: THEME.headFontFace, bodyFontFace: THEME.bodyFontFace };
  const C = pres.SchemeColor;
  pres.defineSlideMaster({ title: 'WW_TITLE', background: { color: HEX.deep },
    objects: [
      { placeholder: { options: { name: 'eyebrow', type: 'body', x: MX, y: 1.55, w: 11.5, h: 0.4, fontSize: 13, bold: true, color: HEX.accentSoft, charSpacing: 2, margin: 0 }, text: '' } },
      { placeholder: { options: { name: 'title', type: 'title', x: MX, y: 2.05, w: 11.6, h: 1.9, fontSize: 44, bold: true, color: HEX.white, valign: 'top', align: 'left', margin: 0 }, text: '' } },
      { placeholder: { options: { name: 'sub', type: 'body', x: MX, y: 4.15, w: 11.0, h: 0.6, fontSize: 18, color: HEX.white, margin: 0 }, text: '' } },
      { placeholder: { options: { name: 'meta', type: 'body', x: MX, y: 4.85, w: 11.0, h: 0.8, fontSize: 14, color: HEX.accentSoft, margin: 0 }, text: '' } },
      { text: { text: footer, options: { x: MX, y: 6.85, w: 12.1, h: 0.35, fontSize: 10, color: HEX.accentSoft, margin: 0 } } },
    ] });
  pres.defineSlideMaster({ title: 'WW_DIVIDER', background: { color: HEX.deep },
    objects: [
      { placeholder: { options: { name: 'eyebrow', type: 'body', x: MX, y: 2.4, w: 11.5, h: 0.4, fontSize: 13, bold: true, color: HEX.accentSoft, charSpacing: 2, margin: 0 }, text: '' } },
      { placeholder: { options: { name: 'title', type: 'title', x: MX, y: 2.9, w: 11.6, h: 1.9, fontSize: 44, bold: true, color: HEX.white, valign: 'top', align: 'left', margin: 0 }, text: '' } },
      { text: { text: footer, options: { x: MX, y: 6.85, w: 12.1, h: 0.35, fontSize: 10, color: HEX.accentSoft, margin: 0 } } },
    ] });
  pres.defineSlideMaster({ title: 'WW_CONTENT', background: { color: HEX.white },
    objects: [
      { placeholder: { options: { name: 'eyebrow', type: 'body', x: MX, y: 0.38, w: 11.0, h: 0.32, fontSize: 12, bold: true, color: HEX.accent, charSpacing: 2, margin: 0 }, text: '' } },
      { placeholder: { options: { name: 'title', type: 'title', x: MX, y: 0.72, w: 12.1, h: 0.75, fontSize: 28, bold: true, color: HEX.ink, valign: 'top', align: 'left', margin: 0 }, text: '' } },
      { text: { text: footer, options: { x: MX, y: 7.05, w: 10.5, h: 0.3, fontSize: 10, color: HEX.muted, margin: 0 } } },
    ],
    slideNumber: { x: 12.25, y: 7.05, w: 0.5, h: 0.3, fontSize: 10, color: HEX.muted, align: 'right' } });
  return { pres, C };
}
let OBJ = 0; const nm = s => `${s}-${++OBJ}`;
const T = (o) => Object.assign({ isTextBox: true, margin: 0, color: HEX.ink, fontSize: 14, valign: 'top' }, o);

// chart frame shared by every chart: quiet axes and grid, the theme body font
const chartFrame = (o = {}) => Object.assign({
  catAxisLabelColor: HEX.muted, valAxisLabelColor: HEX.muted, catAxisLabelFontSize: 10, valAxisLabelFontSize: 10,
  catAxisLabelFontFace: '+mn-lt', valAxisLabelFontFace: '+mn-lt', catAxisTitleFontFace: '+mn-lt', valAxisTitleFontFace: '+mn-lt', valGridLine: { color: HEX.rule, size: 0.75 }, catGridLine: { style: 'none' },
  catAxisLineColor: HEX.rule, valAxisLineShow: false, showLegend: false, legendFontFace: '+mn-lt', legendFontSize: 11, legendColor: HEX.muted,
  showTitle: true, titleFontFace: '+mn-lt', titleFontSize: 12, titleColor: HEX.ink, titleBold: true }, o);
const pctFmt = isF ? '0"bp"' : '0.00%';
const val = v => isF ? v * 1e4 : v;                     // chart values: bp for the floating loan, a fraction (shown as %) for the fixed one

/* ---------- reusable slide pieces ---------- */
function statCard(slide, C, x, y, w, h, label, value, opt = {}) {
  slide.addShape('roundRect', { x, y, w, h, rectRadius: 0.08, fill: { color: opt.fill || C.background2 }, line: { color: opt.fill || C.background2 }, objectName: nm('card') });
  if (opt.row) {   // compact: label on the left, figure on the right
    slide.addText(label, T({ x: x + 0.22, y, w: w * 0.5, h, fontSize: 13, color: opt.labCol || C.text2, valign: 'middle', objectName: nm('card-label') }));
    slide.addText(value, T({ x: x + w * 0.45, y, w: w * 0.55 - 0.22, h, fontSize: opt.size || 20, bold: true, fontFace: 'Cambria', align: 'right', valign: 'middle', color: opt.valCol || C.text1, objectName: nm('card-value') }));
    return;
  }
  slide.addText(label, T({ x: x + 0.22, y: y + 0.2, w: w - 0.44, h: 0.35, fontSize: 13, color: opt.labCol || C.text2, objectName: nm('card-label') }));
  slide.addText(value, T({ x: x + 0.22, y: y + 0.55, w: w - 0.44, h: h - 0.7, fontSize: opt.size || 30, bold: true, fontFace: 'Cambria', color: opt.valCol || C.text1, objectName: nm('card-value') }));
}
function table(slide, rows, o) {
  const head = rows[0].map(t => ({ text: t, options: { bold: true, color: HEX.muted, fontSize: 11, fill: { color: HEX.white }, border: [{ type: 'none' }, { type: 'none' }, { type: 'solid', pt: 1, color: HEX.rule }, { type: 'none' }] } }));
  const body = rows.slice(1).map((r, i) => r.map((t, j) => {
    const cell = typeof t === 'object' ? t : { text: t };
    return { text: cell.text, options: Object.assign({ fontSize: o.fontSize || 13, color: HEX.ink,
      fill: { color: cell.hl ? HEX.accentSoft : HEX.white }, bold: !!cell.hl, align: o.left || j === 0 ? 'left' : 'right',
      border: [{ type: 'none' }, { type: 'none' }, { type: 'solid', pt: 0.75, color: HEX.rule }, { type: 'none' }] }, cell.o || {}) };
  }));
  head.forEach((h, j) => { h.options.align = o.left || j === 0 ? 'left' : 'right'; });
  delete o.left;
  slide.addTable([head].concat(body), Object.assign({ fontFace: 'Calibri', margin: [0.04, 0.08, 0.04, 0.08], valign: 'middle', objectName: nm('table') }, o));
}
const bullets = items => items.map((t, i) => (typeof t === 'string' ? { text: t, options: { bullet: { indent: 16 }, breakLine: i < items.length - 1, paraSpaceAfter: 8 } }
  : { text: t.text, options: Object.assign({ bullet: { indent: 16 }, breakLine: i < items.length - 1, paraSpaceAfter: 8 }, t.o || {}) }));
const runs = parts => parts.map(p => typeof p === 'string' ? { text: p } : p);   // [{text, options:{bold}}]

/* ---------- data for the charts ---------- */
const per = r.per.filter(e => e.O > 0), N = cs.amount, mat = r.maturity;
const strip = WW.strip(r, cs);
const prepay = (() => { const at = t => { let v = 0; for (const [tt, vv] of r.run) if (tt <= t + 1e-9) v = vv; return v * N; };
  return [5, 10, 15, 20].filter(y => y < mat).map(y => [`Repaid at the end of year ${y}`, fmt.money(at(y), c.sym)]).concat([[{ text: `Held to maturity (year ${c.maturity})`, hl: true }, { text: f.pv, hl: true }]]); })();
const profiles = WW.profiles(cs);
const slope = (() => { const out = []; for (let k = -1; k <= 2.0001; k += 0.25) { const g = +k.toFixed(2);
  const rr = WW.runCase(Object.assign({}, cs, { zspreadBp: WW.reshape(cs.zspreadBp, g, r.WAL), ytmPct: WW.reshape(cs.ytmPct, g, r.WAL) }))[RATE]; out.push([g, rr.wedge * 1e4]); } return out; })();

function chartMiniBonds(slide, x, y, w, h, title) {
  const labels = strip.map(m => fmt.yrs(m.T)), pay = r.charged;
  const more = strip.map(m => m.p <= pay ? val(m.p) : 0), less = strip.map(m => m.p > pay ? val(m.p) : 0);
  slide.addChart([
    { type: 'bar', data: [{ name: 'Charged more than its own bond price', labels, values: more }, { name: 'Charged less than its own bond price', labels, values: less }],
      options: { barGrouping: 'stacked', chartColors: [HEX.slate, HEX.accent], barGapWidthPct: 35 } },
    { type: 'line', data: [{ name: payLab, labels, values: strip.map(() => val(pay)) }], options: { chartColors: [HEX.ink], lineSize: 2, lineDataSymbol: 'none' } },
  ], chartFrame({ x, y, w, h, title, showLegend: true, legendPos: 'b', valAxisLabelFormatCode: pctFmt, catAxisLabelFrequency: 4,
    valAxisMinVal: isF ? undefined : Math.floor(Math.min(...strip.map(m => m.p)) * 400) / 400, catAxisTitle: 'Maturity of each mini-bond, years', showCatAxisTitle: true,
    catAxisTitleFontSize: 10, catAxisTitleColor: HEX.muted, objectName: nm('chart-minibonds') }));
}
function chartProfileBars(slide, x, y, w, h) {
  // Half-yearly bars for the loan, a line for the bond (the pitch's version).
  const labels = per.map(e => fmt.yrs(e.t));
  slide.addChart([
    { type: 'bar', data: [{ name: 'Loan balance outstanding', labels, values: per.map(e => e.O * N / 1e6) }], options: { chartColors: [HEX.accent], barGapWidthPct: 25 } },
    { type: 'line', data: [{ name: `${c.wal}-year bond of the same amount`, labels, values: per.map(e => e.t <= r.WAL + 1e-9 ? N / 1e6 : 0) }], options: { chartColors: [HEX.brass], lineSize: 2, lineDataSymbol: 'none' } },
  ], chartFrame({ x, y, w, h, title: `Loan balance against a ${c.wal}-year bond, ${c.sym} m`, showLegend: true, legendPos: 'b', valAxisLabelFormatCode: '#,##0', catAxisLabelFrequency: 4, objectName: nm('chart-profile') }));
}
function chartRedemptions(slide, x, y, w, h) {
  const years = Array.from({ length: Math.ceil(mat) }, (_, i) => i + 1), inst = N / Math.round(2 * cs.repaymentYears) / 1e6;
  const loan = years.map(Y => { let v = 0; for (let k = 1; k <= Math.round(2 * cs.repaymentYears); k++) { const t = cs.drawdownYears + k / 2; if (t > Y - 1 + 1e-9 && t <= Y + 1e-9) v += inst; } return v; });
  const bond = years.map(Y => (r.WAL > Y - 1 + 1e-9 && r.WAL <= Y + 1e-9) ? N / 1e6 : 0);
  slide.addChart('bar', [{ name: 'This loan', labels: years.map(String), values: loan }, { name: `${c.wal}-year bond`, labels: years.map(String), values: bond }],
    chartFrame({ x, y, w, h, title: `Redemptions per year, ${c.sym} m: about ${Math.round(2 * inst)} a year for this loan, ${(N / 1e6).toLocaleString('en-GB')} at once for the bond`, barGrouping: 'clustered', chartColors: [HEX.accent, HEX.brass],
      barGapWidthPct: 40, showLegend: true, legendPos: 'b', valAxisLabelFormatCode: '#,##0', catAxisLabelFrequency: 2, objectName: nm('chart-redemptions') }));
}
function chartCurve(slide, x, y, w, h) {
  const yrs = Array.from({ length: 30 }, (_, i) => String(i + 1)), q = r.qfill.slice(0, 30), sw = WW.fill(F.R.inputs.s).out.slice(0, 30);
  const data = isF ? [{ name: 'Your YAS Z-spread', labels: yrs, values: q.map(v => v * 1e4) }]
                   : [{ name: 'Your YAS bond yield (annual)', labels: yrs, values: q }, { name: 'Swap curve', labels: yrs, values: sw }];
  slide.addChart('line', data, chartFrame({ x, y, w, h, title: isF ? 'Your Z-spread curve, by maturity' : 'Your bond yield curve and the swap curve, by maturity',
    chartColors: isF ? [HEX.accent] : [HEX.accent, HEX.slate], lineSize: 2.25, lineDataSymbol: 'none', showLegend: !isF, legendPos: 'b',
    valAxisLabelFormatCode: isF ? '0"bp"' : '0.00%', catAxisLabelFrequency: 2, valAxisMinVal: isF ? undefined : Math.floor(Math.min(...q, ...sw) * 200) / 200, objectName: nm('chart-curve') }));
}
function chartCost(slide, x, y, w, h) {
  const labels = per.map(e => fmt.yrs(e.t)), pay = r.charged;
  slide.addChart([
    { type: 'bar', data: [{ name: 'Period cheaper than your price (you pay more)', labels, values: per.map(e => e.k <= pay ? val(e.k) : 0) },
      { name: 'Period dearer than your price (you pay less)', labels, values: per.map(e => e.k > pay ? val(e.k) : 0) }],
      options: { barGrouping: 'stacked', chartColors: [HEX.slate, HEX.accent], barGapWidthPct: 25 } },
    { type: 'line', data: [{ name: payLab, labels, values: per.map(() => val(pay)) }], options: { chartColors: [HEX.ink], lineSize: 2, lineDataSymbol: 'none' } },
  ], chartFrame({ x, y, w, h, title: `What your curve implies for each six-month period, against the ${unitLong} you pay`, showLegend: true, legendPos: 'b',
    valAxisLabelFormatCode: pctFmt, valAxisMinVal: isF ? undefined : Math.floor(Math.min(...per.map(e => e.k)) * 400) / 400, catAxisLabelFrequency: 4, objectName: nm('chart-cost') }));
}
function chartRunning(slide, x, y, w, h) {
  const pts = r.run.filter(([t]) => t <= mat + 1e-9);
  slide.addChart('line', [{ name: 'Running present value of the benefit', labels: pts.map(p => fmt.yrs(p[0])), values: pts.map(p => p[1] * N / 1e6) }],
    chartFrame({ x, y, w, h, title: `Running present value of the benefit, ${c.sym} m`, chartColors: [HEX.accent], lineSize: 2.5, lineDataSymbol: 'none',
      valAxisLabelFormatCode: '#,##0;−#,##0', catAxisLabelFrequency: 4, objectName: nm('chart-running') }));
}
function chartWaterfall(slide, x, y, w, h) {
  const labels = [`Signing to year ${c.wal}`, `Year ${c.wal} to ${c.maturity}`, 'Net benefit'], a = r.pvBefore * N / 1e6, b = r.pvAfter * N / 1e6, n = r.pv * N / 1e6;
  slide.addChart('bar', [{ name: 'Early periods', labels, values: [a, 0, 0] }, { name: 'Later periods', labels, values: [0, b, 0] }, { name: 'Net', labels, values: [0, 0, n] }],
    chartFrame({ x, y, w, h, title: `Benefit to you, present value, ${c.sym} m`, barGrouping: 'stacked', chartColors: [HEX.slate, HEX.accent, HEX.ink], barGapWidthPct: 60,
      showValue: true, dataLabelPosition: 'inEnd', dataLabelFormatCode: '#,##0.0;−#,##0.0;;', dataLabelColor: HEX.white, dataLabelFontSize: 12, dataLabelFontFace: '+mn-lt',
      valAxisLabelFormatCode: '#,##0;−#,##0', catAxisLabelFontSize: 11, objectName: nm('chart-waterfall') }));
}
function chartSlope(slide, x, y, w, h) {
  const labels = slope.map(([g]) => g === 1 ? 'today' : g === 0 ? 'flat' : g === -1 ? 'inverted' : (g === 2 ? '×2' : g === 0.5 ? '×0.5' : ''));
  slide.addChart('line', [{ name: 'Benefit, bp a year', labels, values: slope.map(p => p[1]) }],
    chartFrame({ x, y, w, h, title: 'Benefit against the steepness of your curve (today = 1)', chartColors: [HEX.accent], lineSize: 2.5, lineDataSymbol: 'circle', lineDataSymbolSize: 7,
      valAxisLabelFormatCode: '0"bp"', objectName: nm('chart-slope') }));
}

/* ---------- the three-price diagram (section 4), drawn with shapes ---------- */
function threePrices(slide, C, x0, y0, w) {
  const gap = 0.25, bw = (w - 2 * gap) / 3, bh = 1.3, cx = i => x0 + i * (bw + gap) + bw / 2;
  const boxes = [['Bond-equivalent price', 'this loan, valued period by period', f.fair, C.text1],
    ['Reference bond', `a ${c.wal}-year bullet, valued the same way`, f.bullet, C.accent2],
    ['Average-life price', `your curve read at ${c.wal} years`, f.avgLife, C.accent1]];
  boxes.forEach(([k, d, v, top], i) => {
    const x = x0 + i * (bw + gap);
    slide.addShape('roundRect', { x, y: y0, w: bw, h: bh, rectRadius: 0.06, fill: { color: C.background1 }, line: { color: top, width: 2 }, objectName: nm('price-box') });
    slide.addText(k, T({ x: x + 0.2, y: y0 + 0.15, w: bw - 0.4, h: 0.35, fontSize: 15, bold: true, objectName: nm('price-name') }));
    slide.addText(d, T({ x: x + 0.2, y: y0 + 0.5, w: bw - 0.4, h: 0.4, fontSize: 12, color: C.text2, objectName: nm('price-desc') }));
    slide.addText(v, T({ x: x + 0.2, y: y0 + 0.82, w: bw - 0.4, h: 0.42, fontSize: 24, bold: true, fontFace: 'Cambria', objectName: nm('price-value') }));
  });
  const bracket = (xa, xb, y, col, lab, sub, value) => {
    slide.addShape('line', { x: xa, y, w: 0, h: 0.16, line: { color: col, width: 2 }, objectName: nm('bracket') });
    slide.addShape('line', { x: xb, y, w: 0, h: 0.16, line: { color: col, width: 2 }, objectName: nm('bracket') });
    slide.addShape('line', { x: xa, y: y + 0.16, w: xb - xa, h: 0, line: { color: col, width: 2 }, objectName: nm('bracket') });
    slide.addText(runs([{ text: `${lab}: `, options: { bold: true } }, { text: value, options: { bold: true, color: col } }]),
      T({ x: xa - 0.3, y: y + 0.24, w: xb - xa + 0.6, h: 0.34, fontSize: 15, align: 'center', objectName: nm('bracket-label') }));
    if (sub) slide.addText(sub, T({ x: xa - 0.3, y: y + 0.56, w: xb - xa + 0.6, h: 0.28, fontSize: 12, align: 'center', color: HEX.muted, objectName: nm('bracket-sub') }));
  };
  const yb = y0 + bh + 0.1;
  bracket(cx(0), cx(1) - 0.06, yb, C.accent1, 'Timing effect', 'only the profile differs', f.timing);
  bracket(cx(1) + 0.06, cx(2), yb, C.accent2, 'Quote-convention effect', 'only the valuation differs', f.convention);
  bracket(cx(0), cx(2), yb + 0.98, C.text1, 'Your benefit', '', f.wedgeP);
}

/* =====================================================================================
   THE PITCH
   ===================================================================================== */
function buildPitch() {
  const { pres, C } = newDeck('WAL Wedge — Client pitch');
  let s;
  const content = (sec, eyebrow, title) => { const sl = pres.addSlide({ masterName: 'WW_CONTENT', sectionTitle: sec });
    sl.addText(eyebrow.toUpperCase(), { placeholder: 'eyebrow' }); sl.addText(title, { placeholder: 'title' }); return sl; };

  pres.addSection({ title: 'The proposal' });
  // 1 · title
  s = pres.addSlide({ masterName: 'WW_TITLE', sectionTitle: 'The proposal' });
  s.addText('FOR DISCUSSION · INDICATIVE', { placeholder: 'eyebrow' });
  s.addText(`A ${c.maturity}-year amortising loan\nat your ${c.wal}-year price`, { placeholder: 'title' });
  s.addText(`${isF ? 'Floating' : 'Fixed'} rate · ${c.amount} · priced off your Bloomberg ${curveName}`, { placeholder: 'sub' });
  s.addText(`Prepared for ${c.client} · Market data as of ${c.asOf}${c.dataNote}`, { placeholder: 'meta' });
  s.addNotes(`Open with the proposition in one sentence: an amortising loan priced where your own ${c.wal}-year bond is quoted, although it repays over ${c.maturity} years. Against funding the same repayment profile through your own bonds, that price is worth ${f.wedge} a year on a ${isF ? 'floating' : 'fixed'}-rate loan, ${f.pv} in today's money. Avoid calling it a discount, or a saving the borrower is promised.`);

  // 2 · the answer
  s = content('The proposal', 'The answer', `${f.wedgeP} a year below the price your own curve implies`);
  s.addText(`Priced where your own ${c.wal}-year bond is quoted, but repaid over ${c.maturity} years. Measured against funding the same repayment profile through your own bonds, one maturing on each repayment date, that price works in your favour.`,
    T({ x: MX, y: 1.6, w: 12.1, h: 0.8, fontSize: 16, objectName: nm('lead') }));
  const cw = (12.1 - 3 * 0.3) / 4;
  [[payLab, f.charged], [fairLab, f.fair], ['Value today', f.pv], ['Equivalent upfront fee', f.fee]].forEach(([l, v], i) =>
    statCard(s, C, MX + i * (cw + 0.3), 2.65, cw, 1.45, l, v, i === 2 ? { fill: HEX.gainSoft, valCol: C.accent4 } : {}));
  s.addShape('roundRect', { x: MX, y: 4.45, w: 12.1, h: 1.9, rectRadius: 0.06, fill: { color: C.background2 }, line: { color: C.background2 }, objectName: nm('panel') });
  s.addText('It depends on', T({ x: MX + 0.3, y: 4.65, w: 4, h: 0.35, fontSize: 13, bold: true, color: C.accent1, objectName: nm('dep-label') }));
  s.addText(bullets([`A rising curve: the benefit scales with its slope, and disappears on a flat curve`,
    `Holding the loan: in present value the benefit turns positive from about year ${f.breakEven}`,
    `Fees, excluded on both sides: the loan's own, and the bond route's issuance costs`]), T({ x: MX + 0.3, y: 5.05, w: 11.5, h: 1.2, fontSize: 15, objectName: nm('dep-list') }));
  s.addNotes(`The headline: ${f.wedge} a year below the ${fairLab.toLowerCase()}, ${f.pv} in present value, the same as an upfront fee of ${f.fee}. Say early that the benefit is back-loaded and needs a rising curve: that builds trust. Lead with present value and bp a year; the undiscounted total (${f.nominal}) only for reference.`);

  // 3 · the loan
  s = content('The proposal', '1 · The proposed loan', `${c.amount}, amortising over ${c.maturity} years`);
  table(s, [['The loan', ''], ['Amount', c.amountFull], ['Drawdown', c.drawdown], ['Repayment', c.repayment], ['Final maturity', `${c.maturity} years`]],
    { x: MX, y: 1.6, w: 5.9, colW: [1.5, 4.4], fontSize: 12, left: true });
  table(s, [['Life and price', ''], ['Average life', `${c.wal} years, for each euro from drawing to repayment`], ['Interest', isF ? `${c.refLong} plus a fixed margin, paid semi-annually` : 'Fixed rate, paid semi-annually'],
    ['Pricing reference', isF ? `The average-life price: your YAS Z-spread at ${c.wal} years, ${f.charged}` : `The average-life price: your bond yield at ${c.wal} years, ${f.quote}${restate ? ` (${c.freq}), paid semi-annually as ${f.avgLife}` : ''}`]],
    { x: 6.8, y: 1.6, w: 5.9, colW: [1.5, 4.4], fontSize: 12, left: true });
  chartProfileBars(s, MX, 3.3, 12.1, 3.3);
  s.addText(`Equal areas: the same principal-years. The loan keeps part of its balance outstanding for ${c.tailYears} years after the bond would have been repaid.`,
    T({ x: MX, y: 6.62, w: 12.1, h: 0.3, fontSize: 11, color: C.text2, objectName: nm('caption') }));
  s.addNotes(`The average life is the average time each euro is outstanding, from its drawing to its repayment: ${c.wal} years here, the same as a ${c.wal}-year bond. Both carry the same principal-years. What differs is when: the loan's principal is outstanding, on average, at year ${c.cg}, the bond's at year ${c.bondCg}.`);

  // 4 · how the price is set
  s = content('The proposal', '2 · How the price is set', "Your own curve, read at the loan's average life");
  chartCurve(s, MX, 1.55, 7.6, 5.3);
  s.addShape('roundRect', { x: 8.55, y: 1.65, w: 4.15, h: 5.1, rectRadius: 0.06, fill: { color: C.background2 }, line: { color: C.background2 }, objectName: nm('panel') });
  s.addText(isF ? 'The proposed margin' : 'The proposed fixed rate', T({ x: 8.85, y: 1.9, w: 3.6, h: 0.35, fontSize: 13, bold: true, color: C.accent1, objectName: nm('panel-label') }));
  s.addText(f.charged, T({ x: 8.85, y: 2.3, w: 3.6, h: 0.8, fontSize: 40, bold: true, fontFace: 'Cambria', objectName: nm('panel-value') }));
  s.addText(isF ? `over ${c.ref}: your Z-spread at ${c.wal} years` : restate ? `paid semi-annually: the same yield as your ${f.quote} ${c.freq} bond yield at ${c.wal} years` : `your bond yield at ${c.wal} years`,
    T({ x: 8.85, y: 3.15, w: 3.6, h: 0.9, fontSize: 14, objectName: nm('panel-text') }));
  s.addText(runs([{ text: 'This reading is the ', options: {} }, { text: 'average-life price', options: { bold: true } },
    { text: '. Reading your bond curve at the loan\'s average life is a widely used way to price an amortising loan off observable bond levels: simple, transparent, and verifiable on your own screen.' }]),
    T({ x: 8.85, y: 4.2, w: 3.6, h: 2.3, fontSize: 14, objectName: nm('panel-text') }));
  s.addNotes(isF ? `The margin is your YAS Z-spread read at ${c.wal} years. It is the average-life price: a widely used, transparent convention.`
    : `Your ${c.wal}-year yield is ${f.quote}, quoted annually. The loan pays twice a year, so the same yield is ${f.avgLife} paid semi-annually: not a discount, the same yield paid differently. Charging the annual figure semi-annually would overcharge the borrower.`);

  // 5 · the mini-bond strip
  s = content('The proposal', '3 · What the price compares with', `Your loan is a strip of ${f.miniN} mini-bonds`);
  chartMiniBonds(s, MX, 1.55, 7.6, 5.35, `Each mini-bond's own price on your curve, against the one ${unitLong} the loan charges`);
  s.addText(bullets([
    { text: `Each instalment is a mini-bond: ${f.miniN} of them, ${c.peak} each, maturing from year ${f.miniShortT} to year ${f.miniLongT}.` },
    { text: `As bonds, each would have its own price on your curve, from ${f.miniShortP} to ${f.miniLongP}. The loan charges all of them ${f.charged}.` },
    { text: `The long ones count most: a price is paid for as long as a mini-bond is outstanding, so the ${f.miniLongT}-year one weighs ${f.miniWeight} times the shortest.` }]),
    T({ x: 8.5, y: 1.65, w: 4.2, h: 2.9, fontSize: 14, objectName: nm('points') }));
  table(s, [['Mini-bonds, by maturity', 'Count', 'Value today'],
    [`Before year ${f.miniSwitch}: charged more`, f.miniBelow, f.miniBelowV], [`From year ${f.miniSwitch}: charged less`, f.miniAbove, f.miniAboveV],
    [{ text: 'The loan, net', hl: true }, { text: f.miniN, hl: true }, { text: f.pv, hl: true }]], { x: 8.5, y: 4.65, w: 4.2, colW: [2.3, 0.7, 1.2], fontSize: 12 });
  s.addText(runs([{ text: `${fairLab} ${f.fair2} − ${unitLong} you pay ${f.charged2} = `, options: {} }, { text: `${f.wedge} a year`, options: { bold: true, color: HEX.gain } }]),
    T({ x: 8.5, y: 6.2, w: 4.2, h: 0.6, fontSize: 14, objectName: nm('equation') }));
  s.addNotes(`Picture the loan as ${f.miniN} mini-bonds of ${c.peak}, one maturing on each repayment date. As bonds, each would price at its own maturity on your curve. The loan charges all of them one price. The long ones, charged less than their bond price, are outstanding longest and so count most: net, ${f.wedge} a year below the bond-equivalent price. Do not suggest the borrower could issue the mini-bonds: they are a way of pricing the loan, not an execution plan.`);

  // 6 · two effects
  pres.addSection({ title: 'Where the value comes from' });
  s = content('Where the value comes from', '4 · Where the benefit comes from', "Two effects: the loan's timing, and how your curve is quoted");
  s.addText(`The price you pay and the bond-equivalent price differ in two ways at once: a different instrument, priced a different way. The reference bond, a ${c.wal}-year bullet valued on your curve exactly as the loan is, separates the two, so each step changes one thing only.`,
    T({ x: MX, y: 1.6, w: 12.1, h: 0.8, fontSize: 15, objectName: nm('lead') }));
  threePrices(s, C, 1.1, 2.4, 11.1);
  s.addText(runs([{ text: `Timing effect, ${f.timing}. `, options: { bold: true } }, { text: `The core of the benefit: same average life, same valuation, only the loan's profile differs. Part of its principal stays out well beyond ${c.wal} years, where your curve is higher.` }]),
    T({ x: MX, y: 5.75, w: 5.9, h: 1.15, fontSize: 13, objectName: nm('effect-text') }));
  s.addText(runs([{ text: `Quote-convention effect, ${f.convention}. `, options: { bold: true } }, { text: isF
    ? `Small, and it would arise even for a bullet: the average-life price charges your Z-spread, a measure of price, as a cash margin. Already netted in the benefit.`
    : `Small, and it would arise even for a bullet: a yield is one blended rate for all of a bond's payments, the reference bond values each half-year at its own rate. Already netted.` }]),
    T({ x: 6.8, y: 5.75, w: 5.9, h: 1.15, fontSize: 13, objectName: nm('effect-text') }));
  s.addNotes(`From two effects, separated by a third price, the reference bond. The timing effect, bond-equivalent price against reference bond, ${f.timing}, is the loan's profile at work and the core of the benefit. The quote-convention effect, reference bond against average-life price, ${f.convention}, would arise even for a bullet; it is small and works slightly against the borrower, already netted. Do not present the quote-convention effect as part of the value.`);

  // 7 · fixed: credit and interest-rate effects (fixed rate only)
  if (!isF) {
    s = content('Where the value comes from', '4 · Fixed rate', 'Fixed or floating, the core of the benefit is the same');
    s.addText('A fixed rate prices two things at once: the cost of money over the period lent, from the swap curve, and your credit. Split both prices into these two parts and compare like with like.',
      T({ x: MX, y: 1.6, w: 12.1, h: 0.7, fontSize: 15, objectName: nm('lead') }));
    table(s, [['Fixed rate', 'Bond-equivalent', 'Price you pay', 'Effect'],
      [`Interest-rate part: swap rates over the loan's life, against the ${c.wal}-year rate`, f.rfFair, f.rfPaid, f.rfEffect],
      ['Credit part: your credit cost over the loan\'s life, against your credit premium', f.crFair, f.crPaid, { text: f.creditEffect, o: { color: HEX.accent, bold: true } }],
      [{ text: 'The whole rate', hl: true }, { text: f.fair, hl: true }, { text: f.charged, hl: true }, { text: f.wedgeP, hl: true }]],
      { x: MX, y: 2.45, w: 12.1, colW: [6.7, 1.8, 1.8, 1.8], fontSize: 14 });
    s.addText(`Your credit premium is your bond yield minus the swap rate for the same maturity, both on the loan's semi-annual basis: ${f.creditPremium} at ${c.wal} years.`,
      T({ x: MX, y: 4.25, w: 12.1, h: 0.45, fontSize: 12, color: C.text2, objectName: nm('caption') }));
    statCard(s, C, MX, 4.95, 3.6, 1.75, 'Timing effect on your credit curve', f.creditTiming, { fill: HEX.accentSoft, valCol: C.accent1 });
    s.addText(runs([{ text: 'The same for a floating loan. ', options: { bold: true } },
      { text: `Of the fixed rate's timing effect of ${f.timing}, ${f.creditTiming} comes from your credit curve and ${f.rfTiming} from the swap curve. Over the loan's whole life the swap curve gives an interest-rate effect of ${f.rfEffect}, which depends only on its shape: ${f.rfNeg ? `here it peaks at ${c.swapPeak} years and falls after; on a swap curve that kept rising, it would add to the benefit` : 'here it keeps rising over the loan\'s life, which adds to the benefit'}.` }]),
      T({ x: 4.55, y: 4.95, w: 8.15, h: 1.8, fontSize: 14, objectName: nm('message') }));
    s.addNotes(`The core is the same: the timing effect on the credit curve, ${f.creditTiming}, is identical for fixed and floating. A fixed rate also prices the swap curve, so it adds an interest-rate effect that depends only on that curve's shape: here it costs ${f.rfEffect}. Do not recommend fixed or floating on this basis; the choice follows the borrower's interest-rate risk strategy.`);
  }

  // 8 · why it works
  s = content('Where the value comes from', '5 · Why the price works in your favour', 'Your curve charges more for later years, and this loan reaches them');
  chartCost(s, MX, 1.55, 7.6, 5.35);
  s.addShape('roundRect', { x: 8.55, y: 1.65, w: 4.15, h: 2.5, rectRadius: 0.06, fill: { color: C.background2 }, line: { color: C.background2 }, objectName: nm('panel') });
  s.addText('A quoted level is an average', T({ x: 8.8, y: 1.85, w: 3.7, h: 0.35, fontSize: 15, bold: true, objectName: nm('idea-title') }));
  s.addText(isF ? `Your ${c.longYear}-year Z-spread of ${f.yearQuote} averages years 1 to ${c.longYear}. Year ${c.longYear} on its own costs about ${f.yearCost}, ${f.yearRatio} times the quote.`
    : `Your ${c.longYear}-year yield of ${f.yearQuote}${restate ? ` (${f.yearQuoteSA} semi-annual)` : ''} averages years 1 to ${c.longYear}. Year ${c.longYear} on its own costs about ${f.yearCost}, on the same basis.`,
    T({ x: 8.8, y: 2.25, w: 3.7, h: 1.8, fontSize: 14, objectName: nm('idea-text') }));
  s.addShape('roundRect', { x: 8.55, y: 4.4, w: 4.15, h: 2.5, rectRadius: 0.06, fill: { color: C.background2 }, line: { color: C.background2 }, objectName: nm('panel') });
  s.addText('Same average life, later timing', T({ x: 8.8, y: 4.6, w: 3.7, h: 0.35, fontSize: 15, bold: true, objectName: nm('idea-title') }));
  s.addText(`The bond's principal is outstanding, on average, at year ${c.bondCg}; the loan's at year ${c.cg}, and ${c.shareAfter} of its principal-years fall after year ${c.wal}. The average-life price does not charge for that.`,
    T({ x: 8.8, y: 5.0, w: 3.7, h: 1.8, fontSize: 14, objectName: nm('idea-text') }));
  s.addNotes(`Two ideas. A quoted level is an average over the bond's whole life, so the later years cost more than the quote. And the loan's money sits later than the bond's, although both have the same average life. Priced period by period, this profile costs ${f.fair}; at ${f.charged}, the borrower pays ${f.wedge} a year less. If asked why the bars step up and down: each year's cost is inferred from the difference between neighbouring quotes; a fitted issuer curve gives a smoother profile.`);

  // 9 · when it arrives
  pres.addSection({ title: 'The economics' });
  s = content('The economics', '6 · When the benefit arrives', 'The benefit is collected by holding the loan');
  chartRunning(s, MX, 1.55, 7.6, 5.35);
  statCard(s, C, 8.55, 1.65, 2.0, 1.35, 'Lowest point', f.minPV, { size: 19 });
  statCard(s, C, 10.7, 1.65, 2.0, 1.35, 'Positive from', `year ${f.breakEven}`, { size: 19 });
  table(s, [['If repaid early', 'Present value'], ...prepay], { x: 8.55, y: 3.25, w: 4.15, colW: [2.75, 1.4], fontSize: 12 });
  s.addText(`The early periods are priced above what your curve implies, the later ones below. Repaying before about year ${f.breakEven} means having paid more than your curve implies for the periods run: prepayment terms are part of the value.`,
    T({ x: 8.55, y: 5.55, w: 4.15, h: 1.35, fontSize: 12, color: C.text2, objectName: nm('caption') }));
  s.addNotes(`The benefit is back-loaded: in present value it is at its lowest, ${f.minPV}, in year ${f.minYear}, and positive from about year ${f.breakEven}. Repaying before then means having paid more than the bond-equivalent cost of the periods run. Do not leave this for the borrower to discover.`);

  // 10 · net benefit
  s = content('The economics', '7 · The net benefit', 'What you give up early, and what you gain later');
  chartWaterfall(s, MX, 1.55, 6.6, 5.35);
  table(s, [['By date', 'Present value', 'Per year'],
    [`Signing to year ${c.wal}`, { text: f.lossPV, o: { color: HEX.slate, bold: true } }, { text: f.lossBp, o: { color: HEX.slate, bold: true } }],
    [`Year ${c.wal} to final maturity`, { text: f.gainPV, o: { color: HEX.accent, bold: true } }, { text: f.gainBp, o: { color: HEX.accent, bold: true } }],
    [{ text: 'Net benefit', hl: true }, { text: f.pv, hl: true }, { text: f.wedge, hl: true }],
    ['Equivalent upfront fee', '', f.fee], ['Undiscounted, for reference', f.nominal, '']], { x: 7.55, y: 2.0, w: 5.15, colW: [2.55, 1.35, 1.25], fontSize: 14, rowH: 0.43 });
  s.addText('The upfront-fee equivalent is a useful yardstick when comparing all-in offers. Fees are excluded on both sides: bond issuance costs and any new-issue premium would add to the benefit; the loan\'s own fees would reduce it.',
    T({ x: 7.55, y: 4.95, w: 5.15, h: 1.6, fontSize: 14, color: C.text2, objectName: nm('caption') }));
  s.addNotes(`${f.pv} in present value; present value is the right measure because it compares money at different dates on the borrower's own curve. As an upfront fee: ${f.fee}. Loan fees up to that level leave the borrower no worse off than the bond-equivalent cost, before counting the bond route's own costs. Avoid quoting the headline as an all-in comparison.`);

  // 11 · beyond the price (tailored)
  s = content('The economics', '8 · Beyond the price', 'A smoother debt profile, and a structure you can shape');
  const card = (x, y, w, h, title, text) => {
    s.addShape('roundRect', { x, y, w, h, rectRadius: 0.06, fill: { color: C.background2 }, line: { color: C.background2 }, objectName: nm('panel') });
    s.addText(title, T({ x: x + 0.25, y: y + 0.2, w: w - 0.5, h: 0.35, fontSize: 15, bold: true, objectName: nm('card-title') }));
    s.addText(text, T({ x: x + 0.25, y: y + 0.62, w: w - 0.5, h: h - 0.8, fontSize: 13, objectName: nm('card-text') }));
  };
  if (SOV) {
    card(MX, 1.65, 5.3, 2.45, 'Same average maturity, no redemption peak', `The loan's redemptions fall, on average, ${c.avgRepay} years from signing, so in your average time to maturity it counts much like a ${c.wal}-year bond. But a bond redeems ${c.amount} in a single year; this loan spreads repayment over ${c.nInst} instalments of ${c.peak}, ${c.peakPct} each.`);
    card(MX, 4.3, 5.3, 2.45, 'A complement to your issuance programme', 'One facility, priced at signing, diversifies your funding sources and investor base beyond your auctions and syndications, with certainty of execution whatever market conditions bring. No new-issue concession or syndication fees; the loan\'s own fees apply instead.');
  } else {
    card(MX, 1.65, 5.3, 2.45, 'No maturity wall', `A bond of the same average life puts ${c.amount} on one date, year ${c.wal}. This loan spreads repayment over ${c.nInst} instalments of ${c.peak}, ${c.peakPct} each, out to year ${c.maturity}: one concentration point fewer in your maturity profile.`);
    card(MX, 4.3, 5.3, 2.45, 'One facility, priced once', 'A single facility, priced at signing, with one set of documentation, replaces the several bond issues and market windows the same profile would otherwise need. No bond issuance costs or new-issue premium; the loan\'s own fees apply instead.');
  }
  const prow = p => { const q = p[RATE], wb = q.wedge * 1e4; return [p.lab.replace(', same final maturity', ' *'), `${fmt.yrs(q.maturity)}y`, `${fmt.yrs(q.WAL)}y`, isF ? fmt.bp(q.charged * 1e4, 1) : fmt.pct(q.charged),
    { text: fmt.bp(wb), o: { color: wb >= 0 ? HEX.accent : HEX.slate, bold: true } }]; };
  table(s, [['Shaping the profile', 'Maturity', 'Avg life', 'Price', 'Benefit'], ...profiles.map((p, i) => { const row = prow(p); if (i === 0) row[0] = { text: row[0], hl: true }; return row; })],
    { x: 6.25, y: 1.65, w: 6.45, colW: [2.75, 0.9, 0.9, 1.0, 0.9], fontSize: 12 });
  chartRedemptions(s, 6.25, 3.75, 6.45, 2.85);
  s.addText('* Same final maturity. Alternative profiles are indicative and subject to agreement; a longer drawdown would normally carry a commitment fee on undrawn amounts, not included.',
    T({ x: 6.25, y: 6.62, w: 6.45, h: 0.38, fontSize: 9.5, color: C.text2, objectName: nm('footnote') }));
  s.addNotes(SOV ? `In the borrower's average time to maturity the loan counts much like a ${c.wal}-year bond, without a single redemption; it complements the auction and syndication programme rather than replacing it. On the profile table: a longer drawdown with the same final maturity keeps the average life and the price while the money sits later on the curve; that is why its benefit is so much higher. Alternatives are indicative and subject to agreement.`
    : `No maturity wall: ${c.nInst} instalments instead of one maturity. On the profile table: a longer drawdown with the same final maturity keeps the average life and the price while the money sits later on the curve. Alternatives are indicative and subject to agreement.`);

  // 12 · robustness
  s = content('The economics', '9 · How robust is the figure', 'It depends on the shape of your curve, not on the assumptions');
  const k = RATE;
  table(s, [['Scenario', 'Benefit'], [{ text: 'Base case', hl: true }, { text: f.sc_base, hl: true }],
    ['Swap curve 30bp higher', f.sc_swap30], [`Recovery 20% instead of ${c.recovery}`, f.sc_rec20], [`Recovery 60% instead of ${c.recovery}`, f.sc_rec60],
    ['Your curve twice as steep', f.sc_double], ['Your curve half as steep', f.sc_half], ['Your curve flat', f.sc_flat], ['Your curve inverted', f.sc_inv]],
    { x: MX, y: 1.6, w: 4.6, colW: [3.3, 1.3], fontSize: 14, rowH: 0.47 });
  chartSlope(s, 5.55, 1.55, 7.15, 4.3);
  s.addText(`The inputs that cannot be read from your bond prices, the swap curve and recovery, move the benefit by at most ${c.maxMove}. What moves it is the slope of your curve: on a flat curve it disappears, on an inverted one the same pricing works against the borrower. It is measured on your curve at signing, when the price is fixed.`,
    T({ x: 5.55, y: 5.95, w: 7.15, h: 1.0, fontSize: 13, objectName: nm('caption') }));
  s.addNotes(`Assumptions barely move it: at most ${c.maxMove}. The shape of the curve does: flat ${f.sc_flat}, inverted ${f.sc_inv}. We show this openly; it is why the analysis is run on the borrower's own curve. Never present this template to a borrower whose curve is flat or inverted.`);

  // 13 · next steps
  s = content('The economics', 'Next steps', 'From template to indicative terms');
  const steps = [['1', 'Your data', 'Share one Bloomberg YAS snapshot of your bonds: Z-spreads and yields by maturity, and the swap curve YAS measures them against.'],
    ['2', 'Your profile', `We rerun the analysis on your curve, for the drawdown and repayment profile that fits your ${c.strategy}, with fees once agreed.`],
    ['3', 'Indicative terms', 'Indicative terms follow, subject to credit approval, documentation and market conditions at execution.']];
  const sw3 = (12.1 - 2 * 0.3) / 3;
  steps.forEach(([n, t, d], i) => {
    const x = MX + i * (sw3 + 0.3);
    s.addShape('roundRect', { x, y: 1.7, w: sw3, h: 3.75, rectRadius: 0.06, fill: { color: C.background2 }, line: { color: C.background2 }, objectName: nm('step-card') });
    s.addShape('ellipse', { x: x + 0.35, y: 2.0, w: 0.8, h: 0.8, fill: { color: C.accent1 }, line: { color: C.accent1 }, objectName: nm('step-dot') });
    s.addText(n, T({ x: x + 0.35, y: 2.0, w: 0.8, h: 0.8, fontSize: 24, bold: true, color: C.background1, align: 'center', valign: 'middle', fontFace: 'Cambria', objectName: nm('step-n') }));
    s.addText(t, T({ x: x + 0.35, y: 3.05, w: sw3 - 0.7, h: 0.45, fontSize: 20, bold: true, objectName: nm('step-title') }));
    s.addText(d, T({ x: x + 0.35, y: 3.6, w: sw3 - 0.7, h: 1.7, fontSize: 15, objectName: nm('step-text') }));
  });
  s.addText('The calculation runs in a spreadsheet without macros and checks itself: every quoted bond is repriced exactly, and your Z-spreads and yields must describe the same bonds. We can share it.',
    T({ x: MX, y: 5.8, w: 12.1, h: 0.8, fontSize: 14, color: C.text2, objectName: nm('caption') }));
  s.addNotes('Close on the borrower\'s own data: the figures in this template are simulated until we run them on their Bloomberg YAS snapshot. Offer the workbook. Do not present indicative pricing as an offer, and do not negotiate the margin with the analysis.');

  // appendix
  pres.addSection({ title: 'Appendix' });
  s = pres.addSlide({ masterName: 'WW_DIVIDER', sectionTitle: 'Appendix' });
  s.addText('APPENDIX', { placeholder: 'eyebrow' });
  s.addText('Questions, method and important information', { placeholder: 'title' });
  s.addNotes('Use the appendix for sceptical or technical audiences.');

  const qa = (title, items, notes) => {
    const sl = content('Appendix', 'Questions you may have', title);
    items.forEach(([q, a], i) => {
      const x = MX + (i % 2) * 6.2, y = 1.65 + Math.floor(i / 2) * 2.65;
      sl.addShape('roundRect', { x, y, w: 5.9, h: 2.45, rectRadius: 0.06, fill: { color: C.background2 }, line: { color: C.background2 }, objectName: nm('qa-card') });
      sl.addText(q, T({ x: x + 0.25, y: y + 0.18, w: 5.4, h: 0.6, fontSize: 14, bold: true, color: C.accent1, objectName: nm('qa-q') }));
      sl.addText(a, T({ x: x + 0.25, y: y + 0.8, w: 5.4, h: 1.55, fontSize: 13, objectName: nm('qa-a') }));
    });
    sl.addNotes(notes);
  };
  qa('The points we would challenge, if we were you', [
    [`Why not simply issue a ${c.wal}-year bond at the same price?`, `You can, and on price the two are level. The difference is the profile: the bond concentrates refinancing on one date, the loan amortises over ${c.nInst} instalments to year ${c.maturity}. Funding the loan's profile through your bonds would cost ${f.fair}, the bond-equivalent price, rather than ${f.charged}.`],
    ['If the price is below my bond-equivalent price, why would a lender offer it?', 'Average-life pricing is a widely used, transparent convention for amortising loans, and a lender\'s economics are set by its own funding, capital and relationship considerations, not by your bond curve. This analysis measures what the convention is worth to you; it makes no statement about the lender\'s margin.'],
    ['What if we prepay?', `The benefit is back-loaded: it is positive in present value only from about year ${f.breakEven}. Repaying earlier means having paid more than your curve implies for the periods already run. Prepayment terms should be read with this in mind.`],
    SOV ? ['How does this compare with our auction or syndication cost?', 'The comparison uses your bonds at their secondary-market levels. New issues usually add a new-issue concession and, for syndications, fees; both are excluded, so the bond route\'s all-in cost would be higher than the bond-equivalent price shown.']
        : ['How does this affect our ratings or covenants?', 'This analysis is economic only. Accounting, tax, rating and covenant treatment depend on your circumstances and the final documentation, and are for your advisers.']],
    'Concede what is true, hold the core argument. Never speculate on the lender\'s margin or funding cost, and never imply the lender loses money.');
  qa('The points we would challenge (continued)', [
    ['Is the benefit real money, or a modelling result?', `It is the present value of paying less than your own market price for the later periods, computed from your quoted bonds only. It is not a payment: it shows up as interest below the bond-equivalent level in later years, offset in part by interest above it early on. Assumptions move it by at most ${c.maxMove}.`],
    ['What if my curve flattens after signing?', 'The price is fixed at signing, and the benefit is measured on the curve at signing. If your curve later flattened, new long-dated issuance would become cheaper, which would reduce, in hindsight, the value of having fixed the long end at today\'s levels. The analysis does not forecast your curve.'],
    ['How do fees change the picture?', `The headline excludes fees on both sides. As a yardstick, the benefit equals an upfront fee of ${f.fee}: loan fees below that leave you ahead of the bond-equivalent price, before counting the bond route's own issuance costs and any new-issue premium.`],
    ['Does the recovery assumption drive the result?', `No. Recovery is not observable in bond prices, so we test it: at 20% or 60% instead of ${c.recovery} the benefit moves by no more than ${c.maxMove}. A different recovery changes the inferred default risk and the loss given default in opposite directions, which largely offset.`]],
    'Avoid "guaranteed saving" or "cash back". Never quote implied default probabilities.');

  s = content('Appendix', 'Methodology', 'How the figures are derived');
  s.addText('A standard credit valuation, of the kind used to value credit default swaps and to build issuer curves. Your bond curve is the only source of credit information.',
    T({ x: MX, y: 1.6, w: 12.1, h: 0.5, fontSize: 15, objectName: nm('lead') }));
  const stepsM = ['Build risk-free discount factors from the swap curve.',
    'Find, year by year, the default intensity that reprices each of your bonds exactly: each quoted level, an average to maturity, becomes the cost of each year.',
    'Build the loan\'s half-yearly balance from its drawdown and repayment schedule.',
    'Price each six-month period at the cost your curve implies, weighted by balance, discounting and survival: the weighted average is the bond-equivalent price.',
    `Compare it with the average-life price. The difference, times the loan's credit-adjusted annuity of ${f.annuity} years and the amount, is the present value of the benefit.`];
  const sw5 = (12.1 - 4 * 0.2) / 5;
  stepsM.forEach((t, i) => {
    const x = MX + i * (sw5 + 0.2);
    s.addShape('roundRect', { x, y: 2.3, w: sw5, h: 2.45, rectRadius: 0.06, fill: { color: C.background2 }, line: { color: C.background2 }, objectName: nm('step-card') });
    s.addShape('ellipse', { x: x + 0.2, y: 2.48, w: 0.48, h: 0.48, fill: { color: C.accent1 }, line: { color: C.accent1 }, objectName: nm('step-dot') });
    s.addText(String(i + 1), T({ x: x + 0.2, y: 2.48, w: 0.48, h: 0.48, fontSize: 15, bold: true, color: C.background1, align: 'center', valign: 'middle', fontFace: 'Cambria', objectName: nm('step-n') }));
    s.addText(t, T({ x: x + 0.2, y: 3.08, w: sw5 - 0.4, h: 1.6, fontSize: 12, objectName: nm('step-text') }));
  });
  s.addText('Data and built-in checks', T({ x: MX, y: 5.0, w: 12.1, h: 0.35, fontSize: 15, bold: true, color: C.accent1, objectName: nm('h') }));
  const checks = ['One Bloomberg snapshot: your YAS Z-spreads and yields, the swap curve YAS measures them against, the 6-month fixing.',
    'Every quoted bond is repriced exactly by the inferred default intensities.',
    `Your Z-spreads and yields must describe the same bonds: largest difference ${c.gapBp}; above 1bp the data are flagged.`,
    `Recovery ${c.recovery}, the market convention for senior unsecured debt; at 20% or 60% the benefit moves by at most ${c.maxMove}.`];
  const cw4 = (12.1 - 3 * 0.2) / 4;
  checks.forEach((t, i) => {
    const x = MX + i * (cw4 + 0.2);
    s.addShape('roundRect', { x, y: 5.45, w: cw4, h: 1.35, rectRadius: 0.06, fill: { color: HEX.white }, line: { color: HEX.rule, width: 1 }, objectName: nm('check-card') });
    s.addText(t, T({ x: x + 0.2, y: 5.58, w: cw4 - 0.4, h: 1.15, fontSize: 12, objectName: nm('check-text') }));
  });
  s.addNotes('If challenged on the model: it is a way of reading the market prices of the borrower\'s bonds, the standard one for credit default swaps and issuer curves; the inferred intensities reprice every quoted bond exactly. Never quote implied default or survival probabilities.');

  s = content('Appendix', 'Important information', 'Points to note, limitations and disclaimer');
  const infoCard = (x, title, items) => {
    s.addShape('roundRect', { x, y: 1.6, w: 5.9, h: 3.35, rectRadius: 0.06, fill: { color: C.background2 }, line: { color: C.background2 }, objectName: nm('panel') });
    s.addText(title, T({ x: x + 0.3, y: 1.8, w: 5.3, h: 0.35, fontSize: 15, bold: true, color: C.accent1, objectName: nm('panel-label') }));
    s.addText(bullets(items), T({ x: x + 0.3, y: 2.25, w: 5.3, h: 2.6, fontSize: 13, objectName: nm('panel-text') }));
  };
  infoCard(MX, 'Points to note', [
    ...(+c.belowSwaps > 0 ? [`Your curve trades below swaps at maturities up to ${c.belowSwaps} years. The analysis uses it as quoted, which treats those years as cheaper than swaps.`] : []),
    'Each quoted level is read as a bond trading at par for that maturity; for bonds far from par, a fitted issuer curve is the cleaner input.',
    'The whole spread of your bonds over swaps is treated as the price of your credit, as the market prices it, including any liquidity component.']);
  infoCard(MX + 6.2, 'Limitations', [
    'Your bonds must be in the currency of the loan; the analysis makes no cross-currency adjustment.',
    'The loan is modelled in six-month periods with an accrual of half a year; its actual day count changes the result only marginally.',
    'Bond issuance costs, any new-issue premium and the loan\'s own fees are excluded from the headline figures.']);
  s.addShape('roundRect', { x: MX, y: 5.15, w: 12.1, h: 1.7, rectRadius: 0.06, fill: { color: HEX.white }, line: { color: HEX.rule, width: 1 }, objectName: nm('panel') });
  s.addText('Disclaimer', T({ x: MX + 0.3, y: 5.3, w: 11.5, h: 0.3, fontSize: 12, bold: true, color: C.text2, objectName: nm('panel-label') }));
  s.addText((cs.illustrative ? 'Illustrative template. The market data in this version are simulated and the figures are not an indication of terms. ' : '') +
    'This document is indicative and provided for discussion purposes only. It does not constitute an offer, a commitment to lend, or investment, legal, tax or accounting advice. The figures are based on the market data at the date shown and on the assumptions described; they will change with market conditions and with the final terms of any transaction. Any transaction would be subject to credit approval, documentation and market conditions at the time of execution.',
    T({ x: MX + 0.3, y: 5.62, w: 11.5, h: 1.15, fontSize: 11, color: C.text2, objectName: nm('disclaimer') }));
  s.addNotes('Leave this slide in every version sent to a client.');
  return pres;
}

/* =====================================================================================
   THE TEASER
   ===================================================================================== */
function buildTeaser() {
  const { pres, C } = newDeck('WAL Wedge — Teaser');
  pres.addSection({ title: 'Teaser' });
  let s = pres.addSlide({ masterName: 'WW_CONTENT', sectionTitle: 'Teaser' });
  s.addText(`FOR DISCUSSION · INDICATIVE · PREPARED FOR ${c.client.toUpperCase()}`, { placeholder: 'eyebrow' });
  s.addText(`A ${c.maturity}-year amortising loan at your ${c.wal}-year price`, { placeholder: 'title' });
  s.addText(`We propose to price your ${isF ? 'floating' : 'fixed'}-rate amortising loan where your own ${c.wal}-year bond is quoted, at the loan's average life, although it repays over ${c.maturity} years. Against funding the same repayment profile through your own bonds, one maturing on each repayment date, that price is worth:`,
    T({ x: MX, y: 1.6, w: 12.1, h: 0.9, fontSize: 15, objectName: nm('lead') }));
  [['Benefit per year', f.wedgeP], ['Value today', f.pv], ['Equivalent upfront fee', f.fee], [payLab, f.charged]].forEach(([l, v], i) =>
    statCard(s, C, 8.85, 2.6 + i * 1.05, 3.85, 0.92, l, v, Object.assign({ size: 20, row: true }, i === 0 ? { fill: HEX.gainSoft, valCol: C.accent4 } : {})));
  chartProfileBars(s, MX, 2.5, 7.95, 4.1);
  s.addText(`Same principal-years as a ${c.wal}-year bond; ${c.shareAfter} of the loan's sit beyond year ${c.wal}, out to year ${c.maturity}. Market data as of ${c.asOf}${c.dataNote}.`,
    T({ x: MX, y: 6.62, w: 7.95, h: 0.35, fontSize: 11, color: C.text2, objectName: nm('caption') }));
  s.addNotes(`Proposition in one sentence, then the four numbers: ${f.wedge} a year, ${f.pv} today, ${f.fee} as an upfront fee, at ${f.charged}. Offer the full pitch for the detail.`);

  s = pres.addSlide({ masterName: 'WW_CONTENT', sectionTitle: 'Teaser' });
  s.addText('WHY IT WORKS, AND WHAT IT DEPENDS ON', { placeholder: 'eyebrow' });
  s.addText(`One price for ${f.miniN} different bonds`, { placeholder: 'title' });
  chartMiniBonds(s, MX, 1.55, 7.1, 5.4, `Your loan as ${f.miniN} mini-bonds: each one's own price, against the one ${unitLong} you pay`);
  s.addText('Why it works', T({ x: 8.05, y: 1.6, w: 4.65, h: 0.4, fontSize: 17, bold: true, color: C.accent1, objectName: nm('h') }));
  s.addText(bullets([`A quoted level is an average: your ${c.longYear}-year quote averages years 1 to ${c.longYear}; year ${c.longYear} alone costs about ${f.yearCost}.`,
    `The same average life, a later timing: the loan's principal sits on average at year ${c.cg}, the bond's at year ${c.bondCg}.`]),
    T({ x: 8.05, y: 2.05, w: 4.65, h: 1.65, fontSize: 13, objectName: nm('list') }));
  s.addText('What it depends on', T({ x: 8.05, y: 3.75, w: 4.65, h: 0.4, fontSize: 17, bold: true, color: C.accent1, objectName: nm('h') }));
  s.addText(bullets([`A rising curve: on a flat curve the benefit disappears (${f.sc_flat}); on an inverted one it reverses (${f.sc_inv}).`,
    `Holding the loan: positive in present value from about year ${f.breakEven}.`, 'Fees: excluded on both sides of the comparison.']),
    T({ x: 8.05, y: 4.2, w: 4.65, h: 1.55, fontSize: 13, objectName: nm('list') }));
  s.addShape('roundRect', { x: 8.05, y: 5.85, w: 4.65, h: 1.0, rectRadius: 0.06, fill: { color: C.accent5 }, line: { color: C.accent5 }, objectName: nm('cta') });
  s.addText(runs([{ text: 'Next step: ', options: { bold: true, color: HEX.accent } }, { text: 'one Bloomberg YAS snapshot of your bonds, and we run it on your own curve.' }]),
    T({ x: 8.25, y: 5.85, w: 4.25, h: 1.0, fontSize: 13, valign: 'middle', objectName: nm('cta-text') }));
  s.addNotes('The long mini-bonds are charged less than their bond price and are outstanding longest, so they count most. Say early that the benefit needs a rising curve and is back-loaded.');
  return pres;
}

/* ---------- write ---------- */
(async () => {
  const rate = RATE === 'float' ? 'floating' : 'fixed', tag = `${rate}_${SOV ? 'sovereign' : 'corporate'}`;
  for (const [build, name, t] of [[buildPitch, 'Pitch', tag], [buildTeaser, 'Teaser', rate]]) {
    const file = path.join(OUT, `WAL_Wedge_${name}_${t}.pptx`);
    await build().writeFile({ fileName: file });
    if (APPLY_THEME) await require(APPLY_THEME).applyTheme(file, THEME);
    console.log('wrote', file);
  }
  // decks.json: the decks present in this folder, with a build stamp the pages use to defeat caching of an old file
  const fs = require('fs'), list = {};
  fs.readdirSync(OUT).filter(n => /^WAL_Wedge_.*\.pptx$/.test(n)).forEach(n => { list[n] = Math.round(fs.statSync(path.join(OUT, n)).mtimeMs / 1000); });
  fs.writeFileSync(path.join(OUT, 'decks.json'), JSON.stringify(list, null, 1) + '\n');
})();
