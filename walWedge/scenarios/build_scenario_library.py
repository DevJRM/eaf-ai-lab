"""Build the WAL Wedge simulator's scenario library (../scenarioLibrary.js) from official public data.

Two kinds of scenario, both read off official series:
  episodes         dated historical events: the series are read on the start and end dates, with the source of each;
  ordinary moves   what a normal 3, 6 or 12 months did over the last ten years (historical simulation).
The simulator does the rest (simulator.js): it turns the readings into moves of the swap curve and of the
borrower's credit spread. Nothing in the library is typed by hand except the episode dates and the short
description of what happened.

Scenario sets: interest rates by loan currency (EUR, USD, GBP); credit spreads by peer group, which the simulator
picks from the borrower type and region entered in Inputs & data.

Sources (all free, official, no login):
  ECB Data Portal   euro area AAA government yield curve and all-government curve (par yields, daily), used for
                    the maturity profile of euro area spreads; 10-year government bond yields by country
                    (long-term interest rates, monthly averages)
  FRED (St. Louis Fed)  US Treasury constant-maturity yields; Moody's seasoned Aaa and Baa corporate bond yields
                    (bonds of 20 years and more), measured against the 20-year Treasury (daily)
  Bank of England   nominal gilt par yields, 5, 10 and 20 years (daily)
  Banco Central de Reserva del Perú   J.P. Morgan EMBI Global spreads: Latin American countries, the Latin
                    America index and the emerging-markets index (daily)
  Deutsche Bundesbank   German federal securities yield curve (Svensson, daily): the euro rate moves, measured on
                    the curve the euro area country spreads are measured against; yields on German debt securities
                    outstanding: companies (non-banks), banks' unsecured bonds and public bonds (monthly averages)

Measurement rule: every credit spread is read against the government curve whose moves are applied as rate moves
(euro: the German curve; dollar: Treasuries), at matching maturities, so a bond yield move is never counted twice.

Run:  python3 build_scenario_library.py        (needs internet access; Python 3 standard library only)
      WW_CACHE=/path/cache.json python3 build_scenario_library.py   keeps the downloads in a file and reuses them
"""
import csv, datetime, io, json, os, statistics, urllib.request

OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'scenarioLibrary.js')
MONTHS = {'Jan': 1, 'Feb': 2, 'Mar': 3, 'Apr': 4, 'May': 5, 'Jun': 6, 'Jul': 7, 'Aug': 8, 'Sep': 9, 'Oct': 10, 'Nov': 11, 'Dec': 12,
          'Ene': 1, 'Abr': 4, 'Ago': 8, 'Set': 9, 'Dic': 12}


def get(url, headers=None):
    # the Bank of England and the BCRP refuse Python's default user agent; FRED refuses a bare browser one
    h = dict(headers or {}) if 'stlouisfed' in url else {'User-Agent': 'Mozilla/5.0', **(headers or {})}
    for attempt in range(4):   # the public APIs time out now and then
        try: return urllib.request.urlopen(urllib.request.Request(url, headers=h), timeout=120).read().decode('utf-8-sig', 'replace')
        except OSError:
            if attempt == 3: raise


def ecb(key, start):
    rows = csv.DictReader(io.StringIO(get(f'https://data-api.ecb.europa.eu/service/data/{key}?startPeriod={start}&format=csvdata')))
    return {r['TIME_PERIOD']: float(r['OBS_VALUE']) for r in rows if r['OBS_VALUE']}


def fred(sid):
    r = csv.reader(io.StringIO(get(f'https://fred.stlouisfed.org/graph/fredgraph.csv?id={sid}'))); next(r)
    return {d: float(v) for d, v in r if v not in ('', '.')}


def boe(code):
    r = csv.reader(io.StringIO(get('https://www.bankofengland.co.uk/boeapps/database/_iadb-fromshowcolumns.asp?csv.x=yes'
                                   f'&Datefrom=01/Jan/2005&Dateto=31/Dec/2030&SeriesCodes={code}&CSVF=TN&UsingCodes=Y'))); next(r)
    return {datetime.datetime.strptime(d, '%d %b %Y').strftime('%Y-%m-%d'): float(v) for d, v, *_ in r if v.strip()}


def bcrp(code, y0):
    out = {}
    for y in range(y0, datetime.date.today().year + 1, 6):
        j = json.loads(get(f'https://estadisticas.bcrp.gob.pe/estadisticas/series/api/{code}/json/{y}-01-01/{y + 5}-12-31/ing'))
        for p in j['periods']:
            v = p['values'][0]
            if v in ('n.d.', ''): continue
            dd, mm, yy = p['name'].split('.'); yy = int(yy)
            out[f'{(2000 if yy < 90 else 1900) + yy}-{MONTHS[mm]:02d}-{int(dd):02d}'] = float(v)
    return out


def bbk(key, start=None):
    rows = csv.DictReader(io.StringIO(get(f'https://api.statistiken.bundesbank.de/rest/data/BBSIS/{key}?lang=en' + (f'&startPeriod={start}' if start else ''), {'Accept': 'text/csv'})))
    return {r['TIME_PERIOD']: float(r['OBS_VALUE']) for r in rows if r['OBS_VALUE'] not in ('', '.')}


# ---------------- the series ----------------
CACHE = os.environ.get('WW_CACHE')
CACHED = json.load(open(CACHE)) if CACHE and os.path.exists(CACHE) else {}
SERIES = {}   # id -> {name, provider, url, unit, data}
def add(sid, name, provider, url, unit, fetch):
    SERIES[sid] = dict(name=name, provider=provider, url=url, unit=unit, data=CACHED[sid] if sid in CACHED else fetch())

EA_T = [2, 5, 10, 20, 30]
for g, nm in (('G_N_A', 'AAA-rated euro area central government bonds'), ('G_N_C', 'all euro area central government bonds')):
    for T in EA_T:
        key = f'YC/B.U2.EUR.4F.{g}.SV_C_YM.PY_{T}Y'
        add(f'ECB_{g}_{T}', f'Euro area yield curve, {nm}, {T}-year par yield', 'ECB Data Portal',
            f'https://data.ecb.europa.eu/data/datasets/YC/{key.split("/")[1]}', '%', lambda key=key: ecb(key, '2004-09-01'))
