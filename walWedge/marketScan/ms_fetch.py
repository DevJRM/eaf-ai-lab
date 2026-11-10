"""Market scan, step 1: download the official free series (fetchers as in ../scenarios/build_scenario_library.py) into
snapshot.json in this folder. A re-run only fetches what is missing; pass --refresh to download everything again."""
import csv, datetime, io, json, os, sys, urllib.request

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, 'snapshot.json')
MONTHS = {'Jan': 1, 'Feb': 2, 'Mar': 3, 'Apr': 4, 'May': 5, 'Jun': 6, 'Jul': 7, 'Aug': 8, 'Sep': 9, 'Oct': 10, 'Nov': 11, 'Dec': 12,
          'Ene': 1, 'Abr': 4, 'Ago': 8, 'Set': 9, 'Dic': 12}


def get(url, headers=None):
    h = dict(headers or {}) if 'stlouisfed' in url else {'User-Agent': 'Mozilla/5.0', **(headers or {})}
    for attempt in range(4):
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
                                   f'&Datefrom=01/Jan/2015&Dateto=31/Dec/2030&SeriesCodes={code}&CSVF=TN&UsingCodes=Y'))); next(r)
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


S = json.load(open(OUT)) if os.path.exists(OUT) and '--refresh' not in sys.argv else {}
JOBS = {}
EA_T = [2, 5, 10, 20, 30]
for g in ('G_N_A', 'G_N_C'):
    for T in EA_T:
        JOBS[f'ECB_{g}_{T}'] = lambda k=f'YC/B.U2.EUR.4F.{g}.SV_C_YM.PY_{T}Y': ecb(k, '2015-01-01')
for c in ['IT', 'ES', 'PT', 'FR', 'BE', 'AT', 'IE', 'NL', 'FI', 'SK', 'SI', 'DE', 'GR', 'PL', 'RO', 'HU', 'CZ', 'HR', 'BG', 'LT', 'LV']:
    JOBS[f'ECB_IRS_{c}'] = lambda k=f'IRS/M.{c}.L.L40.CI.0000.EUR.N.Z' if c not in ('PL', 'RO', 'HU', 'CZ') else None, c=c: ecb(k, '2015-01') if k else {}
# ECB long-term rates for non-euro EU members are in national currency
for c, cur in (('PL', 'PLN'), ('RO', 'RON'), ('HU', 'HUF'), ('CZ', 'CZK')):
    JOBS[f'ECB_IRS_{c}'] = lambda k=f'IRS/M.{c}.L.L40.CI.0000.{cur}.N.Z': ecb(k, '2015-01')
for sid in ['DGS3', 'DGS1MO', 'DGS6MO'] + [f'HQMCB{n}YR' for n in (1, 2, 3, 5, 7, 10, 15, 20, 25, 30)] + ['DGS1', 'DGS2', 'DGS5', 'DGS7', 'DGS10', 'DGS20', 'DGS30', 'DAAA', 'DBAA',
            # ICE BofA US corporate OAS by maturity band and rating (FRED keeps about 3 years of ICE history)
            'BAMLC1A0C13Y', 'BAMLC2A0C35Y', 'BAMLC3A0C57Y', 'BAMLC4A0C710Y', 'BAMLC7A0C1015Y', 'BAMLC8A0C15PY',
            'BAMLC0A0CM', 'BAMLC0A1CAAA', 'BAMLC0A2CAA', 'BAMLC0A3CA', 'BAMLC0A4CBBB',
            # ICE BofA EM corporate plus: high grade, by region; euro corporate HY for context
            'BAMLEMCBPIOAS', 'BAMLEMIBHGCRPIOAS', 'BAMLEMRACRPIASIAOAS', 'BAMLEMRLCRPILAOAS',
            # high yield by rating (US) and the euro index; SOFR fixing
            'BAMLHE00EHYIOAS', 'BAMLH0A0HYM2', 'BAMLH0A1HYBB', 'BAMLH0A2HYB', 'BAMLH0A3HYC', 'SOFR']:
    JOBS[sid] = lambda sid=sid: fred(sid)
# official fixings the swap curves are checked against: €STR (daily) and 6M / 3M EURIBOR (monthly averages), ECB
JOBS['ECB_ESTR'] = lambda: ecb('EST/B.EU000A2X2A25.WT', '2024-01-01')
JOBS['ECB_EURIBOR6M'] = lambda: ecb('FM/M.U2.EUR.RT.MM.EURIBOR6MD_.HSTA', '2015-01')
JOBS['ECB_EURIBOR3M'] = lambda: ecb('FM/M.U2.EUR.RT.MM.EURIBOR3MD_.HSTA', '2015-01')
for code in ('IUDSNPY', 'IUDMNPY', 'IUDLNPY'):
    JOBS[f'BOE_{code}'] = lambda code=code: boe(code)
for code in ('PD43662XD', 'PD43665XD', 'PD43667XD', 'PD43669XD', 'PD43663XD', 'PD43671XD', 'PD43670XD',
             'PD04708XD', 'PD04711XD', 'PD04713XD', 'PD04715XD', 'PD04709XD', 'PD38581XD', 'PD38580XD'):
    JOBS[f'BCRP_{code}'] = lambda code=code: bcrp(code, 2014)
for sid, key in (('BBK_CORP', 'M.I.UMR.RD.EUR.X2000.B.A.A.R.A.A._Z._Z.A'), ('BBK_PUB', 'M.I.UMR.RD.EUR.S13.B.A.A.R.A.A._Z._Z.A')):
    JOBS[sid] = lambda key=key: bbk(key)
for T in EA_T:
    JOBS[f'BBK_ZST_{T}'] = lambda k=f'D.I.ZST.ZI.EUR.S1311.B.A604.R{T:02d}XX.R.A.A._Z._Z.A': bbk(k, '2015-01-01')

for sid, job in JOBS.items():
    if S.get(sid): continue
    try:
        S[sid] = job(); print(f'{sid:22s} {len(S[sid]):6d} obs, last {max(S[sid]) if S[sid] else "-"}', flush=True)
    except Exception as e:
        print(f'{sid:22s} FAILED {e}', file=sys.stderr, flush=True)
    json.dump(S, open(OUT, 'w'))
for sid in JOBS:
    if S.get(sid): print(f'{sid:22s} last {max(S[sid])} = {S[sid][max(S[sid])]}')
