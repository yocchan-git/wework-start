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

Claude Code をどこで起動していてもOK。以下のプロンプトをそのまま貼り付けてください。
インストール先のディレクトリも Claude Code が提案・確認してから作ります。

```
wifi-chatwork-notifier を私のmacにセットアップしてください。
私はターミナル/Git/Node.jsの操作にあまり慣れていない前提でお願いします。

手順:

1. 事前チェック: Node.js / npm が入っているか確認する。
   - `which node` と `which npm` を実行。両方見つかれば次のステップへ。
   - 片方でも見つからない場合は、まず私にこう声かけしてから入れる:
     「Node.js（npmが同梱されています）がまだ入っていないようなので、これから入れますね。
      ※よっちゃんより: npm は Node.js の公式パッケージマネージャで、世界中の開発現場で
      広く使われている安全なツールです。安心して入れて大丈夫ですよ。」
   - インストール方法は以下の優先順で判断:
     a) `which brew` で Homebrew が入っていれば `brew install node`
     b) Homebrew が無い場合、私が CLI 操作に不慣れであれば
        https://nodejs.org/ja/download の「macOS Installer (.pkg)」をブラウザで開く
        よう案内し、ダウンロード→ダブルクリックで完了するまで待つ。
   - インストール後 `node --version` `npm --version` で確認。
     反映されない場合はターミナルを開き直すよう私に依頼。
2. インストール先ディレクトリを決める。
   - デフォルト案として `~/workspace/wifi-chatwork-notifier` を提示し、
     「ここに作ってよいか／別のパスにしたいか」を必ず私に質問する。
   - 私の回答に従ってディレクトリを作成する。
     (親ディレクトリが無ければ `mkdir -p` で作って良い)
3. そのディレクトリに https://github.com/yocchan-git/wework-start.git を git clone。
   (clone 先のフォルダ名が wework-start になる場合は mv で wifi-chatwork-notifier に変更)
4. cd して npm install。
5. .env.example を .env にコピー。
6. 私に以下の2つだけ質問して .env に書き込む:
   - CHATWORK_API_TOKEN: Chatwork APIトークン
     （未取得なら https://www.chatwork.com/service/packages/chatwork/subpackages/api/token.php を案内）
   - CHATWORK_NOTIFY_ROOM_ID: 通知先ルームID（ChatworkのルームURL末尾の数字）
   TARGET_SSID / TARGET_DNS_DOMAIN は .env.example のデフォルト
   (WeWorkWiFi / wework.com) のまま触らないこと。質問もしない。
7. `chmod +x bin/run.sh` で wrapper スクリプトに実行権限を付ける。
   (このスクリプトが launchd 起動時に nvm / nodenv / Homebrew のパスを
   解決してから npm start を呼ぶ。launchd は .zshrc を読まないため必須)
8. launchd/local.wifi-chatwork-notifier.plist を読み、`__PROJECT_DIR__` を
   実プロジェクトの絶対パスに置換したうえで ~/Library/LaunchAgents/ にコピー。
9. plutil -lint で文法チェック後、launchctl bootstrap gui/$(id -u) で登録。
10. mkdir -p logs して、npm start を一度実行し、
    - SSIDかDNSドメインがターゲットと一致していれば Chatwork に通知が届くこと
    - 続けてもう一度 npm start を実行し、no edge で重複送信されないこと
    を確認。Chatwork APIエラーが出た場合は .env のトークン/ルームIDを見直す。
11. `launchctl kickstart gui/$(id -u)/local.wifi-chatwork-notifier` を1回実行し、
    logs/stdout.log の先頭に [wrapper] node: ... [wrapper] npm: ... が
    表示されていることを確認 (ここが (not found) になっていたら nvm/nodenv の
    検出に失敗しているので bin/run.sh を見直す)。
12. launchctl print gui/$(id -u)/local.wifi-chatwork-notifier で
    event triggers に network_change が登録されていることを確認。

各ステップで何をしているかを一言ずつ私に説明しながら進めてください。
途中で詰まったら勝手に進めず、何が起きていてどうしたいかを私に聞いてください。
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

# 4. wrapper script に実行権限を付ける
#    (launchd は .zshrc を読まないので、ここで nvm/nodenv/Homebrew のパスを
#    再構築してから npm start する。clone 直後だと chmod が落ちる場合あり)
chmod +x bin/run.sh

# 5. launchd plist をテンプレートから生成
PROJECT_DIR=$(pwd)
mkdir -p logs
sed "s|__PROJECT_DIR__|$PROJECT_DIR|g" launchd/local.wifi-chatwork-notifier.plist \
  > ~/Library/LaunchAgents/local.wifi-chatwork-notifier.plist
plutil -lint ~/Library/LaunchAgents/local.wifi-chatwork-notifier.plist

# 6. 登録（次回ログインから自動で network_change を購読する）
launchctl bootstrap gui/$(id -u) ~/Library/LaunchAgents/local.wifi-chatwork-notifier.plist

# 7. 動作確認 (対象ネットワークに接続中ならその場で通知が送られる)
npm start

# 8. launchd 経由で wrapper が node/npm を解決できているかチェック
launchctl kickstart gui/$(id -u)/local.wifi-chatwork-notifier
sleep 3
head -3 logs/stdout.log
# → [wrapper] node: /path/... と [wrapper] npm: /path/... が出ていればOK。
#   (not found) なら bin/run.sh のパス検出条件を見直す。

# 9. 状態確認
launchctl print gui/$(id -u)/local.wifi-chatwork-notifier | grep -A 8 "event triggers"
```

#### nvm/nodenv 以外の Node 管理ツールを使っている場合

`bin/run.sh` は nvm / nodenv / Homebrew (Apple Silicon と Intel 両方) しか
カバーしていません。volta / asdf / fnm 等を使っている場合は、`bin/run.sh`
の該当ブロックを参考にしてご自身の Node 管理ツール用の初期化を追記してください。
切り分けは `launchctl kickstart` 後の `logs/stdout.log` の `[wrapper] node:`
行を見れば分かります。

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
