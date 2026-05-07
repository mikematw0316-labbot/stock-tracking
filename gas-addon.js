/**
 * gas-addon.js
 * ============
 * 將以下程式碼貼到你的 Google Apps Script 專案裡，
 * 讓 GitHub Pages 前端可以透過 HTTP 存取 Google Sheets 資料。
 *
 * 部署後需要重新「發佈 > 部署為 Web 應用程式」（同一個 Script URL 即可）。
 */

const SHEET_ID  = '1juUR2My4_iQKwXQkA1A9xHD_R5TRFsq5Z_qcbh2ixgk';
const DATA_SHEET = 'UserData';  // 欄位：[UserId, StockCode, Lots, Price, UpdatedAt]

// ── doGet：前端 GET 讀取持倉（避免 CORS POST redirect 問題）──────────────────
function doGet(e) {
  const output = ContentService.createTextOutput();
  output.setMimeType(ContentService.MimeType.JSON);

  const user   = String(e.parameter.user   || '').trim();
  const action = String(e.parameter.action || '').trim();

  if (!user) {
    output.setContent(JSON.stringify({ ok: false, error: 'invalid user' }));
    return output;
  }

  if (action === 'load') {
    const data = getUserSettings(user);
    output.setContent(JSON.stringify({ ok: true, data }));
  } else {
    output.setContent(JSON.stringify({ ok: false, error: 'unknown action' }));
  }

  return output;
}

// ── doPost：前端 POST 儲存持倉 ────────────────────────────────────────────────
function doPost(e) {
  const output = ContentService.createTextOutput();
  output.setMimeType(ContentService.MimeType.JSON);

  try {
    const body = JSON.parse(e.postData.contents);
    const { action, user, payload } = body;

    if (!user || user.trim() === '') {
      output.setContent(JSON.stringify({ ok: false, error: 'invalid user' }));
      return output;
    }

    if (action === 'save') {
      saveUserSettings(user, payload);
      output.setContent(JSON.stringify({ ok: true }));
    } else {
      output.setContent(JSON.stringify({ ok: false, error: 'unknown action' }));
    }
  } catch (err) {
    output.setContent(JSON.stringify({ ok: false, error: err.message }));
  }

  return output;
}

// ── Helper：讀取使用者持倉 ────────────────────────────────────────────────────
function getUserSettings(userId) {
  const ss    = SpreadsheetApp.openById(SHEET_ID);
  const sheet = ss.getSheetByName(DATA_SHEET);
  const rows  = sheet.getDataRange().getValues();
  const holdings = {};

  for (let i = 1; i < rows.length; i++) {
    const [id, code, lots, price] = rows[i];
    if (String(id) !== userId || !code) continue;
    holdings[String(code).replace(/^'/, '').trim()] = {
      lots: Number(lots  || 0),
      cost: Number(price || 0),
    };
  }
  return { holdings };
}

// ── Helper：寫入使用者持倉 ────────────────────────────────────────────────────
function saveUserSettings(userId, payload) {
  const ss    = SpreadsheetApp.openById(SHEET_ID);
  const sheet = ss.getSheetByName(DATA_SHEET);
  const all   = sheet.getDataRange().getValues();
  const now   = new Date().toISOString();

  // 從最後一行往前刪，避免 row index 偏移
  for (let i = all.length - 1; i >= 1; i--) {
    if (String(all[i][0]) === userId) sheet.deleteRow(i + 1);
  }

  // 補上新資料
  for (const [code, h] of Object.entries(payload || {})) {
    const lots = Number(h.lots || 0);
    const cost = Number(h.cost || 0);
    if (lots <= 0) continue;
    sheet.appendRow([userId, code, lots, cost, now]);
  }
}
