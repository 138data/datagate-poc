import jwt from 'jsonwebtoken';
import fs from 'fs/promises';
import path from 'path';

const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key-change-in-production';

export default async function handler(req, res) {
    if (req.method !== 'GET') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    try {
        // 認証チェック
        const token = req.headers.authorization?.split(' ')[1];
        if (!token) {
            return res.status(401).json({ error: '認証が必要です' });
        }

        // トークン検証
        try {
            jwt.verify(token, JWT_SECRET);
        } catch (error) {
            return res.status(401).json({ error: 'トークンが無効です' });
        }

        // ユーザーデータを読み込む
        const usersPath = path.join(process.cwd(), 'users.json');
        
        try {
            const data = await fs.readFile(usersPath, 'utf-8');
            const usersData = JSON.parse(data);
            
            // パスワードを除外して返す
            const sanitizedUsers = usersData.users.map(user => {
                const { password, ...userWithoutPassword } = user;
                return userWithoutPassword;
            });

            return res.status(200).json({ 
                users: sanitizedUsers,
                total: sanitizedUsers.length
            });
        } catch (error) {
            // ファイルが存在しない場合は空配列を返す
            return res.status(200).json({ 
                users: [],
                total: 0
            });
        }
    } catch (error) {
        console.error('ユーザー一覧取得エラー:', error);
        return res.status(500).json({ error: 'サーバーエラーが発生しました' });
    }
}