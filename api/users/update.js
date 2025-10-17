import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import fs from 'fs/promises';
import path from 'path';

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
        const { id, username, email, fullName, department, role, status, password } = req.body;

        if (!id || !username || !email || !fullName || !role || !status) {
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
        let usersData;

        try {
            const data = await fs.readFile(usersPath, 'utf-8');
            usersData = JSON.parse(data);
        } catch (error) {
            return res.status(404).json({ error: 'ユーザーデータが見つかりません' });
        }

        // 対象ユーザーを検索
        const userIndex = usersData.users.findIndex(u => u.id === id);
        if (userIndex === -1) {
            return res.status(404).json({ error: 'ユーザーが見つかりません' });
        }

        // 重複チェック（自分以外）
        const duplicateUser = usersData.users.find(
            u => u.id !== id && (u.username === username || u.email === email)
        );

        if (duplicateUser) {
            if (duplicateUser.username === username) {
                return res.status(400).json({ error: 'このユーザー名は既に使用されています' });
            }
            if (duplicateUser.email === email) {
                return res.status(400).json({ error: 'このメールアドレスは既に登録されています' });
            }
        }

        // 既存のユーザー情報を更新
        const existingUser = usersData.users[userIndex];
        const updatedUser = {
            ...existingUser,
            username,
            email,
            fullName,
            department: department || '',
            role,
            status,
            updatedAt: new Date().toISOString(),
            updatedBy: adminData.username
        };

        // パスワードが指定されている場合は更新
        if (password && password.trim() !== '') {
            updatedUser.password = await bcrypt.hash(password, 10);
        }

        // ユーザー情報を更新
        usersData.users[userIndex] = updatedUser;

        // ファイルに保存
        await fs.writeFile(usersPath, JSON.stringify(usersData, null, 2));

        // パスワードを除外して返す
        const { password: _, ...userWithoutPassword } = updatedUser;

        return res.status(200).json({
            message: 'ユーザー情報が更新されました',
            user: userWithoutPassword
        });

    } catch (error) {
        console.error('ユーザー更新エラー:', error);
        return res.status(500).json({ error: 'サーバーエラーが発生しました' });
    }
}