#!/bin/bash
# DataGate Phase 3 デプロイスクリプト
# メール送信機能の完全実装

echo "==============================================="
echo "   DataGate Phase 3 デプロイスクリプト"
echo "   メール送信機能の実装"
echo "==============================================="

# カラー出力の設定
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

# 現在のディレクトリを確認
echo -e "${YELLOW}📂 作業ディレクトリ: $(pwd)${NC}"

# Step 1: ファイルのバックアップ
echo -e "\n${YELLOW}📦 既存ファイルのバックアップ...${NC}"
if [ -f "api/upload.js" ]; then
    cp api/upload.js api/upload.js.backup_$(date +%Y%m%d_%H%M%S)
    echo -e "${GREEN}✅ upload.js をバックアップしました${NC}"
fi

if [ -f "api/download.js" ]; then
    cp api/download.js api/download.js.backup_$(date +%Y%m%d_%H%M%S)
    echo -e "${GREEN}✅ download.js をバックアップしました${NC}"
fi

# Step 2: 新しいファイルをコピー
echo -e "\n${YELLOW}📝 Phase 3のファイルを適用...${NC}"
cp /home/claude/api_upload_fixed.js api/upload.js
cp /home/claude/api_download_fixed.js api/download.js
echo -e "${GREEN}✅ ファイルを更新しました${NC}"

# Step 3: 環境変数の確認
echo -e "\n${YELLOW}🔐 環境変数の確認...${NC}"

# 必要な環境変数のリスト
REQUIRED_VARS=(
    "SENDGRID_API_KEY"
    "SENDER_EMAIL"
    "UPSTASH_REDIS_REST_URL"
    "UPSTASH_REDIS_REST_TOKEN"
)

# 環境変数をチェック
MISSING_VARS=()
for var in "${REQUIRED_VARS[@]}"; do
    if [ -z "${!var}" ]; then
        MISSING_VARS+=($var)
        echo -e "${RED}❌ $var が設定されていません${NC}"
    else
        echo -e "${GREEN}✅ $var 設定済み${NC}"
    fi
done

# 環境変数が不足している場合の処理
if [ ${#MISSING_VARS[@]} -gt 0 ]; then
    echo -e "\n${YELLOW}⚠️ 不足している環境変数をVercelに設定してください:${NC}"
    echo ""
    echo "Vercel CLIを使用する場合:"
    for var in "${MISSING_VARS[@]}"; do
        echo "vercel env add $var production"
    done
    echo ""
    echo "または、Vercelダッシュボードから設定:"
    echo "https://vercel.com/138data/datagate-poc/settings/environment-variables"
fi

# Step 4: package.jsonの確認
echo -e "\n${YELLOW}📦 依存関係の確認...${NC}"
if ! grep -q "@sendgrid/mail" package.json; then
    echo -e "${YELLOW}SendGridパッケージが見つかりません。追加します...${NC}"
    npm install @sendgrid/mail --save
fi

if ! grep -q "@upstash/redis" package.json; then
    echo -e "${YELLOW}Upstash Redisパッケージが見つかりません。追加します...${NC}"
    npm install @upstash/redis --save
fi

# Step 5: Git コミット
echo -e "\n${YELLOW}📝 変更をコミット...${NC}"
git add -A
git commit -m "Phase 3: メール送信機能の完全実装 - SendGrid統合" || {
    echo -e "${YELLOW}変更がないか、既にコミット済みです${NC}"
}

# Step 6: デプロイ
echo -e "\n${YELLOW}🚀 Vercelへデプロイ...${NC}"
git push origin main

echo -e "\n${GREEN}===============================================${NC}"
echo -e "${GREEN}   ✅ Phase 3 デプロイ完了！${NC}"
echo -e "${GREEN}===============================================${NC}"
echo ""
echo -e "${YELLOW}📋 次のステップ:${NC}"
echo "1. Vercelダッシュボードでデプロイ状況を確認"
echo "   https://vercel.com/138data/datagate-poc"
echo ""
echo "2. テストを実行:"
echo "   - ファイルアップロード: https://datagate-poc.vercel.app"
echo "   - メール受信確認"
echo "   - ダウンロード動作確認"
echo ""
echo "3. SendGrid Activity Feedで送信状況を確認:"
echo "   https://app.sendgrid.com/activity"
echo ""

# Step 7: ヘルスチェック
echo -e "${YELLOW}🏥 5秒後にヘルスチェックを実行...${NC}"
sleep 5

if command -v curl &> /dev/null; then
    echo -e "\n${YELLOW}API状態確認:${NC}"
    curl -s https://datagate-poc.vercel.app/api/health | python -m json.tool 2>/dev/null || echo "JSONパースエラー（正常な場合もあります）"
else
    echo -e "${YELLOW}curlがインストールされていません${NC}"
fi

echo -e "\n${GREEN}🎉 Phase 3 メール送信機能の実装が完了しました！${NC}"
