import "dotenv/config";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { getCurrentSSID, getCurrentDNSDomain } from "./wifi.js";
import {
  postMessage,
  getMyAccountId,
  getRoomMessages,
  type ChatworkConfig,
} from "./chatwork.js";

// 通知文言は環境ごとに変えにくいのでソース側に固定。変えたい人はここを編集してください。
const CHATWORK_MESSAGE = "weします(gogo)";

const STATE_FILE =
  process.env.STATE_FILE ??
  `${process.cwd()}/.state/last-network`;

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value || value.trim() === "") {
    console.error(`[env] missing required environment variable: ${name}`);
    process.exit(1);
  }
  return value;
}

function readLastState(): string | null {
  try {
    const v = readFileSync(STATE_FILE, "utf8").trim();
    return v.length > 0 ? v : null;
  } catch {
    return null;
  }
}

function writeLastState(value: string | null): void {
  mkdirSync(dirname(STATE_FILE), { recursive: true });
  writeFileSync(STATE_FILE, value ?? "", "utf8");
}

function startOfTodayUnix(): number {
  // ローカルタイム（JSTなら 00:00 JST）の Unix 秒。
  const now = new Date();
  const midnight = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  return Math.floor(midnight.getTime() / 1000);
}

// 状態ファイル/launchd Throttle に加えての3層目: Chatwork ルームを直接見て、
// 今日自分が同じ文言を投稿していないか確認する。API失敗時は false (重複なし扱い)
// を返して既存の保護に任せる。
async function alreadySentSameMessageToday(
  config: ChatworkConfig,
  message: string,
): Promise<boolean> {
  try {
    const [myId, messages] = await Promise.all([
      getMyAccountId(config),
      getRoomMessages(config),
    ]);
    const since = startOfTodayUnix();
    return messages.some(
      (m) =>
        m.account.account_id === myId &&
        m.send_time >= since &&
        m.body === message,
    );
  } catch (err) {
    console.warn(
      "[dup-check] Chatwork API check failed; falling back to local dedup:",
      err,
    );
    return false;
  }
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

  // 状態としては target に居るか居ないかの 2 値だけ保持する。
  // ssid 文字列を保存しないことで、redacted 環境と非 redacted 環境を行き来しても誤発火しない。
  const lastState = readLastState();
  const currentState = onTarget ? "on-target" : "off-target";

  const now = new Date().toISOString();
  console.log(
    `[run] ${now} ssid=${ssid ?? "(none)"} dns=${dnsDomain ?? "(none)"} ` +
      `target_ssid=${targetSSID} target_dns=${targetDNSDomain ?? "(none)"} ` +
      `current=${currentState} last=${lastState ?? "(none)"}`,
  );

  if (currentState === "on-target" && lastState !== "on-target") {
    if (await alreadySentSameMessageToday({ token, roomId }, message)) {
      console.log(
        "[run] edge detected, but same message already posted today; skipping",
      );
    } else {
      console.log("[run] edge: connected to target; posting to Chatwork...");
      await postMessage({ token, roomId }, message);
      console.log("[run] sent");
    }
  } else {
    console.log("[run] no edge; skipping notification");
  }

  writeLastState(currentState);
}

main().catch((err) => {
  console.error("[run] error:", err);
  process.exit(1);
});
