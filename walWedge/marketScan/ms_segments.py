"""Indicative wedge per segment (curves and checks from ms_curves.py), plus end-2027 scenarios. Writes segments.json."""
import json, os
from ms_curves import SEGS, CHECKS, run_seg, note, flag
from ms_engine import HERE

SCEN = {
 'base':  dict(name='Base: consensus', usd={2: 0, 10: -10, 30: -10}, eur={2: 0, 10: 0, 30: 15}, mult=1.1, add=None,
               note='Fed and ECB near their peaks, US 10y towards 4.75% (Nuveen), Dutch pension switch steepens EUR 10s30s about 15bp (ING), credit spreads modestly wider from the tights (JPM)'),
 'bearflat': dict(name='Hikes and oil: bear flattener', usd={2: 75, 5: 50, 10: 25, 30: 10}, eur={2: 75, 5: 50, 10: 25, 30: 10}, mult=1.0, add={2: 30, 10: 20, 30: 15},
               note='Oil stays above $100 and central banks keep hiking: short rates up most, as in 2022; credit spreads a little wider, front first'),
 'bullsteep': dict(name='Oil normalises: bull steepener', usd={2: -100, 5: -70, 10: -40, 30: -20}, eur={2: -75, 5: -50, 10: -25, 30: 0}, mult=0.9, add=None,
               note='Energy prices fall and cuts return in 2027: short rates fall most; credit spreads tighten a little'),
 'gradual': dict(name='Gradual credit widening', usd={2: 0, 30: 0}, eur={2: 0, 30: 0}, mult=1.4, add=None,
               note='Supply (hyperscalers, fiscal deficits) pushes credit spreads 40% wider over a year, in proportion, as in 2022'),
 'shock':  dict(name='Acute credit shock', usd={2: -60, 10: -30, 30: -15}, eur={2: -40, 10: -20, 30: -10}, mult=1.0, add={2: 140, 5: 110, 10: 80, 20: 60, 30: 55},
               note='A sudden risk-off (an AI-led correction, a sovereign event: IMF GFSR Oct 2026): short credit spreads jump most, as in March 2020'),
}

OUT = {}
for k, s in SEGS.items():
    r = run_seg(s)
    std = r['std']
    lam = min(std['float']['minlam'], std['fixed']['minlam'])
    # the Calculator's own flags, on every segment
    flag(k, 'Bridge coupon vs YTM (Results rows 54–55)', std['gap'], 'Z-spread solved from the all-in yield, so the bridge reproduces the yield', ok=1, warn=1)
    if lam < 0:
        note(k, 'Negative default intensity (Results row 52)', 'CHECK',
             f"λ falls to {lam:.4f} at the short end: the Z-spread over swaps is negative there (government yields under swaps), "
             "which the engine reads as a negative credit cost, as in the tutorial's Portugal example; it lowers the wedge slightly")
    reprice = max(std['float']['reprice'], std['fixed']['reprice'])
    flag(k, 'Bootstrap reprices every par bond', reprice, 'largest repricing error of the λ bootstrap', ok=0.1, warn=1)
    OUT[k] = dict(ccy=s['ccy'], src=s['src'], kind=s['kind'], date=s['date'],
                  credit={str(T): round(v, 1) for T, v in s['credit'].items()},
                  curve={str(T): round(v, 1) for T, v in std['z'].items() if T in (1, 2, 3, 5, 7, 10, 13, 15, 20, 25, 30) or T == max(std['z'])},
                  res={L: {m: {'net': round(r[L][m]['net'], 2), 'rf': round(r[L][m]['rf'], 2), 'timing': round(r[L]['timing'][m], 2),
                               'conv': round(r[L]['conv'][m], 2)} for m in ('float', 'fixed')} for L in ('std', 'long')},
                  minlam=lam)
    OUT[k]['scen'] = {}
    for sk, sc in SCEN.items():
        try:
            rr = run_seg(s, d_rates=sc['usd'] if s['ccy'] == 'USD' else sc['eur'], mult=sc['mult'], add=sc['add'])
            OUT[k]['scen'][sk] = {L: {m: round(rr[L][m]['net'], 2) for m in ('float', 'fixed')} for L in ('std', 'long')}
        except ValueError:      # the closed-form bootstrap has no solution: spreads imply default before the bond can pay
            OUT[k]['scen'][sk] = None
            note(k, f'Scenario not computable: {sc["name"]}', 'CHECK', 'the engine\'s closed-form λ bootstrap (Calc_*!H:P) finds no solution for this curve; a limit of the engine at high yields, to look at separately')

json.dump({'segments': OUT, 'scenarios': SCEN, 'checks': CHECKS}, open(os.path.join(HERE, 'segments.json'), 'w'), indent=1, ensure_ascii=False)
if __name__ == '__main__':
    print(f"{'':10s}{'now':>16s}" + ''.join(f"{s:>16s}" for s in SCEN))
    for k, v in OUT.items():
        row = [(v['res']['std']['float']['net'], v['res']['std']['fixed']['net'])] + [(v['scen'][s]['std']['float'], v['scen'][s]['std']['fixed']) if v['scen'][s] else (float('nan'),) * 2 for s in SCEN]
        print(f"{k:10s}" + ''.join(f"{a:7.1f} /{b:6.1f}  " for a, b in row))
    bad = [c for c in CHECKS if c[3] != 'OK']
    print(len(CHECKS), 'checks,', len(bad), 'not OK:')
    for c in bad: print('  ', c[:4])
