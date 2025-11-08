import { useState, useEffect } from 'react';
import { useRouter } from 'next/router';

interface LogEntry {
  ts: string;
  event: string;
  fileId?: string;
  fileName?: string;
  fileSize?: number;
  to?: string;
  mode?: string;
  reason?: string;
  status?: string;
}

const EVENT_LABELS: Record<string, string> = {
  email_send: 'メール送信',
  file_upload: 'ファイルアップロード',
  download: 'ダウンロード',
  otp_verified: 'OTP検証',
  file_revoked: 'ファイル失効',
};

const MODE_LABELS: Record<string, string> = {
  link: 'リンク送付',
  attach: '添付直送',
  blocked: 'ブロック',
};

const STATUS_LABELS: Record<string, string> = {
  success: '成功',
  error: 'エラー',
  warning: '警告',
};

export default function AdminLogsPage() {
  const router = useRouter();
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [filterEvent, setFilterEvent] = useState('');
  const [filterStatus, setFilterStatus] = useState('');
  const [downloadingCsv, setDownloadingCsv] = useState(false);

  useEffect(() => {
    checkAuth();
    fetchLogs();
  }, []);

  const checkAuth = () => {
    const token = localStorage.getItem('admin_token');
    const expires = localStorage.getItem('admin_token_expires');

    if (!token || !expires || Date.now() > Number(expires)) {
      router.push('/admin/login');
    }
  };

  const fetchLogs = async () => {
    try {
      const token = localStorage.getItem('admin_token');
      if (!token) {
        router.push('/admin/login');
        return;
      }

      const response = await fetch('/api/admin/logs?format=json&limit=100', {
        headers: {
          'Authorization': `Bearer ${token}`,
        },
      });

      if (!response.ok) {
        if (response.status === 401) {
          localStorage.removeItem('admin_token');
          localStorage.removeItem('admin_token_expires');
          router.push('/admin/login');
          return;
        }
        throw new Error('ログの取得に失敗しました');
      }

      const data = await response.json();
      setLogs(data.logs || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'エラーが発生しました');
    } finally {
      setLoading(false);
    }
  };

  const handleDownloadCsv = async () => {
    setDownloadingCsv(true);
    try {
      const token = localStorage.getItem('admin_token');
      if (!token) {
        router.push('/admin/login');
        return;
      }

      const response = await fetch('/api/admin/logs?format=csv', {
        headers: {
          'Authorization': `Bearer ${token}`,
        },
      });

      if (!response.ok) {
        throw new Error('CSVダウンロードに失敗しました');
      }

      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `audit-logs-${new Date().toISOString().split('T')[0]}.csv`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
    } catch (err) {
      alert(err instanceof Error ? err.message : 'CSVダウンロードに失敗しました');
    } finally {
      setDownloadingCsv(false);
    }
  };

  const handleLogout = () => {
    localStorage.removeItem('admin_token');
    localStorage.removeItem('admin_token_expires');
    router.push('/admin/login');
  };

  const filteredLogs = logs.filter(log => {
    if (filterEvent && log.event !== filterEvent) return false;
    if (filterStatus && log.status !== filterStatus) return false;
    return true;
  });

  const formatDate = (ts: string) => {
    return new Date(ts).toLocaleString('ja-JP', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
  };

  const formatSize = (bytes?: number) => {
    if (!bytes) return '-';
    if (bytes < 1024) return \\ B\;
    if (bytes < 1024 * 1024) return \\ KB\;
    return \\ MB\;
  };

  if (loading) {
    return (
      <div className=\"min-h-screen flex items-center justify-center bg-gray-50\">
        <div className=\"text-center\">
          <div className=\"animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-600 mx-auto mb-4\"></div>
          <p className=\"text-gray-600\">ログを読み込み中...</p>
        </div>
      </div>
    );
  }

  return (
    <div className=\"min-h-screen bg-gray-50\">
      {/* ヘッダー */}
      <div className=\"bg-white shadow\">
        <div className=\"max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4\">
          <div className=\"flex justify-between items-center\">
            <div>
              <h1 className=\"text-2xl font-bold text-gray-900\">DataGate 管理者</h1>
              <p className=\"text-sm text-gray-600\">ログ管理システム</p>
            </div>
            <div className=\"flex gap-3\">
              <button
                onClick={() => router.push('/admin/users')}
                className=\"px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-md hover:bg-blue-700\"
              >
                アカウント管理
              </button>
              <button
                onClick={handleLogout}
                className=\"px-4 py-2 text-sm text-gray-700 hover:text-gray-900 border border-gray-300 rounded-md hover:bg-gray-50\"
              >
                ログアウト
              </button>
            </div>
          </div>
        </div>
      </div>

      <div className=\"max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8\">
        {/* フィルター & アクション */}
        <div className=\"bg-white rounded-lg shadow p-4 mb-6\">
          <div className=\"flex flex-wrap gap-4 items-end\">
            <div className=\"flex-1 min-w-[200px]\">
              <label className=\"block text-sm font-medium text-gray-700 mb-1\">
                イベント種別
              </label>
              <select
                value={filterEvent}
                onChange={(e) => setFilterEvent(e.target.value)}
                className=\"w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-indigo-500\"
              >
                <option value=\"\">すべて</option>
                <option value=\"email_send\">メール送信</option>
                <option value=\"file_upload\">ファイルアップロード</option>
                <option value=\"download\">ダウンロード</option>
                <option value=\"otp_verified\">OTP検証</option>
                <option value=\"file_revoked\">ファイル失効</option>
              </select>
            </div>

            <div className=\"flex-1 min-w-[200px]\">
              <label className=\"block text-sm font-medium text-gray-700 mb-1\">
                ステータス
              </label>
              <select
                value={filterStatus}
                onChange={(e) => setFilterStatus(e.target.value)}
                className=\"w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-indigo-500\"
              >
                <option value=\"\">すべて</option>
                <option value=\"success\">成功</option>
                <option value=\"error\">エラー</option>
                <option value=\"warning\">警告</option>
              </select>
            </div>

            <button
              onClick={() => {
                setFilterEvent('');
                setFilterStatus('');
              }}
              className=\"px-4 py-2 text-sm text-gray-700 border border-gray-300 rounded-md hover:bg-gray-50\"
            >
              リセット
            </button>

            <button
              onClick={handleDownloadCsv}
              disabled={downloadingCsv}
              className=\"px-6 py-2 bg-indigo-600 hover:bg-indigo-700 text-white font-medium rounded-md disabled:bg-gray-400 disabled:cursor-not-allowed\"
            >
              {downloadingCsv ? 'ダウンロード中...' : 'CSV ダウンロード'}
            </button>
          </div>
        </div>

        {/* ログ統計 */}
        <div className=\"grid grid-cols-1 md:grid-cols-3 gap-4 mb-6\">
          <div className=\"bg-white rounded-lg shadow p-4\">
            <p className=\"text-sm text-gray-600 mb-1\">総ログ数</p>
            <p className=\"text-2xl font-bold text-gray-900\">{logs.length}</p>
          </div>
          <div className=\"bg-white rounded-lg shadow p-4\">
            <p className=\"text-sm text-gray-600 mb-1\">フィルター後</p>
            <p className=\"text-2xl font-bold text-indigo-600\">{filteredLogs.length}</p>
          </div>
          <div className=\"bg-white rounded-lg shadow p-4\">
            <p className=\"text-sm text-gray-600 mb-1\">成功率</p>
            <p className=\"text-2xl font-bold text-green-600\">
              {logs.length > 0
                ? \\%\
                : '-'}
            </p>
          </div>
        </div>

        {/* エラー表示 */}
        {error && (
          <div className=\"bg-red-50 border border-red-200 rounded-lg p-4 mb-6\">
            <p className=\"text-red-600\">{error}</p>
          </div>
        )}

        {/* ログテーブル */}
        <div className=\"bg-white rounded-lg shadow overflow-hidden\">
          <div className=\"overflow-x-auto\">
            <table className=\"min-w-full divide-y divide-gray-200\">
              <thead className=\"bg-gray-50\">
                <tr>
                  <th className=\"px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider\">
                    日時
                  </th>
                  <th className=\"px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider\">
                    イベント
                  </th>
                  <th className=\"px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider\">
                    ファイル名
                  </th>
                  <th className=\"px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider\">
                    宛先
                  </th>
                  <th className=\"px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider\">
                    配信モード
                  </th>
                  <th className=\"px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider\">
                    サイズ
                  </th>
                  <th className=\"px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider\">
                    ステータス
                  </th>
                </tr>
              </thead>
              <tbody className=\"bg-white divide-y divide-gray-200\">
                {filteredLogs.length === 0 ? (
                  <tr>
                    <td colSpan={7} className=\"px-4 py-8 text-center text-gray-500\">
                      ログが見つかりません
                    </td>
                  </tr>
                ) : (
                  filteredLogs.map((log, index) => (
                    <tr key={index} className=\"hover:bg-gray-50\">
                      <td className=\"px-4 py-3 text-sm text-gray-900 whitespace-nowrap\">
                        {formatDate(log.ts)}
                      </td>
                      <td className=\"px-4 py-3 text-sm text-gray-900\">
                        {EVENT_LABELS[log.event] || log.event}
                      </td>
                      <td className=\"px-4 py-3 text-sm text-gray-700 truncate max-w-xs\">
                        {log.fileName || '-'}
                      </td>
                      <td className=\"px-4 py-3 text-sm text-gray-700 truncate max-w-xs\">
                        {log.to || '-'}
                      </td>
                      <td className=\"px-4 py-3 text-sm text-gray-700\">
                        {log.mode ? (MODE_LABELS[log.mode] || log.mode) : '-'}
                      </td>
                      <td className=\"px-4 py-3 text-sm text-gray-700\">
                        {formatSize(log.fileSize)}
                      </td>
                      <td className=\"px-4 py-3 text-sm\">
                        <span
                          className={\inline-flex px-2 py-1 text-xs font-semibold rounded-full \\}
                        >
                          {STATUS_LABELS[log.status || ''] || log.status || '-'}
                        </span>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* フッター */}
        <div className=\"mt-6 text-center text-sm text-gray-500\">
          Phase 54: アカウント管理UI - 最大100件表示
        </div>
      </div>
    </div>
  );
}



