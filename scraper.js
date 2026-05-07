'use strict';
/**
 * scraper.js — 爬取股價 + 股利資料，寫入 data/cache.json
 *
 * 資料來源：
 *   台股股價：Yahoo Finance (.TW / .TWO)
 *   台股股利：Yahoo Finance events/dividends（準確，自動支援 B 後綴）+ TWSE JSON 備援
 *   美股股價 + 股利：Yahoo Finance
 *   匯率：Yahoo Finance USDTWD=X
 *
 * 修正：
 *   - OTC 股票（00937B/00933B）用 .TWO suffix，不再搭 TWSE 主站 HTML 爬蟲
 *   - 月配 ETF 展延：只動 payDate，exDate 保持原值不變
 *   - 所有密鑰從 .env 讀取，不寫在程式裡
 */

const fs   = require('fs');
const path = require('path');
const CONFIG = require('./config');

const CACHE_FILE = path.join(__dirname, 'data', 'cache.json');
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';

// ─── HTTP helper ──────────────────────────────────────────────────────────────
async function fetchJSON(url, timeoutMs = 12000) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': UA, 'Accept': 'application/json' },
      signal: ctrl.signal,
    });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

// ─── 股價查詢 ─────────────────────────────────────────────────────────────────

/**
 * 取台股現價（上市 .TW，上櫃 .TWO）
 * 回傳 number | null
 */
async function getTWPrice(code) {
  const suffix = CONFIG.OTC_STOCKS.includes(code) ? '.TWO' : '.TW';
  const symbol = encodeURIComponent(code + suffix);
  const data = await fetchJSON(
    `https://query1.finance.yahoo.com/v8/finance/chart/${symbol}?range=1d&interval=1d`
  );
  const meta = data?.chart?.result?.[0]?.meta;
  if (!meta) return null;
  const price = Number(meta.regularMarketPrice || meta.previousClose || 0);
  return price > 0 ? price : null;
}

/**
 * 取台股股利事件（最近 1 年）
 * 回傳 { exDate, payDate, perUnit } | null
 *
 * Yahoo dividends 的 date 欄位即除息日（ex-date），
 * 發放日（payDate）台股慣例 = exDate + ~14 天（實際查 TWSE 備援）。
 */
async function getTWDividend(code) {
  const suffix = CONFIG.OTC_STOCKS.includes(code) ? '.TWO' : '.TW';
  const symbol = encodeURIComponent(code + suffix);
  const data = await fetchJSON(
    `https://query1.finance.yahoo.com/v8/finance/chart/${symbol}?range=1y&interval=1d&events=div`
  );
  const events = data?.chart?.result?.[0]?.events?.dividends;
  if (!events) return null;

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const thisYear  = today.getFullYear();
  const thisMonth = today.getMonth() + 1;

  const candidates = Object.values(events).map(ev => ({
    date:   new Date(Number(ev.date || ev.timestamp) * 1000),
    amount: Number(ev.amount || 0),
  })).filter(c => c.amount > 0)
     .sort((a, b) => b.date - a.date);

  if (!candidates.length) return null;

  // 優先選當月除息的紀錄，否則取最近一筆
  const picked =
    candidates.find(c =>
      c.date.getFullYear() === thisYear &&
      c.date.getMonth() + 1 === thisMonth
    ) ?? candidates[0];

  const exDate  = fmtDate(picked.date);
  // payDate 估算：exDate + 14 天（台股普通估算），月配 ETF 後面 applyRollForward 會再調
  const payDate = fmtDate(new Date(picked.date.getTime() + 14 * 86400000));

  return { exDate, payDate, perUnit: picked.amount };
}

/**
 * TWSE JSON 備援（上市股票，ETFortune dividendList 有 JSON 格式）
 * 只用來補充 payDate 比較準確的情況
 */
