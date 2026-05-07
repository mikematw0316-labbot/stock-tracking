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
const UA = 'Mozilla/5.0';

// ─── Helpers ──────────────────────────────────────────────────────────────────
const sleep = ms => new Promise(r => setTimeout(r, ms));

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
 * 取台股現價 — 使用 TWSE / TPEX 即時行情 API（不限頻，官方來源）
 * 上市用 tse_XXXX.tw，上櫃用 otc_XXXX.tw
 */
async function getTWPrice(code) {
  const isOTC  = CONFIG.OTC_STOCKS.includes(code);
  const exCode = isOTC ? `otc_${code}.tw` : `tse_${code}.tw`;
  const url    = `https://mis.twse.com.tw/stock/api/getStockInfo.jsp?ex_ch=${encodeURIComponent(exCode)}&json=1&delay=0`;
  const data   = await fetchJSON(url);
  const msgArray = data?.msgArray;
  if (!Array.isArray(msgArray) || !msgArray.length) return null;
  const item  = msgArray[0];
  // z = 成交價，y = 昨收
  const price = Number(item.z) || Number(item.y) || 0;
  return price > 0 ? price : null;
}

/**
 * 取台股股利事件（最近 1 年，Yahoo Finance）
 * 回傳 { exDate, payDate, perUnit } | null
 *
 * 邏輯：
 *   exDate  = 最新一筆除息日（不管當月）
 *   payDate = 發放日落在當月的那筆（月配 ETF 通常是上月除息→當月發放）
 *
 * Yahoo Finance 只有 ex-date，payDate 依類型估算：
 *   月配 bond ETF（MONTHLY_ETFS）：ex-date + 28 天
 *   其他：ex-date + 14 天
 */
async function getTWDividend(code) {
  const suffix = CONFIG.OTC_STOCKS.includes(code) ? '.TWO' : '.TW';
  const symbol = encodeURIComponent(code + suffix);
  const data = await fetchJSON(
    `https://query2.finance.yahoo.com/v8/finance/chart/${symbol}?range=1y&interval=1d&events=div`
  );
  const events = data?.chart?.result?.[0]?.events?.dividends;
  if (!events) return null;

  const isMonthly = CONFIG.MONTHLY_ETFS.includes(code);
  const gapMs = (isMonthly ? 28 : 14) * 86400000;

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const currY = today.getFullYear();
  const currM = today.getMonth() + 1;

  // 每筆：{ exD, payD(估算), amount }，按 exDate 降冪
  const candidates = Object.values(events).map(ev => {
    const exD = new Date(Number(ev.date || ev.timestamp) * 1000);
    const payD = new Date(exD.getTime() + gapMs);
    return { exD, payD, amount: Number(ev.amount || 0) };
  }).filter(c => c.amount > 0)
    .sort((a, b) => b.exD - a.exD);

  if (!candidates.length) return null;

  // exDate = 最新一筆
  const latestEx = candidates[0];

  // payDate = 找發放日落在當月的那筆
  const thisMonthPay =
    candidates.find(c => c.payD.getFullYear() === currY && c.payD.getMonth() + 1 === currM)
    ?? latestEx;

  return {
    exDate:  fmtDate(latestEx.exD),
    payDate: fmtDate(thisMonthPay.payD),
    perUnit: thisMonthPay.amount,
  };
}

/**
 * TWSE ETFortune HTML 備援（上市股票）
 * 爬 https://www.twse.com.tw/zh/ETFortune/dividendList 的 HTML 表格
 * 格式: 股票代號 | 名稱 | 除息日 | 除權日 | 發放日 | 金額 | ...（民國年 "115年05月06日"）
 */
