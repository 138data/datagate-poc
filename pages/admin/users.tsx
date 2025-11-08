import { useState, useEffect } from 'react';
import { useRouter } from 'next/router';

interface User {
  username: string;
  role: 'admin' | 'viewer';
  createdAt: string;
}

interface Stats {
  totalUsers: number;
  adminCount: number;
  viewerCount: number;
}

export default function AdminUsersPage() {
  const router = useRouter();
  const [users, setUsers] = useState<User[]>([]);
  const [stats, setStats] = useState<Stats>({ totalUsers: 0, adminCount: 0, viewerCount: 0 });
  const [loading, setLoading] = useState(true);
  const [showAddModal, setShowAddModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [editingUser, setEditingUser] = useState<User | null>(null);
  const [formData, setFormData] = useState({ username: '', password: '', role: 'viewer' as 'admin' | 'viewer' });
  const [error, setError] = useState('');

  useEffect(() => {
    checkAuth();
    fetchUsers();
  }, []);

  const checkAuth = () => {
    const token = localStorage.getItem('admin_token');
    const expires = localStorage.getItem('admin_token_expires');
    if (!token || !expires || Date.now() > Number(expires)) {
      router.push('/admin/login');
    }
  };

  const fetchUsers = async () => {
    try {
      const token = localStorage.getItem('admin_token');
      const response = await fetch(`/api/admin/users?token=${token}`);

      if (response.status === 401 || response.status === 403) {
        localStorage.removeItem('admin_token');
        localStorage.removeItem('admin_token_expires');
        router.push('/admin/login');
        return;
      }

      if (!response.ok) {
        throw new Error('ユーザー情報の取得に失敗しました');
      }

      const data = await response.json();
      setUsers(data.users || []);

      const adminCount = data.users.filter((u: User) => u.role === 'admin').length;
      const viewerCount = data.users.filter((u: User) => u.role === 'viewer').length;
      setStats({
        totalUsers: data.users.length,
        adminCount,
        viewerCount,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'エラーが発生しました');
    } finally {
      setLoading(false);
    }
  };

  const handleAddUser = async () => {
    try {
      const token = localStorage.getItem('admin_token');
      const response = await fetch(`/api/admin/users?token=${token}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'ユーザーの追加に失敗しました');
      }

      setShowAddModal(false);
      setFormData({ username: '', password: '', role: 'viewer' });
      setError('');
      fetchUsers();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'エラーが発生しました');
    }
  };

  const handleEditUser = async () => {
    try {
      const token = localStorage.getItem('admin_token');
      const response = await fetch(`/api/admin/users?token=${token}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          username: editingUser?.username,
          password: formData.password || undefined,
          role: formData.role,
        }),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'ユーザーの更新に失敗しました');
      }

      setShowEditModal(false);
      setEditingUser(null);
      setFormData({ username: '', password: '', role: 'viewer' });
      setError('');
      fetchUsers();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'エラーが発生しました');
    }
  };

  const handleDeleteUser = async (username: string) => {
      if (!confirm(`ユーザー「${username}」を削除しますか？`)) {
      return;
    }

    try {
      const token = localStorage.getItem('admin_token');
      const response = await fetch(`/api/admin/users?token=${token}`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username }),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'ユーザーの削除に失敗しました');
      }

      setError('');
      fetchUsers();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'エラーが発生しました');
    }
  };

  const handleLogout = () => {
    localStorage.removeItem('admin_token');
    localStorage.removeItem('admin_token_expires');
    router.push('/admin/login');
  };

  const openEditModal = (user: User) => {
    setEditingUser(user);
    setFormData({ username: user.username, password: '', role: user.role });
    setShowEditModal(true);
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-600 mx-auto mb-4"></div>
          <p className="text-gray-600">ユーザー情報を読み込み中...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* ヘッダー */}
      <div className="bg-white shadow">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center py-6">
            <div className="flex items-center space-x-4">
              <h1 className="text-3xl font-bold text-gray-900">ユーザー管理</h1>
              <button
                onClick={handleLogout}
                className="bg-red-600 hover:bg-red-700 text-white px-4 py-2 rounded-md text-sm font-medium"
              >
                ログアウト
              </button>
            </div>
            <button
              onClick={() => setShowAddModal(true)}
              className="bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2 rounded-md text-sm font-medium"
            >
              ユーザー追加
            </button>
          </div>
        </div>
      </div>

      {/* 統計カード */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="bg-white rounded-lg shadow p-4">
            <p className="text-sm text-gray-600 mb-1">総ユーザー数</p>
            <p className="text-2xl font-bold text-gray-900">{stats.totalUsers}</p>
          </div>
          <div className="bg-white rounded-lg shadow p-4">
            <p className="text-sm text-gray-600 mb-1">管理者</p>
            <p className="text-2xl font-bold text-purple-600">{stats.adminCount}</p>
          </div>
          <div className="bg-white rounded-lg shadow p-4">
            <p className="text-sm text-gray-600 mb-1">閲覧者</p>
            <p className="text-2xl font-bold text-blue-600">{stats.viewerCount}</p>
          </div>
        </div>
      </div>

      {/* エラー表示 */}
      {error && (
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 mb-6">
          <div className="bg-red-50 border border-red-200 rounded-lg p-4">
            <p className="text-red-600">{error}</p>
          </div>
        </div>
      )}

      {/* ユーザーテーブル */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="bg-white rounded-lg shadow overflow-hidden">
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    ユーザー名
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    権限
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    作成日
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    アクション
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {users.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="px-4 py-8 text-center text-gray-500">
                      ユーザーが見つかりません
                    </td>
                  </tr>
                ) : (
                  users.map((user) => (
                    <tr key={user.username} className="hover:bg-gray-50">
                      <td className="px-4 py-3 text-sm text-gray-900">
                        {user.username}
                      </td>
                      <td className="px-4 py-3 text-sm">
                        <span className={`px-2 py-1 text-xs rounded-full ${
                          user.role === 'admin' ? 'bg-purple-100 text-purple-800' : 'bg-blue-100 text-blue-800'
                        }`}>
                          {user.role === 'admin' ? '管理者' : '閲覧者'}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-700">
                        {new Date(user.createdAt).toLocaleDateString('ja-JP')}
                      </td>
                      <td className="px-4 py-3 text-sm font-medium">
                        <div className="flex space-x-2">
                          <button
                            onClick={() => openEditModal(user)}
                            disabled={user.username === 'admin'}
                            className="text-indigo-600 hover:text-indigo-900 disabled:opacity-50 disabled:cursor-not-allowed"
                          >
                            編集
                          </button>
                          <button
                            onClick={() => handleDeleteUser(user.username)}
                            disabled={user.username === 'admin'}
                            className="text-red-600 hover:text-red-900 disabled:opacity-50 disabled:cursor-not-allowed"
                          >
                            削除
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* 追加モーダル */}
      {showAddModal && (
        <div className="fixed inset-0 bg-gray-600 bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 max-w-md w-full">
            <h3 className="text-lg font-medium text-gray-900 mb-4">ユーザー追加</h3>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  ユーザー名
                </label>
                <input
                  type="text"
                  value={formData.username}
                  onChange={(e) => setFormData({ ...formData, username: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-indigo-500 focus:border-indigo-500"
                  placeholder="ユーザー名を入力"
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  パスワード
                </label>
                <input
                  type="password"
                  value={formData.password}
                  onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-indigo-500 focus:border-indigo-500"
                  placeholder="パスワードを入力"
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  権限
                </label>
                <select
                  value={formData.role}
                  onChange={(e) => setFormData({ ...formData, role: e.target.value as 'admin' | 'viewer' })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-indigo-500 focus:border-indigo-500"
                >
                  <option value="viewer">閲覧者</option>
                  <option value="admin">管理者</option>
                </select>
              </div>
            </div>
            <div className="mt-6 flex justify-end gap-3">
              <button
                onClick={() => {
                  setShowAddModal(false);
                  setError('');
                }}
                className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50"
              >
                キャンセル
              </button>
              <button
                onClick={handleAddUser}
                className="px-4 py-2 text-sm font-medium text-white bg-indigo-600 rounded-md hover:bg-indigo-700"
              >
                追加
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 編集モーダル */}
      {showEditModal && (
        <div className="fixed inset-0 bg-gray-600 bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 max-w-md w-full">
            <h3 className="text-lg font-medium text-gray-900 mb-4">ユーザー編集</h3>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  ユーザー名
                </label>
                <input
                  type="text"
                  value={editingUser?.username}
                  disabled
                  className="w-full px-3 py-2 border border-gray-300 rounded-md bg-gray-100"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  新しいパスワード（変更する場合のみ）
                </label>
                <input
                  type="password"
                  value={formData.password}
                  onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-indigo-500 focus:border-indigo-500"
                  placeholder="変更しない場合は空欄"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  権限
                </label>
                <select
                  value={formData.role}
                  onChange={(e) => setFormData({ ...formData, role: e.target.value as 'admin' | 'viewer' })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-indigo-500 focus:border-indigo-500"
                  disabled={editingUser?.username === 'admin'}
                >
                  <option value="viewer">閲覧者</option>
                  <option value="admin">管理者</option>
                </select>
              </div>
            </div>
            <div className="mt-6 flex justify-end gap-3">
              <button
                onClick={() => {
                  setShowEditModal(false);
                  setEditingUser(null);
                  setError('');
                }}
                className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50"
              >
                キャンセル
              </button>
              <button
                onClick={handleEditUser}
                className="px-4 py-2 text-sm font-medium text-white bg-indigo-600 rounded-md hover:bg-indigo-700"
              >
                更新
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}