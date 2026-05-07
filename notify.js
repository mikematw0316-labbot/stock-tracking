'use strict';
/**
 * notify.js — 讀取快取 + 使用者持倉，計算損益 / 股利，推播 LINE 通知
 *
 * 使用者設定：data/users.json
 * 快取：data/cache.json（由 scraper.js 產生）
 * 密鑰：.env (LINE_ACCESS_TOKEN)
 */

require('dotenv').config();

const fs   = require('fs');
const path = require('path');
const CONFIG = require('./config');

const CACHE_FILE = path.join(__dirname, 'data', 'cache.json');
const USERS_FILE = path.join(__dirname, 'data', 'users.json');

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
  const today   = new Date();
  const thisYear  = today.getFullYear();
  const thisMonth = today.getMonth() + 1;

  let totalDiv   = 0;
  let totalProfit = 0;
  let totalValue  = 0;
  const items = {};

  for (const code of CONFIG.ALL_STOCKS) {
    const h    = holdings[code] || {};
    const lots = Number(h.lots || 0);
    const cost = Number(h.costPrice || 0);
    if (lots === 0) continue;

    const isUS    = CONFIG.US_STOCKS.includes(code);
    const units   = isUS ? lots : lots * CONFIG.BOARD_LOT;
    const info    = cache[code] || {};
    const price   = Number(info.price || 0);
    const perUnit = Number(info.perUnit || 0);
    const fxRate  = isUS ? Number(info.fxRate || 32) : 1;

    // 持股市值（折台幣）
    const val = isUS ? price * units * fxRate : price * units;
    totalValue += val;

    // 損益（折台幣）
    const profit = (price > 0 && cost > 0)
      ? Math.round((price - cost) * units * (isUS ? fxRate : 1))
      : 0;
    totalProfit += profit;

    // 本月股利
    const payDate = info.payDate;
    const isThisMonth = payDate && (() => {
      const m = String(payDate).match(/(\d{4})[\/\-](\d{2})/);
      return m && Number(m[1]) === thisYear && Number(m[2]) === thisMonth;
    })();

    let divAmt = 0;
    if (isThisMonth && perUnit > 0) {
      divAmt = isUS
        ? Math.round(perUnit * units * fxRate * (1 - CONFIG.US_TAX_RATE))
        : Math.round(perUnit * units);
      totalDiv += divAmt;
    }

    items[code] = {
      lots, units, cost, price,
      profit, divAmt,
      perUnit, fxRate,
      exDate: info.exDate,
      payDate,
      isEstimated: !!info.isEstimated,
      isThisMonth: !!isThisMonth,
      isUS,
    };
  }

  return { thisYear, thisMonth, totalDiv, totalProfit, totalValue, items };
}

// ─── 產生 LINE 訊息文字 ───────────────────────────────────────────────────────

function buildMessage(result, updatedAt) {
  const { thisMonth, totalDiv, totalProfit, totalValue, items } = result;

  const ts = updatedAt
    ? new Date(updatedAt).toLocaleString('zh-TW', { timeZone: 'Asia/Taipei', month:'2-digit', day:'2-digit', hour:'2-digit', minute:'2-digit' })
    : '未知';

  let msg = `📊 W&M ${thisMonth}月 股利彙報\n`;
  msg += `資料更新：${ts}\n\n`;
  msg += `💰 本月總股利：$${Math.round(totalDiv).toLocaleString()}\n`;
  msg += `📈 今日總損益：$${Math.round(totalProfit).toLocaleString()}\n`;
  msg += `💎 持股總市值：$${Math.round(totalValue).toLocaleString()}\n`;
  msg += `────────────────\n\n`;

  for (const code of CONFIG.ALL_STOCKS) {
    const item = items[code];
    if (!item) continue;

    const unitStr  = item.isUS ? `${item.lots}股` : `${item.lots}張`;
    const profStr  = item.profit > 0
      ? `🔺${item.profit.toLocaleString()}`
      : item.profit < 0
        ? `▼${Math.abs(item.profit).toLocaleString()}`
        : `  0`;
    const hasDiv   = item.divAmt > 0;
    const icon     = hasDiv ? '◆ ' : '◇ ';

    msg += `${icon}${code} (${unitStr}) ${profStr}\n`;
    msg += `  現價 ${item.price} / 成本 ${item.cost}\n`;

    if (hasDiv) {
      const dateStr = item.payDate ? item.payDate.slice(5) : '??'; // MM/DD
      const estStr  = item.isEstimated ? '（預估）' : '';
      msg += `  ◎ ${dateStr} 發放 $${item.divAmt.toLocaleString()}${estStr}\n`;
      msg += `    (除息 ${item.exDate || '未定'} / 每單位 ${item.perUnit})\n`;
    } else if (CONFIG.MONTHLY_ETFS.includes(code)) {
      msg += `  ◎ 本月股利更新中\n`;
    } else {
      msg += `  ◎ 本月無股利派發\n`;
    }
    msg += '\n';
  }

  msg += `────────────────\n`;
  return msg.trim();
}

// ─── 主流程 ───────────────────────────────────────────────────────────────────

async function notifyAll(dryRun = false) {
  if (!fs.existsSync(CACHE_FILE)) {
    console.error('[notify] 找不到 cache.json，請先執行 scraper.js');
    process.exit(1);
  }
  if (!fs.existsSync(USERS_FILE)) {
    console.error('[notify] 找不到 data/users.json');
    process.exit(1);
  }

  const cache = JSON.parse(fs.readFileSync(CACHE_FILE, 'utf8'));
  const users = JSON.parse(fs.readFileSync(USERS_FILE, 'utf8'));

  // 取最新更新時間
  const updatedAt = Object.values(cache).map(v => v.updatedAt).sort().pop();

  for (const [userId, user] of Object.entries(users)) {
    if (!userId.startsWith('U')) continue; // LINE user ID 以 U 開頭
    try {
      const result  = computeUser(user.holdings || {}, cache);
      const message = buildMessage(result, updatedAt);

      console.log(`\n[notify] 使用者 ${user.name || userId}：\n${message}\n`);

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
