"""Monthly wedge history 2016-01 .. 2026-11, built like today's figures (ms_curves.py): all-in yields = reference + credit,
Z-spread solved by inverting the bridge, annual points up to the last quoted maturity. No free swap history exists, so the
reference and discount curve here is the government curve (ECB AAA par curve; Treasuries)."""
import json, os, statistics
from ms_curves import build_inputs, E
from ms_engine import months, eur_rates, ez_sov, usd_rates, us_hq, LOANS, HERE

def seg(ccy, gov, credit):
    return dict(ccy=ccy, m=1 if ccy == 'EUR' else 2, swap=gov, ref=gov, credit=credit, src='')

GROUPS = {'ezsov': lambda mo: seg('EUR', eur_rates(mo), ez_sov(mo)),
          'ushq': lambda mo: seg('USD', usd_rates(mo), us_hq(mo))}
H = {}
for g, f in GROUPS.items():
    H[g] = {}
    for mo in months():
        s = f(mo)
        if any(v is None for v in list(s['swap'].values()) + list(s['credit'].values())): continue
        res = {}
        for L in LOANS:
            r = E.run(build_inputs(s, loan=L, fixing=None))
            res[L] = {k: round(r[k]['net'] * 1e4, 2) for k in ('float', 'fixed')}
        res['slope'] = {str(T): round(v, 1) for T, v in s['credit'].items()}
        H[g][mo] = res
NOW = {'ezsov': {L: dict(zip(('float', 'fixed'), (lambda r: (round(r['float']['net'] * 1e4, 2), round(r['fixed']['net'] * 1e4, 2)))(E.run(build_inputs(seg('EUR', eur_rates(None), ez_sov(None)), loan=L, fixing=None))))) for L in LOANS},
       'ushq': {L: H['ushq']['2026-10'][L] for L in LOANS}}
for g in H:
    xs = [v['std']['float'] for v in H[g].values()]; xf = [v['std']['fixed'] for v in H[g].values()]
    print(g, len(H[g]), 'now', NOW[g]['std'], 'pct float', round(100 * sum(x < NOW[g]['std']['float'] for x in xs) / len(xs)), 'fixed', round(100 * sum(x < NOW[g]['std']['fixed'] for x in xf) / len(xf)),
          'median', round(statistics.median(xs), 1), round(statistics.median(xf), 1), 'max float', max(xs))
json.dump({'hist': H, 'now': NOW}, open(os.path.join(HERE, 'history.json'), 'w'))
