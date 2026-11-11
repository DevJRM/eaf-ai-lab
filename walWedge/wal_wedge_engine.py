"""WAL Wedge engine: Python mirror of WAL_Wedge_Loan_vs_Bond_Calculator.xlsx.

Reference implementation for the workbook, the tutorial (tutorial.html) and the
borrower pitch (borrowerPitch.html). Standard library only.

    python3 wal_wedge_engine.py            # Results rows for the sample case + self-tests
    python3 wal_wedge_engine.py --figures  # every figure quoted in the tutorial

Inputs are Bloomberg YAS quotes taken at one moment: Z-spread and YTM per tenor
for one issuer in one currency, plus the swap curve YAS measures the Z-spread
against. Rates are decimals unless a name ends in _bp.

Currencies (Inputs row 4): EUR, USD and GBP. The method is the same in all three;
only two swap-curve conventions differ (accrual() and swap_discount()):
    EUR  vs 6M EURIBOR, annual 30/360 fixed leg  α = 1           6M fixing /360
         vs €STR OIS, annual ACT/360             α = 365.25/360  6M fixing /360
    USD  SOFR OIS, annual ACT/360                α = 365.25/360  6M fixing /360
    GBP  SONIA OIS, annual ACT/365F              α = 365.25/365  6M fixing /365
The bonds' coupon frequency (1 or 2) is a separate input, set per issuer curve.

Map to the workbook (sheet!columns) and the tutorial (section, deep-dive card;
section 10 of the tutorial is the formula catalog, section 11 the deep dives):
    fill_curve          Curves!A:S       gap-filling of the three input curves      02
    swap_discount       Curves!Q:R,U:Z   swap bootstrap, half-year DFs, forwards,   02, 11.1
                                         risk-free par yield
    zero_rate           Curves!AA        swap zero rate at the coupon frequency m   11.1
    bridge_coupon       Curves!AB        YAS Z-spread -> par coupon of its bond     02, 11.2
    ytm_gaps            Curves!AC:AD,E45 bridge coupon vs quoted YTM                11.3
    bootstrap           Calc_*!D:P,AH    λ per year so each par bond reprices       06, 11.4
    schedule            Schedule!       drawings and repayments per half-year       02, 11.5
                                         (linear, linear + balloon, custom)
    price_loan          Calc_*!Q:AG,E4:E28  balance (11.5), half-year cost (11.6),  05-08
                                         weights, fair price, PV (11.7), shortcut
                                         and splits (11.8, 11.9)
    results             Results!C:D      rows 7-57                                  08

The tutorial walks the same calculation as an 8-stage route:
    1 market data (fill_curve, swap_discount, bridge_coupon, ytm_gaps)
    2 loan and shortcut price (price_loan: balance, WAL, curve read at the WAL)
    3 default risk (bootstrap: λ per year, survival)     4 loss if default
    5 cost of each half-year   6 weight of each half-year   7 fair price
    8 the saving and where it comes from (timing/convention split; fixed: risk-free/credit)

Calibration (since Nov 2026): both loans calibrate λ on the issuer's par bond
paying its real coupon frequency m (Inputs row 17). The floating loan reads the
YAS Z-spread through the bridge; the fixed loan reads the YTM as the coupon.
On consistent quotes both give the same λ. calibration="legacy" reproduces the
earlier workbook (Z-spread read as a half-yearly par floater spread, YTM restated
half-yearly); it is kept only to document the change.
"""

import math
import sys

A = 0.5  # length of a loan period in years
TAIL_YEARS = 5  # beyond the last quote, λ = the average of the last 5 quoted years, held flat (Calc_*!B12)

