"""Market scan: segment curves with provenance and data checks.

Every segment is an all-in yield curve = reference curve + credit spread, tenor by tenor:
  reference  the curve the spread is quoted against (EURIBOR 6M swaps, the AAA government curve, Treasuries)
  credit     the borrower's spread over that reference (deal pricing, official indices or a stated stylised shape)
The loan is priced against the swap curve of its currency. The Z-spread over swaps is solved from the all-in yield by
inverting the engine's bridge (Calculator Curves!AB), so the Calculator's own check (Results rows 54-55, bridge coupon
vs YTM) holds by construction, and negative default intensities (row 52) are reported, not hidden.
Scenarios move the reference and swap curves together (the government-swap gap is kept) and the credit spread alone.
"""
import statistics
from ms_engine import *

UST_PTS = {1: 'DGS1', 2: 'DGS2', 3: 'DGS3', 5: 'DGS5', 7: 'DGS7', 10: 'DGS10', 20: 'DGS20', 30: 'DGS30'}
BENCH = {3: 3, 4: 3, 5: 5, 5.5: 5, 6: 5, 7: 7, 8: 7, 9: 7, 10: 10, 12: 10, 25: 30, 30: 30}   # on-the-run Treasury a new issue is priced over
EURIBOR_2NOV = {1: 3.24, 2: 3.35, 3: 3.36, 4: 3.36, 5: 3.36, 7: 3.37, 8: 3.38, 10: 3.41, 15: 3.46, 20: 3.43, 30: 3.27}
ICE_HY = {'BB': 'BAMLH0A1HYBB', 'B': 'BAMLH0A2HYB', 'CCC': 'BAMLH0A3HYC'}


def ust(day=None):
    return {T: last(s, day)[0] if day else last(s)[0] for T, s in UST_PTS.items()}


def at(curve, T):
    return E.interp_curve(E.fill_curve(curve), T)


def ice_shape():
    """ICE BofA US corporate OAS by maturity band relative to the index (6 Nov 2026)."""
    b = us_ice(None); idx = last('BAMLC0A0CM')[0] * 100
    return {T: v / idx for T, v in b.items()}


CHECKS = []   # [segment, check, measured, status, note]


def flag(seg, check, gap_bp, note, ok=5, warn=15):
    st = 'OK' if abs(gap_bp) <= ok else 'CHECK' if abs(gap_bp) <= warn else 'FAIL'
    CHECKS.append([seg, check, round(gap_bp, 1), st, note])


def note(seg, check, status, text):
    CHECKS.append([seg, check, None, status, text])


# ---------------- deal-based credit curves ----------------
def usd_deal(seg, day, pts, embi=None, coupon_adj=0.0):
    """pts: (T, spread over the on-the-run benchmark in bp or None, coupon % or None).
    Returns the spread over the interpolated Treasury curve on the deal date, re-levelled by the EMBI move if given."""
    u = ust(day); out = {}
    for T, sp, cpn in pts:
        b = BENCH.get(T, T); bench = at(u, b)
        if sp is not None:
            y = bench + sp / 100
            if cpn is not None:
                flag(seg, f'{T}y coupon vs Treasury + spread', (cpn - y) * 100,
                     f'coupon {cpn:.3f}% against {b}y Treasury {bench:.2f}% + {sp:g}bp on {day}'
                     + ('. Coupons under the yield are usual for issues priced below par, but this gap is larger than coupon rounding; the published spread is used' if (y - cpn) * 100 > 12.5
                        else '; consistent' if abs(y - cpn) * 100 <= 5 else '; within coupon rounding, the published spread is used'))
        else:
            y = cpn + coupon_adj
            note(seg, f'{T}y from coupon', 'CHECK' if coupon_adj else 'OK',
                 f'no spread published: yield taken as the {cpn:.3f}% coupon' + (f' + {coupon_adj * 100:.0f}bp, the gap seen on this issuer\'s other tranches' if coupon_adj else ''))
        out[T] = (y - at(u, T)) * 100
    if embi:
        code, nm = embi; d = (last(code)[0] - last(code, day)[0])
        out = {T: v + d for T, v in out.items()}
        note(seg, 'Re-levelled to today', 'OK', f'EMBI {nm} {last(code, day)[0]:.0f}bp on {day}, {last(code)[0]:.0f}bp on 6 Nov 2026: curve moved by {d:+.0f}bp')
    return out


