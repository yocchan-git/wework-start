# wifi-chatwork-notifier

特定のWi-Fiに接続した瞬間に、Chatworkへ自動でメッセージを送るツール。

## 概要

- macOSの `scutil --watchall` でネットワーク変化イベントを**ポーリングなし**で検知
- 接続した瞬間（エッジ検知）のみChatwork APIを叩く
- `tsx` で直接TypeScriptを実行

## 動作環境

- macOS（`scutil` 依存）
- Node.js 18+
- TypeScript / tsx

## ディレクトリ構成

```
wifi-chatwork-notifier/
├── src/
│   ├── index.ts        # エントリーポイント・メインループ
│   ├── wifi.ts         # SSID取得ロジック（scutil watchall）
│   └── chatwork.ts     # Chatwork API送信
├── .env                # 環境変数（git管理外）
├── .env.example        # 環境変数のサンプル
├── package.json
└── tsconfig.json
```

## 環境変数

`.env.example` をコピーして `.env` を作成し、値を設定すること。

```env
TARGET_SSID=WeWork-Midosuji
CHATWORK_API_TOKEN=xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
CHATWORK_ROOM_ID=000000000
CHATWORK_MESSAGE=✅ WeWorkに到着しました！作業開始します。
```

## 実装仕様

### wifi.ts

`scutil --watchall` を `spawn` で起動し、stdoutをストリーミングで受け取る。

- `State:/Network/Interface/en` を含む出力が来たときだけSSID再取得
- SSID取得は `airport -I` コマンドを `execSync` で実行し、`SSID:` の行を正規表現でパース
  - `airport` のフルパス: `/System/Library/PrivateFrameworks/Apple80211.framework/Versions/Current/Resources/airport`
- SSIDが取得できない場合は `null` を返す
- `scutil` プロセスが落ちた場合は再起動する（再帰呼び出し or setTimeoutで再起動）

エッジ検知のロジック：
- `lastSSID` を保持し、`currentSSID === targetSSID && lastSSID !== targetSSID` のときだけ送信処理を呼ぶ

### chatwork.ts

Chatwork REST APIを `fetch` で叩く。

- エンドポイント: `POST https://api.chatwork.com/v2/rooms/{roomId}/messages`
- ヘッダー: `X-ChatWorkToken: {token}`, `Content-Type: application/x-www-form-urlencoded`
- ボディ: `body={message}`（`URLSearchParams` でエンコード）
- レスポンスが `ok` でない場合は `Error` をthrow

### index.ts

- `.env` を読み込み（`dotenv`）
- 環境変数が不足していたら起動時にエラーで終了
- `wifi.ts` の監視関数を呼び出してメインループを開始
- `SIGINT` / `SIGTERM` を受け取ったら `scutil` プロセスをkillして終了

## package.json に含めるべき依存関係

```json
{
  "dependencies": {
    "dotenv": "^16.0.0"
  },
  "devDependencies": {
    "tsx": "^4.0.0",
    "typescript": "^5.0.0",
    "@types/node": "^20.0.0"
  },
  "scripts": {
    "start": "tsx src/index.ts",
    "dev": "tsx watch src/index.ts"
  }
}
```

## 実行方法

```bash
npm install
npm start

# 開発時（ファイル変更で自動再起動）
npm run dev
```

## 注意事項

- `.env` は `.gitignore` に追加すること
- `airport` コマンドはmacOS Ventura以降で非推奨になっているが現時点では動作する
- Wi-Fiがオフの場合、SSIDは `null` になり送信はスキップされる
