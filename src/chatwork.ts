export type ChatworkConfig = {
  token: string;
  roomId: string;
};

export async function postMessage(
  config: ChatworkConfig,
  message: string,
): Promise<void> {
  const url = `https://api.chatwork.com/v2/rooms/${config.roomId}/messages`;
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
