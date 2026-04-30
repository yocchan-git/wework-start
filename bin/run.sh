#!/usr/bin/env bash
# launchd 経由だと .zshrc / .bash_profile が読まれず nvm/nodenv で入れた
# node/npm が見つからないケースがあるので、ここで PATH を再構築してから npm start する。
set -eu

# このスクリプト自身の置き場所からプロジェクトルートを解決
SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
PROJECT_DIR="$( cd "$SCRIPT_DIR/.." && pwd )"
cd "$PROJECT_DIR"

# Homebrew (Apple Silicon / Intel)
[ -d /opt/homebrew/bin ] && export PATH="/opt/homebrew/bin:$PATH"
[ -d /usr/local/bin ] && export PATH="/usr/local/bin:$PATH"

# nodenv (shim 経由で node/npm を解決)
if [ -d "$HOME/.nodenv/shims" ]; then
  export PATH="$HOME/.nodenv/shims:$PATH"
fi

# nvm (関数として nvm を読み込み、現在のNodeバージョンを使えるようにする)
if [ -s "$HOME/.nvm/nvm.sh" ]; then
  export NVM_DIR="$HOME/.nvm"
  # shellcheck source=/dev/null
  . "$HOME/.nvm/nvm.sh"
fi

# 動作確認用ログ (logs/ がない場合は無視)
echo "[wrapper] PATH=$PATH"
echo "[wrapper] node: $(command -v node || echo '(not found)')"
echo "[wrapper] npm:  $(command -v npm  || echo '(not found)')"

exec npm start