SAMPLE = {
    "name": "Portugal (simulated sample, not market data)",
    "currency": "EUR",
    "amount": 1_000_000_000,
    "x": 1.0,             # drawdown period, years
    "y": 23.0,            # repayment period, years
    # Schedule sheet. "linear" (default): equal drawings over x, equal semi-annual instalments over y.
    # "balloon": as linear, with "balloon" (share of the amount) repaid with the last instalment.
    # "custom": "draw" and "repay", the share of the amount drawn and repaid in half-years 1..60.
    "profile": {"type": "linear"},
    "X_float_bp": 0.0,
    "X_fixed_bp": 0.0,
    "recovery": 0.40,
    "swap_basis": "EURIBOR6M",
    "coupon_freq": 1,     # Inputs row 17: 1 = annual, 2 = semi-annual
    "fixing_6m": 0.03019,
    "z_bp": {1: -19, 2: -15, 3: -14, 4: -2, 5: 6, 6: 13, 7: 24, 8: 30, 9: 37, 10: 42,
             11: 46, 14: 61, 15: 65, 18: 74, 20: 78, 25: 89, 28: 92},
    "ytm": {1: 0.03032, 2: 0.03242, 3: 0.03349, 4: 0.03431, 5: 0.03522, 6: 0.03597,
            7: 0.03726, 8: 0.03804, 9: 0.03888, 10: 0.03942, 11: 0.03995, 14: 0.04198,
            15: 0.04256, 18: 0.04320, 20: 0.04349, 25: 0.04349, 28: 0.04376},
    # Swap par rates consistent with the Z-spreads and YTMs above (YAS definition).
    "swap": {k + 1: v / 100 for k, v in enumerate([
        3.2220, 3.3919, 3.4888, 3.4510, 3.4620, 3.4671, 3.4863, 3.5045, 3.5188, 3.5229,
        3.5362, 3.5545, 3.5728, 3.5913, 3.6103, 3.6011, 3.5919, 3.5826, 3.5767, 3.5707,
        3.5467, 3.5225, 3.4981, 3.4735, 3.4487, 3.4477, 3.4467, 3.4456, 3.4458, 3.4460])},
}

# The case published before Nov 2026 (EUR 5bn, swap curve collected separately).
LEGACY_CASE = dict(SAMPLE, name="Pre-Nov-2026 case", amount=5_000_000_000, coupon_freq=1,
                   swap={1: .0327, 2: .0342, 3: .0345, 4: .0344, 5: .0344, 6: .0344, 7: .0344,
                         8: .0345, 10: .0347, 15: .0351, 20: .0347, 30: .0329})


def fill_curve(quotes):
    """Curves!E/J/P: tenors 1..30; linear between quotes, flat beyond the ends."""
    known = sorted(quotes)
    out = []
    for k in range(1, 31):
        if k in quotes:
            out.append(quotes[k]); continue
        lo = [t for t in known if t < k]; hi = [t for t in known if t > k]
        if lo and hi:
            p, n = lo[-1], hi[0]
            out.append(quotes[p] + (quotes[n] - quotes[p]) * (k - p) / (n - p))
        else:
            out.append(quotes[lo[-1]] if lo else quotes[hi[0]])
    return out


def accrual(inp):
    """Inputs row 16: fixed-leg accrual factor of the swap curve."""
    if inp["currency"] == "USD":
        return 365.25 / 360
    if inp["currency"] == "GBP":
        return 365.25 / 365
    if inp["swap_basis"] == "ESTR":
        return 365.25 / 360
    return 1.0


def mm_basis(inp):
    """Curves!W6: day basis of the 6M fixing (ACT/365 for GBP, ACT/360 otherwise)."""
    return 365 if inp["currency"] == "GBP" else 360