EZ = {'IT': 'Italy', 'ES': 'Spain', 'PT': 'Portugal', 'FR': 'France', 'BE': 'Belgium', 'AT': 'Austria', 'IE': 'Ireland',
      'NL': 'Netherlands', 'FI': 'Finland', 'SK': 'Slovakia', 'SI': 'Slovenia', 'DE': 'Germany'}
for c, nm in EZ.items():
    key = f'IRS/M.{c}.L.L40.CI.0000.EUR.N.Z'
    add(f'ECB_IRS_{c}', f'{nm}, 10-year government bond yield (monthly average)', 'ECB Data Portal',
        f'https://data.ecb.europa.eu/data/datasets/IRS/{key.split("/")[1]}', '%', lambda key=key: ecb(key, '2000-01'))
for sid, nm in (('DGS2', '2-year'), ('DGS5', '5-year'), ('DGS10', '10-year'), ('DGS30', '30-year')):
    add(sid, f'US Treasury {nm} constant-maturity yield', 'FRED, Federal Reserve Bank of St. Louis', f'https://fred.stlouisfed.org/series/{sid}', '%', lambda sid=sid: fred(sid))
add('DGS20', 'US Treasury 20-year constant-maturity yield', 'FRED, Federal Reserve Bank of St. Louis', 'https://fred.stlouisfed.org/series/DGS20', '%', lambda: fred('DGS20'))
# Moody's seasoned bonds have 20 years or more to run: measured against the 20-year Treasury, published throughout
# (the 30-year was suspended from 2002 to 2006), so a change in the slope of the Treasury curve is not taken for credit
add('DAAA', "Moody's seasoned Aaa corporate bond yield (bonds of 20 years and more)", 'FRED, Federal Reserve Bank of St. Louis', 'https://fred.stlouisfed.org/series/DAAA', '%', lambda: fred('DAAA'))
add('DBAA', "Moody's seasoned Baa corporate bond yield (bonds of 20 years and more)", 'FRED, Federal Reserve Bank of St. Louis', 'https://fred.stlouisfed.org/series/DBAA', '%', lambda: fred('DBAA'))
for code, nm in (('IUDSNPY', 5), ('IUDMNPY', 10), ('IUDLNPY', 20)):
    add(f'BOE_{code}', f'UK nominal gilt {nm}-year par yield', 'Bank of England', f'https://www.bankofengland.co.uk/boeapps/database/fromshowcolumns.asp?SeriesCodes={code}', '%', lambda code=code: boe(code))
# BCRP publishes each EMBIG spread under two codes: a long history (from 1998, discontinued in September 2026) and the
# current one (from January 2016). Country spreads agree within a few bp; the two Latin America and emerging-market
# indices do not (different index composition). Episodes read the long history, ordinary moves the current codes.
BCRP_OLD = {'PD04708XD': 'Latin America (index)', 'PD04711XD': 'Brazil', 'PD04713XD': 'Mexico', 'PD04715XD': 'Colombia',
            'PD04709XD': 'Peru', 'PD38581XD': 'Chile', 'PD38580XD': 'Emerging markets (index)'}
BCRP_NOW = {'PD43662XD': 'Latin America (index)', 'PD43665XD': 'Brazil', 'PD43667XD': 'Mexico', 'PD43669XD': 'Colombia',
            'PD43663XD': 'Peru', 'PD43671XD': 'Chile', 'PD43670XD': 'Emerging markets (index)'}
for codes, y0, tag in ((BCRP_OLD, 1998, 'history to September 2026'), (BCRP_NOW, 2016, 'current series')):
    for code, nm in codes.items():
        add(f'BCRP_{code}', f'J.P. Morgan EMBI Global spread, {nm}, {tag}', 'Banco Central de Reserva del Perú',
            f'https://estadisticas.bcrp.gob.pe/estadisticas/series/diarias/resultados/{code}/html', 'bp', lambda code=code, y0=y0: bcrp(code, y0))
for sid, key, nm in (('BBK_CORP', 'M.I.UMR.RD.EUR.X2000.B.A.A.R.A.A._Z._Z.A', 'German corporate bonds (non-banks)'),
                     ('BBK_BANK', 'M.I.UMR.RD.EUR.MFISX.B.X401.A.R.A.A._Z._Z.A', 'German banks’ unsecured bonds (other bank debt securities)'),
                     ('BBK_PUB', 'M.I.UMR.RD.EUR.S13.B.A.A.R.A.A._Z._Z.A', 'German public debt securities')):
    add(sid, f'{nm}, yield on bonds outstanding, all maturities (monthly average)', 'Deutsche Bundesbank',
        f'https://statistiken.bundesbank.de/statistiken-de/zeitreihen/BBSIS/{key}', '%', lambda key=key: bbk(key))
# the German federal curve: the euro rate moves are read here, the curve the euro area country spreads are measured against
# (the ECB AAA curve contained France, Austria, Finland and the Netherlands until 2012 and moved with their spreads)
for T in EA_T:
    key = f'D.I.ZST.ZI.EUR.S1311.B.A604.R{T:02d}XX.R.A.A._Z._Z.A'
    add(f'BBK_ZST_{T}', f'German federal securities yield curve, {T}-year (Svensson, zero-coupon)', 'Deutsche Bundesbank',
        f'https://statistiken.bundesbank.de/statistiken-de/zeitreihen/BBSIS/{key}', '%', lambda key=key: bbk(key, '1997-08-01'))
if CACHE: json.dump({s: v['data'] for s, v in SERIES.items()}, open(CACHE, 'w'))
# computed, for the end dates of US company episodes only: Baa yield minus the 20-year Treasury, on days with both
_b, _t = SERIES['DBAA']['data'], SERIES['DGS20']['data']
SERIES['BAA20'] = dict(name="Moody's Baa yield minus the 20-year Treasury (computed from DBAA and DGS20)", provider='FRED, Federal Reserve Bank of St. Louis',
                       url='https://fred.stlouisfed.org/series/DBAA', unit='pp', data={d: _b[d] - _t[d] for d in _b if d in _t})


