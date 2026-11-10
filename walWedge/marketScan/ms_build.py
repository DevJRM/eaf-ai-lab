"""Build ../marketScan.html from ms_template.html and the computed JSON (history.json, segments.json, stress.json)."""
import json, os, re, statistics
from ms_engine import E, S, eur_rates, usd_rates, gbp_rates

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, '..', 'marketScan.html')
HJ = json.load(open(os.path.join(HERE, 'history.json')))
SJ = json.load(open(os.path.join(HERE, 'segments.json')))
H, NOW, SEG, SCN = HJ['hist'], HJ['now'], SJ['segments'], SJ['scenarios']

LABEL = {'ezsov': 'Euro area governments', 'france': 'France', 'italy': 'Italy', 'bulgaria': 'Bulgaria', 'poland': 'Poland',
         'romania': 'Romania', 'morocco': 'Morocco', 'indo_eur': 'Indonesia (EUR)', 'chile_eur': 'Chile (EUR)',
         'eu_ig': 'European IG companies', 'us_ig': 'US IG companies (ICE)', 'us_hq': 'US high-grade (HQM)', 'us_bbb': 'US BBB companies',
         'mexico': 'Mexico (USD)', 'phil': 'Philippines (USD)', 'aramco': 'Saudi Aramco (USD)', 'pif': 'Saudi PIF (USD)', 'qatar': 'Qatar (USD)',
         'us_bb': 'US BB companies', 'us_b': 'US single-B companies', 'us_ccc': 'US CCC companies', 'eu_hy': 'European high yield', 'rates': 'Swap curves'}
seg = {k: dict(label=LABEL[k], kind=v['kind'], src=v['src'], date=v['date'], curve=v['curve'],
               res={L: {m: {'net': v['res'][L][m]['net']} for m in ('float', 'fixed')} for L in ('std', 'long')},
               scen=v['scen']) for k, v in SEG.items()}
CHK = [[LABEL.get(c[0], c[0])] + c[1:] for c in SJ['checks']]

# ---------------- rates table: swap curves (what the loans are priced on), governments for comparison ----------------
from ms_engine import EURIBOR6M, EURIBOR6M_1Y, SOFR, SOFR_1Y, over, ez_sov, us_hq, price
def slope(now, ago, has2=True):
    out = {}
    for tag, q in (('', now), ('_y', ago)):
        c = E.fill_curve(q)
        out['r7' + tag], out['r13' + tag] = E.interp_curve(c, 7), E.interp_curve(c, 13)
        out['rise' + tag] = (out['r13' + tag] - out['r7' + tag]) * 100
        out['s230' + tag] = (c[29] - c[1]) * 100 if has2 else None
    return out
rates = [dict(name='EUR swaps (EURIBOR 6M)', **slope(EURIBOR6M, EURIBOR6M_1Y), why='ECB hikes in June and September lifted the short end; long swaps barely moved, so the curve went from steep to flat'),
         dict(name='EUR AAA governments', **slope(eur_rates(None), eur_rates('2025-11')), why='For comparison: long government yields rose above swaps (supply, end of ECB reinvestment)'),
         dict(name='USD swaps (SOFR)', **slope(SOFR, SOFR_1Y), why='Fed hike in September, another priced for December: short rates up about a point'),
         dict(name='US Treasuries', **slope(usd_rates(None), usd_rates('2025-11')), why='For comparison: Treasuries yield 35–70bp above swaps beyond 7 years'),
         dict(name='GBP gilts', **slope(gbp_rates(None), gbp_rates('2025-11'), False), why='Government curve only; higher across the curve, the 20-year above 5.4%')]