async function getTWDividendFromTWSE(code) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 15000);
  let html = '';
  try {
    const res = await fetch('https://www.twse.com.tw/zh/ETFortune/dividendList', {
      method: 'POST',
      headers: {
        'User-Agent': UA,
        'Content-Type': 'application/x-www-form-urlencoded',
        'Referer': 'https://www.twse.com.tw/zh/ETFortune/dividendList',
      },
      body: `etfType=&symbols=&start=${new Date().getFullYear()}&end=${new Date().getFullYear()}`,
      signal: ctrl.signal,
    });
    if (!res.ok) return null;
    html = await res.text();
  } catch { return null; }
  finally { clearTimeout(timer); }

  // 取出所有 <tr> 並找到含目標代號的那列
  const rowRe = /<tr[^>]*>([\s\S]*?)<\/tr>/gi;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const currY = today.getFullYear();
  const currM = today.getMonth() + 1;

  const candidates = [];
  let m;
  while ((m = rowRe.exec(html)) !== null) {
    const row = m[1];
    const cells = [...row.matchAll(/<td[^>]*>([\s\S]*?)<\/td>/gi)]
      .map(c => c[1].replace(/<[^>]+>/g, '').trim());
    if (cells.length < 5) continue;
    if (cells[0] !== code) continue;

    // cells[2]=除息日, cells[4]=發放日, cells[5]=金額
    const exD  = parseROCDate(cells[2]);
    const payD = parseROCDate(cells[4]);
    const amt  = parseFloat(cells[5]) || 0;
    if (!exD || amt === 0) continue;
    candidates.push({ exD, payD, amt });
  }
  if (!candidates.length) return null;

  // exDate = 最新除息日；payDate = 發放日落在當月的那筆
  candidates.sort((a, b) => b.exD - a.exD);
  const latestEx = candidates[0];
  const thisMonthPay =
    candidates.find(c => c.payD && c.payD.getFullYear() === currY && c.payD.getMonth() + 1 === currM)
    ?? latestEx;

  return {
    exDate:  fmtDate(latestEx.exD),
    payDate: thisMonthPay.payD ? fmtDate(thisMonthPay.payD) : null,
    perUnit: thisMonthPay.amt,
  };
}

/**
 * 解析民國年日期：「115年05月06日」→ Date
 */
