# SnapPose Studio — 照片拼貼 × Pose 指導網頁工具

結合「SCRL 式照片拼貼」與「Poze 式拍照姿勢指導」的純前端網頁應用，
內建訂閱付費牆：部分進階版型與 Pose 需要 Premium 才能解鎖。

## 功能

### 🧩 照片拼貼
- 12 款版型（單張、雙格、田字、雜誌風、馬賽克、電影感、拍立得留白…）
- 比例切換：1:1／4:5／9:16／16:9
- 間距、圓角、背景色即時調整
- 點格子上傳、拖曳調整構圖、滾輪／滑桿縮放、批次上傳
- 匯出 1080px PNG（免費版含浮水印，Premium 無浮水印）

### 🕺 Pose 圖庫 + 🎥 Pose 相機
- 17 款姿勢，分類：單人／坐姿／情侶／閨蜜／創意，每款附 2–3 條擺姿要點
- 相機模式：即時影像疊加姿勢輪廓線（透明度可調），支援前後鏡頭、鏡像、3 秒倒數
- 拍攝後可直接下載照片

### 💡 拍照技巧
8 篇通用攝影技巧卡片（光線、構圖、角度、連拍…）。

## 💰 付費方案

| 方案 | 價格 |
|------|------|
| 免費版 | 基本版型與 Pose、匯出含浮水印 |
| Premium 月費 | **US$3 / 月** |
| Premium 年費 | **US$2 / 月**（年繳 US$24，省 33%） |

Premium 解鎖：全部進階版型、全部 PRO 姿勢、無浮水印匯出。

## 使用方式

純靜態網頁，無需建置：

```bash
cd collage-pose-app
npx serve .        # 或 python3 -m http.server 8080
```

> 「Pose 相機」需要瀏覽器相機權限，必須在 **HTTPS 或 localhost** 環境下使用。

## 串接真實金流

目前結帳為**示範流程**（訂閱狀態存於 `localStorage`）。正式上線時：

1. `app.js` 中 `Paywall.checkout()`：改為呼叫你的後端建立
   Stripe Checkout Session（或藍新／綠界訂單）並導向付款頁。
2. `Paywall.isPremium()`：改為驗證後端簽發的訂閱憑證（JWT／session），
   避免前端狀態被竄改。
3. Stripe 方案對應：`monthly` → US$3/月 price、`yearly` → US$24/年 price。

## 檔案結構

```
collage-pose-app/
├── index.html      # 頁面骨架（四個分頁 + 兩個彈窗）
├── style.css       # 深色主題樣式
├── app.js          # 分頁切換、付費牆、Pose 圖庫、技巧頁
├── templates.js    # 拼貼版型定義（相對座標）
├── poses.js        # 姿勢骨架資料與火柴人 SVG 繪製
├── collage.js      # 拼貼編輯器與 PNG 匯出
└── camera.js       # Pose 取景相機
```
