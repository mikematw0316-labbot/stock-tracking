'use strict';
/**
 * run.js — 主入口：先爬蟲，再推播
 * 每天 14:00 由 LaunchAgent 觸發
 */

require('dotenv').config();

const { scrapeAll } = require('./scraper');
const { notifyAll } = require('./notify');

async function main() {
  const dryRun = process.argv.includes('--dry-run');
  console.log(`[run] ${new Date().toLocaleString('zh-TW', { timeZone: 'Asia/Taipei' })} 開始執行${dryRun ? '（dry-run）' : ''}`);

  await scrapeAll();
  await notifyAll(dryRun);

  console.log('[run] 全部完成');
}

main().catch(e => { console.error('[run] 錯誤:', e); process.exit(1); });