def swap_discount(inp):
    """Curves!Q (annual DF) and Curves!W:Z (half-year DF, f·a, risk-free par yield)."""
    r = fill_curve(inp["swap"]); al = accrual(inp)
    Q = [1.0]; ann = 0.0
    for k in range(30):
        d = (1 - r[k] * al * ann) / (1 + r[k] * al); ann += d; Q.append(d)
    W = [1.0]
    for i in range(1, 61):
        W.append(Q[i // 2] if i % 2 == 0 else math.sqrt(Q[(i - 1) // 2] * Q[(i + 1) // 2]))
    if inp.get("fixing_6m") is not None:
        W[1] = 1 / (1 + inp["fixing_6m"] * 182.5 / mm_basis(inp))
    fa = [None] + [W[i - 1] / W[i] - 1 for i in range(1, 61)]
    Z = [None]; cum = 0.0
    for i in range(1, 61):
        cum += W[i]; Z.append((1 - W[i]) / (0.5 * cum))
    return {"Q": Q, "W": W, "fa": fa, "rf_par": Z, "swap_filled": r}


def zero_rate(W, t, m):
    """Curves!AA: swap zero rate at t, compounded m times a year."""
    return m * (W[int(round(2 * t))] ** (-1 / (m * t)) - 1)


def bridge_coupon(W, z, T, m):
    """Curves!AB: par coupon of the T-year bond whose YAS Z-spread is z.

    YAS: price = Σ (c/m)·DFz(t) + DFz(T), DFz(t) = (1 + (zero(t) + z)/m)^(−m·t),
    summed over the bond's coupon dates t = 1/m, 2/m, …, T. A par bond has
    price 1, so c = m·(1 − DFz(T)) / Σ DFz(t).
    """
    def dfz(t):
        return (W[int(round(2 * t))] ** (-1 / (m * t)) + z / m) ** (-m * t)
    dates = [j / m for j in range(1, int(round(m * T)) + 1)]
    return m * (1 - dfz(T)) / sum(dfz(t) for t in dates)


def coupons(inp, grid, kind, calibration="bridge"):
    """Calc_*!D: the coupon each year's par bond pays (annual rate, decimal)."""
    m = inp["coupon_freq"]
    if calibration == "legacy":
        if kind == "float":
            return [v / 1e4 for v in fill_curve(inp["z_bp"])]
        return [2 * ((1 + v / m) ** (m / 2) - 1) for v in fill_curve(inp["ytm"])]
    if kind == "float":
        zf = fill_curve(inp["z_bp"])
        return [bridge_coupon(grid["W"], zf[T - 1] / 1e4, T, m) for T in range(1, 31)]
    return fill_curve(inp["ytm"])


def bootstrap(inp, grid, kind, calibration="bridge"):
    """Calc_*!H:P — closed-form λ per year; survival S on the half-year grid.

    Year b: 1 = K + D1·Sp·[u·g1 + R(1−u)] + D2·Sp·[u²·g2 + R(u−u²)], u = e^(−λ/2).
    Bond paying c at frequency m: g1 = c/2 if m = 2 else 0; g2 = c/m + 1.
    K = recovery so far + c·(coupon annuity so far).
    Beyond the last quoted tenor, λ is held flat at the average of the last TAIL_YEARS quoted years,
    so one noisy last quote cannot set the price of the whole tail (legacy mode keeps the last λ).
    """
    W, fa, R, m = grid["W"], grid["fa"], inp["recovery"], inp["coupon_freq"]
    c = coupons(inp, grid, kind, calibration)
    last = max(inp["z_bp"] if kind == "float" else inp["ytm"])
    M = [1.0]; L = [None]; N = [0.0]; O = [0.0]; err = []; tail = None
    legacy_float = calibration == "legacy" and kind == "float"
    for i in range(1, 61):
        b = (i + 1) // 2; q = c[b - 1]
        if i % 2 == 1:
            if b <= last:
                Sp, D1, D2 = M[i - 1], W[i], W[i + 1]
                K = N[i - 1] + q * O[i - 1]
                if calibration == "legacy":
                    f1, f2 = (fa[i], fa[i + 1]) if legacy_float else (0.0, 0.0)
                    g1, g2 = f1 + q * A, f2 + q * A + 1
                else:
                    g1 = q / 2 if m == 2 else 0.0
                    g2 = q / m + 1
                q2 = D2 * Sp * (g2 - R)
                q1 = Sp * (D1 * (g1 - R) + D2 * R)
                q0 = K + D1 * Sp * R - 1
                lam = -2 * math.log((-q1 + math.sqrt(q1 * q1 - 4 * q2 * q0)) / (2 * q2))
            elif calibration == "legacy":
                lam = L[i - 1]
            else:
                if tail is None:   # Calc_*!L at b = last + 1: −ln(S(last) / S(last − k)) / k
                    k = min(TAIL_YEARS, last); tail = -math.log(M[2 * last] / M[2 * (last - k)]) / k
                lam = tail
        else:
            lam = L[i - 1]
        L.append(lam); M.append(M[i - 1] * math.exp(-lam * A))
        dS = M[i - 1] - M[i]
        if legacy_float:
            N.append(N[i - 1] + W[i] * (M[i] * fa[i] + R * dS))
            O.append(O[i - 1] + W[i] * M[i] * A)
        elif calibration == "legacy":
            N.append(N[i - 1] + W[i] * R * dS)
            O.append(O[i - 1] + W[i] * M[i] * A)
        else:
            N.append(N[i - 1] + W[i] * R * dS)
            pays = m == 2 or i % 2 == 0
            O.append(O[i - 1] + (W[i] * M[i] / m if pays else 0.0))
        if i % 2 == 0 and b <= last:   # Calc_*!P and AH: the bond reprices to its coupon
            err.append(abs((1 - N[i] - W[i] * M[i]) / O[i] - q) * 1e4)
    return {"S": M, "lam": L, "coupon": c, "reprice_err_bp": max(err) if err else 0.0}


def interp_curve(values, t):
    """Calc_*!E6: linear interpolation of a filled 1..30 curve at t (as the workbook)."""
    tt = min(30, max(1, t)); lo = max(1, min(29, int(tt)))
    return values[lo - 1] + (values[lo] - values[lo - 1]) * (tt - lo)


def schedule(inp):
    """Schedule!: share of the amount drawn and repaid in each half-year i = 1..60 (index 0 unused).

    linear   equal drawings every 6 months over x years (one at signing if x = 0), then equal
             instalments over y years, the first six months after the drawdown period ends.
    balloon  as linear, but only (1 − b) is amortised; b is repaid with the last instalment.
    custom   the lists given, as fractions of the amount; a drawing is made at the start of its
             half-year and an instalment paid at its end.
    """
    p = inp.get("profile") or {"type": "linear"}
    kind = p.get("type", "linear")
    draw, repay = [0.0] * 61, [0.0] * 61
    if kind in ("linear", "balloon"):
        D, Rn = round(2 * inp["x"]), round(2 * inp["y"]); Dd = max(D, 1)
        b = p.get("balloon", 0.0) if kind == "balloon" else 0.0
        if Rn < 1 or D + Rn > 60:
            raise ValueError("drawdown plus repayment period must fit in 30 years, with at least one instalment")
        if not 0.0 <= b <= 1.0:
            raise ValueError("the balloon must be between 0% and 100% of the amount")
        for i in range(1, Dd + 1):
            draw[i] = 1 / Dd
        for i in range(D + 1, D + Rn + 1):
            repay[i] = (1 - b) / Rn
        repay[D + Rn] += b
    elif kind == "custom":
        dl, rl = list(p.get("draw", [])), list(p.get("repay", []))
        if len(dl) > 60 or len(rl) > 60:
            raise ValueError("a custom schedule has at most 60 half-years (30 years)")
        draw[1:len(dl) + 1], repay[1:len(rl) + 1] = dl, rl
    else:
        raise ValueError(f"unknown profile type {kind!r}: use linear, balloon or custom")
    if min(draw + repay) < 0:
        raise ValueError("drawings and repayments cannot be negative")
    if abs(sum(draw) - 1) > 1e-9 or abs(sum(repay) - 1) > 1e-9:
        raise ValueError(f"drawings sum to {sum(draw):.6%} and repayments to {sum(repay):.6%}; both must be 100%")
    bal = 0.0
    for i in range(1, 61):
        bal += draw[i] - repay[i]
        if bal < -1e-12:
            raise ValueError(f"half-year {i} repays more than is outstanding")
    return draw, repay


def price_loan(inp, grid, cal, kind):
    """Calc_*!Q:AG and E4:E28 — the loan grid, fair price, saving and its splits."""
    W, fa, R, S = grid["W"], grid["fa"], inp["recovery"], cal["S"]
    m = inp["coupon_freq"]
    draw, repay = schedule(inp)
    n = max(i for i in range(1, 61) if repay[i] > 0)      # last instalment: final maturity n/2
    rows = []; drawn = repaid = 0.0
    for i in range(1, 61):
        drawn += draw[i]
        O = drawn - repaid if i <= n else 0.0              # drawn at the start of i, repaid at its end
        O = 0.0 if abs(O) < 1e-12 else O
        P, DD = repay[i], draw[i]
        repaid += repay[i]
        p = S[i] / S[i - 1]
        credit = (1 - p) * (1 + fa[i] - R) / (p * A)
        f = fa[i] / A
        k = credit if kind == "float" else f + credit
        rows.append(dict(i=i, t=i / 2, O=O, P=P, DD=DD, DF=W[i], S=S[i], Sprev=S[i - 1],
                         w=W[i] * S[i] * A * O, credit=credit, f=f, k=k, lam=cal["lam"][i]))
    WAL = sum(r["O"] * A for r in rows)
    B = sum(r["w"] for r in rows)
    if kind == "float":
        quote = interp_curve(fill_curve(inp["z_bp"]), WAL)          # bp
        shortcut = quote / 1e4
        X = inp["X_float_bp"] / 1e4
    else:
        quote = interp_curve(fill_curve(inp["ytm"]), WAL)           # quoted basis
        shortcut = 2 * ((1 + quote / m) ** (m / 2) - 1)
        X = inp["X_fixed_bp"] / 1e4
    charged = shortcut + X
    fair = sum(r["w"] * r["k"] for r in rows) / B
    for r in rows:
        r["gain"] = r["w"] * (r["k"] - charged)
        r["after"] = max(0.0, min(1.0, (r["t"] - WAL) / A))
    pv = sum(r["gain"] for r in rows)
    pv_after = sum(r["gain"] * r["after"] for r in rows)
    py_after = sum(r["O"] * A * r["after"] for r in rows)
    B_after = sum(r["w"] * r["after"] for r in rows)
    avg_after = sum(r["w"] * r["after"] * r["k"] for r in rows) / B_after if B_after > 0 else 0.0
    avg_before = ((sum(r["w"] * r["k"] for r in rows) - B_after * avg_after) / (B - B_after)
                  if B - B_after > 0 else 0.0)
    rf_fwd = sum(r["w"] * r["f"] for r in rows) / B
    rf_par = interp_half(grid["rf_par"], WAL)
    # PV identity (Calc_*!E21): PV(drawdowns) − PV(loan cash flows at the charged price)
    pv_draw = sum(W[r["i"] - 1] * r["Sprev"] * r["DD"] for r in rows)
    def cf(r):
        cpn = (fa[r["i"]] + charged * A) if kind == "float" else charged * A
        return r["DF"] * (r["S"] * (cpn * r["O"] + r["P"]) + R * (r["Sprev"] - r["S"]) * r["O"])
    pv_identity = pv_draw - sum(cf(r) for r in rows)
    wal_check = (sum(r["t"] * r["P"] for r in rows)
                 - sum((r["t"] - 0.5) * r["DD"] for r in rows))
    # New (Calc_*!E27): fair price of a bullet maturing at the WAL, same λ.
    bullet = bullet_fair(rows, WAL)
    return dict(kind=kind, rows=rows, WAL=WAL, annuity=B, quote=quote, shortcut=shortcut,
                X=X, charged=charged, fair=fair, net=fair - charged, rf_fwd=rf_fwd, rf_par=rf_par,
                pv=pv, pv_after=pv_after, pv_before=pv - pv_after, py_after=py_after,
                py_before=WAL - py_after, avg_after=avg_after, avg_before=avg_before,
                pv_identity=pv_identity, wal_check=wal_check, maturity=n / 2,
                min_lam=min(cal["lam"][1:]), reprice_err_bp=cal["reprice_err_bp"],
                bullet_fair=bullet, timing=fair - bullet, convention=bullet - shortcut)


def bullet_fair(rows, WAL):
    """Calc_*!E27: Σ DF·S·k ÷ Σ DF·S over a bullet's half-years, interpolated at 2·WAL."""
    def upto(nn):
        num = sum(r["DF"] * r["S"] * r["k"] for r in rows[:nn])
        den = sum(r["DF"] * r["S"] for r in rows[:nn])
        return num / den
    n0 = max(1, min(59, int(2 * WAL))); frac = 2 * WAL - n0
    return upto(n0) + frac * (upto(n0 + 1) - upto(n0))


def interp_half(series, t):
    """Calc_*!E25: interpolation on the half-year grid (series indexed by i = 2t)."""
    tt = 2 * min(30, max(0.5, t)); lo = max(1, min(59, int(tt)))
    return series[lo] + (series[lo + 1] - series[lo]) * (tt - lo)


def ytm_gaps(inp, grid):
    """Curves!AC:AD: bridge coupon − quoted YTM (bp) where both are quoted."""
    m = inp["coupon_freq"]; out = {}
    for T in sorted(set(inp["z_bp"]) & set(inp["ytm"])):
        out[T] = (bridge_coupon(grid["W"], inp["z_bp"][T] / 1e4, T, m) - inp["ytm"][T]) * 1e4
    return out


def run(inp, calibration="bridge"):
    grid = swap_discount(inp)
    res = {"grid": grid, "gaps": ytm_gaps(inp, grid)}
    for kind in ("float", "fixed"):
        cal = bootstrap(inp, grid, kind, calibration)
        res[kind] = price_loan(inp, grid, cal, kind); res[kind]["cal"] = cal
    return res


def results_rows(inp, res):
    """Results!C (floating) and D (fixed), rows 7-57."""
    amt = inp["amount"]; out = {}
    for col, k in (("C", "float"), ("D", "fixed")):
        r = res[k]
        out[col] = {
            7: r["maturity"], 8: r["WAL"], 9: r["annuity"], 11: r["quote"], 12: r["charged"],
            13: r["fair"], 15: r["net"] * 1e4,
            16: r["net"] / r["fair"] if k == "fixed" else r["net"] / r["fair"],
            17: (r["rf_fwd"] + r["fair"]) if k == "float" else r["fair"],
            18: (r["rf_fwd"] + r["charged"]) if k == "float" else r["charged"],
            20: r["net"] * amt * r["WAL"], 21: r["pv"] * amt,
            22: r["net"] * amt * r["WAL"] / r["maturity"],
            24: r["pv_before"] * amt, 25: r["pv_after"] * amt, 26: r["pv"] * amt,
            27: r["pv_before"] / r["annuity"] * 1e4, 28: r["pv_after"] / r["annuity"] * 1e4,
            29: r["py_before"], 30: r["py_after"], 31: r["avg_before"], 32: r["avg_after"],
            34: (r["rf_fwd"] - r["rf_par"]) * 1e4 if k == "fixed" else None,
            35: (r["net"] * 1e4 - (r["rf_fwd"] - r["rf_par"]) * 1e4) if k == "fixed" else None,
            43: r["reprice_err_bp"], 44: (r["pv"] - r["pv_identity"]) * amt,
            45: r["WAL"] - r["wal_check"], 52: "YES — check data" if r["min_lam"] < 0 else "no",
            56: r["timing"] * 1e4, 57: r["convention"] * 1e4,
        }
        out[col][19] = (r["net"] / (r["rf_fwd"] + r["fair"])) if k == "float" else r["net"] / r["fair"]
    gaps = [abs(v) for v in res["gaps"].values()]
    out["C"][54] = out["D"][54] = max(gaps) if gaps else 0.0
    out["C"][55] = out["D"][55] = "OK" if (max(gaps) if gaps else 0) <= 1.0 else "CHECK"
    return out


def par_floating_spread(grid, S, R, T):
    """Margin over the 6M forward that puts a T-year half-yearly floater at par:
    Σ DF·(1 + f·a − R)·ΔS ÷ (a·Σ DF·S)  — PV of expected loss ÷ risky annuity."""
    W, fa = grid["W"], grid["fa"]
    num = sum(W[i] * (1 + fa[i] - R) * (S[i - 1] - S[i]) for i in range(1, 2 * T + 1))
    den = A * sum(W[i] * S[i] for i in range(1, 2 * T + 1))
    return num / den


def self_tests():
    ok = True
    def check(name, cond):
        nonlocal ok; ok &= cond; print(f"  [{'PASS' if cond else 'FAIL'}] {name}")
    print("Self-tests")
    leg = run(LEGACY_CASE, "legacy")
    check("legacy mode reproduces the old published figures (8.82 / 8.02bp, annuity 9.002)",
          abs(leg["float"]["net"] * 1e4 - 8.822) < 0.002 and abs(leg["fixed"]["net"] * 1e4 - 8.015) < 0.002
          and abs(leg["float"]["annuity"] - 9.0024) < 0.0002)
    res = run(SAMPLE)
    check("every quoted bond reprices to par (< 1e-6bp)",
          res["float"]["reprice_err_bp"] < 1e-6 and res["fixed"]["reprice_err_bp"] < 1e-6)
    dS = max(abs(a - b) for a, b in zip(res["float"]["cal"]["S"], res["fixed"]["cal"]["S"]))
    check(f"consistent quotes give one survival curve (max difference {dS:.1e}; swap rates to 4dp)", dS < 1e-4)
    check("YTM gap is zero on the sample (< 0.01bp, swap rates to 4dp)", max(abs(v) for v in res["gaps"].values()) < 0.01)
    check("PV identity and WAL cross-check hold",
          abs(res["float"]["pv_identity"] - res["float"]["pv"]) < 1e-12
          and abs(res["fixed"]["pv_identity"] - res["fixed"]["pv"]) < 1e-12)
    check("saving = timing effect + quote-convention effect − X",
          all(abs(res[k]["net"] - (res[k]["timing"] + res[k]["convention"] - res[k]["X"])) < 1e-14
              for k in ("float", "fixed")))
    shifted = dict(SAMPLE, swap={k: v + 0.003 for k, v in SAMPLE["swap"].items()}, fixing_6m=SAMPLE["fixing_6m"] + 0.003)
    sh = run(shifted)
    mv = max(abs(sh[k]["net"] - res[k]["net"]) * 1e4 for k in ("float", "fixed"))
    check(f"a 30bp swap-curve error moves each saving by < 0.3bp (max {mv:.2f}bp)", mv < 0.3)
    wrong = run(dict(SAMPLE, coupon_freq=2))
    g = max(abs(v) for v in wrong["gaps"].values())
    check(f"a wrong coupon frequency trips the 1bp gap check (max gap {g:.2f}bp)", g > 1.0)
    usd = dict(SAMPLE, currency="USD", coupon_freq=2, swap_basis="SOFR")
    u = run(usd)
    check("a semi-annual-coupon (USD) case runs and reprices", u["float"]["reprice_err_bp"] < 1e-6
          and u["fixed"]["reprice_err_bp"] < 1e-6)
    # Inputs C16 / Curves W6: the swap conventions per currency.
    conv = {(c, b): (accrual(dict(SAMPLE, currency=c, swap_basis=b)), mm_basis(dict(SAMPLE, currency=c)))
            for c, b in (("EUR", "EURIBOR6M"), ("EUR", "ESTR"), ("USD", "SOFR"), ("GBP", "SONIA"))}
    check("swap conventions per currency (α, 6M fixing basis) match Inputs C16 and Curves W6",
          conv == {("EUR", "EURIBOR6M"): (1.0, 360), ("EUR", "ESTR"): (365.25 / 360, 360),
                   ("USD", "SOFR"): (365.25 / 360, 360), ("GBP", "SONIA"): (365.25 / 365, 365)})
    for m in (1, 2):
        gbp = dict(SAMPLE, currency="GBP", swap_basis="SONIA", coupon_freq=m)
        W = swap_discount(gbp)["W"]   # YTMs consistent with the Z-spreads on SONIA conventions
        gbp["ytm"] = {T: bridge_coupon(W, z / 1e4, T, m) for T, z in SAMPLE["z_bp"].items()}
        gr = run(gbp)
        check(f"a GBP case (coupon frequency {m}) reprices to par and shows no YTM gap",
              gr["float"]["reprice_err_bp"] < 1e-6 and gr["fixed"]["reprice_err_bp"] < 1e-6
              and max(abs(v) for v in gr["gaps"].values()) < 1e-6)
    # Repayment profiles (Schedule sheet).
    lin = res
    b0 = run(dict(SAMPLE, profile={"type": "balloon", "balloon": 0.0}))
    check("a 0% balloon equals the linear profile",
          all(abs(b0[k]["net"] - lin[k]["net"]) < 1e-14 and abs(b0[k]["WAL"] - lin[k]["WAL"]) < 1e-12 for k in ("float", "fixed")))
    dl, rl = schedule(SAMPLE)
    cu = run(dict(SAMPLE, profile={"type": "custom", "draw": dl[1:], "repay": rl[1:]}))
    check("a custom schedule fed the linear lists equals the linear profile",
          all(abs(cu[k]["net"] - lin[k]["net"]) < 1e-14 for k in ("float", "fixed")))
    bl = run(dict(SAMPLE, x=0.0, profile={"type": "balloon", "balloon": 1.0}))
    check("a 100% balloon drawn at signing is a bullet: WAL = maturity, timing effect 0",
          all(abs(bl[k]["WAL"] - bl[k]["maturity"]) < 1e-12 and abs(bl[k]["timing"]) < 1e-14 for k in ("float", "fixed")))
    b3 = run(dict(SAMPLE, profile={"type": "balloon", "balloon": 0.30}))
    d3, r3 = schedule(dict(SAMPLE, profile={"type": "balloon", "balloon": 0.30}))
    wal3 = sum(i / 2 * r3[i] for i in range(61)) - sum((i - 1) / 2 * d3[i] for i in range(61))
    check(f"a 30% balloon: WAL {b3['float']['WAL']:.4f}y = average repayment date − average drawdown date; PV identity holds",
          abs(b3["float"]["WAL"] - wal3) < 1e-12 and abs(b3["float"]["WAL"] - b3["float"]["wal_check"]) < 1e-12
          and all(abs(b3[k]["pv_identity"] - b3[k]["pv"]) < 1e-12 for k in ("float", "fixed")))
    bad = 0
    for prof in ({"type": "custom", "draw": [1.0], "repay": [0.5]},
                 {"type": "custom", "draw": [0.5, 0.5], "repay": [0.8, 0.2]},
                 {"type": "balloon", "balloon": 1.2}, {"type": "sculpted"}):
        try:
            schedule(dict(SAMPLE, profile=prof))
        except ValueError:
            bad += 1
    check("invalid schedules are rejected (sums, negative balance, balloon range, unknown type)", bad == 4)
    cut = dict(SAMPLE, z_bp={k: v for k, v in SAMPLE["z_bp"].items() if k <= 15},
               ytm={k: v for k, v in SAMPLE["ytm"].items() if k <= 15})
    cl = run(cut)["float"]["cal"]["lam"]; avg = sum(cl[2 * b - 1] for b in range(11, 16)) / 5
    check(f"beyond the last quote (15Y), λ = the average of years 11–15 ({avg * 1e4:.1f}bp), held flat to 30Y",
          all(abs(cl[i] - avg) < 1e-12 for i in range(31, 61)))
    check("the EUR sample is unchanged (7.12 / 7.51bp)",
          round(res["float"]["net"] * 1e4, 2) == 7.12 and round(res["fixed"]["net"] * 1e4, 2) == 7.51)
    return ok


def print_results(inp, res):
    rows = results_rows(inp, res)
    labels = {7: "Final maturity (y)", 8: "WAL (y)", 9: "Risky annuity", 11: "Curve at WAL (bp | YTM)",
              12: "Charged", 13: "Fair", 15: "NET saving (bp p.a.)", 21: "PV saving (money)",
              20: "Nominal saving (money)", 27: "Loss phase (bp)", 28: "Benefit phase (bp)",
              34: "Component: risk-free effect (bp)", 35: "Component: credit effect (bp)",
              43: "Max repricing error (bp)", 54: "Max YTM gap (bp)", 55: "Gap check",
              56: "Cause: timing effect (bp)", 57: "Cause: quote-convention effect (bp)"}
    p = inp.get("profile") or {"type": "linear"}
    prof = {"linear": "linear", "balloon": f"linear + {p.get('balloon', 0):.0%} balloon", "custom": "custom schedule"}.get(p.get("type"), "?")
    print(f"{inp['name']} — Results ({prof} profile)")
    for r, lab in labels.items():
        c, d = rows["C"].get(r), rows["D"].get(r)
        fmt = lambda v: "" if v is None else (v if isinstance(v, str) else f"{v:,.6f}")
        print(f"  row {r:2d}  {lab:36s} {fmt(c):>22s} {fmt(d):>22s}")


def figures(inp=SAMPLE):
    """Every number the tutorial and borrower view quote, from one run."""
    res = run(inp); g = res["grid"]; F, X = res["float"], res["fixed"]; R = inp["recovery"]
    amt = inp["amount"]
    print(f"== {inp['name']}")
    print(f"WAL {F['WAL']:.4f}  maturity {F['maturity']}  risky annuity {F['annuity']:.4f} / {X['annuity']:.4f}")
    for k, r in (("floating", F), ("fixed", X)):
        # The bullet's fair price is a margin for the floating loan and an all-in rate for the fixed one.
        bullet = (f"{r['bullet_fair'] * 1e4:.2f}bp" if k == "floating" else f"{r['bullet_fair'] * 100:.4f}%")
        print(f"{k}: quote {r['quote']:.6f} shortcut {r['shortcut']*100:.4f}% charged {r['charged']*100:.4f}% "
              f"fair {r['fair']*100:.4f}% net {r['net']*1e4:.2f}bp | PV {r['pv']*amt/1e6:.1f}m "
              f"nominal {r['net']*amt*r['WAL']/1e6:.1f}m | loss {r['pv_before']/r['annuity']*1e4:.2f} "
              f"benefit {r['pv_after']/r['annuity']*1e4:.2f} | timing {r['timing']*1e4:.2f} "
              f"convention {r['convention']*1e4:.2f} | bullet fair {bullet} | "
              f"rf fwd {r['rf_fwd']*100:.4f}% rf par {r['rf_par']*100:.4f}% | min λ {r['min_lam']*1e4:.1f}bp")
    print(f"Fixed split: risk-free {(X['rf_fwd']-X['rf_par'])*1e4:.2f}bp credit {(X['net']-(X['rf_fwd']-X['rf_par']))*1e4:.2f}bp")
    S = F["cal"]["S"]; lam = F["cal"]["lam"]
    print("λ by year (bp):", [round(lam[2 * b - 1] * 1e4, 1) for b in range(1, 31)])
    print("S at years 1,3,5,10,15,20,24:", {t: round(S[2 * t], 4) for t in (1, 3, 5, 10, 15, 20, 24)})
    print("Bridge coupon / par floating spread at 5,10,12,13,20y:",
          {T: (round(F['cal']['coupon'][T - 1] * 100, 4), round(par_floating_spread(g, S, R, T) * 1e4, 2)) for T in (5, 10, 12, 13, 20)})
    print("Swap zero (annual) 1,10,20:", {T: round(zero_rate(g['W'], T, inp['coupon_freq']) * 100, 4) for T in (1, 10, 20)})
    print("Gaps (bp):", {T: round(v, 3) for T, v in res["gaps"].items()})
    # Section 03 table and takeaway: the cost of each year is the credit cost of its half-years
    # (λ is flat within a year, so both halves carry the same cost).
    print("Yearly credit cost (bp) at years 1,4,10,13,20:",
          {b: round(F["rows"][2 * b - 1]["credit"] * 1e4, 1) for b in (1, 4, 10, 13, 20)})
    # Section 05: exposure centre, each half-year dated at its middle (t_i − 1/4).
    ec = sum((r["t"] - 0.25) * r["O"] * 0.5 for r in F["rows"]) / F["WAL"]
    print(f"Exposure centre {ec:.2f}y (bullet at the WAL: {F['WAL'] / 2:.2f}y)")
    # Results rows 16 and 19.
    print(f"Saving as % of fair: floating {F['net'] / F['fair'] * 100:.2f}%  fixed {X['net'] / X['fair'] * 100:.2f}%  | "
          f"as % of bond all-in: floating {F['net'] / (F['rf_fwd'] + F['fair']) * 100:.2f}%  fixed {X['net'] / X['fair'] * 100:.2f}%")
    return res


if __name__ == "__main__":
    if "--figures" in sys.argv:
        figures()
    else:
        res = run(SAMPLE)
        print_results(SAMPLE, res)
        sys.exit(0 if self_tests() else 1)