async function getTWDividendFromTWSE(code) {
  // TWSE 提供 JSON 格式（Accept: application/json）
  const data = await fetchJSON(
    `https://www.twse.com.tw/zh/ETFortune/dividendList?response=json`
  );
  const rows = data?.data;
  if (!Array.isArray(rows)) return null;

  const today = new Date();
  const thisYear  = today.getFullYear();
  const thisMonth = today.getMonth() + 1;

  // 格式: [股票代號, 股票名稱, 除息日, 股利, 發放日, ...]
  const matched = rows.filter(r => String(r[0]).trim() === code);
  if (!matched.length) return null;

  // 優先找當月的
  const pick = matched.find(r => {
    const payD = parseTWSEDate(r[4]);
    return payD &&
      payD.getFullYear() === thisYear &&
      payD.getMonth() + 1 === thisMonth;
  }) ?? matched[matched.length - 1];

  const exDate  = pick[2] ? fmtDate(parseTWSEDate(pick[2])) : null;
  const payDate = pick[4] ? fmtDate(parseTWSEDate(pick[4])) : null;
  const perUnit = Number(String(pick[3]).replace(/,/g, '')) || 0;

  if (!exDate || !perUnit) return null;
  return { exDate, payDate, perUnit };
}

/**
 * 解析 TWSE 日期格式：民國年 "114/05/15" → Date
 */
function parseTWSEDate(s) {
  if (!s) return null;
  const str = String(s).trim();
  // 民國年 xxx/mm/dd
  let m = str.match(/^(\d{2,3})\/(\d{1,2})\/(\d{1,2})$/);
  if (m) {
    const y = Number(m[1]) + 1911;
    return new Date(y, Number(m[2]) - 1, Number(m[3]));
  }
  // 西元年 yyyy/mm/dd or yyyy-mm-dd
  m = str.match(/^(\d{4})[\/\-](\d{1,2})[\/\-](\d{1,2})$/);
  if (m) return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  return null;
}

// ─── 美股 ─────────────────────────────────────────────────────────────────────

/**
 * 取美股現價 + 近期股利
 * 回傳 { priceUSD, perUnit, exDate, payDate }
 */
async function getUSData(code) {
  const data = await fetchJSON(
    `https://query1.finance.yahoo.com/v8/finance/chart/${code}?range=1y&interval=1d&events=div`
  );
  const result = data?.chart?.result?.[0];
  const meta   = result?.meta;

  const priceUSD = meta
    ? Number(meta.regularMarketPrice || meta.previousClose || 0) || null
    : null;

  const events = result?.events?.dividends;
  if (!events) return { priceUSD, perUnit: 0, exDate: null, payDate: null };

  const today = new Date();
  const thisYear  = today.getFullYear();
  const thisMonth = today.getMonth() + 1;

  const candidates = Object.values(events).map(ev => ({
    date:   new Date(Number(ev.date || ev.timestamp) * 1000),
    amount: Number(ev.amount || 0),
  })).filter(c => c.amount > 0)
     .sort((a, b) => b.date - a.date);

  if (!candidates.length) return { priceUSD, perUnit: 0, exDate: null, payDate: null };

  const picked =
    candidates.find(c =>
      c.date.getFullYear() === thisYear &&
      c.date.getMonth() + 1 === thisMonth
    ) ?? candidates[0];

  const exDate  = fmtDate(picked.date);
  const payDate = fmtDate(new Date(picked.date.getTime() + 3 * 86400000)); // 美股 T+3

  return { priceUSD, perUnit: picked.amount, exDate, payDate };
}

// ─── 匯率 ─────────────────────────────────────────────────────────────────────

async function getUSDTWD() {
  const data = await fetchJSON(
    'https://query1.finance.yahoo.com/v8/finance/chart/USDTWD=X?range=1d&interval=1d'
  );
  const meta = data?.chart?.result?.[0]?.meta;
  if (!meta) return 32;
  return Number(meta.regularMarketPrice || meta.previousClose || 32) || 32;
}

// ─── 月配 ETF 展延 ────────────────────────────────────────────────────────────

/**
 * 月配 ETF：保持 exDate 不變，把 payDate 移到當月合理日期
 * 回傳 { exDate, payDate, isEstimated }
 */
