import { useState, useEffect } from 'react';
import { useRouter } from 'next/router';
import AdminLayout from '../../components/AdminLayout';
import { BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';

export default function Dashboard() {
  const router = useRouter();
  const [kpiData, setKpiData] = useState<{
    uploadSuccessRate: number;
    downloadSuccessRate: number;
    p95ProcessingTime: number;
    errorRate: number;
    emailDeliveryRate: number;
    period: string;
    lastUpdated: string;
    stats: {
      totalUploads: number;
      totalDownloads: number;
      successUploads: number;
      successDownloads: number;
    };
  } | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    fetchKPIData();
    // 30秒ごとに自動更新
    const interval = setInterval(fetchKPIData, 30000);
    return () => clearInterval(interval);
  }, []);

  const fetchKPIData = async () => {
    try {
      const token = localStorage.getItem('admin_token');
      if (!token) {
        router.push('/admin/login');
        return;
      }

      const response = await fetch('/api/admin/kpi', {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });

      if (response.status === 401) {
        localStorage.removeItem('admin_token');
        router.push('/admin/login');
        return;
      }

      if (!response.ok) {
        throw new Error('KPIデータの取得に失敗しました');
      }

      const result = await response.json();
      setKpiData(result.data);
      setError('');
    } catch (err) {
      const error = err as Error;
      setError(error.message || "KPIデータの取得に失敗しました");
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <AdminLayout title="KPI ダッシュボード">
        <div className="flex items-center justify-center h-64">
          <div className="text-gray-600">読み込み中...</div>
        </div>
      </AdminLayout>
    );
  }

  if (error) {
    return (
      <AdminLayout title="KPI ダッシュボード">
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded">
          {error}
        </div>
      </AdminLayout>
    );
  }

  if (!kpiData) {
    return (
      <AdminLayout title="KPI ダッシュボード">
        <div className="text-gray-600">データがありません</div>
      </AdminLayout>
    );
  }

  // グラフ用データ準備
  const successRateData = [
    { name: 'アップロード', rate: kpiData.uploadSuccessRate, target: 99 },
    { name: 'ダウンロード', rate: kpiData.downloadSuccessRate, target: 98 },
    { name: 'メール配信', rate: kpiData.emailDeliveryRate, target: 95 }
  ];

  const performanceData = [
    { name: 'p95処理時間', value: kpiData.p95ProcessingTime, target: 500 },
    { name: 'エラー率', value: kpiData.errorRate, target: 1 }
  ];

  return (
    <AdminLayout title="KPI ダッシュボード">
      <div className="space-y-6">
        {/* ヘッダー */}
        <div className="flex justify-between items-center">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">📈 KPI ダッシュボード</h1>
            <p className="text-sm text-gray-600 mt-1">
              最終更新: {new Date(kpiData.lastUpdated).toLocaleString('ja-JP')} (自動更新: 30秒ごと)
            </p>
          </div>
          <button
            onClick={fetchKPIData}
            className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
          >
            🔄 更新
          </button>
        </div>

        {/* サマリーカード */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <div className="bg-white p-6 rounded-lg shadow">
            <div className="text-sm text-gray-600">アップロード成功率</div>
            <div className="text-3xl font-bold text-green-600 mt-2">
              {kpiData.uploadSuccessRate.toFixed(1)}%
            </div>
            <div className="text-xs text-gray-500 mt-1">目標: 99%以上</div>
          </div>

          <div className="bg-white p-6 rounded-lg shadow">
            <div className="text-sm text-gray-600">ダウンロード成功率</div>
            <div className="text-3xl font-bold text-green-600 mt-2">
              {kpiData.downloadSuccessRate.toFixed(1)}%
            </div>
            <div className="text-xs text-gray-500 mt-1">目標: 98%以上</div>
          </div>

          <div className="bg-white p-6 rounded-lg shadow">
            <div className="text-sm text-gray-600">p95 処理時間</div>
            <div className={`text-3xl font-bold mt-2 ${kpiData.p95ProcessingTime < 500 ? 'text-green-600' : 'text-yellow-600'}`}>
              {kpiData.p95ProcessingTime}ms
            </div>
            <div className="text-xs text-gray-500 mt-1">目標: 500ms以下</div>
          </div>

          <div className="bg-white p-6 rounded-lg shadow">
            <div className="text-sm text-gray-600">エラー率</div>
            <div className={`text-3xl font-bold mt-2 ${kpiData.errorRate < 1 ? 'text-green-600' : 'text-red-600'}`}>
              {kpiData.errorRate.toFixed(2)}%
            </div>
            <div className="text-xs text-gray-500 mt-1">目標: 1%以下</div>
          </div>
        </div>
        {/* 成功率グラフ */}
        <div className="bg-white p-6 rounded-lg shadow">
          <h2 className="text-lg font-semibold mb-4">成功率（過去24時間）</h2>
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={successRateData}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="name" />
              <YAxis domain={[0, 100]} />
              <Tooltip />
              <Legend />
              <Bar dataKey="rate" fill="#10b981" name="実績" />
              <Bar dataKey="target" fill="#94a3b8" name="目標" />
            </BarChart>
          </ResponsiveContainer>
        </div>

        {/* パフォーマンスグラフ */}
        <div className="bg-white p-6 rounded-lg shadow">
          <h2 className="text-lg font-semibold mb-4">パフォーマンス指標</h2>
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={performanceData}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="name" />
              <YAxis />
              <Tooltip />
              <Legend />
              <Bar dataKey="value" fill="#3b82f6" name="実績" />
              <Bar dataKey="target" fill="#94a3b8" name="目標" />
            </BarChart>
          </ResponsiveContainer>
        </div>

        {/* 統計情報 */}
        <div className="bg-white p-6 rounded-lg shadow">
          <h2 className="text-lg font-semibold mb-4">詳細統計（過去24時間）</h2>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div>
              <div className="text-sm text-gray-600">総アップロード数</div>
              <div className="text-2xl font-bold text-gray-900">{kpiData.stats.totalUploads}</div>
            </div>
            <div>
              <div className="text-sm text-gray-600">成功アップロード</div>
              <div className="text-2xl font-bold text-green-600">{kpiData.stats.successUploads}</div>
            </div>
            <div>
              <div className="text-sm text-gray-600">総ダウンロード数</div>
              <div className="text-2xl font-bold text-gray-900">{kpiData.stats.totalDownloads}</div>
            </div>
            <div>
              <div className="text-sm text-gray-600">成功ダウンロード</div>
              <div className="text-2xl font-bold text-green-600">{kpiData.stats.successDownloads}</div>
            </div>
          </div>
        </div>

        {/* アラート設定（将来の拡張用） */}
        <div className="bg-yellow-50 border border-yellow-200 p-4 rounded">
          <div className="flex items-start">
            <div className="flex-shrink-0">
              <svg className="h-5 w-5 text-yellow-400" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
              </svg>
            </div>
            <div className="ml-3">
              <h3 className="text-sm font-medium text-yellow-800">アラート機能（Phase 58で実装予定）</h3>
              <p className="text-sm text-yellow-700 mt-1">
                KPIが目標値を下回った際の自動通知機能を次フェーズで実装します。
              </p>
            </div>
          </div>
        </div>
      </div>
    </AdminLayout>
  );
}
