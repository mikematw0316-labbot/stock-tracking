'use strict';
/**
 * notify.js — 讀取快取 + 使用者持倉（Google Sheets），計算損益 / 股利，推播 LINE
 *
 * 使用者資料來源（優先順序）：
 *   1. Google Sheets "UserData"（用 service account）← 雲端已註冊使用者
 *   2. LINE_USERS_JSON 環境變數（GitHub Actions Secret）
 *   3. data/users.json（本地備用）
 *
 * 密鑰：.env 或 GitHub Secrets
 *   LINE_ACCESS_TOKEN      — LINE Bot Channel Access Token
 *   GOOGLE_SA_JSON         — Service Account JSON 字串（GitHub Secret）
 *   SHEET_ID               — Google Sheets ID（可選，預設使用硬碼）
 */

require('dotenv').config();

const fs      = require('fs');
const path    = require('path');
const { google } = require('googleapis');
const CONFIG  = require('./config');

const CACHE_FILE = path.join(__dirname, 'data', 'cache.json');
const USERS_FILE = path.join(__dirname, 'data', 'users.json');

// Google Sheets ID（從原始 GAS 程式碼取得）
const SHEET_ID = process.env.SHEET_ID || '1juUR2My4_iQKwXQkA1A9xHD_R5TRFsq5Z_qcbh2ixgk';

// ─── Google Sheets：讀取 UserData ────────────────────────────────────────────

/**
 * 從 Google Sheets 讀取所有已註冊使用者的持倉
 * 回傳格式：{ [lineUserId]: { name, holdings: { [code]: { lots, costPrice } } } }
 */
async function loadUsersFromSheets() {
  let saJson;

  // 優先使用 GitHub Secret（JSON 字串）
  if (process.env.GOOGLE_SA_JSON) {
    saJson = JSON.parse(process.env.GOOGLE_SA_JSON);
  } else {
    // 本地開發：讀外接硬碟的 service account 文件
    const saPath = process.env.GOOGLE_SA_PATH ||
      path.join('/Volumes/外接硬碟/gcp-service-account.json');
    if (!fs.existsSync(saPath)) return null;
    saJson = JSON.parse(fs.readFileSync(saPath, 'utf8'));
  }

  try {
    const auth = new google.auth.GoogleAuth({
      credentials: saJson,
      scopes: ['https://www.googleapis.com/auth/spreadsheets.readonly'],
    });

    const sheets = google.sheets({ version: 'v4', auth });
    const res = await sheets.spreadsheets.values.get({
      spreadsheetId: SHEET_ID,
      range: 'UserData!A:E',  // [LineId, StockCode, Lots, Price, UpdatedAt]
    });

    const rows = res.data.values || [];
    if (rows.length <= 1) return {};

    const users = {};
    for (let i = 1; i < rows.length; i++) {
      const [lineId, rawCode, lots, price] = rows[i];
      if (!lineId || !lineId.startsWith('U')) continue;
      const code = String(rawCode || '').replace(/^'/, '').trim();
      if (!code || !CONFIG.ALL_STOCKS.includes(code)) continue;

      if (!users[lineId]) {
        users[lineId] = { name: lineId, holdings: {} };
      }
      users[lineId].holdings[code] = {
        lots:      Number(lots  || 0),
        costPrice: Number(price || 0),
      };
    }

    console.log(`[notify] 從 Google Sheets 讀取 ${Object.keys(users).length} 位使用者`);
    return users;
  } catch (e) {
    console.error('[notify] Google Sheets 讀取失敗:', e.message);
    return null;
  }
}

// ─── LINE 推播 ────────────────────────────────────────────────────────────────

async function sendLinePush(userId, text) {
  const token = process.env.LINE_ACCESS_TOKEN;
  if (!token) throw new Error('LINE_ACCESS_TOKEN 未設定');

  const res = await fetch('https://api.line.me/v2/bot/message/push', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      to: userId,
      messages: [{ type: 'text', text }],
    }),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`LINE API 錯誤 ${res.status}: ${body}`);
  }
}

// ─── 計算單一使用者 ───────────────────────────────────────────────────────────

