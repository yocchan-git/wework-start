export type ChatworkConfig = {
  token: string;
  roomId: string;
};

export type ChatworkMessage = {
  message_id: string;
  account: { account_id: number; name: string };
  body: string;
  send_time: number; // Unix epoch seconds (UTC)
  update_time: number;
};

const API_BASE = "https://api.chatwork.com/v2";

export async function postMessage(
  config: ChatworkConfig,
  message: string,
): Promise<void> {
  const url = `${API_BASE}/rooms/${config.roomId}/messages`;
  const body = new URLSearchParams({ body: message });

  const res = await fetch(url, {
    method: "POST",
    headers: {
      "X-ChatWorkToken": config.token,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body,
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(
      `Chatwork API error: ${res.status} ${res.statusText} ${text}`,
    );
  }
}

export async function getMyAccountId(config: ChatworkConfig): Promise<number> {
  const res = await fetch(`${API_BASE}/me`, {
    headers: { "X-ChatWorkToken": config.token },
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Chatwork /me error: ${res.status} ${res.statusText} ${text}`);
  }
  const me = (await res.json()) as { account_id: number };
  return me.account_id;
}

// force=1 を付けることで未読消化を伴わずに最新 100 件を取得する。
// (force なしだと未読がない場合に 204 が返り、判定漏れの原因になる)
export async function getRoomMessages(
  config: ChatworkConfig,
): Promise<ChatworkMessage[]> {
  const url = `${API_BASE}/rooms/${config.roomId}/messages?force=1`;
  const res = await fetch(url, {
    headers: { "X-ChatWorkToken": config.token },
  });
  if (res.status === 204) return [];
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(
      `Chatwork get messages error: ${res.status} ${res.statusText} ${text}`,
    );
  }
  return (await res.json()) as ChatworkMessage[];
}
