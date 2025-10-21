const jwt = require('jsonwebtoken');

// JWT秘密鍵
const JWT_SECRET = process.env.JWT_SECRET || 'your-super-secret-jwt-key-change-in-production';

/**
 * JWT認証ミドルウェア
 * 保護されたAPIエンドポイントで使用
 */
function authMiddleware(handler) {
    return async (req, res) => {
        // CORSヘッダー
        res.setHeader('Access-Control-Allow-Credentials', true);
        res.setHeader('Access-Control-Allow-Origin', '*');
        res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT');
        res.setHeader(
            'Access-Control-Allow-Headers',
            'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version, Authorization'
        );

        if (req.method === 'OPTIONS') {
            res.status(200).end();
            return;
        }

        try {
            // Authorizationヘッダーからトークンを取得
            const authHeader = req.headers.authorization;
            
            if (!authHeader) {
                return res.status(401).json({ 
                    error: '認証が必要です',
                    code: 'NO_TOKEN'
                });
            }

            // Bearer トークンの形式をチェック
            const tokenParts = authHeader.split(' ');
            if (tokenParts.length !== 2 || tokenParts[0] !== 'Bearer') {
                return res.status(401).json({ 
                    error: '無効なトークン形式です',
                    code: 'INVALID_FORMAT'
                });
            }

            const token = tokenParts[1];

            // トークンの検証（同期的に処理）
            try {
                const decoded = jwt.verify(token, JWT_SECRET);
                
                // リクエストオブジェクトにユーザー情報を追加
                req.user = {
                    username: decoded.username,
                    loginTime: decoded.loginTime
                };

                // 元のハンドラーを実行
                return await handler(req, res);
                
            } catch (jwtError) {
                if (jwtError.name === 'TokenExpiredError') {
                    return res.status(401).json({ 
                        error: 'トークンの有効期限が切れています',
                        code: 'TOKEN_EXPIRED'
                    });
                }
                
                if (jwtError.name === 'JsonWebTokenError') {
                    return res.status(401).json({ 
                        error: '無効なトークンです',
                        code: 'INVALID_TOKEN'
                    });
                }
                
                return res.status(401).json({ 
                    error: 'トークンの検証に失敗しました',
                    code: 'VERIFICATION_FAILED'
                });
            }

        } catch (error) {
            console.error('Auth middleware error:', error);
            res.status(500).json({ 
                error: '認証処理中にエラーが発生しました',
                code: 'AUTH_ERROR'
            });
        }
    };
}

module.exports = authMiddleware;