def on(sid, day):
    """Month itself (monthly series, 'YYYY-MM'), or the last observation on or before day, at most 10 days old."""
    d = SERIES[sid]['data']
    if len(day) == 7: return d[day]
    k = max(x for x in d if x <= day)
    if (datetime.date.fromisoformat(day) - datetime.date.fromisoformat(k)).days > 10: raise KeyError(f'{sid}: no reading near {day}')
    return d[k]


def has(sid, day):
    try: on(sid, day); return True
    except (KeyError, ValueError): return False


def mavg(sid, month): return statistics.mean(v for k, v in SERIES[sid]['data'].items() if k.startswith(month))


def peak_date(sid, a, b, hi=True):
    d = SERIES[sid]['data']; ks = [k for k in d if a <= k <= b]
    return (max if hi else min)(ks, key=lambda k: d[k])


def spread_bp(sids, vals):   # an issuer's spread in bp from its series readings {sid: value}
    if len(sids) == 2: return (vals[sids[0]] - vals[sids[1]]) * 100
    return vals[sids[0]] * (100 if SERIES[sids[0]]['unit'] == 'pp' else 1)


# ---------------- rate episodes: government curves stand in for the swap curve of the currency ----------------
RATE_SERIES = {'EUR': ([f'BBK_ZST_{T}' for T in EA_T], EA_T), 'USD': (['DGS2', 'DGS5', 'DGS10', 'DGS30'], [2, 5, 10, 30]),
               'GBP': (['BOE_IUDSNPY', 'BOE_IUDMNPY', 'BOE_IUDLNPY'], [5, 10, 20])}
RATES = [
    ('EUR', 'eur22', 'ECB hiking cycle', '2022', '2021-12-31', '2022-12-30',
     'Inflation reached a record high and the ECB raised its rates from July 2022, ending eight years of negative rates. Short rates rose most.'),
    ('EUR', 'eur23', 'Long-end sell-off', '2023', '2023-07-31', '2023-10-03',
     'With policy rates near their peak, investors demanded more to hold long bonds: long yields rose while short yields barely moved.'),
    ('EUR', 'eur24', 'ECB cutting cycle', '2023–24', '2023-10-03', '2024-09-30',
     'As inflation fell, markets priced and the ECB delivered rate cuts from June 2024. Short rates fell most.'),
    ('EUR', 'eur19', 'Rally to record lows', '2019', '2018-12-31', '2019-08-28',
     'Growth slowed and trade tensions rose; markets priced a new ECB rate cut, delivered in September 2019. The German government curve fell below zero at every maturity out to 30 years.'),
    ('EUR', 'eur15', 'Bund tantrum', '2015', '2015-04-17', '2015-06-10',
     'Weeks after the ECB started buying bonds, long yields jumped from almost zero: the 10-year Bund rose about 100bp in under two months while short yields barely moved.'),
    ('EUR', 'eur14', 'Rates fall to record lows', '2014–16', '2014-01-02', '2016-07-08',
     'Negative ECB deposit rate from June 2014 and large-scale bond purchases from March 2015: long yields fell most, towards zero.'),
    ('EUR', 'eur13', 'Taper tantrum', '2013', '2013-05-02', '2013-09-05',
     "The US Federal Reserve signalled it would slow its bond purchases; long yields rose worldwide, euro yields with them."),
    ('EUR', 'eur08', 'Crisis easing', '2008–09', '2008-07-01', '2009-01-30',
     'After Lehman Brothers failed the ECB cut its rates from 4.25% to 2% within months. Short rates fell far more than long ones.'),
    ('EUR', 'eur06', 'ECB hiking cycle', '2005–07', '2005-11-30', '2007-06-29',
     'As growth recovered the ECB raised its main rate from 2% in December 2005 to 4% in June 2007, in steps of a quarter point. Short rates rose most.'),
    ('USD', 'usd22', 'Fed hiking cycle', '2022', '2021-12-31', '2022-12-30',
     'The Federal Reserve raised its rates from near zero to over 4% within the year to fight inflation. Short rates rose most.'),
    ('USD', 'usd23', 'Long-end sell-off', '2023', '2023-07-31', '2023-10-19',
     'Heavy Treasury issuance and higher term premium: the 10- and 30-year yields rose about 100bp in under three months.'),
    ('USD', 'usd24', 'Fed cutting cycle', '2024', '2024-04-25', '2024-09-16',
     'Inflation eased and markets priced cuts ahead of the Fed’s first cut in September 2024. Short rates fell most.'),
    ('USD', 'usd20', 'Pandemic rally', '2020', '2020-02-19', '2020-03-09',
     'As the pandemic spread, investors fled to Treasuries ahead of emergency Fed cuts: yields fell about 100bp in three weeks.'),
    ('USD', 'usd19', 'Fed U-turn', '2018–19', '2018-11-08', '2019-09-03',
     'The Federal Reserve stopped raising rates in December 2018 and cut three times from July 2019 as trade tensions grew: yields fell by about 150 to 180bp at every maturity.'),
    ('USD', 'usd16', 'US election reflation', '2016', '2016-11-08', '2016-12-15',
     'Expectations of tax cuts and spending after the November 2016 election, then a Fed hike on 14 December: 5- and 10-year yields rose over 70bp in five weeks.'),
    ('USD', 'usd13', 'Taper tantrum', '2013', '2013-05-02', '2013-09-05',
     'The Federal Reserve signalled it would slow its bond purchases; 5- to 30-year yields rose by over 100bp in four months.'),
    ('USD', 'usd08', 'Crisis easing', '2008–09', '2008-07-01', '2009-01-30',
     'After Lehman Brothers failed the Fed cut its rates to near zero. Yields fell at every maturity, short ones most.'),
    ('USD', 'usd05', 'Hikes and the “conundrum”', '2004–06', '2004-06-29', '2006-06-28',
     'The Federal Reserve raised its rate from 1% to 5.25% in seventeen steps; short yields followed but long yields barely rose, which the Fed Chairman called a conundrum. The curve flattened sharply.'),
    ('USD', 'usd94', 'Bond market sell-off', '1994', '1993-10-15', '1994-11-07',
     'The Federal Reserve raised its rate from 3% in February 1994 to 5.5% by November, faster than markets expected: yields rose by between 2.4 and 3.3 points at every maturity.'),
    ('GBP', 'gbp22', 'Bank of England hiking cycle', '2022', '2021-12-31', '2022-12-30',
     'The Bank of England raised Bank Rate from 0.25% to 3.5% during 2022; gilt yields rose by almost 3 points at every maturity.'),
    ('GBP', 'gbp22m', 'Mini-budget crisis', '2022', '2022-09-22', '2022-09-27',
     'Unfunded tax cuts announced on 23 September 2022 triggered a gilt sell-off: about 100bp in three trading days, until the Bank of England intervened.'),
    ('GBP', 'gbp23', 'Inflation surprise', '2023', '2023-04-03', '2023-07-06',
     'UK inflation stayed higher than expected; markets priced more hikes and short gilt yields rose most.'),
    ('GBP', 'gbp20', 'Pandemic rally', '2020', '2020-02-19', '2020-03-09',
     'As the pandemic spread investors bought gilts, ahead of the Bank of England’s emergency rate cuts in March 2020: yields fell about 40 to 55bp.'),
    ('GBP', 'gbp16', 'Brexit vote', '2016', '2016-06-23', '2016-08-12',
     'After the referendum of 23 June 2016 the Bank of England cut Bank Rate and restarted bond purchases; gilt yields fell about 90bp.'),
    ('GBP', 'gbp13', 'Taper tantrum', '2013', '2013-05-02', '2013-09-05',
     'The US Federal Reserve signalled it would slow its bond purchases; yields rose worldwide, gilt yields by about 90 to 125bp.'),
    ('GBP', 'gbp08', 'Crisis easing', '2008–09', '2008-07-01', '2009-01-30',
     'After Lehman Brothers failed the Bank of England cut Bank Rate from 5% to 1.5% by January 2009. Short gilt yields fell far more than long ones.'),
]

