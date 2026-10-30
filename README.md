# 證件浮水印產生器

幫台灣的身分證、健保卡、駕照等證件加上「僅供申辦XXX使用」浮水印，避免證件影本被挪作其他用途。

**完全免費、沒有廣告、不用註冊。照片只在你的裝置上處理，不會上傳到網路。**

## 可以做什麼

- **自動抓證件邊界：** 拍斜的證件會自動校正成長方形，並裁掉桌面等背景。
- **自動判斷證件類型：** 分得出身分證、健保卡和駕照，校正後還原成證件實際的長寬比例。
- **手動調整：** 自動抓得不準時，可以拖曳證件的四個角，拖的時候有放大鏡方便對準。
- **浮水印可以自訂：** 文字、顏色、透明度、角度、大小、間距都能調，浮水印會斜向鋪滿整張，不容易被裁掉。
- **一次處理多張：** 可以一次選多張照片，也能全部一起下載。
- **支援 iPhone 照片：** 支援 JPG、PNG、WebP，以及 iPhone 拍的 HEIC。

## 怎麼使用

1. 打開網頁，點上方區塊選擇證件照片，或直接把照片拖進來。
2. 程式會自動找出證件、校正成長方形，並判斷證件類型。
3. 在左邊輸入浮水印文字，例如「僅供申辦XXX銀行開戶使用」。
4. 如果有哪張抓得不準，按該張的「調整裁切」，把四個角拖到證件的角上。
5. 按「下載」或「全部下載」。

## 常見問題

**需要付費嗎？有廣告嗎？**
完全免費，沒有廣告，也不用註冊或登入。

**照片會上傳到網路嗎？**
不會。讀取、偵測、裁切、加浮水印全部在你的瀏覽器裡完成，照片不會傳到任何伺服器，也不會被保存。

**支援哪些證件？**
身分證、健保卡、信用卡（85.6 × 54 mm）和駕照（85 × 60 mm）。其他卡片可以在「證件類型」選「依四個點計算」，照實際拍到的比例校正。

**為什麼第一次自動偵測比較慢？**
第一次偵測時要先下載偵測元件（約 10MB），之後瀏覽器會記住，就會變快。

---

> ⚠️ **以下是技術說明，給要修改或部署這個專案的開發者看。只是要使用的話，看到這裡就可以了。**

---

## 技術架構

React 19 + Redux Toolkit + React-Redux，用 Vite 打包，部署在 GitHub Pages。

- 證件邊界偵測用 OpenCV.js，第一次偵測時才從 CDN 載入，不打包進 app。
- HEIC 轉換用 heic2any，遇到 HEIC 檔才載入。

## 開發

```bash
npm install
npm run dev       # http://localhost:5173
npm run build     # 輸出到 dist/
npm run preview   # 預覽 build 結果
npm test          # 執行單元測試 (Vitest)
```

## 部署到 GitHub Pages

1. 把專案推到 GitHub repo 的 `main` 分支。
2. 到 repo 的 Settings → Pages，Source 選 **GitHub Actions**。
3. `.github/workflows/deploy.yml` 會先跑測試，通過後才 build 並部署。網站網址會自動帶入 canonical、`og:url`、`robots.txt` 和 `sitemap.xml`。

## SEO

- `index.html` 有 title、description、canonical、Open Graph、Twitter Card，以及 `WebApplication` 和 `FAQPage` 結構化資料（JSON-LD）。
- 使用說明和常見問題直接寫在 `index.html`，不靠 JavaScript 產生，搜尋引擎不用執行 JS 也讀得到。
- build 時會自動產生 `robots.txt` 和 `sitemap.xml`。
- 上線後到 [Google Search Console](https://search.google.com/search-console) 驗證網站並提交 `sitemap.xml`，會比較快被收錄。驗證碼可以設在 repo 的 Settings → Secrets and variables → Actions → Variables，名稱是 `GOOGLE_SITE_VERIFICATION`，build 時會自動加進 `<meta name="google-site-verification">`。

## 專案結構

```
src/
  main.jsx               建立 store、掛上 React
  App.jsx
  components/            React 元件 (只讀 state、dispatch action)
  store/
    index.js             configureStore
    settingsSlice.js
    itemsSlice.js
    editorSlice.js
    thunks.js            所有副作用 (讀檔、偵測、下載)
    persistence.js       設定的讀取與儲存
  lib/                   與 Redux 無關的純邏輯
    cards.js             證件尺寸
    geometry.js          四點排序、投影矩陣、透視校正
    opencv.js            證件邊界偵測
    classify.js          證件類型判斷
    decode.js            讀取圖片 (含 HEIC)
    imageCache.js        圖片像素快取 (不放進 Redux store)
    watermark.js         畫浮水印、下載
```
