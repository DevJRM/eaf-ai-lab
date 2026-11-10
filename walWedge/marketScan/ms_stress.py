"""Stress test: how much do the wedges depend on the swap curve? All-in yields (real) are kept; only the swap curve changes,
except in 'data error' cases where the swap data feed both the discount curve and the mid-swap-based yields."""
import json, copy, os
from ms_curves import SEGS, build_inputs, at, E
ESTR = {1: 2.83, 2: 2.93, 3: 2.96, 4: 2.97, 5: 2.98, 7: 3.02, 8: 3.05, 10: 3.11, 15: 3.21, 20: 3.23, 30: 3.13}
from ms_engine import EURIBOR6M, SOFR, eur_rates, usd_rates, HERE
KEYS = ['ezsov', 'us_hq', 'romania', 'poland', 'bulgaria', 'indo_eur', 'phil', 'mexico', 'morocco', 'us_ig']
def run(s):
    out = {}
    r = E.run(build_inputs(s))
    for k in ('float', 'fixed'):
        x = r[k]; out[k] = x['net'] * 1e4
        out[k + '_conv'] = x['convention'] * 1e4
    f = r['fixed']; out['rate'] = (f['rf_fwd'] - f['rf_par']) * 1e4; out['credit'] = out['fixed'] - out['rate']
    return out
def twist(c, d13):   # pivot at 7y: 0 up to 7y, +d13 at 13y, flat beyond
    return {T: v + (0 if T <= 7 else d13 / 100 * min(1, (T - 7) / 6)) for T, v in c.items()}
def variant(s, name):
    s = copy.deepcopy(s); ms = s['ref'] is EURIBOR6M or s['ref'] == EURIBOR6M
    if name == 'base': return s
    if name == 'estr' and s['ccy'] == 'EUR':          # other risk-free basis; all-in yields unchanged
        s['swap'] = ESTR; return s
    if name == 'gov':                                   # government curve as the discount curve; all-in unchanged
        s['swap'] = eur_rates(None) if s['ccy'] == 'EUR' else usd_rates(None); return s
    if name in ('twist+10', 'twist-10'):                # swap curve steeper/flatter 7y->13y, all-in yields unchanged
        s['swap'] = twist(s['swap'], 10 if name == 'twist+10' else -10); return s
    if name in ('err+10', 'err-10'):                    # swap DATA wrong by that twist: mid-swap yields move with it
        d = 10 if name == 'err+10' else -10
        s['swap'] = twist(s['swap'], d)
        if ms: s['ref'] = s['swap']
        return s
    if name == 'level+25':
        s['swap'] = {T: v + 0.25 for T, v in s['swap'].items()}
        if ms: s['ref'] = s['swap']
        return s
    return None
VARS = ['base', 'estr', 'gov', 'twist+10', 'twist-10', 'err+10', 'err-10', 'level+25']
R = {}
for k in KEYS:
    R[k] = {}
    for v in VARS:
        s = variant(SEGS[k], v)
        if s is None: continue
        try: R[k][v] = run(s)
        except ValueError: R[k][v] = None
print('FLOAT / FIXED std loan')
print(f"{'':10s}" + ''.join(f"{v:>15s}" for v in VARS))
for k in KEYS:
    print(f"{k:10s}" + ''.join((f"{R[k][v]['float']:6.1f}/{R[k][v]['fixed']:5.1f}   " if R[k].get(v) else ' ' * 15) for v in VARS))
print('\nDECOMPOSITION (base): fixed = rate part + credit part; float and the two quote-convention effects')
for k in KEYS:
    b = R[k]['base']; print(f"{k:10s} fixed {b['fixed']:5.1f} = rate {b['rate']:4.1f} + credit {b['credit']:5.1f} | float {b['float']:5.1f} | conv float {b['float_conv']:5.1f}  conv fixed {b['fixed_conv']:5.1f} | fixed-float {b['fixed']-b['float']:5.1f}")
json.dump(R, open(os.path.join(HERE, 'stress.json'), 'w'))
