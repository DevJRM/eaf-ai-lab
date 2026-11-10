"""Market scan: shared data and helpers. Loads snapshot.json (written by ms_fetch.py), holds the swap curves typed in by
hand, and builds government and credit curves by month. Prices loans with the WAL Wedge engine (../wal_wedge_engine.py)."""
import json, os, statistics, sys

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, '..'))
import wal_wedge_engine as E

S = json.load(open(os.path.join(HERE, 'snapshot.json')))
# Swap curves (par, %): BlueGamma, 6 Nov 2026 close, and one year earlier (7 Nov 2025 EURIBOR, 5 Nov 2025 SOFR).
EURIBOR6M = {1: 3.21, 2: 3.28, 3: 3.29, 4: 3.29, 5: 3.29, 7: 3.30, 8: 3.31, 10: 3.34, 15: 3.40, 20: 3.38, 30: 3.23}
EURIBOR6M_1Y = {1: 2.14, 2: 2.15, 3: 2.22, 4: 2.30, 5: 2.38, 7: 2.51, 8: 2.58, 10: 2.69, 15: 2.90, 20: 2.97, 30: 2.97}
SOFR = {1: 4.24, 2: 4.34, 3: 4.38, 4: 4.37, 5: 4.36, 7: 4.39, 8: 4.41, 10: 4.46, 15: 4.59, 20: 4.65, 30: 4.59}
SOFR_1Y = {1: 3.67, 2: 3.47, 3: 3.39, 4: 3.41, 5: 3.45, 7: 3.56, 8: 3.61, 10: 3.72, 15: 3.94, 20: 4.03, 30: 4.00}
LOANS = {'std': dict(x=1.0, y=12.0), 'long': dict(x=2.0, y=18.0)}   # 13y (WAL ~7) and 20y (WAL ~11) amortisers


def mavg(sid, month):
    v = [x for k, x in S[sid].items() if k.startswith(month)]
    return statistics.mean(v) if v else None


def last(sid, upto=None):
    ks = [k for k in S[sid] if upto is None or k <= upto]
    k = max(ks); return S[sid][k], k


def price(ccy, m, rates, spread_bp, loan='std', recovery=0.40):
    """rates {T: % par}, spread_bp {T: bp over the rates curve}. Returns the engine's float/fixed results."""
    W = E.swap_discount(dict(currency=ccy, swap_basis='EURIBOR6M', swap={T: r / 100 for T, r in rates.items()}, fixing_6m=None))['W']  # basis only matters for USD/GBP accrual
    z = E.fill_curve(spread_bp)
    ytm = {T: E.bridge_coupon(W, z[T - 1] / 1e4, T, m) for T in spread_bp}
    inp = dict(name='seg', currency=ccy, amount=1e9, profile={'type': 'linear'}, X_float_bp=0.0, X_fixed_bp=0.0,
               recovery=recovery, swap_basis='EURIBOR6M', coupon_freq=m, fixing_6m=None,
               z_bp=dict(spread_bp), ytm=ytm, swap={T: r / 100 for T, r in rates.items()}, **LOANS[loan])
    r = E.run(inp)
    out = {}
    for k in ('float', 'fixed'):
        x = r[k]
        out[k] = dict(rf=(x['rf_fwd'] - x['rf_par']) * 1e4 if k == 'fixed' else 0.0, net=x['net'] * 1e4, timing=x['timing'] * 1e4, conv=x['convention'] * 1e4, WAL=x['WAL'],
                      fair=x['fair'] * 1e4, charged=x['charged'] * 1e4, minlam=x['min_lam'])
    return out


def spot_to_par(spot):
    """{T: % spot, semi-annual compounding} -> {T: % par, semi-annual coupons}."""
    Ts = sorted(spot)
    def s_at(t):
        if t <= Ts[0]: return spot[Ts[0]]
        if t >= Ts[-1]: return spot[Ts[-1]]
        lo = max(x for x in Ts if x <= t); hi = min(x for x in Ts if x >= t)
        return spot[lo] if hi == lo else spot[lo] + (spot[hi] - spot[lo]) * (t - lo) / (hi - lo)
    out = {}
    for T in Ts:
        d = [(1 + s_at(j / 2) / 200) ** (-j) for j in range(1, 2 * T + 1)]
        out[T] = 200 * (1 - d[-1]) / sum(d)
    return out


