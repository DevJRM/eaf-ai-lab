/* WAL Wedge client templates — THE CASE.
   This is the only file to edit to populate the client documents (walWedgePitch.html,
   borrowerView.html, borrowerViewExpanded.html) and the internal Q&A guide (borrowerQA.html)
   with a real case. Every figure and every case-dependent sentence in those pages is computed
   from the values below by clientKit.js.

   The defaults reproduce the sample case of WAL_Wedge_Loan_vs_Bond_Calculator.xlsx
   (simulated market data shaped on Portugal — NOT market data). Before any real use:
   replace all market data with ONE Bloomberg YAS snapshot (see the workbook's Data Sourcing
   tab) and set illustrative to false. */
window.WW_CASE = {
  illustrative: true,              // true = shows the "illustrative template, simulated data" ribbon
  client: '',                      // e.g. 'Republic of X' or 'X Group plc'; blank shows a placeholder
  borrowerType: 'sovereign',       // 'sovereign' or 'corporate' (wording only)
  asOf: '26 October 2026',         // date of the market-data snapshot (workbook Inputs C10)

  currency: 'EUR',                 // 'EUR', 'USD' or 'GBP' — of the loan AND of the bonds quoted below
  swapBasis: 'EURIBOR6M',          // EUR only: 'EURIBOR6M' or 'ESTR' (ignored for USD = SOFR, GBP = SONIA)
  amount: 1e9,                     // loan amount = bond amount
  drawdownYears: 1,                // x: equal semi-annual drawdowns from signing (0 = drawn at signing)
  repaymentYears: 23,              // y: equal semi-annual instalments after the drawdown period
  marginFloatBp: 0,                // X: floating margin agreed above (+) or below (−) the curve reading, bp
  marginFixedBp: 0,                // X: fixed rate agreed above (+) or below (−) the curve reading, bp
  recovery: 0.40,                  // recovery rate on default
  couponFreq: 1,                   // the issuer's bond coupon frequency in this currency: 1 or 2
  fixing6mPct: 3.019,              // 6M fixing, % (EURIBOR / Term SOFR / 6M SONIA OIS); null = none

  // Bloomberg YAS quotes by whole-year tenor; leave a tenor out where there is no quote.
  zspreadBp: {1: -19, 2: -15, 3: -14, 4: -2, 5: 6, 6: 13, 7: 24, 8: 30, 9: 37, 10: 42,
              11: 46, 14: 61, 15: 65, 18: 74, 20: 78, 25: 89, 28: 92},
  ytmPct:    {1: 3.032, 2: 3.242, 3: 3.349, 4: 3.431, 5: 3.522, 6: 3.597, 7: 3.726, 8: 3.804,
              9: 3.888, 10: 3.942, 11: 3.995, 14: 4.198, 15: 4.256, 18: 4.320, 20: 4.349,
              25: 4.349, 28: 4.376},
  // Swap par rates, % — the curve YAS measures the Z-spreads against, same snapshot.
  swapPct:   {1: 3.2220, 2: 3.3919, 3: 3.4888, 4: 3.4510, 5: 3.4620, 6: 3.4671, 7: 3.4863,
              8: 3.5045, 9: 3.5188, 10: 3.5229, 11: 3.5362, 12: 3.5545, 13: 3.5728, 14: 3.5913,
              15: 3.6103, 16: 3.6011, 17: 3.5919, 18: 3.5826, 19: 3.5767, 20: 3.5707, 21: 3.5467,
              22: 3.5225, 23: 3.4981, 24: 3.4735, 25: 3.4487, 26: 3.4477, 27: 3.4467, 28: 3.4456,
              29: 3.4458, 30: 3.4460}
};