function computeUser(holdings, cache) {
  const today     = new Date();
  const thisYear  = today.getFullYear();
  const thisMonth = today.getMonth() + 1;

  let totalDiv = 0, totalProfit = 0, totalValue = 0;
  const items = {};

  for (const code of CONFIG.ALL_STOCKS) {
    const h    = holdings[code] || {};
    const lots = Number(h.lots || 0);
    const cost = Number(h.costPrice || 0);
    if (lots === 0) continue;

    const isUS    = CONFIG.US_STOCKS.includes(code);
    const units   = isUS ? lots : lots * CONFIG.BOARD_LOT;
    const info    = cache[code] || {};
    const price   = Number(info.price   || 0);
    const perUnit = Number(info.perUnit || 0);
    const fxRate  = isUS ? Number(info.fxRate || 32) : 1;

    const val = isUS ? price * units * fxRate : price * units;
    totalValue += val;

    const profit = (price > 0 && cost > 0)
      ? Math.round((price - cost) * units * (isUS ? fxRate : 1))
      : 0;
    totalProfit += profit;

    const payDate = info.payDate || '';
    const isThisMonth = (() => {
      const m = String(payDate).match(/(\d{4})[\/\-](\d{2})/);
      return m && Number(m[1]) === thisYear && Number(m[2]) === thisMonth;
    })();

    let divAmt = 0;
    if (isThisMonth && perUnit > 0 && units > 0) {
      divAmt = isUS
        ? Math.round(perUnit * units * fxRate * (1 - CONFIG.US_TAX_RATE))
        : Math.round(perUnit * units);
      totalDiv += divAmt;
    }

    items[code] = {
      lots, units, cost, price, profit, divAmt, perUnit, fxRate,
      exDate: info.exDate, payDate,
      isEstimated: !!info.isEstimated, isThisMonth: !!isThisMonth, isUS,
    };
  }

  return { thisYear, thisMonth, totalDiv, totalProfit, totalValue, items };
}

// ─── 產生 LINE 訊息 ───────────────────────────────────────────────────────────

function buildMessage(result) {
  const { thisYear, thisMonth, totalDiv, totalProfit, totalValue, items } = result;

  let msg = `📊 W&M ${thisYear}-${thisMonth} 股利彙報\n\n`;
  msg += `💰 本月總股利：$${Math.round(totalDiv).toLocaleString()}\n`;
  msg += `📈 今日總損益：$${Math.round(totalProfit).toLocaleString()}\n`;
  msg += `💎 目前持股值：$${Math.round(totalValue).toLocaleString()}\n\n`;
  msg += `────────────────\n\n`;

  for (const code of CONFIG.ALL_STOCKS) {
    const item = items[code];
    if (!item) continue;

    const unitStr = item.isUS ? `${item.lots}股` : `${item.lots}張`;
    const profStr = item.profit > 0
      ? `🔺${item.profit.toLocaleString()}`
      : item.profit < 0 ? `🔻${Math.abs(item.profit).toLocaleString()}` : '±0';
    const icon = item.divAmt > 0 ? '◆' : '◇';

    msg += `${icon} ${code} (${unitStr}) ${profStr}\n`;

    if (item.divAmt > 0) {
      // payDate 格式：2026/05/14 → 05/14
      const dateStr = item.payDate ? item.payDate.slice(5) : '??';
      msg += `----${dateStr} 發放：$${item.divAmt.toLocaleString()}\n`;
    } else {
      msg += `----本月無股利派發\n`;
    }
    msg += '\n';
  }

  msg += `────────────────\n\n`;
  msg += `🔗 手動查詢/修改：\n\n`;
  msg += `https://mikematw0316-labbot.github.io/stock-tracking/`;

  return msg;
}

// ─── 主流程 ───────────────────────────────────────────────────────────────────

async function notifyAll(dryRun = false) {
  if (!fs.existsSync(CACHE_FILE)) {
    console.error('[notify] 找不到 cache.json，請先執行 scraper.js');
    process.exit(1);
  }

  const cache = JSON.parse(fs.readFileSync(CACHE_FILE, 'utf8'));
  const updatedAt = Object.values(cache).map(v => v.updatedAt).sort().pop();

  // 使用者資料：Sheets > LINE_USERS_JSON env > 本地 users.json
  let users = await loadUsersFromSheets();

  if (!users) {
    if (process.env.LINE_USERS_JSON) {
      users = JSON.parse(process.env.LINE_USERS_JSON);
      console.log('[notify] 使用 LINE_USERS_JSON env');
    } else if (fs.existsSync(USERS_FILE)) {
      users = JSON.parse(fs.readFileSync(USERS_FILE, 'utf8'));
      console.log('[notify] 使用本地 users.json');
    } else {
      console.log('[notify] 無使用者資料，跳過推播');
      return;
    }
  }

  for (const [userId, user] of Object.entries(users)) {
    if (!userId.startsWith('U')) continue;
    try {
      const result  = computeUser(user.holdings || {}, cache);
      const message = buildMessage(result);
      console.log(`\n[notify] ${user.name || userId}：\n${message}\n`);

      if (!dryRun) {
        await sendLinePush(userId, message);
        console.log(`[notify] 已發送給 ${user.name || userId}`);
      } else {
        console.log('[notify] dry-run：不發送');
      }
    } catch (e) {
      console.error(`[notify] ${userId} 失敗:`, e.message);
    }
  }
}

module.exports = { notifyAll };

if (require.main === module) {
  const dryRun = process.argv.includes('--dry-run');
  notifyAll(dryRun).catch(e => { console.error(e); process.exit(1); });
}
