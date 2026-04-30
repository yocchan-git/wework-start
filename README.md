# wifi-chatwork-notifier

特定の Wi-Fi（例: WeWork）に接続した瞬間、Chatwork の指定ルームへ自動でメッセージを送る macOS 用ツール。

## 概要

- macOS launchd の `LaunchEvents` (`com.apple.system.config.network_change`) を購読し、**ネットワーク変化時にだけ**スクリプトを起動。ポーリングも固定スケジュールも使わない。
- 「対象ネットワークに接続しているか」を **SSID** と **DHCP の DNS search domain** の両方で判定（macOS Sonoma 以降は SSID が `<redacted>` になる場合があるため、DNS ドメインがフォールバックになる）。
- `.state/last-network` で前回状態を保持し、エッジ検知（off→on の遷移時のみ送信）。同一ネットワークで再接続が続いても再送しない。
- 通知文言はソース内 (`src/index.ts` の `CHATWORK_MESSAGE`) に固定。変えたい場合はそこを編集。

## 動作環境

- macOS（Sonoma 以降で動作確認）
- Node.js 18+ / npm
- Chatwork APIトークン

---

## セットアップ

### A. Claude Code に丸投げする場合（推奨）

ターミナルでセットアップしたいディレクトリの親まで `cd` した状態で、Claude Code に以下のプロンプトをそのまま貼り付けてください。

```
wifi-chatwork-notifier をセットアップしてください。手順:

1. このディレクトリの直下に `wifi-chatwork-notifier/` を作って、
   そこに https://github.com/yocchan-git/wework-start.git を git clone。
   (フォルダ名が wework-start になるなら mv で wifi-chatwork-notifier に変更)
2. cd して npm install。
3. .env.example を .env にコピー。
4. 私に以下の2つだけ質問して .env に書き込む:
   - CHATWORK_API_TOKEN: Chatwork APIトークン
     （未取得なら https://www.chatwork.com/service/packages/chatwork/subpackages/api/token.php を案内）
   - CHATWORK_NOTIFY_ROOM_ID: 通知先ルームID（ChatworkのルームURL末尾の数字）
   TARGET_SSID / TARGET_DNS_DOMAIN は .env.example のデフォルト
   (WeWorkWiFi / wework.com) のまま触らないこと。質問もしない。
5. launchd/local.wifi-chatwork-notifier.plist を読み、`__PROJECT_DIR__` を
   実プロジェクトの絶対パスに置換したうえで ~/Library/LaunchAgents/ にコピー。
6. plutil -lint で文法チェック後、launchctl bootstrap gui/$(id -u) で登録。
7. mkdir -p logs して、npm start を一度実行し、
   - SSIDかDNSドメインがターゲットと一致していれば Chatwork に通知が届くこと
   - 続けてもう一度 npm start を実行し、no edge で重複送信されないこと
   を確認。Chatwork APIエラーが出た場合は .env のトークン/ルームIDを見直す。
8. launchctl print gui/$(id -u)/local.wifi-chatwork-notifier で
   event triggers に network_change が登録されていることを確認。

セットアップ後、何を確認すれば動作確認完了か教えてください。
```

Claude Code が手順通りに動かない箇所があれば、下の「B. 手動セットアップ」を参照させてください。

### B. 手動セットアップ

```bash
# 1. clone
git clone https://github.com/yocchan-git/wework-start.git wifi-chatwork-notifier
cd wifi-chatwork-notifier

# 2. 依存インストール
npm install

# 3. 環境変数
cp .env.example .env
# .env を編集して CHATWORK_API_TOKEN と CHATWORK_NOTIFY_ROOM_ID を埋める。
# TARGET_SSID / TARGET_DNS_DOMAIN は接続先 Wi-Fi に合わせて（WeWorkはデフォルトのままでOK）。

# 4. launchd plist をテンプレートから生成
PROJECT_DIR=$(pwd)
mkdir -p logs
sed "s|__PROJECT_DIR__|$PROJECT_DIR|g" launchd/local.wifi-chatwork-notifier.plist \
  > ~/Library/LaunchAgents/local.wifi-chatwork-notifier.plist
plutil -lint ~/Library/LaunchAgents/local.wifi-chatwork-notifier.plist

# 5. 登録（次回ログインから自動で network_change を購読する）
launchctl bootstrap gui/$(id -u) ~/Library/LaunchAgents/local.wifi-chatwork-notifier.plist

# 6. 動作確認
#    対象ネットワークに接続中ならその場で通知が送られる
npm start

# 7. 状態確認
launchctl print gui/$(id -u)/local.wifi-chatwork-notifier | grep -A 8 "event triggers"
```

### アンインストール

```bash
launchctl bootout gui/$(id -u)/local.wifi-chatwork-notifier
rm ~/Library/LaunchAgents/local.wifi-chatwork-notifier.plist
```

### 通知文言を変える

`src/index.ts` の `CHATWORK_MESSAGE` 定数を編集してください。再起動・再ロード不要（launchd は毎回 `npm start` を呼ぶだけなので、次回の発火時から反映される）。

### ログ

- `logs/stdout.log` / `logs/stderr.log` に launchd 経由の起動結果が追記されます。
- 手動実行 (`npm start`) の出力はターミナルに直接出ます。
