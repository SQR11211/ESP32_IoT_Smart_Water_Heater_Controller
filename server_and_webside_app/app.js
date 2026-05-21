// ==================== 後端伺服器 (Express.js) ====================
// 智慧熱水器控制系統 - 接收 ESP32 感測資料、提供前端控制介面
import express from "express";
import bodyParser from "body-parser";
import cors from "cors";

const app = express();
app.use(cors());              // 允許跨域請求
app.use(bodyParser.json());   // 解析 JSON 請求內容

// ==================== 資料儲存 ====================
// ESP32 上傳的即時感測資料
let sensorData = {
  temperatureC: 0,    // DS18B20 水溫 (°C)
  temperature: 0,     // DHT22 室溫 (°C)
  water: 0,           // 水位等級 (0=無水, 1~3=水位, 4=異常)
};

// 控制設定值
let config = {
  targetTemp1: 0,          // 目標水溫 (整數, °C)
  targetTemp2: 0,          // 目標室溫 (整數, °C)
  manualControl: false,     // 手動控制模式 (false=自動, true=手動關閉)
};

// 繼電器目前狀態（由 POST /api/data 計算後更新）
let relayState = false;

// ==================== API 路由 ====================

// ESP32 上傳感測資料，後端計算繼電器狀態後回傳
app.post("/api/data", (req, res) => {
  sensorData = req.body;
  console.log("ESP32 上傳資料:", sensorData);

  // 計算繼電器狀態（自動模式下根據溫度和水位判斷）
  relayState = false;
  if (!config.manualControl) {
    const w = sensorData.water;
    // 水位正常(1~3) 且 水溫未達標 且 室溫未達標 → 開啟加熱
    if (w >= 1 && w <= 3 &&
        sensorData.temperatureC <= config.targetTemp1 &&
        sensorData.temperature <= config.targetTemp2) {
      relayState = true;
    }
  }

  // 回傳設定值與繼電器指令給 ESP32
  res.json({ ...config, relayState });
});

// 前端查詢即時感測資料與控制狀態
app.get("/api/data", (req, res) => {
  res.json({
    ...sensorData,
    manualControl: config.manualControl,
    relayState: relayState
  });
});

// 前端更新溫度設定值
app.post("/api/update", (req, res) => {
  if (req.body.hasOwnProperty('targetTemp1')) {
    config.targetTemp1 = parseInt(req.body.targetTemp1);   // 確保為整數
  }
  if (req.body.hasOwnProperty('targetTemp2')) {
    config.targetTemp2 = parseInt(req.body.targetTemp2);   // 確保為整數
  }
  if (req.body.hasOwnProperty('manualControl')) {
    config.manualControl = req.body.manualControl;
  }
  console.log("設定已更新:", config);
  res.json({ status: "OK", config: config });
});

// 前端切換手動/自動控制模式
app.post("/api/toggle", (req, res) => {
  config.manualControl = req.body.manualControl;
  console.log("手動控制模式:", config.manualControl ? "關閉熱水器" : "自動模式");
  res.json({ status: "OK", manualControl: config.manualControl });
});

