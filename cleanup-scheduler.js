// cleanup-scheduler.js
// 自動クリーンアップの定期実行スケジューラー

import cleanup from './auto-cleanup.js';
import fs from 'fs';
import path from 'path';

const SETTINGS_FILE = path.join(process.cwd(), 'config', 'settings.json');
const INTERVAL_MINUTES = 5; // 実行間隔（分）

// デフォルト設定
const DEFAULT_SETTINGS = {
    autoDelete: true
};

// 設定を読み込む
function loadSettings() {
    try {
        if (fs.existsSync(SETTINGS_FILE)) {
            const data = fs.readFileSync(SETTINGS_FILE, 'utf8');
            return JSON.parse(data);
        }
    } catch (error) {
        console.error('設定ファイルの読み込みエラー:', error);
    }
    return DEFAULT_SETTINGS;
}

// 次回実行時刻を表示
function showNextRunTime() {
    const nextRun = new Date(Date.now() + INTERVAL_MINUTES * 60 * 1000);
    console.log(`⏰ 次回実行予定: ${nextRun.toLocaleString('ja-JP')}`);
}

// 定期実行を開始
async function startScheduler() {
    console.log('========================================');
    console.log('🚀 自動クリーンアップスケジューラー起動');
    console.log(`📅 実行間隔: ${INTERVAL_MINUTES}分`);
    console.log('========================================\n');

    // 初回実行
    try {
        const settings = loadSettings();
        if (settings.autoDelete) {
            await cleanup();
        } else {
            console.log('⚠️  自動削除は無効に設定されています');
        }
    } catch (error) {
        console.error('❌ クリーンアップエラー:', error);
    }

    showNextRunTime();

    // 定期実行を設定
    setInterval(async () => {
        try {
            const settings = loadSettings();
            if (settings.autoDelete) {
                await cleanup();
            } else {
                console.log('\n⚠️  自動削除は無効に設定されています');
            }
        } catch (error) {
            console.error('❌ クリーンアップエラー:', error);
        }
        showNextRunTime();
    }, INTERVAL_MINUTES * 60 * 1000);

    // プロセス終了時の処理
    process.on('SIGINT', () => {
        console.log('\n\n🛑 スケジューラーを停止します...');
        process.exit(0);
    });

    process.on('SIGTERM', () => {
        console.log('\n\n🛑 スケジューラーを停止します...');
        process.exit(0);
    });
}

// メイン処理
if (process.argv.includes('--once')) {
    // 1回だけ実行
    console.log('🔄 単発実行モード');
    cleanup()
        .then(() => {
            console.log('✅ クリーンアップ完了');
            process.exit(0);
        })
        .catch(error => {
            console.error('❌ エラー:', error);
            process.exit(1);
        });
} else {
    // スケジューラーを開始
    startScheduler().catch(error => {
        console.error('❌ スケジューラー起動エラー:', error);
        process.exit(1);
    });
}
