# Market scan: the scripts behind `../marketScan.html`

These scripts build the page "Where the wedge pays". Every wedge on it comes from the WAL Wedge engine (`../wal_wedge_engine.py`).
They use Python 3 and the standard library only. Downloads need internet access.

## Run order

```
python3 ms_fetch.py        # 1. official series → snapshot.json (about 6 MB; a few minutes the first time)
python3 ms_segments.py     # 2. today's segment curves, data checks and scenarios → segments.json
python3 ms_history.py      # 3. monthly wedge since 2016 (government curves) → history.json
python3 ms_stress.py       # 4. swap-curve stress test → stress.json
python3 ms_build.py        # 5. fills ms_template.html → ../marketScan.html
```

Re-running `ms_fetch.py` downloads only the series that are missing; `ms_fetch.py --refresh` downloads everything again.
Steps 2–5 take under a minute together.
The JSON files are not committed (`.gitignore`), so run step 1 before the others.

## What each file does

| File | Role |
|---|---|
| `ms_fetch.py` | Downloads the free official series: ECB (yield curves, country 10-year yields, €STR, EURIBOR), FRED (Treasuries, ICE BofA spreads by maturity and rating, HQM corporate curve, SOFR), Bank of England, Bundesbank, and EMBI spreads from the Banco Central de Reserva del Perú. |
| `ms_engine.py` | Shared helpers: reads `snapshot.json`, builds government and credit curves by month, and holds the **swap curves typed in by hand**. |
| `ms_curves.py` | One all-in yield curve per segment (reference curve + credit spread, with sources), the **deal data typed in by hand**, the data checks, and the pricing: the Z-spread is solved from the yield, then the engine runs. |
| `ms_segments.py` | Today's wedges, the Calculator's own flags (Results rows 52, 54–55), and the five end-2027 scenarios. |
| `ms_history.py` | The ten-year history. No free swap history exists, so government curves serve as the reference and discount curve. |
| `ms_stress.py` | Re-runs key segments with other swap curves (€STR, government, a steeper or flatter swap curve, data errors). |
| `ms_build.py` | Headline numbers, segment cards (text), sources and the page data; writes `../marketScan.html`. |
| `ms_template.html` | The page: layout, prose with `{{placeholders}}`, charts and tables. |

## Refreshing the scan

Nothing in the official series needs editing. Five kinds of input are typed in by hand and must be updated for a new date:

1. **Swap curves** (`ms_engine.py`: `EURIBOR6M`, `SOFR` and the one-year-earlier `_1Y` versions). Source: BlueGamma, indicative closes. Check them against a second source and the official fixings; `ms_curves.py` holds those comparison values (`RAIFF`, `BG_9NOV`, the Investing.com 10-year).
2. **New-issue deal data** (`ms_curves.py`: the `usd_deal(...)` and `eur_deal(...)` calls): date, tenor, spread, yield or coupon, and source. Use final pricing, not guidance. Dollar spreads are quoted over the on-the-run Treasury.
3. **Facts in the segment cards** (`ms_build.py`, `CARDS`) and the sources list (`SOURCES`).
4. **Prose with fixed facts** in `ms_template.html`: policy rates, outlooks, the "as of" date.
5. **Scenario sizes** (`ms_segments.py`, `SCEN`), if the published outlooks change.

After the five steps, open the page and read the Data checks section (9). A `FAIL` or a new `CHECK` means an input needs a look before the page goes out.

## Conventions worth knowing

- **Standard loan:** 1-year drawdown, 12 years of half-yearly instalments (average life 7.0, maturity 13).
- **Long loan:** 2-year drawdown, 18 years of instalments (average life 10.5, maturity 20).
- **Recovery:** 40%.
- **Curve points:** yields enter the engine at every year up to the last quoted maturity. Beyond it, the engine holds the default intensity flat (its own rule).
- **Stylised curves:** where no maturity data exist, a curve borrows a shape from a related curve. These are marked "stylised" on the page and in the data checks.