# ---------------- segment curves for one month ('YYYY-MM') or the latest day (month=None) ----------------
def get(sid, month):
    if month is None: return last(sid)[0]
    return mavg(sid, month)


def eur_rates(month):
    return {T: get(f'ECB_G_N_A_{T}', month) for T in (2, 5, 10, 20, 30)}


def ez_sov(month):
    return {T: (get(f'ECB_G_N_C_{T}', month) - get(f'ECB_G_N_A_{T}', month)) * 100 for T in (2, 5, 10, 20, 30)}


def usd_rates(month):
    return {T: get(sid, month) for T, sid in ((1, 'DGS1'), (2, 'DGS2'), (3, 'DGS3'), (5, 'DGS5'), (7, 'DGS7'),
                                              (10, 'DGS10'), (20, 'DGS20'), (30, 'DGS30'))}


def us_hq(month):
    """US high-quality (AA-A) corporates: Treasury HQM spot curve -> par, minus Treasury par yields."""
    hm = month or max(S['HQMCB10YR'])[:7]                 # HQM is monthly and lags: 'now' is its latest month
    if not any(k.startswith(hm) for k in S['HQMCB10YR']):
        return {1: None}
    spot = {T: mavg(f'HQMCB{T}YR', hm) for T in (1, 2, 3, 5, 7, 10, 15, 20, 25, 30)}
    par = spot_to_par(spot); r = usd_rates(hm)
    rf = E.fill_curve(r)
    return {T: (par[T] - rf[T - 1]) * 100 for T in par}


def us_ice(month, scale=1.0):
    """ICE BofA US corporate OAS by maturity band (FRED, from Nov 2023): band mid-points."""
    bands = ((2, 'BAMLC1A0C13Y'), (4, 'BAMLC2A0C35Y'), (6, 'BAMLC3A0C57Y'), (8, 'BAMLC4A0C710Y'),
             (12, 'BAMLC7A0C1015Y'), (22, 'BAMLC8A0C15PY'))
    return {T: get(sid, month) * 100 * scale for T, sid in bands}


def gbp_rates(month):
    return {T: get(f'BOE_{c}', month) for T, c in ((5, 'IUDSNPY'), (10, 'IUDMNPY'), (20, 'IUDLNPY'))}


def over(curve, base_from, base_to):
    """Re-base a spread curve {T: bp} from one rates curve to another: + (from − to) at each tenor."""
    a, b = E.fill_curve(base_from), E.fill_curve(base_to)
    return {T: v + (a[T - 1] - b[T - 1]) * 100 for T, v in curve.items()}


def months(a='2016-01', b='2026-11'):
    y, m = map(int, a.split('-')); out = []
    while f'{y}-{m:02d}' <= b:
        out.append(f'{y}-{m:02d}'); m += 1
        if m == 13: y, m = y + 1, 1
    return out


if __name__ == '__main__':
    print('EUR rates', {k: round(v, 3) for k, v in eur_rates(None).items()})
    print('EZ sov spread', {k: round(v, 1) for k, v in ez_sov(None).items()})
    print('USD rates', usd_rates(None))
    print('US HQ (HQM par - UST)', {k: round(v, 1) for k, v in us_hq(None).items()})
    print('US ICE bands', us_ice(None))
    print('GBP rates', gbp_rates(None))
    for nm, args in (('EZ sov', ('EUR', 1, eur_rates(None), ez_sov(None))),
                     ('US HQM', ('USD', 2, usd_rates(None), us_hq(None))),
                     ('US ICE', ('USD', 2, usd_rates(None), us_ice(None)))):
        for L in LOANS:
            r = price(*args, loan=L)
            print(f'{nm:8s} {L:4s} WAL {r["float"]["WAL"]:.2f}  float {r["float"]["net"]:6.2f} (timing {r["float"]["timing"]:.2f})  fixed {r["fixed"]["net"]:6.2f} (timing {r["fixed"]["timing"]:.2f})')
