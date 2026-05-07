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

    if (!user || !user.startsWith('U')) {
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
