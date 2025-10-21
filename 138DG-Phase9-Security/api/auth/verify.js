const jwt = require('jsonwebtoken');

// JWT秘密鍵（本番環境では環境変数を使用）
const JWT_SECRET = process.env.JWT_SECRET || 'your-super-secret-jwt-key-change-in-production';

module.exports = async (req, res) => {
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

    if (req.method !== 'GET') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    try {
        // Authorizationヘッダーからトークンを取得
        const authHeader = req.headers.authorization;
        
        if (!authHeader) {
            return res.status(401).json({ 
                error: '認証トークンがありません' 
            });
        }

        // Bearer トークンの形式をチェック
        const tokenParts = authHeader.split(' ');
        if (tokenParts.length !== 2 || tokenParts[0] !== 'Bearer') {
            return res.status(401).json({ 
                error: '無効なトークン形式です' 
            });
        }

        const token = tokenParts[1];

        // トークンの検証
        jwt.verify(token, JWT_SECRET, (err, decoded) => {
            if (err) {
                if (err.name === 'TokenExpiredError') {
                    return res.status(401).json({ 
                        error: 'トークンの有効期限が切れています',
                        expired: true
                    });
                }
                
                if (err.name === 'JsonWebTokenError') {
                    return res.status(401).json({ 
                        error: '無効なトークンです',
                        invalid: true
                    });
                }
                
                return res.status(401).json({ 
                    error: 'トークンの検証に失敗しました' 
                });
            }

            // トークンが有効
            res.status(200).json({ 
                valid: true,
                username: decoded.username,
                loginTime: decoded.loginTime,
                expiresAt: new Date(decoded.exp * 1000).toISOString()
            });
        });

    } catch (error) {
        console.error('Token verification error:', error);
        res.status(500).json({ 
            error: 'トークン検証中にエラーが発生しました' 
        });
    }
};