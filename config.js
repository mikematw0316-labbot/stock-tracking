'use strict';

const CONFIG = {
  // 台股 ETF（上市 TSE）
  TW_STOCKS: ['0050', '0056', '00878', '00919', '00953B', '00984D'],
  // 台股 ETF（上櫃 TPEX）— Yahoo Finance 用 .TWO suffix
  OTC_STOCKS: ['00937B', '00933B', '00687B'],
  // 美股 ETF
  US_STOCKS: ['QQQI', 'CLOZ'],
  // 月配 ETF（需每月展延預估）
  MONTHLY_ETFS: ['00953B', '00937B', '00933B', '00984D', 'QQQI', 'CLOZ'],

  get ALL_TW_STOCKS() {
    return [...this.TW_STOCKS, ...this.OTC_STOCKS];
  },
  get ALL_STOCKS() {
    return [...this.TW_STOCKS, ...this.OTC_STOCKS, ...this.US_STOCKS];
  },

  // 每張台股 = 1000 股
  BOARD_LOT: 1000,
  // 美股預扣稅率（30%）
  US_TAX_RATE: 0.30,
  // 快取過期天數
  CACHE_EXPIRE_DAYS: 35,
};

module.exports = CONFIG;
