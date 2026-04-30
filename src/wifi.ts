import { spawn, execSync, type ChildProcess } from "node:child_process";

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

// macOS Sonoma 以降で airport が削除されたため、ipconfig / networksetup へフォールバックする。
export function getCurrentSSID(): string | null {
  return (
    trySSIDFromAirport() ?? trySSIDFromIpconfig() ?? trySSIDFromNetworksetup()
  );
}

export type WatchOptions = {
  targetSSID: string;
  onConnect: (ssid: string) => void | Promise<void>;
};

export type WatchHandle = {
  stop: () => void;
};

export function watchSSID(options: WatchOptions): WatchHandle {
  const { targetSSID, onConnect } = options;
  let lastSSID: string | null = getCurrentSSID();
  let stopped = false;
  let proc: ChildProcess | null = null;

  console.log(`[wifi] initial SSID: ${lastSSID ?? "(none)"}`);

  // 起動時すでに接続済みでも通知したい場合は以下を有効化する想定だが、
  // 仕様はエッジ検知のみなので初期一致では発火しない。

  const handleChange = async () => {
    const current = getCurrentSSID();
    if (current !== lastSSID) {
      console.log(`[wifi] SSID changed: ${lastSSID ?? "(none)"} -> ${current ?? "(none)"}`);
    }
    if (current === targetSSID && lastSSID !== targetSSID) {
      try {
        await onConnect(current);
      } catch (err) {
        console.error("[wifi] onConnect error:", err);
      }
    }
    lastSSID = current;
  };

  const start = () => {
    if (stopped) return;
    const child = spawn("scutil", ["--watchall"], { stdio: ["ignore", "pipe", "pipe"] });
    proc = child;

    child.stdout!.setEncoding("utf8");
    child.stdout!.on("data", (chunk: string) => {
      if (chunk.includes("State:/Network/Interface/en")) {
        void handleChange();
      }
    });

    child.stderr!.setEncoding("utf8");
    child.stderr!.on("data", (chunk: string) => {
      console.error(`[scutil stderr] ${chunk}`);
    });

    child.on("exit", (code, signal) => {
      console.error(`[scutil] exited (code=${code}, signal=${signal})`);
      proc = null;
      if (!stopped) {
        setTimeout(start, 1000);
      }
    });

    child.on("error", (err) => {
      console.error("[scutil] error:", err);
    });
  };

  start();

  return {
    stop: () => {
      stopped = true;
      if (proc) {
        proc.kill();
        proc = null;
      }
    },
  };
}