# ---------------- credit: peer groups and their reference issuers ----------------
EZ_REFS = ['IT', 'ES', 'PT', 'FR', 'BE', 'AT', 'IE', 'NL', 'FI', 'SK', 'SI']
LA_REFS = [('Brazil', 'PD04711XD', 'PD43665XD'), ('Mexico', 'PD04713XD', 'PD43667XD'), ('Colombia', 'PD04715XD', 'PD43669XD'),
           ('Peru', 'PD04709XD', 'PD43663XD'), ('Chile', 'PD38581XD', 'PD43671XD'), ('Latin America (index)', 'PD04708XD', 'PD43662XD')]
GROUPS = {
    'ezsov': dict(name='Euro area sovereigns', ccy='EUR', monthly=True,
                  measure='10-year government bond yield minus the German 10-year yield, monthly averages (ECB)',
                  shape='Split across maturities as the ECB all-government curve moved against the AAA curve in the same months (2, 5, 10, 20 and 30 years).',
                  rates='German federal securities curve (Bundesbank), same months (monthly averages).',
                  left='Greece is left out: its 2012 debt restructuring makes its spread a measure of default and recovery, not of a spread move. Countries enter once their series starts (Slovakia 2001, Slovenia 2002).',
                  refs=[(EZ[c], [f'ECB_IRS_{c}', 'ECB_IRS_DE']) for c in EZ_REFS]),
    'eucorp': dict(name='European companies', ccy='EUR', monthly=True, brk='2020-05',
                   measure='yield on German companies’ (non-bank) and banks’ unsecured bonds outstanding, minus German public bonds, all maturities, monthly averages (Deutsche Bundesbank)',
                   shape='The series average all maturities: the move is applied equally at every maturity.',
                   rates='German federal securities curve (Bundesbank), same months (monthly averages).',
                   left='The only free official series of euro corporate bond yields; licensed indices (iBoxx, ICE BofA) cover more issuers. Both averages span all maturities, so a change in the mix of maturities outstanding or in the slope of the German curve can move the spread too. The Bundesbank changed the securities included on 1 May 2020: no episode or ordinary period spans that date. Readings to November 2022 have one decimal place (10bp steps).',
                   refs=[('German companies', ['BBK_CORP', 'BBK_PUB']), ('German banks, unsecured', ['BBK_BANK', 'BBK_PUB'])]),
    'latamsov': dict(name='Latin American sovereigns', ccy='USD', monthly=False,
                     measure='J.P. Morgan EMBI Global spread over US Treasuries, daily (published by the Banco Central de Reserva del Perú)',
                     shape='The index measures the whole curve on average: the move is applied equally at every maturity.',
                     rates='US Treasury curve, same dates.',
                     left='Argentina, Ecuador and Venezuela are left out: they were in or close to default for long stretches, when spreads measure expected recovery rather than spread moves. They remain in the Latin America index.',
                     refs=[(nm, [f'BCRP_{o}']) for nm, o, _ in LA_REFS], refsNow=[(nm, [f'BCRP_{n}']) for nm, _, n in LA_REFS]),
    'emsov': dict(name='Emerging-market sovereigns', ccy='USD', monthly=False,
                  measure='J.P. Morgan EMBI Global spread over US Treasuries, all emerging markets, daily (published by the Banco Central de Reserva del Perú)',
                  shape='The index measures the whole curve on average: the move is applied equally at every maturity.',
                  rates='US Treasury curve, same dates.',
                  left='One index for all emerging markets (Asia, Europe, the Middle East, Africa and Latin America): free official data have no regional or country split outside Latin America.',
                  refs=[('Emerging markets (index)', ['BCRP_PD38580XD'])], refsNow=[('Emerging markets (index)', ['BCRP_PD43670XD'])]),
    'usig': dict(name='US investment-grade companies', ccy='USD', monthly=False,
                 measure="Moody's seasoned Aaa and Baa corporate bond yields (bonds of 20 years and more) minus the 20-year Treasury yield, daily (FRED)",
                 shape='The series cover long-dated bonds only: the move is applied equally at every maturity.',
                 rates='US Treasury curve, same dates.', left='',
                 refs=[('Aaa', ['DAAA', 'DGS20']), ('Baa', ['DBAA', 'DGS20'])]),
}
# monthly groups: (group, id, name, when, start month, end month, text)
# daily groups:   (group, id, name, when, start date, (headline series, search until[, 'min']), text): the episode ends at the
#                 peak (or the low) of the headline series in the window
CREDIT = [
    ('ezsov', 'ez11', 'Euro debt crisis', '2010–11', '2010-03', '2011-11',
     'After the Greek bailout in May 2010 the crisis spread to Ireland, Portugal and then, in 2011, to Italy and Spain. The Italian spread peaked in November 2011, just before the ECB’s three-year loans. Ireland and Portugal were cut below investment grade by some rating agencies along the way.'),
    ('ezsov', 'ez08', 'Global financial crisis', '2008–09', '2008-06', '2009-03',
     'After Lehman Brothers failed investors fled to Bunds: every country’s spread widened, Ireland’s most as its banks came under strain.'),
    ('ezsov', 'ez17', 'Italian referendum and French election risk', '2016–17', '2016-07', '2017-02',
     'The Italian government lost its constitutional referendum in December 2016 and polls ahead of the 2017 French presidential election worried investors: Italian, Portuguese and French spreads widened most.'),
    ('ezsov', 'ez18', 'Italian budget stand-off', '2018', '2018-04', '2018-11',
     'A new Italian government and its dispute with the European Commission over the 2019 budget. Italian short-dated yields jumped most in late May; other countries moved far less.'),
    ('ezsov', 'ez20', 'Pandemic shock', '2020', '2020-02', '2020-04',
     'Lockdowns in March 2020. The ECB launched its pandemic purchase programme on 18 March, which capped the widening.'),
    ('ezsov', 'ez22', 'ECB tightening', '2022', '2022-01', '2022-10',
     'The ECB ended its net bond purchases and started raising rates in July 2022; spreads of higher-debt countries widened, then were contained by the new Transmission Protection Instrument.'),
    ('ezsov', 'ez24', 'French snap election', '2024', '2024-05', '2024-12',
     'The French President dissolved the National Assembly on 9 June 2024; the new government fell in December. France widened on its own; most others did not.'),
    ('ezsov', 'ez12', '“Whatever it takes” recovery', '2012–15', '2012-07', '2015-03',
     'After the ECB President’s pledge of July 2012 and the announcement of Outright Monetary Transactions, spreads narrowed for almost three years, helped by ECB purchases from March 2015.'),
    ('ezsov', 'ez21', 'Recovery fund rally', '2020–21', '2020-04', '2021-02',
     'The ECB’s pandemic purchases and the EU recovery fund agreed in July 2020 narrowed spreads back below their pre-pandemic levels.'),
    ('ezsov', 'ez26', 'Southern Europe converges', '2023–26', '2023-09', '2026-02',
     'Falling deficits and rating upgrades narrowed Italian, Spanish and Portuguese spreads; by February 2026 Italy’s was the lowest since 2008. France widened on its budget difficulties.'),
    ('eucorp', 'ec08', 'Global financial crisis', '2007–08', '2007-06', '2008-12',
     'From the first subprime losses in summer 2007 to the months after Lehman Brothers failed: German companies’ spreads rose from about 35bp to over 380bp, banks’ from about 20bp to 170bp.'),
    ('eucorp', 'ec11', 'Euro debt crisis', '2011', '2011-06', '2011-12',
     'The crisis reached Italy and Spain in the summer of 2011; bank funding dried up until the ECB’s three-year loans in December. Spreads nearly doubled.'),
    ('eucorp', 'ec15', 'China, oil and Volkswagen', '2015–16', '2015-06', '2016-02',
     'China’s devaluation (August 2015), the oil price slump and the Volkswagen emissions scandal (September 2015) widened spreads until the ECB announced corporate bond purchases in March 2016.'),
    ('eucorp', 'ec20', 'Pandemic shock', '2020', '2020-01', '2020-04',
     'Lockdowns in March 2020: spreads almost doubled before the ECB’s pandemic purchases took hold.'),
    ('eucorp', 'ec22', 'ECB tightening', '2022', '2021-12', '2022-10',
     'The ECB ended its bond purchases and raised rates from July 2022 as energy prices soared after Russia’s invasion of Ukraine: spreads doubled.'),
    ('eucorp', 'ec09', 'Post-crisis recovery', '2009–10', '2008-12', '2010-04',
     'Central-bank support and the recovery from the 2009 recession: spreads fell by more than half.'),
    ('eucorp', 'ec23', 'Recovery from 2022', '2022–23', '2022-10', '2023-12',
     'As energy prices and inflation came down, companies’ spreads narrowed by almost half; banks’ much less, after the bank failures of March 2023.'),
    ('latamsov', 'la98', 'Russian default', '1998', '1998-07-31', ('PD04708XD', '1998-12-31'),
     'Russia defaulted on its domestic debt in August 1998 and the hedge fund LTCM collapsed: investors sold emerging-market bonds everywhere. Latin American spreads more than doubled within six weeks.'),
    ('latamsov', 'la02', 'Brazil’s election scare', '2002', '2002-03-28', ('PD04711XD', '2002-10-31'),
     'Ahead of the October 2002 presidential election investors feared a Brazilian default: Brazil’s spread more than tripled, to over 2,400bp. Colombia’s doubled; Mexico and Chile moved far less.'),
    ('latamsov', 'la08', 'Global financial crisis', '2008', '2008-08-29', ('PD04708XD', '2008-12-31'),
     'After Lehman Brothers failed in September 2008, Latin American spreads roughly tripled within weeks as investors sold risk.'),
    ('latamsov', 'la13', 'Taper tantrum', '2013', '2013-05-02', ('PD04708XD', '2013-09-30'),
     'The Federal Reserve signalled on 22 May 2013 that it would slow its bond purchases; money left emerging markets.'),
    ('latamsov', 'la15', 'Commodity slump and Brazil’s downgrade', '2014–16', '2014-09-01', ('PD04708XD', '2016-03-31'),
     'Oil and metal prices fell by more than half. Brazil, in recession, lost its investment-grade rating at S&P (September 2015), Fitch and Moody’s.'),
    ('latamsov', 'la16', 'US election shock', '2016', '2016-11-08', ('PD04713XD', '2016-12-31'),
     'Fears for Mexico’s trade with the United States after the November 2016 US election: Mexico’s spread jumped most, the rest of the region less.'),
    ('latamsov', 'la18', 'Emerging-market sell-off', '2018', '2018-01-31', ('PD04708XD', '2018-12-31'),
     'Argentina’s currency crisis (an IMF programme from June 2018), Turkey’s in August and rising US rates widened spreads through the year.'),
    ('latamsov', 'la20', 'Pandemic shock', '2020', '2020-02-19', ('PD04708XD', '2020-04-30'),
     'Spreads more than doubled in a month, peaking as the Federal Reserve announced its emergency facilities on 23 March 2020.'),
    ('latamsov', 'la21c', 'Colombia loses investment grade', '2021', '2021-04-15', ('PD04715XD', '2021-07-31'),
     'Protests against a tax reform, then S&P (19 May 2021) and Fitch (1 July) cut Colombia below investment grade. A single-country event: the rest of the region moved far less.'),
    ('latamsov', 'la22', 'Fed tightening', '2022', '2021-12-31', ('PD04708XD', '2022-10-31'),
     'The Federal Reserve raised its rates quickly; emerging-market funding costs rose with US yields and spreads.'),
    ('latamsov', 'la21', 'Post-pandemic recovery', '2020–21', '2020-03-23', ('PD04708XD', '2021-06-30', 'min'),
     'Central-bank support and the recovery narrowed spreads by more than half from their March 2020 peak.'),
    ('latamsov', 'la24', 'Recovery from 2022', '2022–24', '2022-10-31', ('PD04708XD', '2025-12-31', 'min'),
     'As US inflation eased and markets looked ahead to rate cuts, spreads narrowed by about a third from their 2022 highs.'),
    ('emsov', 'em98', 'Russian default', '1998', '1998-07-31', ('PD38580XD', '1998-12-31'),
     'Russia defaulted on its domestic debt in August 1998 and the hedge fund LTCM collapsed: the emerging-market spread more than doubled within six weeks.'),
    ('emsov', 'em08', 'Global financial crisis', '2008', '2008-08-29', ('PD38580XD', '2008-12-31'),
     'After Lehman Brothers failed, the emerging-market spread almost tripled in eight weeks.'),
    ('emsov', 'em13', 'Taper tantrum', '2013', '2013-05-02', ('PD38580XD', '2013-09-30'),
     'The Federal Reserve signalled on 22 May 2013 that it would slow its bond purchases; money left emerging markets.'),
    ('emsov', 'em15', 'China devaluation and commodity slump', '2015–16', '2015-04-30', ('PD38580XD', '2016-03-31'),
     'China devalued the renminbi in August 2015 and oil fell below $30 a barrel: commodity exporters sold off most.'),
    ('emsov', 'em18', 'Emerging-market sell-off', '2018', '2018-01-26', ('PD38580XD', '2018-12-31'),
     'Argentina’s and Turkey’s currency crises, a stronger dollar and rising US rates widened spreads through the year.'),
    ('emsov', 'em20', 'Pandemic shock', '2020', '2020-02-19', ('PD38580XD', '2020-04-30'),
     'The emerging-market spread more than doubled in a month, peaking as the Federal Reserve announced its emergency facilities on 23 March 2020.'),
    ('emsov', 'em22', 'War and Fed tightening', '2022', '2021-12-31', ('PD38580XD', '2022-10-31'),
     'Russia’s invasion of Ukraine (February 2022), higher food and energy prices and the Federal Reserve’s fast rate rises.'),
    ('emsov', 'em09', 'Post-crisis recovery', '2008–10', '2008-10-24', ('PD38580XD', '2010-04-30', 'min'),
     'Central-bank support, IMF lending and China’s stimulus: the spread fell by over two thirds from its October 2008 peak.'),
    ('emsov', 'em21', 'Post-pandemic recovery', '2020–21', '2020-03-23', ('PD38580XD', '2021-06-30', 'min'),
     'Central-bank support and the recovery narrowed spreads by more than half from their March 2020 peak.'),
    ('usig', 'us98', 'Russian default and LTCM', '1998', '1998-07-31', ('BAA20', '1998-12-31'),
     'Russia’s default in August 1998 and the near-collapse of the hedge fund LTCM: investors fled to Treasuries and spreads widened by about 30 to 50bp until the Fed’s rate cuts that autumn.'),
    ('usig', 'us02', 'Accounting scandals and telecom busts', '2002', '2001-12-31', ('BAA20', '2002-10-31'),
     'After Enron (December 2001) and WorldCom (July 2002), then the largest bankruptcies in US history, investors repriced corporate risk across the market.'),
    ('usig', 'us08', 'Global financial crisis', '2008', '2008-08-29', ('BAA20', '2008-12-31'),
     'The failure of Lehman Brothers in September 2008 froze credit markets; Baa spreads more than doubled by early December.'),
    ('usig', 'us11', 'US downgrade and euro crisis', '2011', '2011-06-30', ('BAA20', '2011-12-31'),
     'S&P cut the US government’s rating in August 2011 as the euro debt crisis reached Italy and Spain; investors bought Treasuries and sold credit.'),
    ('usig', 'us16', 'Energy and commodity slump', '2014–16', '2014-06-30', ('BAA20', '2016-02-29'),
     'Oil fell from over $100 to under $30 a barrel; energy and mining issuers led the widening of investment-grade spreads.'),
    ('usig', 'us18', 'Trade war and Q4 sell-off', '2018', '2018-01-31', ('BAA20', '2018-12-31'),
     'Fed rate rises, tariffs between the United States and China and a sharp fall in equities in the last quarter of 2018 widened spreads through the year.'),
    ('usig', 'us20', 'Pandemic shock', '2020', '2020-02-19', ('BAA20', '2020-04-30'),
     'Spreads more than doubled in a month, peaking on 23 March 2020 when the Federal Reserve announced it would buy corporate bonds.'),
    ('usig', 'us22', 'Fed tightening', '2022', '2021-12-31', ('BAA20', '2022-10-31'),
     'The Federal Reserve’s fastest hiking cycle in decades widened spreads moderately.'),
    ('usig', 'us09', 'Post-crisis recovery', '2009–10', '2009-03-09', ('BAA20', '2010-04-30', 'min'),
     'From the low point of the crisis in March 2009, central-bank support and the recovery more than halved Baa spreads within a year.'),
    ('usig', 'us21', 'Post-pandemic recovery', '2020–21', '2020-03-23', ('BAA20', '2021-06-30', 'min'),
     'Federal Reserve support and the recovery brought spreads back below their pre-pandemic levels.'),
]