# ---------------- cards ----------------
zc = lambda k, T: round(SEG[k]['curve'][str(T)])
hyp = lambda sid: (S[sid][max(S[sid])] * 100, round(100 * sum(v < S[sid][max(S[sid])] for v in S[sid].values()) / len(S[sid])), S[sid].get('2025-11-06', 0) * 100)
BB, B_, CCC, EHY = hyp('BAMLH0A1HYBB'), hyp('BAMLH0A2HYB'), hyp('BAMLH0A3HYC'), hyp('BAMLHE00EHYIOAS')
CARDS = [
 dict(id='cee', rank=1, grade='pri', name='Central and eastern Europe: governments and state companies',
      who='Poland, Romania, Bulgaria; also Hungary, Croatia, Serbia and state companies such as Orlen, PGE, ČEZ and BEH',
      keys=['poland', 'bulgaria', 'romania'], dir='Steeper: Romania 8y at +285bp vs about +210bp in March; Bulgaria wider at the long end', stress='Romania: watch (BBB−, politics)', meas=3, win=3,
      short='The steepest euro curves we found, all quoted over mid-swaps: Poland +43bp at 5 years to +83bp at 10; Bulgaria +60bp at 5, +95bp at 8, +160bp at 18; Romania +190bp at 4 to +335bp at 12. Governments, development banks and state utilities for whom a 13-year amortising bond is hard to place.',
      happened='CEE governments kept borrowing in euros through 2026 to cover deficits and defence and energy spending. Romania paid up after political turmoil: its 8-year bond priced at 285bp over mid-swaps on 2 November, against about 210bp in March. Bulgaria, in the euro area since January 2026, came in July and again in September; between the two deals its long end widened (about +140bp at 19 years in July, +160bp at 18 in September). Poland opened the year with 5- and 10-year benchmarks.',
      now='All three curves climb steeply beyond 5–8 years: each extra year of maturity costs Poland about 8bp, Bulgaria 6–12bp and Romania 12–24bp, all of it credit, since these spreads are quoted over mid-swaps. Romania\'s November yields match mid-swaps plus spread within 4bp.',
      outlook="Heavy euro issuance continues in 2027 (EU co-financing, defence, grids, nuclear). Part of Romania's steepness is stress: a further downgrade would push its short spreads up most and could flatten the curve.",
      why='Steep, measurable curves; borrowers (governments, development banks, state utilities) that cannot easily issue 13-year amortising bonds; and heavy borrowing ahead. For Romania, measure on the day: the wedge is large but the credit is at the edge of investment grade.',
      examples='Poland (Ministry of Finance, BGK, PGE, Orlen), Romania (Ministry of Finance, Transelectrica, Hidroelectrica), Bulgaria (Ministry of Finance, BEH), Czechia (ČEZ), Croatia (HEP), Serbia (EPS).'),
 dict(id='asia', rank=2, grade='pri', name='Asian investment-grade governments', who='Indonesia (EUR and USD), the Philippines (USD); state companies PLN, Pertamina',
      keys=['indo_eur', 'phil'], dir='Wider: local yields up 125–200bp this year', stress="Indonesia: watch (Moody's outlook negative)", meas=3, win=3,
      short="The Philippines' January dollar deal priced T+50 at 5.5 years and T+80 at 10, then 5.75% at 25 years: steep to 10 years, gentle beyond. Indonesia's euro bonds priced +145bp at 7 years and +185bp at 12.",
      happened="Indonesia issued in dollars (January) and euros (May) against a negative backdrop; Moody's moved its outlook to negative over fuel subsidies and the deficit. Local yields rose about 125bp in Indonesia and 200bp in the Philippines this year with oil and US rates. The Philippines priced 5.5-, 10- and 25-year dollar bonds in January and returned in June (T+55 and T+92.5).",
      now="The Philippines' curve rises about 7bp a year from 5.5 to 10 years and about 1bp a year beyond, so 10–13-year loans gain most. Indonesia's euro curve rises about 8bp a year from 7 to 12 years, but rests on a single press source.",
      outlook='Both depend on oil and US rates (Philippine yields track Treasuries closely). A one-notch downgrade would leave Indonesia investment grade at BBB.',
      why='Steep curves, large infrastructure needs (power, transport, energy transition) and debt offices used to agency and ECA-backed loans.',
      examples='Indonesia (Ministry of Finance, PLN, Pertamina), the Philippines (Bureau of the Treasury).'),
 dict(id='latam', rank=3, grade='pri', name='Mexico and Latin American investment-grade governments', who='Mexico (USD), Chile (EUR), Peru; state companies CFE, Codelco, ENAP',
      keys=['mexico', 'chile_eur'], dir='Spreads near decade tights (EMBI around the 10th percentile)', stress='None (Colombia is sub-IG: see below)', meas=3, win=2,
      short="Mexico's January deal: 8 years at 5.625%, 12 and 30 years at T+200 over the 10- and 30-year benchmarks, which is about +185bp and +193bp over a Treasury of the same maturity. The curve rises to 12 years and slowly beyond. Chile's euro curve is gentler and rewards longer or fixed-rate loans.",
      happened="Mexico opened 2026 with a record US$9bn at its lowest spreads since 2019–20. Chile came to the euro market in January and July (+110bp at 8 years, +120bp at 12, about +150bp at 20 in guidance). EMBI spreads for Mexico, Chile and Peru are near their tightest since 2016; Chile's has widened 12bp since its July deal.",
      now="Over a matching Treasury, Mexico's curve rises about 5bp a year from 8 to 12 years and less than 1bp a year beyond; over SOFR swaps, as YAS measures, it also picks up the widening Treasury–swap gap. Chile's euro curve rises slowly, so the floating wedge is small at 13 years and grows with tenor.",
      outlook="Spreads this tight have little room to fall. A gradual widening would steepen these curves; Mexico's fiscal path and support for its state companies are the risks.",
      why='Mexico: pitch loans of 10–20 years. Chile and Peru: lead with fixed-rate or longer loans, and with state companies whose curves carry a premium.',
      examples='Mexico (SHCP, CFE, Nafin, Banobras), Chile (Hacienda, Codelco, ENAP), Peru (MEF, COFIDE).'),
 dict(id='morocco', rank=4, grade='pri', name='Morocco: the government and its state companies', who='Kingdom of Morocco; OCP, ONEE, ONCF, ADM, MASEN',
      keys=['morocco'], dir='Slightly wider than 2025; slope kept', stress='None; split-rated (BBB− S&P, Ba1/BB+ Moody\'s/Fitch)', meas=2, win=3,
      short="Split-rated: BBB− at S&P since 2025, Ba1 (positive outlook) at Moody's and BB+ at Fitch, so a crossover credit rather than investment grade. Its May euro deal priced +170bp at 8 years and +200bp at 12, so long loans (15–20 years) gain most. Large needs to 2030: World Cup, water, energy, ports.",
      happened='Morocco returned to the euro market in May 2026 with €2.25bn: 8 years at mid-swaps +170bp and 12 years at +200bp, tightened from +200bp and +230bp guidance, in a less supportive market than its March 2025 deal (books of €5.2bn against about €7bn).',
      now='The curve rises about 7–8bp a year from 8 to 12 years. Only two recent points and no published yields: before 8 years the curve is held flat, as the Calculator does, so confirm the shape on the full YAS curve (older euro and dollar bonds).',
      outlook="Large financing needs to 2030 (stadiums, high-speed rail, desalination, renewables, phosphates). Moody's positive outlook points to a second investment-grade rating.",
      why='A curve that rises past the average life, a borrower that needs long money in size, and a government and state companies for whom 12–20-year amortising bonds are hard to place. Credit appetite for a crossover name is the gating question.',
      examples='Kingdom of Morocco, OCP, ONEE, ONCF, ADM, MASEN.'),
 dict(id='quasi', rank=5, grade='sel', name='State-owned companies with dollar curves', who='Saudi Aramco, ADNOC, QatarEnergy, Codelco, CFE, OCP, Pertamina',
      keys=['aramco', 'pif'], dir='Gulf long end wider since the US–Iran conflict began', stress='None', meas=2, win=2,
      short="Aramco's curve climbs from about +50bp at 3 years to +95bp at 10 and +130bp at 30 over Treasuries; PIF's is flatter. Pick by curve, not by name.",
      happened='Gulf issuers borrowed heavily in the first half (US$117bn across the GCC), then slowed as yields rose; Saudi bonds fell almost 19% from the start of the US–Iran conflict. Aramco priced 3- to 30-year bonds in January (10 years +95bp, 30 years +130bp); PIF in May (3 years +95bp, 7 years +105bp, 30 years +135bp).',
      now="Aramco published spreads only for 10 and 30 years; its 3- and 5-year points are estimated from coupons, which on its other tranches sit 13–19bp under the yield, so those points are lifted by the same gap.",
      outlook='Lower oil revenue widens Gulf deficits; more supply should keep long spreads under pressure.',
      why="Measurable curves and large capex, but sophisticated treasuries: lead with the number from their own curve, and drop the argument where the curve is flat.",
      examples='Aramco, ADNOC, QatarEnergy, Codelco, CFE, OCP, Pertamina, PLN.'),
 dict(id='gcc', rank=None, grade='sel', name='Gulf governments', who='Qatar, Saudi Arabia, Abu Dhabi, Kuwait',
      keys=['qatar'], dir='Long end sold off; spreads near five-year tights', stress='None', meas=3, win=1,
      happened="Qatar sold US$3bn in September (5 years T+55, 10 years T+65), its first deal since November 2025, as its deficit reached a near-decade high. Gulf spreads sit near the low end of their five-year range; analysts quoted by AGBI think they should be 25–50bp wider.",
      now='Spreads over Treasuries rise only 10bp from 5 to 10 years. Measured over SOFR swaps, as YAS does, the curve also picks up the gap between Treasuries and swaps, which is about half of the wedge shown here.',
      outlook='Deficits and project funding mean more supply; a gradual widening would steepen these curves.',
      why='Debt offices with liquid curves and plenty of bank offers: the playbook says price to clear. If at all, pitch fixed-rate dollar loans of 15–20 years, where the swap curve adds most.',
      examples='Qatar, Saudi Arabia (NDMC), Abu Dhabi, Kuwait.'),
 dict(id='france', rank=None, grade='sel', name='France and French public entities', who='State agencies, regions and state companies (the Republic itself funds in bonds)',
      keys=['france'], dir='Much wider: OAT–Bund up to 150–175bp in October', stress='Yes: widest since 2012; outlooks negative', meas=3, win=1,
      happened='Budget battles, protests and a minority government pushed the OAT–Bund spread to about 175bp in October, its widest since the euro crisis. It eased to about 153bp after Moody\'s kept France at Aa3 with a negative outlook; Fitch and DBRS also have negative outlooks.',
      now="The curve is steep because the market prices French risk rising over time. France's 10-year spread over Germany (ECB, September average 97bp) was already at the top of its range since 2016 before the October widening. The maturity shape here is the euro aggregate's, scaled.",
      outlook='The 2027 budget is the trigger. If it passes, spreads could narrow; if the government falls, short spreads could jump and flatten the curve.',
      why='A large wedge on paper, measured on a curve under stress. Useful for French public entities that borrow on amortising terms; recheck the curve on the day.',
      examples='SNCF Réseau, EDF, regions, public hospital groups.'),
 dict(id='ez', rank=None, grade='sel', name='Euro area governments, core and periphery', who='Germany, Netherlands, Austria, Italy, Spain, Portugal, Greece',
      keys=['ezsov', 'italy'], dir='Periphery at decade tights; long government yields now above swaps', stress='None; negative λ at 1–3 years (see data checks)', meas=3, win=1,
      happened='Italian, Spanish, Portuguese and Greek spreads fell to their lowest since 2016 (Italy 89bp and Spain 45bp over Germany at 10 years in September). Belgium widened with France.',
      now=f"Against EURIBOR swaps, as YAS measures, the aggregate's Z-spread runs from {zc('ezsov', 2)}bp at 2 years to {zc('ezsov', 10)}bp at 10 and {zc('ezsov', 30)}bp at 30, mostly because long government yields now sit above swaps: a supply and term-premium effect rather than credit. The negative short end gives a negative default intensity there, which the engine flags.",
      outlook="Heavy supply and the end of ECB reinvestment keep long ends heavy; the pension switch steepens swaps.",
      why='These governments fund in bonds and rarely borrow on loan terms. Their regions, agencies and state companies are the targets: their curves inherit the same government–swap gap, so the wedge measured on their own YAS curves can be sizeable.',
      examples='Regional governments, development agencies, state utilities.'),
 dict(id='usig', rank=None, grade='low', name='US investment-grade companies', who='Industrials, utilities, technology, including the hyperscalers',
      keys=['us_ig', 'us_bbb', 'us_hq'], dir='Slightly wider (OAS 93bp, BBB 116bp); flat beyond 10 years', stress='None', meas=3, win=1,
      happened='Spreads widened a little in 2026 from near 30-year tights. Hyperscalers issued about US$296bn of bonds, over 40% at 20 years or longer; Meta paid about 220bp over Treasuries for 2056 bonds, roughly 90bp more than in April.',
      now='Over Treasuries the ICE curve climbs from 63bp (1–3 years) to 112bp (7–10 years) and is flat beyond, so there is little credit rise past a 7-year average life; over SOFR swaps it also picks up the Treasury–swap gap. The HQM curve (AA–A) shows more slope. The BBB row uses the whole index\'s maturity shape.',
      outlook='Supply is the swing factor: more long-dated tech issuance could steepen the long end.',
      why='Liquid curves and treasuries that run the WAL-matched comparison themselves: price to clear. Exception: data-centre and energy projects sponsored by hyperscalers, whose long end has widened.',
      examples='Exporters and utilities with long capex programmes; data-centre project companies.'),
 dict(id='euig', rank=None, grade='low', name='European investment-grade companies', who='Utilities, telecoms, industrials, autos',
      keys=['eu_ig'], dir='Wider since September; long end hit by term premium', stress='None', meas=2, win=1,
      happened="Euro IG spreads widened from about 93bp to 100–117bp in September–October as hyperscalers issued in euros (Meta's record €53bn book) and long ends sold off.",
      now='No free maturity-by-maturity data: the shape here is borrowed from US IG and is the least reliable figure on this page. Managers report the steepest part of the curve between 7 and 10 years.',
      outlook='Euro IG net supply is expected to rise sharply in 2027 (BNP Paribas: €192bn, from €105bn).',
      why="Large treasuries with their own curves. Pitch only where the borrower's own YAS curve proves steep: typically mid-size utilities and grid operators with large capex.",
      examples='Grid operators and utilities with 2027–30 capex plans.'),
 dict(id='hyc', rank=None, grade='low', name='Sub-investment-grade companies, US and western Europe', who='BB, B and CCC issuers: sponsor-backed companies, cyclical industrials, telecoms and media, fallen angels',
      keys=['us_bb', 'us_b', 'us_ccc', 'eu_hy'], dir=f"Much wider: CCC {CCC[0]:,.0f}bp from {CCC[2]:,.0f}bp a year ago; BB {BB[0]:.0f}bp, B {B_[0]:.0f}bp", stress='CCC: yes (curve inverted)', meas=1, win=3,
      happened=f"High-yield spreads widened through 2026 with oil, hikes and the AI-related sell-off: US BB {BB[0]:.0f}bp (from {BB[2]:.0f}bp a year ago), single-B {B_[0]:.0f}bp (from {B_[2]:.0f}bp), CCC {CCC[0]:,.0f}bp (from {CCC[2]:,.0f}bp, the {CCC[1]}th percentile of the last three years). Euro high yield {EHY[0]:.0f}bp (from {EHY[2]:.0f}bp).",
      now="Levels are measured (ICE BofA, FRED); maturity shapes are not published free, so the page assumes the usual shapes: BB rising like investment grade, single-B flat, CCC inverted. On those shapes BB and B give a small positive wedge that grows with tenor; CCC gives a large negative one (the borrower would pay well over its bonds). For euro high yield, the quote-convention effect at these spread levels outweighs the timing effect on a 13-year floating-rate loan.",
      outlook='More downside if the AI-led correction or the oil shock deepens; CCC is already priced for defaults.',
      why='Playbook §8–9: for these borrowers a long amortising bond is out of reach, so lead with committed tenor and certainty of funding. Their loans are usually prepayable at par, which breaks the "hold to maturity" condition. The wedge is at most an appendix, for BB borrowers on long tenors, and never for CCC.',
      examples='BB-rated industrials and utilities with export capex; avoid B and CCC for this argument.'),
 dict(id='aus', rank=None, grade='na', name='Australian states and state companies', who='NSW TCorp, TCV, QTC, state-owned energy companies',
      keys=[], dir='Semi-government spreads steady (TCorp 10y about 59bp)', stress='None', meas=2, win=2,
      happened='Australian states fund large infrastructure and energy-transition programmes, mostly in Australian dollars.',
      now='Their curves slope upward, but they are quoted in AUD, which the Calculator does not support (it covers EUR, USD and GBP).',
      outlook='Large state infrastructure and energy-transition programmes keep issuance heavy.',
      why="Not measurable with our tools for AUD loans; for EUR or USD loans use the states' offshore curves. Adding AUD to the Calculator would make them measurable.",
      examples='TCorp, TCV, QTC, state energy companies.'),
 dict(id='hy', rank=None, grade='low', name='Sub-investment-grade governments', who='Colombia, Brazil, Türkiye, Egypt, Nigeria and other frontier issuers',
      keys=[], dir='Colombia EMBI 232bp (40th percentile since 2016)', stress='Often: curves can invert', meas=1, win=3,
      happened='Colombia (EMBI 232bp) and Brazil (200bp) are tight by their own history; frontier issuers returned to the euro and dollar markets in 2026.',
      now='Few bonds, and curves that flatten or invert when stress comes.',
      outlook='Most exposed to an acute risk-off.',
      why='Playbook §9: here a long amortising bond is out of reach, so lead with committed tenor and certainty of funding. The wedge is the appendix, if the curve allows it.',
      examples=None),
]
CARDS.sort(key=lambda c: c['rank'] or 99)   # ranked segments first, in rank order; the rest keep their order
GRADE = {'pri': 'Prioritise', 'sel': 'Selective', 'low': 'Low priority', 'na': 'Not measurable'}

