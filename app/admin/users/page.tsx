# page.tsx を作成（長いので2パートに分割）
@"
'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';

interface User {
  username: string;
  role: 'admin' | 'viewer';
  createdAt: string;
}

export default function UsersPage() {
  const router = useRouter();
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [showAddForm, setShowAddForm] = useState(false);
  const [editingUser, setEditingUser] = useState<string | null>(null);
  
  // フォーム状態
  const [formData, setFormData] = useState({
    username: '',
    password: '',
    role: 'viewer' as 'admin' | 'viewer'
  });

  // 認証チェック
  useEffect(() => {
    const token = localStorage.getItem('adminToken');
    if (!token) {
      router.push('/admin/login');
      return;
    }
    fetchUsers();
  }, []);

  // ユーザー一覧取得
  const fetchUsers = async () => {
    try {
      const token = localStorage.getItem('adminToken');
      const response = await fetch(\`/api/admin/users?token=\${token}\`);
      
      if (response.status === 401 || response.status === 403) {
        localStorage.removeItem('adminToken');
        router.push('/admin/login');
        return;
      }

      if (!response.ok) {
        throw new Error('ユーザー一覧の取得に失敗しました');
      }

      const data = await response.json();
      setUsers(data.users || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'エラーが発生しました');
    } finally {
      setLoading(false);
    }
  };

  // ユーザー追加
  const handleAddUser = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    try {
      const token = localStorage.getItem('adminToken');
      const response = await fetch(\`/api/admin/users?token=\${token}\`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData)
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'ユーザーの作成に失敗しました');
      }

      // 成功したらリセット
      setFormData({ username: '', password: '', role: 'viewer' });
      setShowAddForm(false);
      fetchUsers();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'エラーが発生しました');
    }
  };

  // ユーザー編集
  const handleEditUser = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    try {
      const token = localStorage.getItem('adminToken');
      const response = await fetch(\`/api/admin/users?token=\${token}\`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          username: editingUser,
          password: formData.password || undefined,
          role: formData.role
        })
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'ユーザーの更新に失敗しました');
      }

      // 成功したらリセット
      setFormData({ username: '', password: '', role: 'viewer' });
      setEditingUser(null);
      fetchUsers();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'エラーが発生しました');
    }
  };

  // ユーザー削除
  const handleDeleteUser = async (username: string) => {
    if (!confirm(\`ユーザー「\${username}」を削除しますか？\`)) {
      return;
    }

    setError('');

    try {
      const token = localStorage.getItem('adminToken');
      const response = await fetch(\`/api/admin/users?token=\${token}\`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username })
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'ユーザーの削除に失敗しました');
      }

      fetchUsers();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'エラーが発生しました');
    }
  };

  // 編集開始
  const startEdit = (user: User) => {
    setEditingUser(user.username);
    setFormData({
      username: user.username,
      password: '',
      role: user.role
    });
    setShowAddForm(false);
  };

  // キャンセル
  const handleCancel = () => {
    setFormData({ username: '', password: '', role: 'viewer' });
    setShowAddForm(false);
    setEditingUser(null);
  };

  // ログアウト
  const handleLogout = () => {
    localStorage.removeItem('adminToken');
    router.push('/admin/login');
  };

  if (loading) {
    return (
      <div className=\"min-h-screen bg-gray-50 flex items-center justify-center\">
        <div className=\"text-gray-600\">読み込み中...</div>
      </div>
    );
  }

  const adminCount = users.filter(u => u.role === 'admin').length;
  const viewerCount = users.filter(u => u.role === 'viewer').length;
"@ | Out-File -FilePath "app\admin\users\page.tsx" -Encoding UTF8 -NoNewline
# page.tsx の続きを追記
@"

  return (
    <div className=\"min-h-screen bg-gray-50\">
      {/* ヘッダー */}
      <div className=\"bg-white shadow\">
        <div className=\"max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4 flex justify-between items-center\">
          <h1 className=\"text-2xl font-bold text-gray-900\">アカウント管理</h1>
          <div className=\"flex gap-4\">
            <button
              onClick={() => router.push('/admin/logs')}
              className=\"px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50\"
            >
              ログ管理
            </button>
            <button
              onClick={handleLogout}
              className=\"px-4 py-2 text-sm font-medium text-white bg-red-600 rounded-md hover:bg-red-700\"
            >
              ログアウト
            </button>
          </div>
        </div>
      </div>

      <div className=\"max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8\">
        {/* エラー表示 */}
        {error && (
          <div className=\"mb-4 p-4 bg-red-50 border border-red-200 rounded-md\">
            <p className=\"text-sm text-red-600\">{error}</p>
          </div>
        )}

        {/* 統計カード */}
        <div className=\"grid grid-cols-1 md:grid-cols-3 gap-4 mb-6\">
          <div className=\"bg-white p-6 rounded-lg shadow\">
            <div className=\"text-sm text-gray-500\">総ユーザー数</div>
            <div className=\"text-3xl font-bold text-gray-900\">{users.length}</div>
          </div>
          <div className=\"bg-white p-6 rounded-lg shadow\">
            <div className=\"text-sm text-gray-500\">管理者</div>
            <div className=\"text-3xl font-bold text-blue-600\">{adminCount}</div>
          </div>
          <div className=\"bg-white p-6 rounded-lg shadow\">
            <div className=\"text-sm text-gray-500\">閲覧者</div>
            <div className=\"text-3xl font-bold text-green-600\">{viewerCount}</div>
          </div>
        </div>

        {/* 新規追加ボタン */}
        {!showAddForm && !editingUser && (
          <div className=\"mb-6\">
            <button
              onClick={() => setShowAddForm(true)}
              className=\"px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-md hover:bg-blue-700\"
            >
              + 新規ユーザー追加
            </button>
          </div>
        )}

        {/* 追加フォーム */}
        {showAddForm && (
          <div className=\"bg-white p-6 rounded-lg shadow mb-6\">
            <h2 className=\"text-lg font-semibold mb-4\">新規ユーザー追加</h2>
            <form onSubmit={handleAddUser} className=\"space-y-4\">
              <div>
                <label className=\"block text-sm font-medium text-gray-700 mb-1\">
                  ユーザー名
                </label>
                <input
                  type=\"text\"
                  required
                  value={formData.username}
                  onChange={(e) => setFormData({ ...formData, username: e.target.value })}
                  className=\"w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500\"
                />
              </div>
              <div>
                <label className=\"block text-sm font-medium text-gray-700 mb-1\">
                  パスワード
                </label>
                <input
                  type=\"password\"
                  required
                  value={formData.password}
                  onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                  className=\"w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500\"
                />
              </div>
              <div>
                <label className=\"block text-sm font-medium text-gray-700 mb-1\">
                  権限
                </label>
                <select
                  value={formData.role}
                  onChange={(e) => setFormData({ ...formData, role: e.target.value as 'admin' | 'viewer' })}
                  className=\"w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500\"
                >
                  <option value=\"viewer\">閲覧者</option>
                  <option value=\"admin\">管理者</option>
                </select>
              </div>
              <div className=\"flex gap-2\">
                <button
                  type=\"submit\"
                  className=\"px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-md hover:bg-blue-700\"
                >
                  追加
                </button>
                <button
                  type=\"button\"
                  onClick={handleCancel}
                  className=\"px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50\"
                >
                  キャンセル
                </button>
              </div>
            </form>
          </div>
        )}

        {/* 編集フォーム */}
        {editingUser && (
          <div className=\"bg-white p-6 rounded-lg shadow mb-6\">
            <h2 className=\"text-lg font-semibold mb-4\">ユーザー編集: {editingUser}</h2>
            <form onSubmit={handleEditUser} className=\"space-y-4\">
              <div>
                <label className=\"block text-sm font-medium text-gray-700 mb-1\">
                  新しいパスワード（変更する場合のみ）
                </label>
                <input
                  type=\"password\"
                  value={formData.password}
                  onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                  className=\"w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500\"
                  placeholder=\"変更しない場合は空欄\"
                />
              </div>
              <div>
                <label className=\"block text-sm font-medium text-gray-700 mb-1\">
                  権限
                </label>
                <select
                  value={formData.role}
                  onChange={(e) => setFormData({ ...formData, role: e.target.value as 'admin' | 'viewer' })}
                  className=\"w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500\"
                >
                  <option value=\"viewer\">閲覧者</option>
                  <option value=\"admin\">管理者</option>
                </select>
              </div>
              <div className=\"flex gap-2\">
                <button
                  type=\"submit\"
                  className=\"px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-md hover:bg-blue-700\"
                >
                  更新
                </button>
                <button
                  type=\"button\"
                  onClick={handleCancel}
                  className=\"px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50\"
                >
                  キャンセル
                </button>
              </div>
            </form>
          </div>
        )}

        {/* ユーザー一覧テーブル */}
        <div className=\"bg-white rounded-lg shadow overflow-hidden\">
          <table className=\"min-w-full divide-y divide-gray-200\">
            <thead className=\"bg-gray-50\">
              <tr>
                <th className=\"px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider\">
                  ユーザー名
                </th>
                <th className=\"px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider\">
                  権限
                </th>
                <th className=\"px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider\">
                  作成日時
                </th>
                <th className=\"px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider\">
                  操作
                </th>
              </tr>
            </thead>
            <tbody className=\"bg-white divide-y divide-gray-200\">
              {users.map((user) => (
                <tr key={user.username}>
                  <td className=\"px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900\">
                    {user.username}
                  </td>
                  <td className=\"px-6 py-4 whitespace-nowrap text-sm text-gray-500\">
                    <span className={\`px-2 py-1 text-xs rounded-full \${
                      user.role === 'admin' 
                        ? 'bg-blue-100 text-blue-800' 
                        : 'bg-green-100 text-green-800'
                    }\`}>
                      {user.role === 'admin' ? '管理者' : '閲覧者'}
                    </span>
                  </td>
                  <td className=\"px-6 py-4 whitespace-nowrap text-sm text-gray-500\">
                    {new Date(user.createdAt).toLocaleString('ja-JP')}
                  </td>
                  <td className=\"px-6 py-4 whitespace-nowrap text-right text-sm font-medium\">
                    <button
                      onClick={() => startEdit(user)}
                      className=\"text-blue-600 hover:text-blue-900 mr-4\"
                    >
                      編集
                    </button>
                    <button
                      onClick={() => handleDeleteUser(user.username)}
                      className=\"text-red-600 hover:text-red-900\"
                    >
                      削除
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
"@ | Out-File -FilePath "app\admin\users\page.tsx" -Encoding UTF8 -Append -NoNewline