def eur_deal(seg, day, pts, swap_on_day=None, peers=None):
    """pts: (T, spread over mid-swaps bp, reported yield % or None). Spreads over mid-swaps are credit over EURIBOR swaps."""
    out = {}
    for T, sp, y in pts:
        out[T] = float(sp)
        if y is not None and swap_on_day:
            flag(seg, f'{T}y yield vs mid-swap + spread', (y - (at(swap_on_day, T) + sp / 100)) * 100,
                 f'reported {y:.2f}% against swap {at(swap_on_day, T):.2f}% + {sp}bp on {day}; reported yields are rounded to 0.1%', ok=6)
        elif y is not None:
            note(seg, f'{T}y implied mid-swap', 'OK', f'yield {y:.3f}% − {sp}bp = mid-swap {y - sp / 100:.2f}% on {day}' + (f'; {peers}' if peers else ''))
    return out


# ---------------- swap curves: check against official fixings; first 6-month fixing for the engine ----------------
FIX6M = {'EUR': last('ECB_EURIBOR6M')[0], 'USD': (SOFR[1] + 4.06) / 2}    # EUR: ECB, Oct 2026 average; USD: between the 3M and 1Y SOFR swaps
flag('rates', '€STR swap, 1 month vs €STR fixing', (2.45 - last('ECB_ESTR')[0]) * 100, f"BlueGamma 1-month €STR swap 2.45% against the ECB's €STR fixing {last('ECB_ESTR')[0]:.3f}% (6 Nov 2026)", ok=3)
flag('rates', 'SOFR swap, 1 month vs SOFR fixing', (3.89 - last('SOFR')[0]) * 100, f"BlueGamma 1-month SOFR swap 3.89% against the New York Fed's SOFR {last('SOFR')[0]:.2f}% (FRED, 6 Nov 2026)", ok=3)
fwd = (2 * EURIBOR6M[1] - FIX6M['EUR'])          # 6x12 EURIBOR forward implied by the 1y swap and the fixing (simple average)
ois_fwd = 2 * 2.83 - 2.67; basis = FIX6M['EUR'] - 2.67
flag('rates', 'EURIBOR 1y swap vs fixing and €STR curve', (fwd - (ois_fwd + basis)) * 100,
     f"the 1y EURIBOR swap 3.21% with the 6M fixing {FIX6M['EUR']:.2f}% (ECB, Oct average) implies a 6x12 forward of {fwd:.2f}%; the €STR curve plus today's EURIBOR–€STR basis ({basis * 100:.0f}bp) implies {ois_fwd + basis:.2f}%", ok=8, warn=20)
RAIFF = {1: 3.199, 2: 3.275, 3: 3.275, 4: 3.276, 5: 3.268}       # Raiffeisen Certificates, EUR swap (annual vs 6M EURIBOR), 9–10 Nov 2026
BG_9NOV = {1: 3.21, 2: 3.29, 3: 3.29, 4: 3.29, 5: 3.28}
flag('rates', 'EURIBOR swaps 1–5y vs a second source', max(abs(BG_9NOV[T] - RAIFF[T]) for T in RAIFF) * 100,
     'BlueGamma against Raiffeisen Certificates, 1 to 5 years, same day: largest gap shown', ok=3)
flag('rates', 'EURIBOR 10y swap vs a second source', (3.41 - 3.428) * 100, 'BlueGamma 3.41% (2 Nov) against Investing.com 3.428% (3 Nov)', ok=3)
note('rates', 'EURIBOR and SOFR swaps beyond 10 years', 'CHECK', 'one source only (BlueGamma, indicative); this part of the curve drives the wedge on 20-year loans')
flag('rates', 'Treasury–SOFR spreads plausible', 0, 'Treasuries 17bp above SOFR swaps at 2 years, 40bp at 10, 67bp at 30: long-dated swap spreads have been negative since 2008 (St. Louis Fed, Bloomberg)', ok=1)
note('rates', 'Government and swap curves on the same date', 'OK', 'AAA curve, Treasuries, EURIBOR and SOFR swaps are all 6 November 2026 closes; HQM is the October 2026 monthly curve')

