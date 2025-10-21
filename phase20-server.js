// server.js
// 138DataGate - SMTPゲートウェイサーバー

require('dotenv').config();
const SMTPServer = require('smtp-server').SMTPServer;
const simpleParser = require('mailparser').simpleParser;
const axios = require('axios');
const FormData = require('form-data');
const fs = require('fs');
const path = require('path');

// ログ関数
function log(level, message, data = null) {
    const timestamp = new Date().toISOString();
    const logMessage = `[${timestamp}] [${level}] ${message}`;
    
    console.log(logMessage);
    if (data) {
        console.log(JSON.stringify(data, null, 2));
    }
    
    const logFile = process.env.LOG_FILE || '/var/log/138datagate-smtp.log';
    try {
        fs.appendFileSync(logFile, logMessage + '\n');
        if (data) {
            fs.appendFileSync(logFile, JSON.stringify(data, null, 2) + '\n');
        }
    } catch (err) {
        console.error('Failed to write log:', err);
    }
}

// 一時ディレクトリ
const TEMP_DIR = path.join(__dirname, 'temp');
if (!fs.existsSync(TEMP_DIR)) {
    fs.mkdirSync(TEMP_DIR, { recursive: true });
}

// Vercel APIにファイルをアップロード
async function uploadToVercel(fileBuffer, fileName, senderEmail, recipientEmail, messageText) {
    try {
        log('INFO', 'Vercel APIへアップロード開始', {
            fileName,
            fileSize: fileBuffer.length,
            sender: senderEmail,
            recipient: recipientEmail
        });

        const formData = new FormData();
        formData.append('file', fileBuffer, {
            filename: fileName,
            contentType: 'application/octet-stream'
        });
        formData.append('sender', senderEmail);
        formData.append('recipient', recipientEmail);
        formData.append('message', messageText || 'ファイルをお送りします。');

        const uploadUrl = process.env.VERCEL_API_URL + process.env.VERCEL_UPLOAD_ENDPOINT;
        
        log('INFO', 'API呼び出し', { url: uploadUrl });

        const response = await axios.post(uploadUrl, formData, {
            headers: {
                ...formData.getHeaders()
            },
            maxContentLength: Infinity,
            maxBodyLength: Infinity,
            timeout: 300000
        });

        log('INFO', 'Vercel APIレスポンス成功', response.data);

        return {
            success: true,
            data: response.data
        };

    } catch (error) {
        log('ERROR', 'Vercel APIエラー', {
            message: error.message,
            response: error.response?.data
        });

        return {
            success: false,
            error: error.message
        };
    }
}

// メール処理
async function handleMail(stream, session, callback) {
    const startTime = Date.now();
    const sessionId = Math.random().toString(36).substring(7);

    log('INFO', 'メール受信開始', {
        sessionId,
        from: session.envelope.mailFrom,
        to: session.envelope.rcptTo
    });

    try {
        const parsed = await simpleParser(stream);

        log('INFO', 'メール解析完了', {
            sessionId,
            subject: parsed.subject,
            from: parsed.from?.text,
            to: parsed.to?.text,
            attachmentsCount: parsed.attachments?.length || 0
        });

        if (!parsed.attachments || parsed.attachments.length === 0) {
            log('WARN', '添付ファイルなし', { sessionId });
            callback(new Error('添付ファイルが必要です'));
            return;
        }

        const senderEmail = parsed.from?.value[0]?.address || session.envelope.mailFrom.address;
        const recipientEmail = parsed.to?.value[0]?.address || session.envelope.rcptTo[0].address;

        log('INFO', 'メールアドレス抽出', {
            sessionId,
            sender: senderEmail,
            recipient: recipientEmail
        });

        const results = [];

        for (const attachment of parsed.attachments) {
            const fileName = attachment.filename || 'untitled';
            const fileSize = attachment.size || attachment.content.length;

            log('INFO', '添付ファイル処理開始', {
                sessionId,
                fileName,
                fileSize,
                contentType: attachment.contentType
            });

            const maxSize = parseInt(process.env.MAX_FILE_SIZE) || 104857600;
            if (fileSize > maxSize) {
                log('ERROR', 'ファイルサイズ超過', {
                    sessionId,
                    fileName,
                    fileSize,
                    maxSize
                });
                continue;
            }

            const result = await uploadToVercel(
                attachment.content,
                fileName,
                senderEmail,
                recipientEmail,
                parsed.text || parsed.html || ''
            );

            results.push({
                fileName,
                ...result
            });
        }

        const allSuccess = results.every(r => r.success);
        const processingTime = Date.now() - startTime;

        log('INFO', 'メール処理完了', {
            sessionId,
            results,
            processingTime: `${processingTime}ms`,
            success: allSuccess
        });

        if (allSuccess) {
            callback();
        } else {
            callback(new Error('一部のファイル処理に失敗しました'));
        }

    } catch (error) {
        log('ERROR', 'メール処理エラー', {
            sessionId,
            error: error.message,
            stack: error.stack
        });
        callback(error);
    }
}

// SMTPサーバー作成
const server = new SMTPServer({
    authOptional: true,
    name: process.env.SMTP_HOSTNAME || 'smtp.138data.com',
    banner: '138DataGate SMTP Gateway',
    onData: handleMail,
    onConnect(session, callback) {
        log('INFO', 'SMTP接続', {
            remoteAddress: session.remoteAddress,
            sessionId: session.id
        });
        callback();
    },
    onError(err) {
        log('ERROR', 'SMTPサーバーエラー', {
            error: err.message,
            stack: err.stack
        });
    },
    disabledCommands: ['STARTTLS'],
    size: parseInt(process.env.MAX_FILE_SIZE) || 104857600,
    logger: process.env.LOG_LEVEL === 'debug'
});

// サーバー起動
const PORT = process.env.SMTP_PORT || 587;

server.listen(PORT, () => {
    log('INFO', 'SMTPサーバー起動', {
        port: PORT,
        hostname: process.env.SMTP_HOSTNAME,
        vercelApi: process.env.VERCEL_API_URL,
        maxFileSize: process.env.MAX_FILE_SIZE,
        timestamp: new Date().toISOString()
    });
});

server.on('error', (err) => {
    log('ERROR', 'サーバーエラー', {
        error: err.message,
        code: err.code
    });
});

process.on('SIGTERM', () => {
    log('INFO', 'SIGTERM受信 - サーバー終了');
    server.close(() => {
        log('INFO', 'サーバー正常終了');
        process.exit(0);
    });
});

process.on('SIGINT', () => {
    log('INFO', 'SIGINT受信 - サーバー終了');
    server.close(() => {
        log('INFO', 'サーバー正常終了');
        process.exit(0);
    });
});

process.on('unhandledRejection', (reason, promise) => {
    log('ERROR', '未処理のPromise拒否', {
        reason: reason?.message || reason,
        stack: reason?.stack
    });
});

log('INFO', '138DataGate SMTPゲートウェイ 初期化完了');
