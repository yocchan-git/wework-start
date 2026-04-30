import "dotenv/config";
import { watchSSID } from "./wifi.js";
import { postMessage } from "./chatwork.js";

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value || value.trim() === "") {
    console.error(`[env] missing required environment variable: ${name}`);
    process.exit(1);
  }
  return value;
}

const targetSSID = requireEnv("TARGET_SSID");
const token = requireEnv("CHATWORK_API_TOKEN");
const roomId = requireEnv("CHATWORK_NOTIFY_ROOM_ID");
const message = requireEnv("CHATWORK_MESSAGE");

console.log(`[boot] watching for SSID: ${targetSSID}`);
console.log(`[boot] chatwork room: ${roomId}`);

const handle = watchSSID({
  targetSSID,
  onConnect: async (ssid) => {
    console.log(`[notify] connected to ${ssid}, posting to Chatwork...`);
    await postMessage({ token, roomId }, message);
    console.log("[notify] sent");
  },
});

const shutdown = (signal: NodeJS.Signals) => {
  console.log(`[shutdown] received ${signal}, stopping...`);
  handle.stop();
  process.exit(0);
};

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
