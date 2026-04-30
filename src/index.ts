import "dotenv/config";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { getCurrentSSID, getCurrentDNSDomain } from "./wifi.js";
import { postMessage } from "./chatwork.js";

// 通知文言は環境ごとに変えにくいのでソース側に固定。変えたい人はここを編集してください。
const CHATWORK_MESSAGE = "weします(gogo)";

const STATE_FILE =
  process.env.STATE_FILE ??
  `${process.cwd()}/.state/state.json`;

type NetworkState = "on-target" | "off-target";

type State = {
  network: NetworkState;
  lastSentDate: string | null; // "YYYY-MM-DD" ローカルタイム
};

const DEFAULT_STATE: State = { network: "off-target", lastSentDate: null };

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value || value.trim() === "") {
    console.error(`[env] missing required environment variable: ${name}`);
    process.exit(1);
  }
  return value;
}

function readState(): State {
  try {
    const raw = readFileSync(STATE_FILE, "utf8");
    const parsed = JSON.parse(raw) as Partial<State>;
    return {
      network: parsed.network === "on-target" ? "on-target" : "off-target",
      lastSentDate:
        typeof parsed.lastSentDate === "string" ? parsed.lastSentDate : null,
    };
  } catch {
    return { ...DEFAULT_STATE };
  }
}

function writeState(state: State): void {
  mkdirSync(dirname(STATE_FILE), { recursive: true });
  writeFileSync(STATE_FILE, JSON.stringify(state, null, 2), "utf8");
}

function todayLocalDate(): string {
  const d = new Date();
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

// 「対象ネットワークに接続している」と見なすかを判定する。
// SSID 一致を優先し、SSID が取れない/redacted の環境では DNS ドメイン一致をフォールバック。
function isOnTargetNetwork(args: {
  ssid: string | null;
  dnsDomain: string | null;
  targetSSID: string;
  targetDNSDomain: string | null;
}): boolean {
  const { ssid, dnsDomain, targetSSID, targetDNSDomain } = args;
  if (ssid && ssid !== "<redacted>" && ssid === targetSSID) return true;
  if (targetDNSDomain && dnsDomain && dnsDomain === targetDNSDomain) return true;
  return false;
}

async function main() {
  const targetSSID = requireEnv("TARGET_SSID");
  const targetDNSDomain = process.env.TARGET_DNS_DOMAIN?.trim() || null;
  const token = requireEnv("CHATWORK_API_TOKEN");
  const roomId = requireEnv("CHATWORK_NOTIFY_ROOM_ID");
  const message = CHATWORK_MESSAGE;

  const ssid = getCurrentSSID();
  const dnsDomain = getCurrentDNSDomain();
  const onTarget = isOnTargetNetwork({ ssid, dnsDomain, targetSSID, targetDNSDomain });

  const prev = readState();
  const today = todayLocalDate();
  const currentNetwork: NetworkState = onTarget ? "on-target" : "off-target";

  const now = new Date().toISOString();
  console.log(
    `[run] ${now} ssid=${ssid ?? "(none)"} dns=${dnsDomain ?? "(none)"} ` +
      `target_ssid=${targetSSID} target_dns=${targetDNSDomain ?? "(none)"} ` +
      `current=${currentNetwork} last=${prev.network} ` +
      `last_sent=${prev.lastSentDate ?? "(none)"} today=${today}`,
  );

  // 送信条件: (off-target → on-target のエッジ) かつ (今日まだ送っていない)
  // → 1日1回だけ。お昼抜けして戻ってきても再送されない。
  const isEdge = currentNetwork === "on-target" && prev.network !== "on-target";
  const alreadySentToday = prev.lastSentDate === today;

  let nextLastSentDate = prev.lastSentDate;

  if (isEdge && !alreadySentToday) {
    console.log("[run] edge & not yet sent today; posting to Chatwork...");
    await postMessage({ token, roomId }, message);
    nextLastSentDate = today;
    console.log("[run] sent");
  } else if (isEdge && alreadySentToday) {
    console.log("[run] edge but already sent today; skipping");
  } else {
    console.log("[run] no edge; skipping notification");
  }

  writeState({ network: currentNetwork, lastSentDate: nextLastSentDate });
}

main().catch((err) => {
  console.error("[run] error:", err);
  process.exit(1);
});
