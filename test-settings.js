// test-settings.js
// 設定APIの動作確認テストスクリプト

import fetch from 'node-fetch';

const BASE_URL = 'http://localhost:3000';

async function testSettings() {
    console.log('========================================');
    console.log('📋 設定API動作確認テスト');
    console.log('========================================\n');

    try {
        // 1. 現在の設定を取得
        console.log('1️⃣ 現在の設定を取得...');
        const getResponse = await fetch(`${BASE_URL}/api/settings`);
        const currentSettings = await getResponse.json();
        console.log('現在の設定:', JSON.stringify(currentSettings, null, 2));
        console.log('');

        // 2. 設定を変更
        console.log('2️⃣ 設定を変更...');
        const newSettings = {
            maxDownloads: 10,
            retentionHours: 48,
            maxFileSize: 200,
            autoDelete: true
        };
        
        const postResponse = await fetch(`${BASE_URL}/api/settings`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(newSettings)
        });
        
        if (postResponse.ok) {
            const result = await postResponse.json();
            console.log('✅ 設定を更新しました:', result.message);
            console.log('新しい設定:', JSON.stringify(result.settings, null, 2));
        } else {
            const error = await postResponse.json();
            console.log('❌ 設定更新エラー:', error);
        }
        console.log('');

        // 3. ファイル一覧を取得
        console.log('3️⃣ ファイル一覧を取得...');
        const filesResponse = await fetch(`${BASE_URL}/api/files`);
        const files = await filesResponse.json();
        console.log(`ファイル数: ${files.length}`);
        if (files.length > 0) {
            console.log('最新のファイル:', files[0]);
        }
        console.log('');

        // 4. 統計情報を取得
        console.log('4️⃣ 統計情報を取得...');
        const statsResponse = await fetch(`${BASE_URL}/api/stats`);
        const stats = await statsResponse.json();
        console.log('統計情報:', JSON.stringify(stats, null, 2));
        console.log('');

        // 5. 設定を元に戻す（オプション）
        console.log('5️⃣ 設定を初期値に戻す...');
        const resetSettings = {
            maxDownloads: 5,
            retentionHours: 72,
            maxFileSize: 100,
            autoDelete: true
        };
        
        const resetResponse = await fetch(`${BASE_URL}/api/settings`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(resetSettings)
        });
        
        if (resetResponse.ok) {
            console.log('✅ 設定を初期値に戻しました');
        }

        console.log('\n✨ すべてのテストが完了しました！');

    } catch (error) {
        console.error('❌ テストエラー:', error.message);
    }
}

// テスト実行
testSettings();