lib = {'built': datetime.date.today().isoformat(), 'groups': {g: {k: v for k, v in G.items() if k not in ('refs', 'refsNow')} for g, G in GROUPS.items()},
       'rates': [], 'credit': [], 'sources': {}}
used = set()
for ccy, sid, name, when, a, b, text in RATES:
    ser, tenors = RATE_SERIES[ccy]
    keep = [i for i, s in enumerate(ser) if has(s, a) and has(s, b)]   # a maturity without a fresh reading is left out
    ser, tenors = [ser[i] for i in keep], [tenors[i] for i in keep]; used.update(ser)
    lib['rates'].append(dict(id=sid, ccy=ccy, name=name, when=when, start=a, end=b, text=text, series=ser, tenors=tenors,
                             v0=[round(on(s, a), 4) for s in ser], v1=[round(on(s, b), 4) for s in ser]))

US_T = (['DGS2', 'DGS5', 'DGS10', 'DGS30'], [2, 5, 10, 30])
for g, sid, name, when, a, b, text in CREDIT:
    G = GROUPS[g]; e = dict(id=sid, group=g, name=name, when=when, text=text)
    if G['monthly']:
        if G.get('brk'): assert not (a < G['brk'] <= b), f'{sid} spans the series break {G["brk"]}'
        e.update(start=a, end=b, monthly=True); end = b
    else:
        key, until, *mode = b; ref = key if key in SERIES else f'BCRP_{key}'
        end = peak_date(ref, a, until, hi=not mode)            # the end date: the peak (or the low) of the headline series
        e.update(start=a, end=end, monthly=False, endRule=f'{"low" if mode else "peak"} of {SERIES[ref]["name"]} between {a} and {until}')
    refs = [(nm, ids) for nm, ids in G['refs'] if all(has(s, a) and has(s, end) for s in ids)]   # issuers with readings on both dates
    e['refs'] = [dict(name=nm, series=ids, s0=round(spread_bp(ids, {s: on(s, a) for s in ids}), 1), s1=round(spread_bp(ids, {s: on(s, end) for s in ids}), 1)) for nm, ids in refs]
    used.update(s for _, ids in refs for s in ids)
    e['shape'] = None
    if g == 'ezsov':
        sh0 = [(mavg(f'ECB_G_N_C_{T}', a) - mavg(f'ECB_G_N_A_{T}', a)) * 100 for T in EA_T]
        sh1 = [(mavg(f'ECB_G_N_C_{T}', end) - mavg(f'ECB_G_N_A_{T}', end)) * 100 for T in EA_T]
        e['shape'] = dict(tenors=EA_T, d=[round(y - x, 1) for x, y in zip(sh0, sh1)],
                          series=[f'ECB_G_N_C_{T}' for T in EA_T] + [f'ECB_G_N_A_{T}' for T in EA_T])
        used.update(e['shape']['series'])
    if G['ccy'] == 'EUR':   # the same months on the German curve, the benchmark of the spreads
        ser = [f'BBK_ZST_{T}' for T in EA_T]
        if all(any(k.startswith(m) for k in SERIES[x]['data']) for x in ser for m in (a, end)):
            # the curve is zero-coupon, the spreads are measured against Germany's 10-year benchmark yield: the moves are
            # shifted in parallel so the 10-year move equals the benchmark's, so a country's yield move is matched exactly at 10 years
            v0 = [mavg(x, a) for x in ser]; mv = [mavg(x, end) - y for x, y in zip(ser, v0)]
            anchor = (on('ECB_IRS_DE', end) - on('ECB_IRS_DE', a)) - mv[EA_T.index(10)]
            e['rates'] = dict(tenors=EA_T, series=ser + ['ECB_IRS_DE'], v0=[round(y, 4) for y in v0], v1=[round(y + m + anchor, 4) for y, m in zip(v0, mv)],
                              anchor=round(anchor * 100, 1))
            used.update(ser)
        else: e['rates'] = None
    else:
        ser, ten = US_T; keep = [i for i, s in enumerate(ser) if has(s, a) and has(s, end)]
        e['rates'] = dict(tenors=[ten[i] for i in keep], series=[ser[i] for i in keep], v0=[on(ser[i], a) for i in keep], v1=[on(ser[i], end) for i in keep])
        used.update(e['rates']['series'])
    lib['credit'].append(e)