// ==================== 前端網頁介面 ====================
app.get("/", (req, res) => {
  res.send(`
  <!DOCTYPE html>
  <html>
  <head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>智慧熱水器控制</title>
    <style>
      /* === 全域樣式 === */
      * { box-sizing: border-box; margin: 0; padding: 0; }
      body {
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Arial, sans-serif;
        background: white; min-height: 100vh; padding: 10px;
      }
      .container { max-width: 1200px; margin: 0 auto; padding: 20px; }
      h2 {
        color: #333; text-align: center;
        font-size: clamp(24px, 5vw, 32px); margin-bottom: 20px;
      }

      /* === 格線佈局 === */
      .grid-container { display: grid; gap: 15px; grid-template-columns: 1fr; }
      /* 平板：兩欄 */
      @media (min-width: 768px) {
        .grid-container { grid-template-columns: repeat(2, 1fr); }
        .power-box { grid-column: 1 / -1; }
      }
      /* 桌機：三欄 */
      @media (min-width: 1024px) {
        .grid-container { grid-template-columns: repeat(3, 1fr); }
        .power-box { grid-column: 1 / -1; }
      }

      /* === 卡片樣式 === */
      .data-box, .control-box, .power-box {
        background: white; padding: clamp(15px, 3vw, 25px);
        border-radius: 12px; box-shadow: 0 4px 6px rgba(0,0,0,0.1);
        animation: fadeIn 0.5s ease-in;
      }
      @keyframes fadeIn {
        from { opacity: 0; transform: translateY(20px); }
        to { opacity: 1; transform: translateY(0); }
      }
      .power-box {
        background: linear-gradient(135deg, #fff3e0 0%, #ffe0b2 100%);
        text-align: center;
      }
      .control-box { background: linear-gradient(135deg, #e3f2fd 0%, #bbdefb 100%); }

      /* === 文字與資料項 === */
      h3 { font-size: clamp(18px, 4vw, 22px); margin-bottom: 15px; color: #333; }
      .data-item {
        padding: 10px 0; border-bottom: 1px solid #eee;
        font-size: clamp(14px, 3vw, 16px);
      }
      .data-item:last-child { border-bottom: none; }
      .data-item span { font-weight: bold; color: #2196F3; }

      /* === 控制區 === */
      .control-group { margin: 15px 0; }
      .control-group label {
        display: block; margin-bottom: 8px;
        font-size: clamp(14px, 3vw, 16px); color: #555;
      }
      input {
        padding: 12px; width: 100%; max-width: 200px;
        border: 2px solid #ddd; border-radius: 8px;
        font-size: 16px; transition: border-color 0.3s;
      }
      input:focus { outline: none; border-color: #2196F3; }

      /* === 按鈕 === */
      button {
        padding: 12px 24px; background: #2196F3; color: white;
        border: none; border-radius: 8px; cursor: pointer;
        font-size: clamp(14px, 3vw, 16px); font-weight: 600;
        transition: all 0.3s; width: 100%; max-width: 300px; margin-top: 10px;
      }
      button:hover {
        background: #1976D2; transform: translateY(-2px);
        box-shadow: 0 4px 8px rgba(0,0,0,0.2);
      }
      button:active { transform: translateY(0); }

      /* === 電源按鈕 === */
      .power-btn {
        padding: 20px 40px; font-size: clamp(16px, 4vw, 20px);
        font-weight: bold; margin: 15px auto; max-width: 400px; display: block;
      }
      .power-btn.on { background: linear-gradient(135deg, #4CAF50 0%, #45a049 100%); }
      .power-btn.on:hover { background: linear-gradient(135deg, #45a049 0%, #3d8b40 100%); }
      .power-btn.off { background: linear-gradient(135deg, #f44336 0%, #da190b 100%); }
      .power-btn.off:hover { background: linear-gradient(135deg, #da190b 0%, #c41408 100%); }

      /* === 狀態標籤 === */
      .status {
        display: inline-block; padding: 8px 16px; border-radius: 20px;
        margin: 10px 0; font-weight: bold; font-size: clamp(14px, 3vw, 16px);
      }
      .status.auto { background: #4CAF50; color: white; }
      .status.manual { background: #f44336; color: white; }
      .mode-desc {
        margin-top: 10px; font-size: clamp(12px, 2.5vw, 14px);
        color: #666; padding: 0 15px;
      }

      /* === 手機版優化 === */
      @media (max-width: 767px) {
        body { padding: 5px; }
        .container { padding: 10px; }
        .grid-container { gap: 10px; }
        input { max-width: 100%; }
        button { max-width: 100%; }
      }
    </style>
  </head>
  <body>
    <div class="container">
      <h2>智慧熱水器控制系統</h2>
      <div class="grid-container">
        <!-- 電源控制區 -->
        <div class="power-box">
          <h3>熱水器電源控制</h3>
          <div>當前狀態：<span class="status" id="status">讀取中...</span></div>
          <button class="power-btn on" id="powerBtn" onclick="togglePower()">讀取中...</button>
          <div class="mode-desc"><span id="modeDesc">讀取中...</span></div>
        </div>
        <!-- 即時感測資料區 -->
        <div class="data-box">
          <h3>即時感測資料</h3>
          <div class="data-item">水溫 (DS18B20)：<span id="temp1">--</span> °C</div>
          <div class="data-item">室溫 (DHT22)：<span id="temp2">--</span> °C</div>
          <div class="data-item">水位等級：<span id="water">--</span></div>
        </div>
        <!-- 溫度設定區 -->
        <div class="control-box">
          <h3>溫度設定</h3>
          <div class="control-group">
            <label>目標水溫 (DS18B20)</label>
            <input id="t1" type="number" step="1" value="0">
          </div>
          <div class="control-group">
            <label>目標室溫 (DHT22)</label>
            <input id="t2" type="number" step="1" value="0">
          </div>
          <button onclick="updateTemp()">更新溫度設定</button>
        </div>
      </div>
    </div>
    <script>
      let currentManualControl = false;  // 目前手動控制狀態
      let currentRelayState = false;     // 目前繼電器開關狀態

      // 從伺服器載入即時感測資料並更新畫面
      async function load() {
        try {
          let res = await fetch('/api/data');
          let data = await res.json();
          // 更新感測器數據顯示
          document.getElementById('temp1').innerText = data.temperatureC.toFixed(2);
          document.getElementById('temp2').innerText = data.temperature;
          document.getElementById('water').innerText = data.water + ' (0=無水, 1-3=水位等級, 4=異常)';
          // 同步伺服器的手動控制狀態與繼電器狀態
          currentManualControl = data.manualControl;
          currentRelayState = data.relayState;
          updateUI();
        } catch(e) {
          console.error('讀取資料失敗:', e);
        }
      }

      // 根據手動控制狀態與繼電器狀態更新按鈕與標籤顯示
      function updateUI() {
        const btn = document.getElementById('powerBtn');
        const status = document.getElementById('status');
        const desc = document.getElementById('modeDesc');

        // 繼電器實際開關狀態
        if (currentRelayState) {
          status.innerText = 'ON';
          status.className = 'status auto';
        } else {
          status.innerText = 'OFF';
          status.className = 'status manual';
        }

        // 模式切換按鈕
        if (currentManualControl) {
          btn.innerText = '切換到自動模式';
          btn.className = 'power-btn off';
          desc.innerText = '手動關閉：熱水器已強制停止運作';
        } else {
          btn.innerText = '手動關閉熱水器';
          btn.className = 'power-btn on';
          desc.innerText = '自動模式：根據溫度和水位自動控制';
        }
      }

      // 送出新的目標溫度設定到伺服器
      async function updateTemp() {
        try {
          await fetch('/api/update', {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({
              targetTemp1: parseInt(document.getElementById('t1').value),
              targetTemp2: parseInt(document.getElementById('t2').value),
              manualControl: currentManualControl
            })
          });
          alert("溫度設定已更新");
        } catch(e) {
          alert("更新失敗: " + e.message);
        }
      }

      // 切換手動/自動控制模式
      async function togglePower() {
        const newState = !currentManualControl;
        try {
          let res = await fetch('/api/toggle', {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({ manualControl: newState })
          });
          let result = await res.json();
          if (result.status === 'OK') {
            currentManualControl = newState;
            updateUI();
          }
        } catch(e) {
          alert("切換失敗: " + e.message);
        }
      }

      setInterval(load, 2000);  // 每 2 秒自動更新資料
      load();                   // 頁面載入時立即執行一次
    </script>
  </body>
  </html>`);
});

// ==================== 啟動伺服器 ====================
app.listen(3000, () => console.log("伺服器啟動於 http://localhost:3000"));