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

function startOfTodayUnix(): number {
  // ローカルタイム 0 時の Unix 秒。
  const d = new Date();
  const midnight = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  return Math.floor(midnight.getTime() / 1000);
}

// ローカル state ファイルが破損/削除されている場合や別端末から送られた場合の
// 二重防御として、Chatwork API 側でも当日の同文言投稿をチェックする。
// API失敗時は false を返してローカル判定 (lastSentDate) に任せる。
async function alreadySentTodayViaApi(
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
      "[dup-check] Chatwork API check failed; falling back to local state:",
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

  // 送信条件: (off-target → on-target のエッジ) かつ
  //          (ローカル state でも当日未送信) かつ
  //          (Chatwork API でも当日同文言の自分の投稿なし)
  // 1日1回だけ。お昼抜けして戻ってきても再送されない。
  // ローカル state が消えた/別端末から送られた場合の保険として API 側もチェック。
  const isEdge = currentNetwork === "on-target" && prev.network !== "on-target";
  const alreadySentTodayLocal = prev.lastSentDate === today;

  let nextLastSentDate = prev.lastSentDate;

  if (!isEdge) {
    console.log("[run] no edge; skipping notification");
  } else if (alreadySentTodayLocal) {
    console.log("[run] edge but already sent today (local); skipping");
  } else if (await alreadySentTodayViaApi({ token, roomId }, message)) {
    console.log(
      "[run] edge but Chatwork already has today's same message; skipping (syncing local state)",
    );
    nextLastSentDate = today;
  } else {
    console.log("[run] edge & dedup-clear; posting to Chatwork...");
    await postMessage({ token, roomId }, message);
    nextLastSentDate = today;
    console.log("[run] sent");
  }

  writeState({ network: currentNetwork, lastSentDate: nextLastSentDate });
}

main().catch((err) => {
  console.error("[run] error:", err);
  process.exit(1);
});
