import jwt from 'jsonwebtoken';
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
        const { id } = req.body;

        if (!id) {
            return res.status(400).json({ error: 'ユーザーIDが必要です' });
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

        // 削除するユーザーの情報を保存（ログ用）
        const deletedUser = usersData.users[userIndex];
        
        // 自分自身は削除できない
        if (deletedUser.username === adminData.username) {
            return res.status(400).json({ error: '自分自身は削除できません' });
        }

        // ユーザーを削除
        usersData.users.splice(userIndex, 1);

        // ファイルに保存
        await fs.writeFile(usersPath, JSON.stringify(usersData, null, 2));

        // 削除ログを記録（将来の実装のため）
        const logEntry = {
            action: 'USER_DELETED',
            targetUser: deletedUser.username,
            deletedBy: adminData.username,
            timestamp: new Date().toISOString()
        };
        console.log('削除ログ:', logEntry);

        return res.status(200).json({
            message: 'ユーザーが削除されました',
            deletedUserId: id
        });

    } catch (error) {
        console.error('ユーザー削除エラー:', error);
        return res.status(500).json({ error: 'サーバーエラーが発生しました' });
    }
}