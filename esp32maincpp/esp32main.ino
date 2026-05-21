// ==================== 引入函式庫 ====================
#include <OneWire.h>            // OneWire 通訊協議（DS18B20 溫度感測器用）
#include <DallasTemperature.h>  // DS18B20 溫度感測器驅動
#include <DHTesp.h>             // DHT22 溫濕度感測器驅動（ESP32 專用版）
#include <WiFi.h>               // WiFi 連線功能
#include <HTTPClient.h>         // HTTP 客戶端，用於向伺服器發送請求
#include <ArduinoJson.h>        // JSON 解析與生成
#include <WebServer.h>          // 網頁伺服器（AP 設定模式用）
#include <Preferences.h>        // NVS 非揮發性儲存（儲存 WiFi 設定）

// ==================== 全域物件 ====================
Preferences prefs;              // NVS 儲存物件
WebServer configServer(80);     // AP 模式下的設定網頁伺服器（port 80）

// ==================== 腳位定義 ====================
const int oneWireBus = 17;      // DS18B20 資料腳位（OneWire）
const int DHTPIN = 5;           // DHT22 資料腳位
const int relaypin = 14;        // 繼電器控制腳位
const int waterpin1 = 27;       // 水位感測器 1（最低水位）
const int waterpin2 = 26;       // 水位感測器 2（中間水位）
const int waterpin3 = 25;       // 水位感測器 3（最高水位）

// ==================== 感測器物件 ====================
OneWire oneWire(oneWireBus);           // OneWire 匯流排
DallasTemperature sensors(&oneWire);   // DS18B20 感測器
DHTesp dht;                            // DHT22 感測器

// ==================== 全域變數 ====================
byte water_val;                 // 目前水位等級（0=無水, 1~3=水位, 4=異常）
String serverUrl;               // 後端伺服器 API 網址
bool configMode = false;        // 是否處於 AP 設定模式

