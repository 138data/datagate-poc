import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import fs from 'fs/promises';
import path from 'path';
import { v4 as uuidv4 } from 'uuid';

const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key-change-in-production';

export default async function handler(req, res) {
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    try {
        // 認証チェック
        const token = req.headers.authorization?.split(' ')[1];
        if (!token) {
            return res.status(401).json({ error: '認証が必要です' });
        }

        // トークン検証
        let adminData;
        try {
            adminData = jwt.verify(token, JWT_SECRET);
        } catch (error) {
            return res.status(401).json({ error: 'トークンが無効です' });
        }

        // リクエストボディの検証
        const { username, email, fullName, department, role, status, password } = req.body;

        if (!username || !email || !fullName || !role || !status || !password) {
            return res.status(400).json({ error: '必須項目が不足しています' });
        }

        // メールアドレスの形式検証
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(email)) {
            return res.status(400).json({ error: 'メールアドレスの形式が正しくありません' });
        }

        // ロールの検証
        const validRoles = ['admin', 'manager', 'user'];
        if (!validRoles.includes(role)) {
            return res.status(400).json({ error: '無効なロールです' });
        }

        // ステータスの検証
        const validStatuses = ['active', 'inactive'];
        if (!validStatuses.includes(status)) {
            return res.status(400).json({ error: '無効なステータスです' });
        }

        // ユーザーデータを読み込む
        const usersPath = path.join(process.cwd(), 'users.json');
        let usersData = { users: [] };

        try {
            const data = await fs.readFile(usersPath, 'utf-8');
            usersData = JSON.parse(data);
        } catch (error) {
            // ファイルが存在しない場合は新規作成
        }

        // 重複チェック
        const existingUser = usersData.users.find(
            u => u.username === username || u.email === email
        );

        if (existingUser) {
            if (existingUser.username === username) {
                return res.status(400).json({ error: 'このユーザー名は既に使用されています' });
            }
            if (existingUser.email === email) {
                return res.status(400).json({ error: 'このメールアドレスは既に登録されています' });
            }
        }

        // パスワードをハッシュ化
        const hashedPassword = await bcrypt.hash(password, 10);

        // 新しいユーザーを作成
        const newUser = {
            id: `usr_${uuidv4().substring(0, 8)}`,
            username,
            email,
            fullName,
            department: department || '',
            role,
            status,
            password: hashedPassword,
            lastLogin: null,
            createdAt: new Date().toISOString(),
            createdBy: adminData.username
        };

        // ユーザーを追加
        usersData.users.push(newUser);

        // ファイルに保存
        await fs.writeFile(usersPath, JSON.stringify(usersData, null, 2));

        // パスワードを除外して返す
        const { password: _, ...userWithoutPassword } = newUser;

        return res.status(201).json({
            message: 'ユーザーが作成されました',
            user: userWithoutPassword
        });

    } catch (error) {
        console.error('ユーザー作成エラー:', error);
        return res.status(500).json({ error: 'サーバーエラーが発生しました' });
    }
}