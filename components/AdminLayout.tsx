// components/AdminLayout.tsx
import { ReactNode, useEffect, useState } from 'react';
import { useRouter } from 'next/router';
import Link from 'next/link';
import { jwtDecode } from 'jwt-decode';

interface AdminLayoutProps {
  children: ReactNode;
  title: string;
}

interface JwtPayload {
  username: string;
  role: 'admin' | 'viewer';
  exp: number;
}

export default function AdminLayout({ children, title }: AdminLayoutProps) {
  const router = useRouter();
  const currentPath = router.pathname;
  const [userRole, setUserRole] = useState<'admin' | 'viewer'>('viewer');
  const [username, setUsername] = useState<string>('');

  useEffect(() => {
    checkAuth();
  }, []);

  const checkAuth = () => {
    const token = localStorage.getItem('admin_token');
    const expires = localStorage.getItem('admin_token_expires');

    if (!token || !expires || Date.now() > Number(expires)) {
      router.push('/admin/login');
      return;
    }

    // JWT トークンからロール情報を取得
    try {
      const decoded = jwtDecode<JwtPayload>(token);
      setUserRole(decoded.role);
      setUsername(decoded.username);
    } catch (error) {
      console.error('JWT デコードエラー:', error);
      // トークンが不正な場合はログイン画面へ
      localStorage.removeItem('admin_token');
      localStorage.removeItem('admin_token_expires');
      router.push('/admin/login');
    }
  };

  const handleLogout = () => {
    localStorage.removeItem('admin_token');
    localStorage.removeItem('admin_token_expires');
    router.push('/admin/login');
  };

  const isActive = (path: string) => {
    return currentPath === path;
  };

  return (
    <div className="min-h-screen bg-gray-50">
      {/* ナビゲーションヘッダー */}
      <nav className="bg-white shadow-sm border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-16">
            {/* 左側: ロゴとナビゲーションリンク */}
            <div className="flex items-center space-x-8">
              <div className="flex-shrink-0">
                <h1 className="text-xl font-bold text-indigo-600">
                  DataGate 管理画面
                </h1>
              </div>
              <div className="hidden md:flex space-x-4">
                {/* 管理者のみダッシュボードを表示 */}
                {userRole === 'admin' && (
                  <Link
                    href="/admin/dashboard"
                    className={`px-3 py-2 rounded-md text-sm font-medium transition-colors ${
                      isActive('/admin/dashboard')
                        ? 'bg-indigo-100 text-indigo-700 border-b-2 border-indigo-600'
                        : 'text-gray-700 hover:bg-gray-100 hover:text-gray-900'
                    }`}
                  >
                    📈 KPI ダッシュボード
                  </Link>
                )}

                <Link
                  href="/admin/logs"
                  className={`px-3 py-2 rounded-md text-sm font-medium transition-colors ${
                    isActive('/admin/logs')
                      ? 'bg-indigo-100 text-indigo-700 border-b-2 border-indigo-600'
                      : 'text-gray-700 hover:bg-gray-100 hover:text-gray-900'
                  }`}
                >
                  📊 監査ログ
                </Link>

                {/* 管理者のみユーザー管理を表示 */}
                {userRole === 'admin' && (
                  <Link
                    href="/admin/users"
                    className={`px-3 py-2 rounded-md text-sm font-medium transition-colors ${
                      isActive('/admin/users')
                        ? 'bg-indigo-100 text-indigo-700 border-b-2 border-indigo-600'
                        : 'text-gray-700 hover:bg-gray-100 hover:text-gray-900'
                    }`}
                  >
                    👥 ユーザー管理
                  </Link>
                )}
              </div>
            </div>

            {/* 右側: ユーザー情報とログアウトボタン */}
            <div className="flex items-center space-x-4">
              <div className="hidden md:flex flex-col items-end">
                <span className="text-sm font-medium text-gray-700">{username}</span>
                <span className="text-xs text-gray-500">
                  {userRole === 'admin' ? '管理者' : '閲覧者'}
                </span>
              </div>
              <button
                onClick={handleLogout}
                className="bg-red-600 hover:bg-red-700 text-white px-4 py-2 rounded-md text-sm font-medium transition-colors"
              >
                ログアウト
              </button>
            </div>
          </div>
        </div>

        {/* モバイル用ナビゲーション */}
        <div className="md:hidden border-t border-gray-200">
          <div className="px-2 pt-2 pb-3 space-y-1">
            {/* 管理者のみダッシュボードを表示 */}
            {userRole === 'admin' && (
              <Link
                href="/admin/dashboard"
                className={`block px-3 py-2 rounded-md text-base font-medium ${
                  isActive('/admin/dashboard')
                    ? 'bg-indigo-100 text-indigo-700'
                    : 'text-gray-700 hover:bg-gray-100'
                }`}
              >
                📈 KPI ダッシュボード
              </Link>
            )}

            <Link
              href="/admin/logs"
              className={`block px-3 py-2 rounded-md text-base font-medium ${
                isActive('/admin/logs')
                  ? 'bg-indigo-100 text-indigo-700'
                  : 'text-gray-700 hover:bg-gray-100'
              }`}
            >
              📊 監査ログ
            </Link>

            {/* 管理者のみユーザー管理を表示 */}
            {userRole === 'admin' && (
              <Link
                href="/admin/users"
                className={`block px-3 py-2 rounded-md text-base font-medium ${
                  isActive('/admin/users')
                    ? 'bg-indigo-100 text-indigo-700'
                    : 'text-gray-700 hover:bg-gray-100'
                }`}
              >
                👥 ユーザー管理
              </Link>
            )}
          </div>
        </div>
      </nav>

      {/* ページタイトル */}
      <div className="bg-white shadow">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
          <h1 className="text-3xl font-bold text-gray-900">{title}</h1>
        </div>
      </div>

      {/* メインコンテンツ */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        {children}
      </main>
    </div>
  );
}