# ---------------- ordinary moves: what a normal 3, 6 or 12 months did over the last ten years ----------------
# Historical simulation, the standard way to size routine market moves: every overlapping change over the horizon in the
# last ten years (month-end readings; monthly series: monthly averages) is ranked, and a scenario is the average of the
# changes ranked within five percentile points of its target (e.g. 70th-80th for "1 in 4").
HORIZONS, YEARS = [3, 6, 12], 10
def monthly(sid):
    d = SERIES[sid]['data']; out = {}
    for k in sorted(d): out[k[:7]] = d[k]               # last observation of each month (monthly series: the month itself)
    return out
def months_back(last, n):
    y, m = map(int, last.split('-')); out = []
    for _ in range(n): out.append(f'{y}-{m:02d}'); m -= 1; y, m = (y - 1, 12) if m == 0 else (y, m)
    return out[::-1]
def windows(series_ids, last, h, brk=None):
    M = {s: monthly(s) for s in series_ids}; ms = months_back(last, YEARS * 12 + h); out = []
    for i in range(len(ms) - h):
        a, b = ms[i], ms[i + h]
        if brk and a < brk <= b: continue                # a change across a break in the series is not a market move
        if all(a in M[s] and b in M[s] for s in series_ids): out.append((a, b, {s: (M[s][a], M[s][b]) for s in series_ids}))
    return out
