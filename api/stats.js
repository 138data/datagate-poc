// api/stats.js
// 統計情報取得API（Phase 21: KPI機能追加版）

const fs = require('fs');
const path = require('path');
const fetch = require('node-fetch');

// JWT認証用の簡易バージョン（guard.jsの代替）
const jwt = require('jsonwebtoken');

function verifyToken(req) {
    try {
        const authHeader = req.headers.authorization;
        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            return { valid: false, error: 'トークンが見つかりません' };
        }

        const token = authHeader.substring(7);
        const secret = process.env.JWT_SECRET;

        if (!secret) {
            return { valid: false, error: 'JWT_SECRETが設定されていません' };
        }

        const decoded = jwt.verify(token, secret);
        return { valid: true, user: decoded };
    } catch (error) {
        return { valid: false, error: error.message };
    }
}

// KVクライアント（REST API方式）
const kvClient = {
    async get(key) {
        const url = `${(process.env.KV_REST_API_URL || '').trim()}/get/${key}`;
        const token = (process.env.KV_REST_API_TOKEN || '').trim();

        const response = await fetch(url, {
            headers: {
                'Authorization': `Bearer ${token}`
            }
        });

        if (!response.ok) {
            if (response.status === 404) return null;
            throw new Error(`KV GET failed: ${response.statusText}`);
        }

        const data = await response.json();
        return data.result;
    },

    async keys(pattern) {
        const url = `${(process.env.KV_REST_API_URL || '').trim()}/keys/${pattern}`;
        const token = (process.env.KV_REST_API_TOKEN || '').trim();

        const response = await fetch(url, {
            headers: {
                'Authorization': `Bearer ${token}`
            }
        });

        if (!response.ok) {
            if (response.status === 404) return [];
            throw new Error(`KV KEYS failed: ${response.statusText}`);
        }

        const data = await response.json();
        return data.result || [];
    }
};

module.exports = async (req, res) => {
    // CORSヘッダー設定
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

    // OPTIONSリクエストの処理
    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }

    // GETメソッドのみ許可
    if (req.method !== 'GET') {
        return res.status(405).json({
            success: false,
            error: 'Method not allowed'
        });
    }

    try {
        // JWT認証
        const authResult = verifyToken(req);
        if (!authResult.valid) {
            return res.status(401).json({
                success: false,
                error: '認証が必要です'
            });
        }

        // 環境変数チェック
        const hasKv = !!(process.env.KV_REST_API_URL && process.env.KV_REST_API_TOKEN);

        // ユーザー数を取得
        let userCount = 0;
        try {
            const usersPath = path.join(process.cwd(), 'data', 'users.json');
            if (fs.existsSync(usersPath)) {
                const usersData = JSON.parse(fs.readFileSync(usersPath, 'utf8'));
                userCount = usersData.users ? usersData.users.length : 0;
            }
        } catch (error) {
            console.error('ユーザー数取得エラー:', error);
        }

        // ファイル数とストレージ使用量を取得
        let fileCount = 0;
        let storageUsed = 0;
        let todayUploads = 0;
        const today = new Date().toISOString().split('T')[0];

        try {
            if (hasKv) {
                // KVからファイル情報を取得
                const keys = await kvClient.keys('file:*');
                fileCount = keys.length;

                for (const key of keys) {
                    try {
                        const fileDataStr = await kvClient.get(key);
                        if (fileDataStr) {
                            const fileData = JSON.parse(fileDataStr);
                            if (fileData && fileData.size) {
                                storageUsed += fileData.size;
                            }

                            // 今日のアップロード数をカウント
                            if (fileData && fileData.uploadedAt) {
                                const uploadDate = new Date(fileData.uploadedAt).toISOString().split('T')[0];
                                if (uploadDate === today) {
                                    todayUploads++;
                                }
                            }
                        }
                    } catch (error) {
                        console.error(`ファイルデータ取得エラー (${key}):`, error);
                    }
                }
            } else {
                // ローカル環境: storageディレクトリから取得
                const storagePath = path.join(process.cwd(), 'storage');
                if (fs.existsSync(storagePath)) {
                    const files = fs.readdirSync(storagePath);
                    fileCount = files.length;

                    files.forEach(file => {
                        const filePath = path.join(storagePath, file);
                        const stats = fs.statSync(filePath);
                        storageUsed += stats.size;
                    });
                }
            }
        } catch (error) {
            console.error('ファイル情報取得エラー:', error);
        }

        // Phase 21: KPI統計を取得
        let kpiStats = {
            avgTransferSpeed: 0,
            avgCompressionRatio: 0,
            uploadSuccessRate: 0,
            avgFileSize: 0
        };

        try {
            if (hasKv) {
                // KVからKPI統計を取得
                const kpiDataStr = await kvClient.get('kpi:stats');

                if (kpiDataStr) {
                    const kpiData = JSON.parse(kpiDataStr);

                    // 転送速度の平均を計算
                    if (kpiData.transferSpeeds && kpiData.transferSpeeds.length > 0) {
                        const totalSpeed = kpiData.transferSpeeds.reduce((sum, speed) => sum + speed, 0);
                        kpiStats.avgTransferSpeed = totalSpeed / kpiData.transferSpeeds.length;
                    }

                    // 圧縮率の平均を計算
                    if (kpiData.compressionRatios && kpiData.compressionRatios.length > 0) {
                        const totalRatio = kpiData.compressionRatios.reduce((sum, ratio) => sum + ratio, 0);
                        kpiStats.avgCompressionRatio = totalRatio / kpiData.compressionRatios.length;
                    }

                    // アップロード成功率を計算
                    if (kpiData.uploadAttempts && kpiData.uploadAttempts > 0) {
                        kpiStats.uploadSuccessRate = (kpiData.uploadSuccesses / kpiData.uploadAttempts) * 100;
                    }

                    // 平均ファイルサイズを計算
                    if (kpiData.fileSizes && kpiData.fileSizes.length > 0) {
                        const totalSize = kpiData.fileSizes.reduce((sum, size) => sum + size, 0);
                        kpiStats.avgFileSize = totalSize / kpiData.fileSizes.length;
                    }
                }
            }
        } catch (error) {
            console.error('KPI統計取得エラー:', error);
        }

        // ストレージ使用量のフォーマット
        function formatBytes(bytes) {
            if (bytes === 0) return '0 B';
            const k = 1024;
            const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
            const i = Math.floor(Math.log(bytes) / Math.log(k));
            return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
        }

        // ログ数を取得（簡易実装）
        let logCount = 0;
        try {
            const logsPath = path.join(process.cwd(), 'data', 'logs.json');
            if (fs.existsSync(logsPath)) {
                const logsData = JSON.parse(fs.readFileSync(logsPath, 'utf8'));
                logCount = logsData.logs ? logsData.logs.length : 0;
            }
        } catch (error) {
            console.error('ログ数取得エラー:', error);
        }

        // 統計情報を返却
        return res.status(200).json({
            success: true,
            stats: {
                users: userCount,
                files: fileCount,
                logs: logCount,
                todayUploads: todayUploads,
                storage: {
                    used: storageUsed,
                    usedFormatted: formatBytes(storageUsed),
                    total: 10737418240, // 10GB
                    totalFormatted: '10.0 GB',
                    percentage: (storageUsed / 10737418240 * 100).toFixed(2)
                },
                kpi: kpiStats
            }
        });

    } catch (error) {
        console.error('統計情報取得エラー:', error);
        return res.status(500).json({
            success: false,
            error: '統計情報の取得に失敗しました',
            details: error.message
        });
    }
};
