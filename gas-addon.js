/**
 * gas-addon.js
 * ============
 * 將以下程式碼貼到你的 Google Apps Script 專案裡，
 * 讓 GitHub Pages 前端可以透過 HTTP 存取 Google Sheets 資料。
 *
 * 部署後需要重新「發佈 > 部署為 Web 應用程式」（同一個 Script URL 即可）。
 */

// ── doPost：GitHub Pages 前端儲存持倉 ─────────────────────────────────────────
function doPost(e) {
  // 允許跨域
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
    } else if (action === 'load') {
      const data = getUserSettings(user);
      output.setContent(JSON.stringify({ ok: true, data }));
    } else {
      output.setContent(JSON.stringify({ ok: false, error: 'unknown action' }));
    }
  } catch (err) {
    output.setContent(JSON.stringify({ ok: false, error: err.message }));
  }

  return output;
}

// ── doGet 補充：api=load（讓前端 GET 讀使用者設定）────────────────────────────
// 在原有 doGet 的 if (e.parameter.api === 'compute') 之前加入：
//
//   if (e.parameter.api === 'load' && e.parameter.user) {
//     const data = getUserSettings(String(e.parameter.user).trim());
//     return ContentService.createTextOutput(JSON.stringify(data)).setMimeType(ContentService.MimeType.JSON);
//   }

// ── 以下貼到同一個 GAS 檔案（helper functions）────────────────────────────────

const SHEET_ID = '1juUR2My4_iQKwXQkA1A9xHD_R5TRFsq5Z_qcbh2ixgk';
const DATA_SHEET = 'UserData';  // 欄位：[LineId, StockCode, Lots, Price, UpdatedAt]

/**
 * 將使用者持倉寫入 UserData 工作表
 * payload 格式：{ [stockCode]: { lots, cost } }
 */
function saveUserSettings(lineId, payload) {
  const ss    = SpreadsheetApp.openById(SHEET_ID);
  const sheet = ss.getSheetByName(DATA_SHEET);
  const all   = sheet.getDataRange().getValues();
  const now   = new Date().toISOString();

  // 從最後一行往前刪，避免 row index 偏移
  for (let i = all.length - 1; i >= 1; i--) {
    if (String(all[i][0]) === lineId) sheet.deleteRow(i + 1);
  }

  // 補上新資料
  for (const [code, h] of Object.entries(payload || {})) {
    const lots = Number(h.lots  || 0);
    const cost = Number(h.cost  || 0);
    if (lots <= 0) continue;
    sheet.appendRow([lineId, code, lots, cost, now]);
  }
}

/**
 * 讀取使用者持倉（供 api=load GET 使用）
 */
function getUserSettings(lineId) {
  const ss    = SpreadsheetApp.openById(SHEET_ID);
  const sheet = ss.getSheetByName(DATA_SHEET);
  const rows  = sheet.getDataRange().getValues();
  const holdings = {};

  for (let i = 1; i < rows.length; i++) {
    const [id, code, lots, price] = rows[i];
    if (String(id) !== lineId || !code) continue;
    holdings[String(code).replace(/^'/, '').trim()] = {
      lots: Number(lots  || 0),
      cost: Number(price || 0),
    };
  }
  return { holdings };
}