# ---------------- reference curves today ----------------
AAA, UST_NOW, UST_OCT = eur_rates(None), ust(), ust('2026-10-30')
SEGS = {}   # key: dict(ccy, m, swap, ref, credit, kind, src, date)


def seg(key, ccy, ref, credit, kind, src, date):
    SEGS[key] = dict(ccy=ccy, m=1 if ccy == 'EUR' else 2, swap=EURIBOR6M if ccy == 'EUR' else SOFR, ref=ref, credit=credit, kind=kind, src=src, date=date)


ez = ez_sov(None)
seg('ezsov', 'EUR', AAA, ez, 'measured', 'ECB par curves: all euro area governments over the AAA curve', '6 Nov 2026')
seg('france', 'EUR', AAA, {T: v * 150 / ez[10] for T, v in ez.items()}, 'stylised', 'OAT–Bund about 150bp at 10y (late Oct 2026); maturity shape of the ECB aggregate', 'late Oct 2026')
seg('italy', 'EUR', AAA, {T: v * 89 / ez[10] for T, v in ez.items()}, 'stylised', 'BTP–Bund 89bp at 10y (ECB, Sep 2026 average); maturity shape of the ECB aggregate', 'Sep 2026')
seg('poland', 'EUR', EURIBOR6M, eur_deal('poland', '9 Jan 2026', [(5, 43, 2.964), (10, 83, 3.739)], peers='consistent with the swap level implied by Chile and Bulgaria later in the year'),
    'new issue', 'New issue 9 Jan 2026, spread over mid-swaps (Ministry of Finance)', 'Jan 2026')
seg('romania', 'EUR', EURIBOR6M, eur_deal('romania', '2 Nov 2026', [(4, 190, 5.3), (8, 285, 6.2), (12, 335, 6.8)], EURIBOR_2NOV),
    'new issue', 'New issue 2 Nov 2026, spread over mid-swaps (Romania Insider)', 'Nov 2026')
seg('bulgaria', 'EUR', EURIBOR6M, eur_deal('bulgaria', '29 Sep 2026', [(5, 60, None), (8, 95, None), (18, 160, None)]),
    'new issue', 'New issue 29 Sep 2026 (2031, 2034, 2044 bonds), spread over mid-swaps (Bloomberg, Capital.bg)', 'Sep 2026')
eur_deal('bulgaria', '7 Jul 2026', [(6, 60, 3.4), (12, 115, 4.3)], peers='July deal, used only as a check')
seg('morocco', 'EUR', EURIBOR6M, eur_deal('morocco', '19 May 2026', [(8, 170, None), (12, 200, None)]),
    'new issue', 'New issue 19 May 2026, spread over mid-swaps (Ministry of Finance, Yabiladi)', 'May 2026')
note('morocco', 'Two points only', 'CHECK', 'no yields published; shape before 8 years is assumed flat (the Calculator\'s rule)')
seg('indo_eur', 'EUR', EURIBOR6M, eur_deal('indo_eur', 'May 2026', [(7, 145, None), (12, 185, None)]),
    'new issue', 'EUR tranches May 2026, spread over mid-swaps (IFRE)', 'May 2026')
note('indo_eur', 'Single secondary source', 'CHECK', 'IFRE only; no official release or yields found')
seg('chile_eur', 'EUR', EURIBOR6M, {**{T: v + 12 for T, v in eur_deal('chile_eur', '27 Jul 2026', [(8, 110, 4.101), (12, 120, 4.424)], peers='close to Bulgaria\'s implied swap level in July').items()}, 20: 150 + 12},
    'new issue', 'New issue 27 Jul 2026 (8y +110, 12y +120; 20y about +150 from Bloomberg guidance), re-levelled with EMBI Chile', 'Jul 2026')
