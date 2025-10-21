// test-smtp.js
// SMTPサーバーテスト用スクリプト

const nodemailer = require('nodemailer');
const fs = require('fs');
const path = require('path');

// テスト用ファイル作成
const testFilePath = path.join(__dirname, 'test-attachment.txt');
fs.writeFileSync(testFilePath, 'これは138DataGateのテストファイルです。\n送信日時: ' + new Date().toISOString());

// SMTPサーバーに接続
const transporter = nodemailer.createTransport({
    host: 'localhost',
    port: 587,
    secure: false,
    tls: {
        rejectUnauthorized: false
    }
});

// テストメール送信
async function sendTestMail() {
    try {
        console.log('テストメール送信開始...');

        const info = await transporter.sendMail({
            from: 'test-sender@138data.com',
            to: 'test-recipient@example.com',
            subject: '138DataGate テストメール',
            text: 'これはテストメールです。添付ファイルをご確認ください。',
            attachments: [
                {
                    filename: 'test-attachment.txt',
                    path: testFilePath
                }
            ]
        });

        console.log('✅ テストメール送信成功!');
        console.log('メッセージID:', info.messageId);
        console.log('レスポンス:', info.response);

        fs.unlinkSync(testFilePath);

    } catch (error) {
        console.error('❌ テストメール送信失敗:', error.message);
    }
}

sendTestMail();
