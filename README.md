# 🦉 Sentinel · 會員監控系統

仿 vigilsentinel 的私人會員監控網頁後台 + Telegram 自動推播。

## 功能

- 🔐 密碼登入的私人後台
- 👁️ 監控對象清單管理（新增 / 移除會員 ID）
- ⚙️ 門檻設定（存款 / 投注 / 閒置）
- 🤖 達到門檻自動推播到 Telegram 群組
- 📜 歷史警報紀錄

## 完全免費部署（不需安裝任何軟體）

整個流程**完全在瀏覽器內完成**，不需要在你的電腦上裝 Node.js、Git 或任何指令工具。

---

## 部署步驟

### Step 1️⃣：建立 Telegram Bot

1. 在 Telegram 搜尋 **@BotFather**
2. 傳送 `/newbot`
3. 按提示輸入名稱與 username
4. **複製 BotFather 給你的 token**（格式：`123456789:ABC-DEF...`）→ 記在記事本

### Step 2️⃣：取得你的群組 ID

1. 建立一個 Telegram 群組
2. 把你的 Bot 加入群組（必須給它「Admin」權限）
3. 在群組裡發送任意訊息
4. 在瀏覽器開啟：
   ```
   https://api.telegram.org/bot<你的TOKEN>/getUpdates
   ```
5. 找到 `"chat":{"id":-100xxxxx}` → **複製這個負號開頭的數字**

### Step 3️⃣：註冊 GitHub & 上傳程式

1. 註冊 https://github.com/signup
2. 登入後點右上角 **+** → **New repository**
3. 命名為 `sentinel-web`，設為 **Private**，建立
4. 在新建的 repo 頁面點 **uploading an existing file**
5. **把 `sentinel-web` 資料夾裡的所有檔案拖進去上傳**
6. 拉到底點 **Commit changes**

### Step 4️⃣：註冊 Vercel & 部署

1. 到 https://vercel.com/signup
2. 選 **Continue with GitHub** 用 GitHub 帳號登入
3. 點 **Add New → Project**
4. 選擇剛才建立的 `sentinel-web` repo → **Import**
5. 在 **Environment Variables** 區塊加入下列變數（看下一步）
6. 點 **Deploy**

### Step 5️⃣：設定環境變數

在 Vercel 部署頁面的 **Environment Variables** 加入：

| Name | Value |
|------|-------|
| `SITE_PASSWORD` | 你要設定的網頁登入密碼 |
| `JWT_SECRET` | 隨便輸入一串長的英數字（至少 32 字元） |
| `TELEGRAM_BOT_TOKEN` | Step 1 的 Bot Token |
| `TELEGRAM_CHAT_ID` | Step 2 的群組 ID（含負號） |
| `SITE_API_BASE` | 你的平台 API 網址 |
| `SITE_USERNAME` | 你的平台代理商帳號 |
| `SITE_PASSWORD_PLATFORM` | 你的平台代理商密碼 |
| `CRON_SECRET` | 隨便輸入一串隨機字串 |

### Step 6️⃣：連結 Vercel KV 存儲

1. 部署完成後，到 Vercel Dashboard
2. 進入你的專案 → **Storage** 分頁
3. 點 **Create Database** → 選 **KV**
4. 命名（例：`sentinel-store`）→ Create
5. 點 **Connect Project** → 選你的 sentinel-web → Connect
6. 重新部署一次（**Deployments** → 最新一筆 → **Redeploy**）

### Step 7️⃣：設定外部 Cron 觸發（最關鍵）

因為 Vercel Hobby 免費版的 Cron 只能每天一次，所以我們用免費的外部排程服務 **cron-job.org**，讓你的監控可以**每分鐘執行一次**。

1. 註冊 https://cron-job.org（免費）
2. 點 **CREATE CRONJOB**
3. 填入：
   - **Title**: `Sentinel Monitor`
   - **URL**: `https://你的vercel網址.vercel.app/api/cron`
   - **Schedule**: 選 **Every 1 minute**
4. 展開 **Advanced** → 找到 **Headers**，新增：
   - Header name: `Authorization`
   - Header value: `Bearer 你的CRON_SECRET`（要跟 Vercel 設定的一樣）
5. 儲存 → 啟用

✅ **完成！** 現在系統會每分鐘自動檢查你監控的會員。

---

## 使用方式

1. 開啟 `https://你的vercel網址.vercel.app`
2. 輸入 `SITE_PASSWORD` 登入
3. 在「監控對象清單」加入你要監控的會員 ID
4. 在「門檻設定」調整觸發數值
5. 點右上角「發送測試」確認 Telegram 通知正常
6. 完成！會員一有動作就會自動推播到群組

---

## ⚠️ 重要：要修改平台 API 對接

**目前 [lib/siteApi.js](lib/siteApi.js) 是「示意範本」**，你必須根據你的博弈平台 API 文件修改：

1. **登入路徑與欄位**（`login()` 函式）
2. **資料查詢路徑**（`getMemberActivity()` 函式）
3. **回傳欄位對應**（`member.id`、`logins`、`deposits`、`bets`...）

如果你能提供平台的 API 文件或回傳範例 JSON，我可以幫你直接改好。

---

## 檔案結構

```
sentinel-web/
├── pages/
│   ├── index.js          ← 登入頁
│   ├── dashboard.js      ← 主控台
│   ├── _app.js           ← App 進入點
│   └── api/
│       ├── login.js      ← 登入 API
│       ├── logout.js     ← 登出 API
│       ├── monitors.js   ← 監控對象 CRUD
│       ├── settings.js   ← 門檻設定 CRUD
│       ├── history.js    ← 歷史警報
│       ├── test-notify.js ← 測試通知
│       └── cron.js       ← 排程入口（外部 cron 呼叫）
├── lib/
│   ├── auth.js           ← JWT 登入驗證
│   ├── store.js          ← Vercel KV 資料存取
│   ├── telegram.js       ← Telegram 推送 + 訊息模板
│   └── siteApi.js        ← 平台 API 串接 ⚠️ 需自行修改
├── styles/
│   └── globals.css       ← 全站樣式
├── package.json
├── next.config.js
├── .gitignore
└── .env.example
```

---

## 常見問題

### Q: 我可以不用 Vercel KV 嗎？
A: KV 是免費的，每月 30000 次請求。對小型監控完全夠用。

### Q: cron-job.org 安全嗎？
A: 它只是一個會「定時呼叫一個網址」的服務，不會看到你的程式碼或密碼。配合 `CRON_SECRET` 驗證可以防止他人觸發你的端點。

### Q: 我要換平台密碼怎麼辦？
A: 到 Vercel Dashboard → 你的專案 → Settings → Environment Variables → 編輯後重新部署。

### Q: 通知會發到我的群組外的地方嗎？
A: 不會。`TELEGRAM_CHAT_ID` 寫死在環境變數，只會發到那個固定群組。