note('chile_eur', '20y from guidance', 'CHECK', 'the 20-year point is pre-pricing guidance, not the final spread')
note('chile_eur', 'Re-levelled to today', 'OK', f"EMBI Chile {last('BCRP_PD43671XD', '2026-07-27')[0]:.0f}bp on 27 Jul, {last('BCRP_PD43671XD')[0]:.0f}bp on 6 Nov 2026: +12bp")
shape = ice_shape()
seg('eu_ig', 'EUR', AAA, {T: v * 109 for T, v in shape.items()}, 'stylised', 'Euro IG ~109bp over German public bonds (Bundesbank, Oct 2026); maturity shape of US IG (ICE)', 'Oct 2026')
seg('us_bbb', 'USD', UST_NOW, {T: v * last('BAMLC0A4CBBB')[0] * 100 for T, v in shape.items()}, 'stylised', f"ICE BofA US BBB OAS {last('BAMLC0A4CBBB')[0] * 100:.0f}bp (FRED, 6 Nov 2026); maturity shape of the whole US IG index", '6 Nov 2026')
seg('us_ig', 'USD', UST_NOW, us_ice(None), 'measured', 'ICE BofA US Corporate OAS by maturity band, 6 Nov 2026 (FRED)', '6 Nov 2026')
seg('us_hq', 'USD', UST_NOW, us_hq('2026-10'), 'measured', 'US Treasury HQM corporate curve (AA–A), Oct 2026, over Treasuries', 'Oct 2026')
seg('mexico', 'USD', UST_NOW, usd_deal('mexico', '2026-01-07', [(8, None, 5.625), (12, 200, 6.125), (30, 200, 6.75)], embi=('BCRP_PD43667XD', 'Mexico')),
    'new issue', 'New issue 7 Jan 2026: 8y 5.625%, 12y and 30y T+200 over the 10y and 30y benchmarks (Mexico Business News); re-levelled with EMBI Mexico', 'Jan 2026')
seg('phil', 'USD', UST_NOW, usd_deal('phil', '2026-01-21', [(5.5, 50, 4.347), (10, 80, None), (25, None, 5.75)]),
    'new issue', 'New issue 21 Jan 2026, final pricing: 5.5y T+50, 10y T+80, 25y 5.75% (Department of Finance)', 'Jan 2026')
CHECKS_BEFORE = len(CHECKS)
ar = usd_deal('aramco', '2026-01-27', [(10, 95, 5.0), (30, 130, 6.0)])
gap = -statistics.mean(c[2] for c in CHECKS[CHECKS_BEFORE:]) / 100          # how far coupons sit under yields on the tranches with spreads
ar.update(usd_deal('aramco', '2026-01-27', [(3, None, 4.0), (5, None, 4.375)], coupon_adj=gap))
seg('aramco', 'USD', UST_NOW, dict(sorted(ar.items())), 'new issue', 'New issue 27 Jan 2026: 10y T+95, 30y T+130; 3y and 5y from coupons (Gulf Business, Zawya)', 'Jan 2026')
seg('pif', 'USD', UST_NOW, usd_deal('pif', '2026-05-15', [(3, 95, None), (7, 105, None), (30, 135, 6.25)]),
    'new issue', 'New issue May 2026: 3y T+95, 7y T+105, 30y T+135 (Zawya)', 'May 2026')
note('pif', 'Pricing date', 'CHECK', 'exact May date not found: Treasuries taken at 15 May 2026')
seg('qatar', 'USD', UST_NOW, usd_deal('qatar', '2026-09-21', [(5, 55, 5.25), (10, 65, 5.375)]),
    'new issue', 'New issue 21 Sep 2026: 5y T+55, 10y T+65 (The Peninsula); coupons from Cbonds', 'Sep 2026')
# sub-investment-grade companies: rating-level OAS (ICE, FRED); maturity shapes stated, not measured
hy = {r: last(s)[0] * 100 for r, s in ICE_HY.items()}
seg('us_bb', 'USD', UST_NOW, {T: v * hy['BB'] for T, v in shape.items()}, 'stylised', f"ICE BofA US BB OAS {hy['BB']:.0f}bp (FRED, 6 Nov 2026); maturity shape of US IG, the usual shape for BB credit", '6 Nov 2026')
seg('us_b', 'USD', UST_NOW, {2: hy['B'], 30: hy['B']}, 'stylised', f"ICE BofA US single-B OAS {hy['B']:.0f}bp (FRED, 6 Nov 2026); flat maturity shape, the usual shape for B credit", '6 Nov 2026')
seg('us_ccc', 'USD', UST_NOW, {2: hy['CCC'] * 1.15, 5: hy['CCC'], 10: hy['CCC'] * 0.85, 30: hy['CCC'] * 0.8}, 'stylised',
    f"ICE BofA US CCC OAS {hy['CCC']:.0f}bp (FRED, 6 Nov 2026); inverted maturity shape (short bonds price default first)", '6 Nov 2026')
