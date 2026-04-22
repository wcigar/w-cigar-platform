#!/bin/bash
# W Cigar Bar Pi 橋接機一鍵安裝腳本
# 在 Raspberry Pi 上執行：bash setup.sh

set -e

echo "================================================"
echo "  W Cigar Bar 列印橋接伺服器 安裝程式"
echo "================================================"

# 安裝 Node.js
echo "[1/4] 安裝 Node.js 20..."
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt-get install -y nodejs

# 複製程式到 /home/pi/wcb-print
echo "[2/4] 部署程式..."
sudo mkdir -p /home/pi/wcb-print
sudo cp server.js package.json /home/pi/wcb-print/
sudo chown -R pi:pi /home/pi/wcb-print

# 設定 systemd 開機自動啟動
echo "[3/4] 設定開機自動啟動..."
sudo tee /etc/systemd/system/wcb-print.service > /dev/null << SERVICE
[Unit]
Description=W Cigar Bar Print Bridge Server
After=network.target bluetooth.target

[Service]
Type=simple
User=pi
WorkingDirectory=/home/pi/wcb-print
ExecStart=/usr/bin/node /home/pi/wcb-print/server.js
Restart=always
RestartSec=5
Environment=RECEIPT_IP=192.168.1.101
Environment=RECEIPT_PORT=9100
Environment=KITCHEN_IP=192.168.1.102
Environment=KITCHEN_PORT=9100
Environment=LABEL_MAC=XX:XX:XX:XX:XX:XX

[Install]
WantedBy=multi-user.target
SERVICE

sudo systemctl daemon-reload
sudo systemctl enable wcb-print
sudo systemctl start wcb-print

echo "[4/4] 完成！"
echo ""
echo "查看狀態：sudo systemctl status wcb-print"
echo "查看日誌：sudo journalctl -u wcb-print -f"
echo ""
echo "修改印表機 IP："
echo "  sudo nano /etc/systemd/system/wcb-print.service"
echo "  修改 RECEIPT_IP= 和 KITCHEN_IP="
echo "  sudo systemctl daemon-reload && sudo systemctl restart wcb-print"
