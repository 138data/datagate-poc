#!/bin/bash
# DataGate Phase 1 デプロイスクリプト

echo "🚀 DataGate Phase 1 デプロイ開始..."

# 現在のディレクトリを確認
echo "📂 作業ディレクトリ: $(pwd)"

# Git設定（必要に応じて）
git config --global user.email "138data@example.com"
git config --global user.name "138data"

# 変更をステージング
echo "📝 変更をステージング..."
git add -A

# コミット
echo "💾 コミット作成..."
git commit -m "Phase 1実装: ファイルアップロード/ダウンロード機能、OTP認証、Vercel対応"

# プッシュ
echo "📤 GitHubへプッシュ..."
git push origin main

echo "✅ デプロイ完了！"
echo "🌐 Vercelが自動的にデプロイを開始します"
echo "📍 URL: https://datagate-poc.vercel.app"
