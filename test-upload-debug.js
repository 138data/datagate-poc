/**
 * デバッグ用テストスクリプト
 */

import fs from 'fs';
import path from 'path';
import FormData from 'form-data';
import fetch from 'node-fetch';

const BASE_URL = 'http://localhost:3000';

async function testFileUploadDebug() {
  console.log('🐛 デバッグモード: ファイルアップロードテスト\n');

  try {
    const testFilePath = path.join(process.cwd(), 'test-file.txt');
    
    if (!fs.existsSync(testFilePath)) {
      console.error('❌ test-file.txt が見つかりません');
      return;
    }

    console.log('✅ テストファイル確認:', testFilePath);

    const form = new FormData();
    form.append('file', fs.createReadStream(testFilePath));
    form.append('sender', 'test-sender@example.com');
    form.append('recipient', 'test-recipient@example.com');
    form.append('phase', '1');

    console.log('📤 アップロードリクエスト送信中...');

    const uploadRes = await fetch(`${BASE_URL}/api/files/upload`, {
      method: 'POST',
      body: form
    });

    console.log('📊 レスポンスステータス:', uploadRes.status);
    console.log('📊 Content-Type:', uploadRes.headers.get('content-type'));

    const responseText = await uploadRes.text();
    console.log('📄 レスポンス内容（最初の500文字）:');
    console.log('━━━━━━━━━━━━━━━━━━━━━━');
    console.log(responseText.substring(0, 500));
    console.log('━━━━━━━━━━━━━━━━━━━━━━');

    // JSONパースを試みる
    try {
      const uploadData = JSON.parse(responseText);
      console.log('✅ JSONパース成功:');
      console.log(JSON.stringify(uploadData, null, 2));
    } catch (e) {
      console.error('❌ JSONパース失敗:', e.message);
      console.error('レスポンスはJSONではありません');
    }

  } catch (error) {
    console.error('❌ エラー:', error.message);
    console.error(error.stack);
  }
}

testFileUploadDebug();