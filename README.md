# ESP32 IoT Smart Water Heater Controller

An IoT system for intelligent water heater control using an ESP32 microcontroller, Node.js backend, and a responsive web dashboard.

## Features

- Real-time water and room temperature monitoring (DS18B20 + DHT22)
- Three-level water level detection
- Automatic heating control based on configurable temperature targets
- Manual override mode to force heater off
- WiFi configuration via AP mode on first boot
- Persistent settings stored in ESP32 NVS
- Responsive web dashboard (mobile, tablet, desktop)
- 2-second sensor update cycle
- Custom KiCad PCB design included

## Hardware Requirements

| Component | Description |
|---|---|
| ESP32 (AI-Thinker NodeMCU-32S) | Main microcontroller |
| DS18B20 | Water temperature sensor (OneWire) |
| DHT22 | Room temperature and humidity sensor |
| Relay module | Controls the heating element |
| Water level sensors x3 | Connected to GPIO 25, 26, 27 |

## Project Structure

```
esp32/
├── esp32maincpp/
│   └── esp32main.ino          # ESP32 firmware
├── server_and_webside_app/
│   ├── app.js                 # Express.js backend server
│   └── package.json           # Node.js dependencies
└── layout/                    # KiCad PCB design files
```

## Getting Started

### 1. Flash the ESP32 Firmware

1. Open `esp32maincpp/esp32main.ino` in Arduino IDE
2. Install required libraries:
   - `OneWire`
   - `DallasTemperature`
   - `DHT sensor library`
   - `ArduinoJson`
3. Select board: **ESP32 Dev Module**
4. Upload the sketch

### 2. First Boot — WiFi Setup

On first boot, the ESP32 starts in AP mode:

1. Connect to the WiFi network: **ESP32_Config**
2. Open a browser and go to `192.168.4.1`
3. Enter your WiFi SSID, password, and the backend server IP/port
4. The ESP32 will save the settings and reboot

### 3. Run the Backend Server

```bash
cd server_and_webside_app
npm install
node app.js
```

The server starts on port **3000**. Open `http://<server-ip>:3000` in a browser to access the dashboard.

## API Endpoints

| Method | Endpoint | Description |
|---|---|---|
| POST | `/api/data` | Receive sensor data from ESP32, returns relay state |
| GET | `/api/data` | Get current sensor readings |
| POST | `/api/update` | Update temperature targets |
| POST | `/api/toggle` | Switch between auto and manual mode |

## PCB Design

KiCad project files are located in the `layout/` directory. The design includes:

- AI-Thinker NodeMCU-32S footprint
- Relay and sensor connectors

## License

This project is licensed under the MIT License. See [LICENSE](LICENSE) for details.
You are free to use, modify, and distribute this project as long as you include the original author credit.

## Author

**SQR11211** — 2026