function parseROCDate(s) {
  if (!s) return null;
  const m = String(s).match(/(\d{2,3})年(\d{1,2})月(\d{1,2})日/);
  if (!m) return null;
  return new Date(Number(m[1]) + 1911, Number(m[2]) - 1, Number(m[3]));
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
 *
 * 邏輯同台股：
 *   exDate  = 最新除息日
 *   payDate = 發放日落在當月的那筆
 *   月配 ETF：ex-date + 28 天估算；其他：ex-date + 7 天（美股一般 T+7 左右）
 */
async function getUSData(code) {
  const data = await fetchJSON(
    `https://query2.finance.yahoo.com/v8/finance/chart/${code}?range=1y&interval=1d&events=div`
  );
  const result = data?.chart?.result?.[0];
  const meta   = result?.meta;

  const priceUSD = meta
    ? Number(meta.regularMarketPrice || meta.previousClose || 0) || null
    : null;

  const events = result?.events?.dividends;
  if (!events) return { priceUSD, perUnit: 0, exDate: null, payDate: null };

  const isMonthly = CONFIG.MONTHLY_ETFS.includes(code);
  const gapMs = (isMonthly ? 14 : 7) * 86400000;

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const currY = today.getFullYear();
  const currM = today.getMonth() + 1;

  const candidates = Object.values(events).map(ev => {
    const exD  = new Date(Number(ev.date || ev.timestamp) * 1000);
    const payD = new Date(exD.getTime() + gapMs);
    return { exD, payD, amount: Number(ev.amount || 0) };
  }).filter(c => c.amount > 0)
    .sort((a, b) => b.exD - a.exD);

  if (!candidates.length) return { priceUSD, perUnit: 0, exDate: null, payDate: null };

  const latestEx = candidates[0];
  const thisMonthPay =
    candidates.find(c => c.payD.getFullYear() === currY && c.payD.getMonth() + 1 === currM)
    ?? latestEx;

  return {
    priceUSD,
    perUnit:  thisMonthPay.amount,
    exDate:   fmtDate(latestEx.exD),
    payDate:  fmtDate(thisMonthPay.payD),
  };
}

// ─── 匯率 ─────────────────────────────────────────────────────────────────────

async function getUSDTWD() {
  const data = await fetchJSON(
    'https://query2.finance.yahoo.com/v8/finance/chart/USDTWD=X?range=1d&interval=1d'
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
  const now = new Date();

  const cache = {};
  const prices = {}; // code → price (TWD) or priceUSD (USD)

  // ── Phase 1：台股現價（TWSE mis API，無頻率限制）────────────────────────────
  console.log('[scraper] Phase 1: 台股現價（TWSE）...');
  for (const code of CONFIG.ALL_TW_STOCKS) {
    try {
      prices[code] = await getTWPrice(code);
      console.log(`[scraper]   ${code} 現價=${prices[code]}`);
    } catch (e) {
      console.error(`[scraper] ${code} 價格失敗:`, e.message);
      prices[code] = null;
    }
  }

  // ── Phase 2：等待 15 秒，讓 Yahoo Finance rate-limit 冷卻 ─────────────────
  console.log('[scraper] Phase 2: 等待 15s（Yahoo rate-limit 冷卻）...');
  await sleep(15000);

  // ── Phase 3：匯率（Yahoo，先單獨取）──────────────────────────────────────
  const fxRate = await getUSDTWD();
  console.log(`[scraper] 匯率 USD/TWD = ${fxRate}`);
  await sleep(3000);

  // ── Phase 3b：TWSE ETFortune HTML（上市股一次撈全部）────────────────────
  // TWSE HTML 一次請求即可取得所有上市 ETF 股利資料，比逐支查 Yahoo 更穩定
  console.log('[scraper] Phase 3b: TWSE ETFortune HTML 批次抓取...');
  const twseDivCache = {};
  for (const code of CONFIG.ALL_TW_STOCKS.filter(c => !CONFIG.OTC_STOCKS.includes(c))) {
    const d = await getTWDividendFromTWSE(code);
    if (d) twseDivCache[code] = d;
    console.log(`[scraper]   TWSE ${code} → exDate=${d?.exDate ?? 'null'} perUnit=${d?.perUnit ?? 0}`);
  }

  // ── Phase 4：台股股利（TWSE HTML 優先，Yahoo 補 OTC，2s 間隔）────────────
  console.log('[scraper] Phase 4: 台股股利...');
  for (const code of CONFIG.ALL_TW_STOCKS) {
    try {
      // 上市股：優先用 TWSE HTML（已批次抓），再嘗試 Yahoo
      // OTC 股：只走 Yahoo Finance（.TWO suffix）
      let divInfo = twseDivCache[code] ?? null;
      if (!divInfo) {
        divInfo = await getTWDividend(code);
        await sleep(2000);
      }

      const exDate  = divInfo?.exDate  ?? null;
      const payDate = divInfo?.payDate ?? null;
      const perUnit = divInfo?.perUnit ?? 0;

      cache[code] = { price: prices[code], exDate, payDate, perUnit, isEstimated: false, currency: 'TWD', updatedAt: now.toISOString() };
      console.log(`[scraper] ${code} 價格=${prices[code]} 除息=${exDate} 發放=${payDate} 股利=${perUnit}`);
    } catch (e) {
      console.error(`[scraper] ${code} 股利失敗:`, e.message);
      cache[code] = { price: prices[code] ?? null, exDate: null, payDate: null, perUnit: 0, isEstimated: false, currency: 'TWD', updatedAt: now.toISOString() };
    }
  }

  // ── Phase 5：美股（Yahoo，2s 間隔）─────────────────────────────────────────
  console.log('[scraper] Phase 5: 美股...');
  for (const code of CONFIG.US_STOCKS) {
    try {
      const { priceUSD, perUnit, exDate, payDate } = await getUSData(code);

      cache[code] = { price: priceUSD, exDate, payDate, perUnit, isEstimated: false, currency: 'USD', fxRate, updatedAt: now.toISOString() };
      console.log(`[scraper] ${code} 價格=$${priceUSD} 除息=${exDate} 發放=${payDate} 股利=$${perUnit}`);
    } catch (e) {
      console.error(`[scraper] ${code} 失敗:`, e.message);
    }
    await sleep(2000);
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