# ---------------- euro governments on swaps today and a year ago (same pipeline); fixed-rate split (Calculator Results rows 34-35) ----------------
import ms_curves as MC
AAA = eur_rates(None)
ez1y = dict(ccy='EUR', m=1, swap=EURIBOR6M_1Y, ref=eur_rates('2025-11'), credit=ez_sov('2025-11'), src='')
r1y = E.run(MC.build_inputs(ez1y, fixing=None))
ezr = SEG['ezsov']['res']['std']
rpt = E.run(E.SAMPLE)
aaa, sw, ptsw = E.fill_curve(AAA), E.fill_curve(EURIBOR6M), E.fill_curve(E.SAMPLE['swap'])
SPLIT = dict(ez_f_sw=ezr['float']['net'], ez_x_sw=ezr['fixed']['net'], ez_rf_sw=ezr['fixed']['rf'], ez_cr_sw=ezr['fixed']['net'] - ezr['fixed']['rf'],
             ez_f_1y=r1y['float']['net'] * 1e4, ez_x_1y=r1y['fixed']['net'] * 1e4,
             sw7=E.interp_curve(sw, 7), sw13=E.interp_curve(sw, 13), aaa7=E.interp_curve(aaa, 7), aaa13=E.interp_curve(aaa, 13),
             pt_rf=(rpt['fixed']['rf_fwd'] - rpt['fixed']['rf_par']) * 1e4, pt_f=rpt['float']['net'] * 1e4, pt_x=rpt['fixed']['net'] * 1e4,
             pt7=E.interp_curve(ptsw, 12.5) * 100, pt24=E.interp_curve(ptsw, 24) * 100)
