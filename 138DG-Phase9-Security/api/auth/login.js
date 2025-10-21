const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const fs = require('fs').promises;
const path = require('path');

// JWT秘密鍵（本番環境では環境変数を使用）
const JWT_SECRET = process.env.JWT_SECRET || 'your-super-secret-jwt-key-change-in-production';
const TOKEN_EXPIRY = '24h'; // トークン有効期限

// 管理者認証情報の保存先
const ADMIN_CONFIG_PATH = path.join(process.cwd(), 'config', 'admin.json');

// デフォルトの管理者情報（初回起動時に作成）
const DEFAULT_ADMIN = {
    username: 'admin',
    password: '$2a$10$xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx' // 後で設定
};

// 管理者情報の読み込み
async function loadAdminConfig() {
    try {
        const data = await fs.readFile(ADMIN_CONFIG_PATH, 'utf8');
        return JSON.parse(data);
    } catch (error) {
        // ファイルが存在しない場合はデフォルトを作成
        const hashedPassword = await bcrypt.hash('Admin138!', 10);
        const adminConfig = {
            username: 'admin',
            password: hashedPassword,
            createdAt: new Date().toISOString(),
            lastLogin: null,
            loginAttempts: 0,
            lockedUntil: null
        };
        
        // configフォルダが存在しない場合は作成
        await fs.mkdir(path.dirname(ADMIN_CONFIG_PATH), { recursive: true });
        await fs.writeFile(ADMIN_CONFIG_PATH, JSON.stringify(adminConfig, null, 2));
        
        return adminConfig;
    }
}

// 管理者情報の保存
async function saveAdminConfig(config) {
    await fs.writeFile(ADMIN_CONFIG_PATH, JSON.stringify(config, null, 2));
}

// ログイン試行回数のチェック
function isAccountLocked(adminConfig) {
    if (adminConfig.lockedUntil) {
        const lockTime = new Date(adminConfig.lockedUntil);
        if (lockTime > new Date()) {
            return true;
        }
    }
    return false;
}

// ログイン処理
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

    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    try {
        const { username, password, remember } = req.body;

        // 入力検証
        if (!username || !password) {
            return res.status(400).json({ 
                error: 'ユーザー名とパスワードは必須です' 
            });
        }

        // 管理者情報を読み込み
        const adminConfig = await loadAdminConfig();

        // アカウントロックのチェック
        if (isAccountLocked(adminConfig)) {
            const lockTime = new Date(adminConfig.lockedUntil);
            const remainingMinutes = Math.ceil((lockTime - new Date()) / 1000 / 60);
            return res.status(429).json({ 
                error: `アカウントがロックされています。${remainingMinutes}分後に再試行してください。` 
            });
        }

        // ユーザー名の確認
        if (username !== adminConfig.username) {
            // ログイン失敗をカウント
            adminConfig.loginAttempts = (adminConfig.loginAttempts || 0) + 1;
            
            // 5回失敗したら30分間ロック
            if (adminConfig.loginAttempts >= 5) {
                adminConfig.lockedUntil = new Date(Date.now() + 30 * 60 * 1000).toISOString();
            }
            
            await saveAdminConfig(adminConfig);
            
            return res.status(401).json({ 
                error: 'ユーザー名またはパスワードが正しくありません' 
            });
        }

        // パスワードの確認
        const isValidPassword = await bcrypt.compare(password, adminConfig.password);
        
        if (!isValidPassword) {
            // ログイン失敗をカウント
            adminConfig.loginAttempts = (adminConfig.loginAttempts || 0) + 1;
            
            // 5回失敗したら30分間ロック
            if (adminConfig.loginAttempts >= 5) {
                adminConfig.lockedUntil = new Date(Date.now() + 30 * 60 * 1000).toISOString();
            }
            
            await saveAdminConfig(adminConfig);
            
            return res.status(401).json({ 
                error: 'ユーザー名またはパスワードが正しくありません' 
            });
        }

        // ログイン成功
        adminConfig.loginAttempts = 0;
        adminConfig.lockedUntil = null;
        adminConfig.lastLogin = new Date().toISOString();
        await saveAdminConfig(adminConfig);

        // JWTトークンの生成
        const token = jwt.sign(
            { 
                username: adminConfig.username,
                loginTime: new Date().toISOString()
            },
            JWT_SECRET,
            { 
                expiresIn: remember ? '7d' : TOKEN_EXPIRY 
            }
        );

        // ログ記録
        const logEntry = {
            event: 'admin_login',
            username: adminConfig.username,
            ip: req.headers['x-forwarded-for'] || req.connection.remoteAddress,
            userAgent: req.headers['user-agent'],
            timestamp: new Date().toISOString()
        };
        
        const logsDir = path.join(process.cwd(), 'logs');
        await fs.mkdir(logsDir, { recursive: true });
        
        const logFile = path.join(logsDir, `login-${new Date().toISOString().split('T')[0]}.log`);
        await fs.appendFile(logFile, JSON.stringify(logEntry) + '\n');

        res.status(200).json({ 
            success: true,
            token,
            username: adminConfig.username,
            message: 'ログインに成功しました'
        });

    } catch (error) {
        console.error('Login error:', error);
        res.status(500).json({ 
            error: 'ログイン処理中にエラーが発生しました' 
        });
    }
};