function applyMonthlyRollForward(code, exDate, payDate, perUnit) {
  if (!CONFIG.MONTHLY_ETFS.includes(code)) {
    return { exDate, payDate, perUnit, isEstimated: false };
  }

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const currY = today.getFullYear();
  const currM = today.getMonth() + 1;

  const exD  = parseYMD(exDate);
  const payD = parseYMD(payDate);

  if (!exD) return { exDate, payDate, perUnit, isEstimated: true };

  // payDate 目標：原始發放日，但年月強制換成當月
  const targetDay = payD ? payD.getDate() : exD.getDate() + 14;
  let newPay = new Date(currY, currM - 1, targetDay);

  // 若月份溢出（例如 2 月沒有 31 日），夾回當月最後一天
  if (newPay.getMonth() !== currM - 1) {
    newPay = new Date(currY, currM, 0);
  }

  // 發放日不能早於或等於除息日
  if (exD && newPay.getTime() <= exD.getTime()) {
    newPay = new Date(exD.getTime() + 5 * 86400000);
    if (newPay.getMonth() !== currM - 1) {
      newPay = new Date(currY, currM, 0);
    }
  }

  // 若原始 payDate 本來就在當月，視為真實資料（非預估）
  const payWasThisMonth =
    payD &&
    payD.getFullYear() === currY &&
    payD.getMonth() + 1 === currM;

  return {
    exDate,                        // 除息日：原值不動
    payDate: fmtDate(newPay),      // 發放日：移到當月
    perUnit,
    isEstimated: !payWasThisMonth,
  };
}

// ─── 主流程 ───────────────────────────────────────────────────────────────────

async function scrapeAll() {
  console.log('[scraper] 開始抓取...');
  const now    = new Date();
  const fxRate = await getUSDTWD();
  console.log(`[scraper] 匯率 USD/TWD = ${fxRate}`);

  const cache = {};

  // 台股
  for (const code of CONFIG.ALL_TW_STOCKS) {
    try {
      const price = await getTWPrice(code);

      // 優先 Yahoo，備援 TWSE JSON（僅上市股）
      let divInfo = await getTWDividend(code);
      if (!divInfo && !CONFIG.OTC_STOCKS.includes(code)) {
        divInfo = await getTWDividendFromTWSE(code);
      }

      let exDate  = divInfo?.exDate  ?? null;
      let payDate = divInfo?.payDate ?? null;
      let perUnit = divInfo?.perUnit ?? 0;
      let isEstimated = false;

      if (CONFIG.MONTHLY_ETFS.includes(code) && exDate) {
        const rolled = applyMonthlyRollForward(code, exDate, payDate, perUnit);
        exDate      = rolled.exDate;
        payDate     = rolled.payDate;
        perUnit     = rolled.perUnit;
        isEstimated = rolled.isEstimated;
      }

      cache[code] = { price, exDate, payDate, perUnit, isEstimated, currency: 'TWD', updatedAt: now.toISOString() };
      console.log(`[scraper] ${code} 價格=${price} 除息=${exDate} 發放=${payDate} 股利=${perUnit}${isEstimated ? ' (預估)' : ''}`);
    } catch (e) {
      console.error(`[scraper] ${code} 失敗:`, e.message);
    }
  }

  // 美股
  for (const code of CONFIG.US_STOCKS) {
    try {
      const q = await getUSData(code);
      let { priceUSD, perUnit, exDate, payDate } = q;
      let isEstimated = false;

      if (CONFIG.MONTHLY_ETFS.includes(code) && exDate) {
        const rolled = applyMonthlyRollForward(code, exDate, payDate, perUnit);
        exDate      = rolled.exDate;
        payDate     = rolled.payDate;
        perUnit     = rolled.perUnit;
        isEstimated = rolled.isEstimated;
      }

      cache[code] = { price: priceUSD, exDate, payDate, perUnit, isEstimated, currency: 'USD', fxRate, updatedAt: now.toISOString() };
      console.log(`[scraper] ${code} 價格=$${priceUSD} 除息=${exDate} 發放=${payDate} 股利=$${perUnit}${isEstimated ? ' (預估)' : ''}`);
    } catch (e) {
      console.error(`[scraper] ${code} 失敗:`, e.message);
    }
  }

  // 寫入快取
  fs.mkdirSync(path.dirname(CACHE_FILE), { recursive: true });
  fs.writeFileSync(CACHE_FILE, JSON.stringify(cache, null, 2), 'utf8');
  console.log(`[scraper] 完成，已寫入 ${CACHE_FILE}`);
  return cache;
}

// ─── 工具函數 ─────────────────────────────────────────────────────────────────

function fmtDate(d) {
  if (!(d instanceof Date) || isNaN(d)) return null;
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}/${m}/${day}`;
}

function parseYMD(s) {
  if (!s) return null;
  const m = String(s).match(/(\d{4})[\/\-](\d{1,2})[\/\-](\d{1,2})/);
  if (!m) return null;
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  d.setHours(0, 0, 0, 0);
  return d;
}

module.exports = { scrapeAll };

if (require.main === module) {
  scrapeAll().catch(e => { console.error(e); process.exit(1); });
}