nck = len(CHK); nok = sum(c[3] == 'OK' for c in CHK); nfail = sum(c[3] == 'FAIL' for c in CHK)
SPLIT.update(n_checks=nck, n_ok=nok, n_check=nck - nok - nfail, n_fail=nfail)

# ---------------- headline numbers ----------------
NOW['ushq'] = {L: H['ushq']['2026-10'][L] for L in ('std', 'long')}   # HQM is monthly: 'now' is October, on October Treasuries
def pct(g, k, L='std'):
    xs = [v[L][k] for v in H[g].values()]; x = NOW[g][L][k]
    return round(100 * sum(1 for v in xs if v < x) / len(xs))
yr = lambda g, y, k: statistics.median(v['std'][k] for m, v in H[g].items() if m.startswith(y))
tops = sorted((k for k in SEG if SEG[k]['kind'] != 'stylised'), key=lambda k: -SEG[k]['res']['std']['float']['net'])[:5]
NAMES = {'us_hq': 'US high-grade', 'romania': 'Romania', 'mexico': 'Mexico', 'indo_eur': 'Indonesia (EUR)', 'poland': 'Poland', 'bulgaria': 'Bulgaria', 'aramco': 'Saudi Aramco',
         'phil': 'the Philippines', 'morocco': 'Morocco', 'ezsov': 'euro governments', 'us_hq': 'US high-grade', 'qatar': 'Qatar', 'us_ig': 'US IG', 'pif': 'PIF', 'chile_eur': 'Chile'}
