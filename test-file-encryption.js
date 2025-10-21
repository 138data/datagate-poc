/**
 * ファイルアップロード・ダウンロード統合テスト
 */

import fs from 'fs';
import path from 'path';
import FormData from 'form-data';
import fetch from 'node-fetch';

const BASE_URL = 'http://localhost:3000';

async function testFileEncryption() {
  console.log('🧪 ファイル暗号化・復号 統合テスト開始\n');

  try {
    // テスト1: ファイルアップロード
    console.log('📤 テスト1: ファイルアップロード（暗号化）');
    
    const testFilePath = path.join(process.cwd(), 'test-file.txt');
    
    if (!fs.existsSync(testFilePath)) {
      console.error('❌ test-file.txt が見つかりません');
      return;
    }

    const form = new FormData();
    form.append('file', fs.createReadStream(testFilePath));
    form.append('sender', 'test-sender@example.com');
    form.append('recipient', 'test-recipient@example.com');
    form.append('phase', '1');

    const uploadRes = await fetch(`${BASE_URL}/api/files/upload`, {
      method: 'POST',
      body: form
    });

    const uploadData = await uploadRes.json();
    
    if (!uploadData.success) {
      console.error('❌ アップロード失敗:', uploadData.error);
      return;
    }

    console.log('✅ アップロード成功!');
    console.log('   ファイルID:', uploadData.fileId);
    console.log('   ファイル名:', uploadData.fileName);
    console.log('   元のサイズ:', uploadData.fileSize, 'bytes');
    console.log('   暗号化後:', uploadData.encryptedSize, 'bytes');
    console.log('   有効期限:', uploadData.expiresAt);
    console.log('');

    // テスト2: ファイルダウンロード
    console.log('📥 テスト2: ファイルダウンロード（復号）');
    
    const downloadRes = await fetch(`${BASE_URL}/api/files/download?fileId=${uploadData.fileId}&token=test-token`);
    
    if (!downloadRes.ok) {
      console.error('❌ ダウンロード失敗:', downloadRes.status);
      return;
    }

    const downloadedData = await downloadRes.buffer();
    console.log('✅ ダウンロード成功!');
    console.log('   ダウンロードサイズ:', downloadedData.length, 'bytes');
    console.log('');

    // テスト3: 内容の検証
    console.log('🔍 テスト3: ファイル内容の検証');
    
    const originalData = fs.readFileSync(testFilePath);
    
    if (originalData.equals(downloadedData)) {
      console.log('✅ 検証成功: 元のファイルと一致しました!');
      console.log('');
      console.log('📄 ファイル内容:');
      console.log('━━━━━━━━━━━━━━━━━━━━━━');
      console.log(downloadedData.toString('utf8'));
      console.log('━━━━━━━━━━━━━━━━━━━━━━');
    } else {
      console.log('❌ 検証失敗: ファイルが一致しません');
    }

    console.log('');
    console.log('🎉 すべてのテスト完了!');
    console.log('✅ ファイル暗号化・復号が正常に動作しています!');

  } catch (error) {
    console.error('❌ テストエラー:', error.message);
  }
}

testFileEncryption();