const { Redis } = require('@upstash/redis');

// 環境変数から接続情報を取得
const redis = new Redis({
    url: 'https://joint-whippet-14198.upstash.io',
    token: 'ATd2AAIncDJmMmE5NWE5OWE4YTE0NDg3OTAwMDQwNmJlZTBlMDkzZXAyMTQxOTg'
});

async function test() {
    try {
        // テストデータを保存
        await redis.set('test:connection', 'DataGate Phase 2 Working!');
        
        // データを取得
        const value = await redis.get('test:connection');
        console.log('✅ Upstash Redis接続成功！');
        console.log('   保存データ:', value);
        
        // ファイルテスト用のデータも保存
        await redis.set('file:test123:meta', JSON.stringify({
            fileName: 'test-file.txt',
            otp: '123456',
            downloadCount: 0,
            maxDownloads: 100
        }));
        console.log('✅ テストファイル作成完了');
        
    } catch (error) {
        console.error('❌ エラー:', error.message);
    }
}

test();