top_names = ', '.join(NAMES[k] for k in tops[:-1]) + ' and ' + NAMES[tops[-1]]
tf = [SEG[k]['res']['std']['float']['net'] for k in tops]; tx = [SEG[k]['res']['std']['fixed']['net'] for k in tops]
ms_hq = sorted(H['ushq']); L10 = [H['ushq'][m]['slope']['10'] for m in ms_hq]; Wf = [H['ushq'][m]['std']['float'] for m in ms_hq]
q = sorted(L10); t1, t2 = q[len(q) // 3], q[2 * len(q) // 3]
V = dict(
    ez_f_now=NOW['ezsov']['std']['float'], ez_x_now=NOW['ezsov']['std']['fixed'], ez_f_pct=pct('ezsov', 'float'), ez_x_pct=pct('ezsov', 'fixed'),
    ez_x_12m=H['ezsov']['2025-11']['std']['fixed'], ez_f_max=max(v['std']['float'] for v in H['ezsov'].values()),
    hq_f_now=NOW['ushq']['std']['float'], hq_x_now=NOW['ushq']['std']['fixed'], hq_f_pct=pct('ushq', 'float'),
    hq_f_med=statistics.median(v['std']['float'] for v in H['ushq'].values()), hq_x_12m=H['ushq']['2025-10']['std']['fixed'],
    hq_wide=statistics.median(w for l, w in zip(L10, Wf) if l >= t2), hq_tight=statistics.median(w for l, w in zip(L10, Wf) if l < t1),
    top_f_lo=min(tf), top_f_hi=max(tf), top_x_lo=min(tx), top_x_hi=max(tx),
    **SPLIT, top_names=top_names, hq_x_pct=pct('ushq', 'fixed'),
    eursw_230_y=('+' if rates[0]['s230_y'] >= 0 else '−') + str(abs(round(rates[0]['s230_y']))), eursw_230=('+' if rates[0]['s230'] >= 0 else '−') + str(abs(round(rates[0]['s230']))),
    ez_x_2023=yr('ezsov', '2023', 'fixed'), hq_x_2023=yr('ushq', '2023', 'fixed'),
    usig_lo=min(SEG[k]['res']['std']['float']['net'] for k in ('us_ig', 'us_hq', 'us_bbb')), usig_hi=max(SEG[k]['res']['std']['float']['net'] for k in ('us_ig', 'us_hq', 'us_bbb')),
)
TWO = {'aaa7', 'aaa13', 'pt7', 'pt24', 'sw7', 'sw13'}
ZERO = {'n_checks', 'n_ok', 'n_check', 'n_fail'}
def fmt(v, k=''):
    if k in TWO: return f'{v:.2f}'
    if k in ZERO: return str(int(v))
    if isinstance(v, str): return v
    if isinstance(v, int): return f'{v:,}'
    s = f'{v:.1f}'; return s.replace('-', '−')

hist = {g: {m: {'float': v['std']['float'], 'fixed': v['std']['fixed']} for m, v in H[g].items()} for g in ('ezsov', 'ushq')}
hist['ushq'] = {m: v for m, v in hist['ushq'].items() if m <= '2026-10'}
hist['ezsov']['2026-11'] = {k: NOW['ezsov']['std'][k] for k in ('float', 'fixed')}   # the chart ends on the latest reading (6 Nov)
SOURCES = [
 ('Official data (read 6–9 November 2026)', [
   ('ECB Data Portal: euro area yield curves (AAA and all governments) and long-term interest rates by country', 'https://data.ecb.europa.eu/data/datasets/YC'),
   ('FRED: Treasury yields, ICE BofA corporate and EM corporate option-adjusted spreads, HQM corporate curve, Moody\'s Aaa/Baa', 'https://fred.stlouisfed.org/'),
   ('Bank of England: gilt par yields', 'https://www.bankofengland.co.uk/statistics/yield-curves'),
   ('Banco Central de Reserva del Perú: J.P. Morgan EMBI Global spreads', 'https://estadisticas.bcrp.gob.pe/estadisticas/series/'),
   ('Deutsche Bundesbank: German federal curve and bond yields by issuer', 'https://www.bundesbank.de/en/statistics/money-and-capital-markets')]),
 ('Policy and outlook', [
   ('CNBC: Fed holds at 3.75–4%, 28 Oct 2026', 'https://www.cnbc.com/2026/10/28/fed-meeting-today-live-updates.html'),
   ('CNN: two FOMC dissents in favour of a hike, 28 Oct 2026', 'https://www.cnn.com/2026/10/28/business/live-news/federal-reserve-interest-rate-october'),
   ('ECB holds deposit rate at 2.50%, 29 Oct 2026', 'https://euribor-rates.info/en/ecb-interest-rates/'),
   ('CNBC: IMF warns of a disorderly bond yield spike (GFSR, Oct 2026)', 'https://www.cnbc.com/2026/10/13/treasury-yields-imf-debt-inflation-.html'),
   ('IMF: G7 bond market functioning and euro area divergence, Oct 2026', 'https://www.imfconnect.org/content/dam/imf/News%20and%20Generic%20Content/GMM/Special%20Features/Special%20Feature%20-%20G7%20Bond%20Market%20Functioning%20and%20Euro-Area%20Divergence%20October%202026.pdf'),
   ('ING THINK: Dutch pension transitions and curve steepening', 'https://think.ing.com/articles/a-bigger-round-dutch-pension-transitions-puts-curve-steepening-back-in-play/'),
   ('Nuveen: fixed income weekly commentary (rates to end-2027)', 'https://www.nuveen.com/global/insights/fixed-income/fixed-income-weekly-commentary'),
   ('J.P. Morgan: 2026 mid-year outlook', 'https://www.jpmorgan.com/insights/global-research/outlook/mid-year-outlook'),
   ('MetLife: 2026 investment grade credit outlook', 'https://www.metlife.com/investments/global/insights/outlooks-and-market-updates/2026-investment-grade-credit-outlook/'),
   ('SSGA: emerging market debt commentary Q3 2026', 'https://www.ssga.com/us/en/institutional/insights/emerging-market-debt-commentary-q3-2026')]),
 ('Europe', [
   ('CNBC: France protests push bond yields higher, 19 Oct 2026', 'https://www.cnbc.com/2026/10/19/france-protests-bond-yields-markets.html'),
   ('ActionForex: France avoids downgrade', 'https://www.actionforex.com/action-insight/market-overview/658830-france-avoids-downgrade-but-eur-gbp-and-eur-chf-face-fresh-downside-tests/'),
   ('Romania Insider: Romania issues €4.5bn Eurobonds, 2 Nov 2026', 'https://www.romania-insider.com/business/romania-issues-eur-45-bln-eurobonds-borrowing-cost'),
   ('Bulgarian Ministry of Finance: euro bonds, 7 Jul 2026', 'https://www.minfin.bg/en/news/13442'),
   ('Bloomberg: Bulgaria sells €2.25bn of bonds, 29 Sep 2026', 'https://www.bloomberg.com/news/articles/2026-09-29/bulgaria-selling-2-25-billion-in-bonds-to-plug-budget-deficit'),
   ('Polish Ministry of Finance: pricing of EUR bond, Jan 2026', 'https://www.gov.pl/web/finance/pricing-of-eur-bond-20260109'),
   ('ING THINK: CEE issuance outlook 2026', 'https://think.ing.com/articles/issuance-outlook-cee-issuance-outlook-2026-diversify-pre-fund-switch-repeat/'),
   ('Amundi: euro credit market views, Oct 2026', 'https://www.amundi.com/institutional/article/euro-credit-market-views-eur-october-2026'),
   ('Disruption Banking: Europe\'s bond sell-off reaches corporate borrowers, 5 Nov 2026', 'https://www.disruptionbanking.com/2026/11/05/europes-bond-sell-off-has-reached-corporate-borrowers-what-does-it-mean-for-dealmaking/'),
   ('ECB blog: Big Tech in the euro area bond market, 31 Aug 2026', 'https://www.ecb.europa.eu/press/blog/date/2026/html/ecb.blog20260831~dac6a37e73.en.html')]),
 ('Emerging markets and Gulf', [
   ('Moroccan Ministry of Finance: €2.25bn euro bond, May 2026', 'https://www.finances.gov.ma/en/Pages/detail-actualite.aspx?fiche=7705'),
   ('Le Desk: Morocco closes €2.25bn eurobond, 19 May 2026', 'https://ledesk.ma/2026/05/19/le-maroc-boucle-un-eurobond-de-225-milliards-deuros-dans-un-marche-moins-porteur/'),
   ('Mexico Business News: US$9bn record sovereign deal, Jan 2026', 'https://mexicobusiness.news/finance/news/mexico-sets-us9-billion-sovereign-debt-record-start-2026'),
   ('Chile Ministry of Finance: €3.1bn euro bonds, Jul 2026', 'https://www.hacienda.cl/english/news-and-events/news/571342a9f76a6'),
   ('IFRE: Indonesia braves negative backdrop', 'https://www.ifre.com/bonds/2429232/indonesia-braves-negative-backdrop'),
   ('Philstar: the Philippines returns to the global debt market, Jan 2026', 'https://www.philstar.com/business/2026/01/21/2502321/philippines-returns-global-debt-market'),
   ('ADB AsianBondsOnline: local yields', 'https://asianbondsonline.adb.org/'),
   ('Gulf Business: Saudi Aramco US$4bn bond, Jan 2026', 'https://gulfbusiness.com/en/2026/finance/saudi-aramco-4bn-bond-sale-draws-investor-demand/'),
   ('Zawya: PIF three-part dollar bond, May 2026', 'https://www.zawya.com/en/capital-markets/bonds/saudi-pif-sets-three-part-dollar-bond-spreads-as-demand-tops-21.6bln-342365'),
   ('The Peninsula: Qatar US$3bn dual-tranche bond, Sep 2026', 'https://thepeninsulaqatar.com/article/28/09/2026/qatar-successfully-completes-usd-3-billion-dual-tranche-bond-sssuance'),
   ('AGBI: Gulf sovereign bonds hit by US borrowing costs, Aug 2026', 'https://www.agbi.com/analysis/markets/2026/08/gulf-sovereign-bonds-hit-by-surge-in-us-borrowing-costs/'),
   ('AGBI: high yields dampen Gulf issuance, Oct 2026', 'https://www.agbi.com/analysis/markets/2026/10/high-yields-dampen-gulf-appetite-for-issuing-new-debt/'),
   ('Muscat Daily: GCC debt issuance US$117bn in H1 2026', 'https://www.muscatdaily.com/2026/07/29/gcc-debt-issuances-climb-14-to-117bn-in-h1-2026/')]),
 ('US companies', [
   ('Yahoo Finance: Meta\'s bond sale and the new reality for tech debt', 'https://finance.yahoo.com/technology/articles/meta-bond-sale-shows-reality-200000968.html'),
   ('Hyperscalers exceed full-year debt forecasts as concessions rise', 'https://cryptobriefing.com/hyperscalers-exceed-full-year-debt-forecasts-as-ai-bond-concessions-rise/'),
   ('NSW TCorp: benchmark bonds and economic reports', 'https://tcorp.nsw.gov.au/benchmark-bonds/')]),
]
# ---------------- stress test of the swap curves (stress.py) and the size of the interest-rate part ----------------
ST = json.load(open(os.path.join(HERE, 'stress.json')))
HOW = {'ezsov': 'Measured yields (ECB)', 'us_hq': 'Measured yields (HQM)', 'us_ig': 'Treasuries + ICE spreads', 'phil': 'Treasuries + deal spreads', 'mexico': 'Treasuries + deal spreads',
       'romania': 'Mid-swap + deal spreads', 'poland': 'Mid-swap + deal spreads', 'bulgaria': 'Mid-swap + deal spreads', 'indo_eur': 'Mid-swap + deal spreads', 'morocco': 'Mid-swap + deal spreads'}
stress = []
for k, v in ST.items():
    ok = [x for x in v.values() if x]
    stress.append(dict(label=LABEL[k], how=HOW[k], fl=v['base']['float'], fx=v['base']['fixed'], rate=v['base']['rate'],
                       fl_lo=min(x['float'] for x in ok), fl_hi=max(x['float'] for x in ok), fx_lo=min(x['fixed'] for x in ok), fx_hi=max(x['fixed'] for x in ok)))
rfs = {k: SEG[k]['res']['std']['fixed']['rf'] for k in SEG if SEG[k]['kind'] != 'stylised'}
convs = [SEG[k]['res']['std']['float']['conv'] for k in SEG if SEG[k]['ccy'] == 'EUR' and SEG[k]['kind'] != 'stylised']
def bf(ccy):
    ks = [k for k in SEG if SEG[k]['ccy'] == ccy and SEG[k]['kind'] != 'stylised']
    ch = [100 * (SEG[k]['scen']['bearflat']['std']['fixed'] - SEG[k]['res']['std']['fixed']['net']) / SEG[k]['res']['std']['fixed']['net'] for k in ks]
    return str(round(-max(ch))), str(round(-min(ch)))
V.update(rf_lo=min(rfs.values()), rf_hi=max(rfs.values()), rf_eur=statistics.median(v for k, v in rfs.items() if SEG[k]['ccy'] == 'EUR'),
         rf_usd=statistics.median(v for k, v in rfs.items() if SEG[k]['ccy'] == 'USD'),
         conv_lo=-max(convs), conv_hi=-min(convs), eur_bf_lo=bf('EUR')[0], eur_bf_hi=bf('EUR')[1], usd_bf_lo=bf('USD')[0], usd_bf_hi=bf('USD')[1])
DATA = dict(hist=hist, seg=seg, order=list(seg), scen=SCN, scenOrder=['base', 'bearflat', 'bullsteep', 'gradual', 'shock'],
            cards=CARDS, gradeName=GRADE, rates=rates, sources=SOURCES, checks=CHK, stress=stress)

html = open(os.path.join(HERE, 'ms_template.html')).read()
html = html.replace('{{DATA}}', json.dumps(DATA, ensure_ascii=False, separators=(',', ':')).replace('</', '<\\/'))
missing = set()
def sub(m):
    k = m.group(1)
    if k not in V: missing.add(k); return m.group(0)
    return fmt(V[k], k)
html = html.replace('today 12.8bp against government curves', 'today {{ez_x_now}}bp against government curves').replace('fixed-rate wedge of 12.8bp, steeper', 'fixed-rate wedge of {{ez_x_now}}bp, steeper').replace('against 12.8 and {{hq_x_now}}bp today', 'against {{ez_x_now}} and {{hq_x_now}}bp today')
html = re.sub(r'\{\{(\w+)\}\}', sub, html)
assert not missing, missing
open(OUT, 'w').write(html)
print('wrote', os.path.normpath(OUT), len(html), 'bytes'); print({k: fmt(v) for k, v in V.items()})
