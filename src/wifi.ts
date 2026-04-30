import { execSync } from "node:child_process";

const AIRPORT_PATH =
  "/System/Library/PrivateFrameworks/Apple80211.framework/Versions/Current/Resources/airport";
const WIFI_INTERFACE = process.env.WIFI_INTERFACE ?? "en0";

function trySSIDFromAirport(): string | null {
  try {
    const output = execSync(`${AIRPORT_PATH} -I`, {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    });
    const match = output.match(/^\s*SSID:\s*(.+)$/m);
    if (!match) return null;
    const ssid = match[1].trim();
    return ssid.length > 0 ? ssid : null;
  } catch {
    return null;
  }
}

function trySSIDFromIpconfig(): string | null {
  try {
    const output = execSync(`ipconfig getsummary ${WIFI_INTERFACE}`, {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    });
    const match = output.match(/^\s*SSID\s*:\s*(.+)$/m);
    if (!match) return null;
    const ssid = match[1].trim();
    return ssid.length > 0 ? ssid : null;
  } catch {
    return null;
  }
}

function trySSIDFromNetworksetup(): string | null {
  try {
    const output = execSync(`networksetup -getairportnetwork ${WIFI_INTERFACE}`, {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    });
    const match = output.match(/^Current Wi-Fi Network:\s*(.+)$/m);
    if (!match) return null;
    const ssid = match[1].trim();
    return ssid.length > 0 ? ssid : null;
  } catch {
    return null;
  }
}

// macOS Sonoma 以降ではプロセスに位置情報権限がない場合、SSID は文字列 "<redacted>" で返る。
// その場合は呼び出し側で DNS ドメイン等の代替シグナルを使う。
export function getCurrentSSID(): string | null {
  const v =
    trySSIDFromAirport() ?? trySSIDFromIpconfig() ?? trySSIDFromNetworksetup();
  return v;
}

// DHCP が配る DNS search domain は redact されないので、ネットワーク識別の代替に使える。
// WeWork の場合 "wework.com" が入る。
export function getCurrentDNSDomain(): string | null {
  try {
    const output = execSync(`scutil --dns`, {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    });
    const match = output.match(/^\s*search domain\[0\]\s*:\s*(.+)$/m);
    if (!match) return null;
    const domain = match[1].trim();
    return domain.length > 0 ? domain : null;
  } catch {
    return null;
  }
}
