const fs = require('fs').promises;
const path = require('path');

async function cleanupBrokenFiles() {
    console.log('=================================');
    console.log('138DataGate 破損ファイルクリーンアップ');
    console.log('=================================\n');

    const storageDir = path.join(process.cwd(), 'storage');
    
    try {
        // storageディレクトリの確認
        await fs.access(storageDir);
        
        // ファイル一覧を取得
        const files = await fs.readdir(storageDir);
        console.log(`📁 検査対象ファイル数: ${files.length}\n`);
        
        let brokenCount = 0;
        let fixedCount = 0;
        let deletedCount = 0;
        
        for (const file of files) {
            const filePath = path.join(storageDir, file);
            
            // .meta.jsonファイル（古い形式）の処理
            if (file.endsWith('.meta.json')) {
                console.log(`🔍 古い形式のファイル発見: ${file}`);
                
                try {
                    const content = await fs.readFile(filePath, 'utf8');
                    const metadata = JSON.parse(content);
                    
                    // uploadTimeが無効な場合
                    if (!metadata.uploadTime || metadata.uploadTime === 'Invalid Date') {
                        console.log(`  ❌ 破損: uploadTimeが無効`);
                        console.log(`  🗑️ 削除中...`);
                        
                        // メタデータファイルを削除
                        await fs.unlink(filePath);
                        
                        // 対応するデータファイルも削除
                        const dataFileName = file.replace('.meta.json', '.meta.data');
                        const dataFilePath = path.join(storageDir, dataFileName);
                        try {
                            await fs.unlink(dataFilePath);
                            console.log(`  🗑️ データファイルも削除: ${dataFileName}`);
                        } catch (e) {
                            // データファイルがない場合は無視
                        }
                        
                        deletedCount++;
                        console.log(`  ✅ 削除完了\n`);
                    } else {
                        // 新しい形式に変換
                        const newFileName = file.replace('.meta.json', '.json');
                        const newFilePath = path.join(storageDir, newFileName);
                        
                        console.log(`  📝 新形式に変換: ${newFileName}`);
                        await fs.rename(filePath, newFilePath);
                        
                        // データファイル名も修正
                        const oldDataName = file.replace('.meta.json', '.meta.data');
                        const newDataName = file.replace('.meta.json', '.data');
                        const oldDataPath = path.join(storageDir, oldDataName);
                        const newDataPath = path.join(storageDir, newDataName);
                        
                        try {
                            await fs.rename(oldDataPath, newDataPath);
                            console.log(`  📝 データファイル名も修正: ${newDataName}`);
                        } catch (e) {
                            // データファイルがない場合は無視
                        }
                        
                        fixedCount++;
                        console.log(`  ✅ 変換完了\n`);
                    }
                } catch (error) {
                    console.log(`  ❌ 読み込みエラー: ${error.message}`);
                    console.log(`  🗑️ 破損ファイルとして削除`);
                    await fs.unlink(filePath);
                    deletedCount++;
                    brokenCount++;
                    console.log(`  ✅ 削除完了\n`);
                }
            }
            
            // 通常の.jsonファイルのチェック
            else if (file.endsWith('.json')) {
                try {
                    const content = await fs.readFile(filePath, 'utf8');
                    const metadata = JSON.parse(content);
                    
                    // uploadTimeのバリデーション
                    if (!metadata.uploadTime) {
                        console.log(`🔍 破損ファイル: ${file}`);
                        console.log(`  ❌ uploadTimeが未定義`);
                        
                        // 現在時刻を設定して修復を試みる
                        metadata.uploadTime = new Date().toISOString();
                        metadata.retentionHours = metadata.retentionHours || 24;
                        metadata.maxDownloads = metadata.maxDownloads || 3;
                        metadata.downloads = metadata.downloads || 0;
                        
                        await fs.writeFile(filePath, JSON.stringify(metadata, null, 2));
                        fixedCount++;
                        console.log(`  ✅ 修復完了: uploadTimeを現在時刻に設定\n`);
                    } else {
                        // 日付として有効か確認
                        const testDate = new Date(metadata.uploadTime);
                        if (isNaN(testDate.getTime())) {
                            console.log(`🔍 破損ファイル: ${file}`);
                            console.log(`  ❌ uploadTimeが無効な形式: ${metadata.uploadTime}`);
                            
                            // 現在時刻で修復
                            metadata.uploadTime = new Date().toISOString();
                            await fs.writeFile(filePath, JSON.stringify(metadata, null, 2));
                            fixedCount++;
                            console.log(`  ✅ 修復完了: uploadTimeを現在時刻に設定\n`);
                        }
                    }
                    
                    // 必須フィールドの確認と修復
                    let needsUpdate = false;
                    if (!metadata.retentionHours) {
                        metadata.retentionHours = 24;
                        needsUpdate = true;
                    }
                    if (metadata.maxDownloads === undefined) {
                        metadata.maxDownloads = 3;
                        needsUpdate = true;
                    }
                    if (metadata.downloads === undefined) {
                        metadata.downloads = 0;
                        needsUpdate = true;
                    }
                    
                    if (needsUpdate) {
                        await fs.writeFile(filePath, JSON.stringify(metadata, null, 2));
                        console.log(`  📝 必須フィールドを追加: ${file}\n`);
                    }
                    
                } catch (error) {
                    console.log(`🔍 破損ファイル: ${file}`);
                    console.log(`  ❌ JSONパースエラー: ${error.message}`);
                    console.log(`  🗑️ 削除中...`);
                    
                    await fs.unlink(filePath);
                    
                    // 対応するデータファイルも削除
                    const dataFileName = file.replace('.json', '.data');
                    const dataFilePath = path.join(storageDir, dataFileName);
                    try {
                        await fs.unlink(dataFilePath);
                        console.log(`  🗑️ データファイルも削除: ${dataFileName}`);
                    } catch (e) {
                        // データファイルがない場合は無視
                    }
                    
                    deletedCount++;
                    brokenCount++;
                    console.log(`  ✅ 削除完了\n`);
                }
            }
        }
        
        console.log('=================================');
        console.log('クリーンアップ完了');
        console.log('=================================');
        console.log(`📊 結果:`);
        console.log(`  ✅ 修復済み: ${fixedCount}個`);
        console.log(`  🗑️ 削除済み: ${deletedCount}個`);
        console.log(`  ❌ 破損検出: ${brokenCount}個`);
        console.log('\n✨ storageフォルダがクリーンアップされました！');
        
    } catch (error) {
        console.error('❌ エラーが発生しました:', error);
    }
}

// スクリプト実行
cleanupBrokenFiles().then(() => {
    console.log('\n処理が完了しました。');
    process.exit(0);
}).catch(error => {
    console.error('致命的エラー:', error);
    process.exit(1);
});