def band(ws, key, pct):
    r = sorted(ws, key=key); n = len(r); lo, hi = int(n * (pct - 5) / 100), int(n * (pct + 5) / 100)
    return r[lo:max(hi, lo + 1)]
def last_common(series_ids):   # the last complete month all the series share
    t = datetime.date.today().replace(day=1) - datetime.timedelta(days=1)
    return min([max(SERIES[s]['data'])[:7] for s in series_ids] + [t.strftime('%Y-%m')])
ROUT = [(75, 'up', '1 in 4'), (90, 'up', '1 in 10'), (25, 'down', '1 in 4'), (10, 'down', '1 in 10')]
lib['routine'] = {'horizons': HORIZONS, 'years': YEARS, 'rates': [], 'credit': []}
for h in HORIZONS:
    for ccy, (ser, tenors) in RATE_SERIES.items():
        last = last_common(ser); used.update(ser)
        ws = windows(ser, last, h)
        ch = lambda w: [(w[2][s][1] - w[2][s][0]) * 100 for s in ser]
        lvl = lambda w: sum(ch(w)) / len(ser); slope = lambda w: ch(w)[-1] - ch(w)[0]
        base = dict(ccy=ccy, h=h, series=ser, tenors=tenors, nAll=len(ws), first=ws[0][0], last=ws[-1][1])
        for pct, dirn, odds in ROUT:
            b = band(ws, lvl, pct); mv = [round(sum(ch(w)[i] for w in b) / len(b), 1) for i in range(len(ser))]
            lib['routine']['rates'].append(dict(base, id=f'{ccy.lower()}_lvl{pct}_{h}', name=f'Rates {"rise" if dirn == "up" else "fall"}, {odds}', odds=odds, pct=pct,
                                                rank='the average move across maturities', move=mv, n=len(b)))
        for pct, nm in ((75, 'Curve steepens, 1 in 4'), (25, 'Curve flattens, 1 in 4')):
            b = band(ws, slope, pct); mv = [round(sum(ch(w)[i] for w in b) / len(b), 1) for i in range(len(ser))]
            lib['routine']['rates'].append(dict(base, id=f'{ccy.lower()}_slp{pct}_{h}', name=nm, odds='1 in 4', pct=pct,
                                                rank=f'the change in the {tenors[-1]}-year minus {tenors[0]}-year gap', move=mv, n=len(b)))
    for g, G in GROUPS.items():
        refs = G.get('refsNow', G['refs'])
        allids = sorted({s for _, ids in refs for s in ids}); last = last_common(allids); ws = windows(allids, last, h, G.get('brk'))
        sh_ids = [f'ECB_G_N_C_{T}' for T in EA_T] + [f'ECB_G_N_A_{T}' for T in EA_T] if g == 'ezsov' else []
        wsh = windows(sh_ids, last, h) if sh_ids else []
        for pct, dirn, odds in ROUT:
            out = []
            for nm, ids in refs:
                chg = lambda w: spread_bp(ids, {s: w[2][s][1] for s in ids}) - spread_bp(ids, {s: w[2][s][0] for s in ids})
                b = band(ws, chg, pct); lv = sorted(spread_bp(ids, {s: w[2][s][0] for s in ids}) for w in ws)
                out.append(dict(name=nm, series=ids, level=round(lv[len(lv) // 2], 1), move=round(sum(chg(w) for w in b) / len(b), 1)))
            e = dict(id=f'{g}_{pct}_{h}', group=g, h=h, name=f'Spreads {"widen" if dirn == "up" else "tighten"}, {odds}', odds=odds, pct=pct, refs=out,
                     n=len(band(ws, lambda w: 0, pct)), nAll=len(ws), first=ws[0][0], last=ws[-1][1], shape=None)
            if wsh:
                d10 = lambda w: (w[2]['ECB_G_N_C_10'][1] - w[2]['ECB_G_N_A_10'][1] - w[2]['ECB_G_N_C_10'][0] + w[2]['ECB_G_N_A_10'][0]) * 100
                b = band(wsh, d10, pct)
                e['shape'] = dict(tenors=EA_T, series=sh_ids, d=[round(sum((w[2][f'ECB_G_N_C_{T}'][1] - w[2][f'ECB_G_N_A_{T}'][1] - w[2][f'ECB_G_N_C_{T}'][0] + w[2][f'ECB_G_N_A_{T}'][0]) * 100 for w in b) / len(b), 1) for T in EA_T])
                used.update(sh_ids)
            used.update(allids); lib['routine']['credit'].append(e)

lib['sources'] = {s: {k: SERIES[s][k] for k in ('name', 'provider', 'url', 'unit')} for s in sorted(used)}
with open(OUT, 'w') as f:
    f.write('/* WAL Wedge simulator — scenario library. GENERATED by scenarios/build_scenario_library.py on '
            f'{lib["built"]}; do not edit by hand.\n   Every number below is a reading of the official series named in "sources", '
            'on the dates of each episode. */\nwindow.WW_SCENARIOS = ')
    json.dump(lib, f, indent=1, ensure_ascii=False)
    f.write(';\n')
print(f'wrote {OUT}: {len(lib["rates"])} rate episodes, {len(lib["credit"])} credit episodes, {len(lib["routine"]["rates"]) + len(lib["routine"]["credit"])} ordinary-move scenarios, {len(lib["sources"])} series')
for e in lib['rates']: print(f"  {e['id']:7s} {e['start']} -> {e['end']}  " + '  '.join(f"{T}y {(b - a) * 100:+.0f}" for T, a, b in zip(e['tenors'], e['v0'], e['v1'])))
for e in lib['routine']['rates']:
    if e['h'] == 6 or e['id'].endswith('lvl75_3') or e['id'].endswith('lvl75_12'): print(f"  {e['id']:13s} {e['first']}..{e['last']} n={e['n']}/{e['nAll']} {e['move']}")
for e in lib['routine']['credit']:
    print(f"  {e['id']:15s} n={e['n']}/{e['nAll']} " + '  '.join(f"{r['name'][:8]} {r['level']:.0f}:{r['move']:+.0f}" for r in e['refs'][:6]) + (f"  shape {e['shape']['d']}" if e['shape'] else ''))
for e in lib['credit']:
    print(f"  {e['id']:6s} {e['start']} -> {e['end']}  " + '  '.join(f"{r['name'][:10]} {r['s0']:.0f}->{r['s1']:.0f}" for r in e['refs']) + ('' if e['rates'] else '  (no rates)'))