// ==================== AP 設定頁面 HTML ====================
const char CONFIG_PAGE[] PROGMEM = R"rawliteral(
<!DOCTYPE html><html><head><meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<style>body{font-family:sans-serif;max-width:400px;margin:40px auto;padding:20px}
input{width:100%;padding:10px;margin:5px 0 15px;border:1px solid #ccc;border-radius:5px;font-size:16px;box-sizing:border-box}
button{width:100%;padding:12px;background:#2196F3;color:#fff;border:none;border-radius:5px;font-size:16px}</style>
</head><body><h2>WiFi 設定</h2>
<form action="/save" method="POST">
<label>WiFi SSID</label><input name="ssid" required>
<label>WiFi 密碼</label><input name="pass" type="password" required>
<label>伺服器 (IP:Port)</label><input name="server" placeholder="192.168.1.100:3000" required>
<button type="submit">儲存並連線</button></form></body></html>)rawliteral";

// ==================== 啟動 AP 設定模式 ====================
// 當沒有儲存的 WiFi 設定或連線失敗時，啟動 AP 讓使用者透過手機瀏覽器設定
void startConfigAP() {
  WiFi.mode(WIFI_AP);
  WiFi.softAP("hot_water_setup", "00000000");  // AP 名稱與密碼
  Serial.println("AP 啟動: hot_water_setup / 00000000");
  Serial.println("設定頁面: http://" + WiFi.softAPIP().toString());

  // 首頁：顯示 WiFi 設定表單
  configServer.on("/", HTTP_GET, []() {
    configServer.send_P(200, "text/html", CONFIG_PAGE);
  });

  // 儲存設定：將 SSID、密碼、伺服器位址寫入 NVS，然後重啟
  configServer.on("/save", HTTP_POST, []() {
    prefs.begin("wifi", false);
    prefs.putString("ssid", configServer.arg("ssid"));
    prefs.putString("pass", configServer.arg("pass"));
    prefs.putString("server", configServer.arg("server"));
    prefs.end();
    configServer.send(200, "text/html",
      "<meta charset='UTF-8'><h2>已儲存，重新啟動中...</h2>");
    delay(1000);
    ESP.restart();
  });

  configServer.begin();
  configMode = true;
}

// ==================== 連線 WiFi ====================
// 從 NVS 讀取已儲存的 WiFi 設定並嘗試連線，成功回傳 true
bool connectWiFi() {
  prefs.begin("wifi", true);  // 唯讀模式開啟 NVS
  String ssid = prefs.getString("ssid", "");
  String pass = prefs.getString("pass", "");
  String server = prefs.getString("server", "");
  prefs.end();
  if (ssid.length() == 0) return false;  // 沒有儲存的設定

  serverUrl = "http://" + server + "/api/data";  // 組合 API 網址
  WiFi.mode(WIFI_STA);
  WiFi.begin(ssid.c_str(), pass.c_str());
  Serial.print("連線 WiFi: " + ssid);

  // 最多等待 15 秒（30 次 x 500ms）
  for (int i = 0; i < 30 && WiFi.status() != WL_CONNECTED; i++) {
    delay(500); Serial.print(".");
  }
  if (WiFi.status() != WL_CONNECTED) { Serial.println(" 失敗"); return false; }
  Serial.println("\nWiFi OK, IP: " + WiFi.localIP().toString());
  return true;
}

// ==================== 初始化 ====================
void setup() {
  Serial.begin(115200);

  // 初始化繼電器（預設關閉）
  pinMode(relaypin, OUTPUT);
  digitalWrite(relaypin, LOW);

  // 初始化水位感測器腳位
  pinMode(waterpin1, INPUT);
  pinMode(waterpin2, INPUT);
  pinMode(waterpin3, INPUT);

  // 初始化溫度感測器
  sensors.begin();                        // DS18B20
  dht.setup(DHTPIN, DHTesp::DHT22);      // DHT22

  // 嘗試連線 WiFi，失敗則進入 AP 設定模式
  if (!connectWiFi()) {
    startConfigAP();
  }
}

// ==================== 主迴圈 ====================
void loop() {
  // AP 設定模式：只處理網頁請求，不執行感測器邏輯
  if (configMode) { configServer.handleClient(); return; }

  // ---------- 讀取 DS18B20 水溫 ----------
  sensors.requestTemperatures();
  float temperatureC = sensors.getTempCByIndex(0);

  // ---------- 讀取 DHT22 室溫 ----------
  TempAndHumidity data = dht.getTempAndHumidity();
  float temperature = data.temperature;
  if (isnan(temperature)) {
    Serial.println("DHT22 讀取失敗: " + String(dht.getStatusString()));
    temperature = 0;
  }

  // ---------- 讀取水位感測器 ----------
  byte w1 = digitalRead(waterpin1);
  byte w2 = digitalRead(waterpin2);
  byte w3 = digitalRead(waterpin3);
  // 根據三個感測器的組合判斷水位等級
  if      (w1 == LOW && w2 == LOW && w3 == LOW)                              water_val = 0;  // 無水
  else if (w1 == HIGH && w2 == LOW && w3 == LOW)                water_val = 1;  // 低水位
  else if (w1 == HIGH && w2 == HIGH && w3 == LOW)  water_val = 2;  // 中水位
  else if (w1 == HIGH && w2 == HIGH && w3 == HIGH) water_val = 3;  // 高水位
  else                                             water_val = 4;  // 異常

  // ---------- 上傳感測資料到伺服器 ----------
  if (WiFi.status() == WL_CONNECTED) {
    HTTPClient http;
    http.begin(serverUrl.c_str());
    http.addHeader("Content-Type", "application/json");

    // 組合 JSON：水溫、室溫、水位
    String json = "{\"temperatureC\":" + String(temperatureC) +
                  ",\"temperature\":" + String(temperature, 1) +
                  ",\"water\":" + String(water_val) + "}";
    Serial.println("POST: " + json);

    int code = http.POST(json);
    Serial.println("HTTP 回應碼: " + String(code));

    // 解析伺服器回傳的繼電器指令
    if (code == 200) {
      String payload = http.getString();
      Serial.println("伺服器回傳: " + payload);
      StaticJsonDocument<256> doc;
      DeserializationError err = deserializeJson(doc, payload);
      if (!err) {
        // 根據後端計算結果控制繼電器
        if (doc.containsKey("relayState")) {
          bool relay = doc["relayState"].as<bool>();
          digitalWrite(relaypin, relay ? HIGH : LOW);
          Serial.println("繼電器 -> " + String(relay ? "ON" : "OFF"));
        } else {
          Serial.println("回傳 JSON 缺少 relayState");
        }
      } else {
        Serial.println("JSON 解析失敗: " + String(err.c_str()));
      }
    }
    http.end();
  } else {
    Serial.println("WiFi 未連線");
  }

  delay(2000);  // 每 2 秒執行一次
}