ehy = last('BAMLHE00EHYIOAS')[0] * 100
seg('eu_hy', 'EUR', AAA, {T: v * ehy for T, v in shape.items()}, 'stylised', f"ICE BofA Euro High Yield OAS {ehy:.0f}bp over governments (FRED, 6 Nov 2026), about two thirds BB; maturity shape of US IG", '6 Nov 2026')
for k in ('us_bb', 'us_b', 'us_ccc', 'eu_hy'):
    note(k, 'Maturity shape assumed', 'CHECK', 'no free maturity-by-maturity data for high yield: the shape is a stated assumption; the level is measured')


# ---------------- pricing ----------------
def solve_z(W, y, T, m):
    lo, hi = -0.05, 0.40
    for _ in range(80):
        mid = (lo + hi) / 2
        if E.bridge_coupon(W, mid, T, m) > y: hi = mid
        else: lo = mid
    return (lo + hi) / 2


def build_inputs(s, d_rates=None, mult=1.0, add=None, loan='std', fixing='today'):
    """Engine inputs for a segment, optionally under a scenario: d_rates {T: bp} shifts the reference and swap curves,
    the credit spread becomes credit × mult + add."""
    shift = (lambda T: at(d_rates, T) / 100) if d_rates else (lambda T: 0.0)
    swap = {T: r + shift(T) for T, r in s['swap'].items()}
    ref = {T: r + shift(T) for T, r in s['ref'].items()}
    cr0 = {T: v * mult + (at(add, T) if add else 0.0) for T, v in s['credit'].items()}
    last = max(cr0)                                  # annual points up to the last quoted maturity, so a fixed-rate loan sees the true
    cr = {T: at(cr0, T) for T in [t for t in range(1, 31) if t < last] + [last]}   # shape of the rates curve; beyond it the engine holds λ flat
    W = E.swap_discount(dict(currency=s['ccy'], swap_basis='EURIBOR6M', swap={T: r / 100 for T, r in swap.items()}, fixing_6m=FIX6M[s['ccy']] / 100 if fixing == 'today' else None))['W']
    ytm = {T: at(ref, T) / 100 + cr[T] / 1e4 for T in cr}
    z = {T: solve_z(W, ytm[T], T, s['m']) * 1e4 for T in cr}
    return dict(name=s.get('src', ''), currency=s['ccy'], amount=1e9, profile={'type': 'linear'}, X_float_bp=0.0, X_fixed_bp=0.0,
                recovery=0.40, swap_basis='EURIBOR6M', coupon_freq=s['m'], fixing_6m=FIX6M[s['ccy']] / 100 if fixing == 'today' else None, z_bp=z, ytm=ytm,
                swap={T: r / 100 for T, r in swap.items()}, **LOANS[loan])


def run_seg(s, **kw):
    out = {}
    for L in LOANS:
        inp = build_inputs(s, loan=L, **kw); r = E.run(inp)
        out[L] = {k: dict(net=r[k]['net'] * 1e4, rf=(r[k]['rf_fwd'] - r[k]['rf_par']) * 1e4 if k == 'fixed' else 0.0,
                          minlam=r[k]['min_lam'], reprice=r[k]['reprice_err_bp']) for k in ('float', 'fixed')}
        out[L]['gap'] = max((abs(v) for v in r['gaps'].values()), default=0.0)
        out[L]['z'] = inp['z_bp']
        out[L]['timing'] = {k: r[k]['timing'] * 1e4 for k in ('float', 'fixed')}
        out[L]['conv'] = {k: r[k]['convention'] * 1e4 for k in ('float', 'fixed')}
    return out


if __name__ == '__main__':
    for k, s in SEGS.items():
        r = run_seg(s)
        print(f"{k:10s} float {r['std']['float']['net']:6.2f} fixed {r['std']['fixed']['net']:6.2f} | long {r['long']['float']['net']:6.2f} {r['long']['fixed']['net']:6.2f} | "
              f"bridge gap {r['std']['gap']:.2f}bp  min λ {min(r['std']['float']['minlam'], r['std']['fixed']['minlam']):+.4f}  Z {{{', '.join(f'{T}: {v:.0f}' for T, v in r['std']['z'].items())}}}")
    print()
    for c in CHECKS: print(c)
