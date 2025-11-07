// pages/manage/[fileId].tsx
import { useRouter } from 'next/router';
import { useState, useEffect } from 'react';
import Head from 'next/head';

interface FileInfo {
  exists: boolean;
  fileName?: string;
  fileSize?: number;
  sender?: string;
  recipient?: string;
  uploadedAt?: number;
  expiresAt?: number;
  isExpired?: boolean;
  canDelete?: boolean;
  message?: string;
}

export default function ManageFile() {
  const router = useRouter();
  const { fileId } = router.query;
  
  const [fileInfo, setFileInfo] = useState<FileInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  
  // ファイル情報取得
  useEffect(() => {
    if (!fileId) return;
    
    const fetchFileInfo = async () => {
      try {
        const response = await fetch(`/api/files/${fileId}/delete`);
        const data = await response.json();
        
        setFileInfo(data);
        setLoading(false);
      } catch (err) {
        setError('ファイル情報の取得に失敗しました');
        setLoading(false);
      }
    };
    
    fetchFileInfo();
  }, [fileId]);
  
  // ファイル削除
  const handleDelete = async () => {
    if (!confirm('本当にこのファイルを削除しますか？\n削除後は復元できません。')) {
      return;
    }
    
    setDeleting(true);
    setError('');
    
    try {
      const response = await fetch(`/api/files/${fileId}/delete`, {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          deletedBy: 'sender',
        }),
      });
      
      const data = await response.json();
      
      if (!response.ok) {
        throw new Error(data.error || '削除に失敗しました');
      }
      
      setSuccess('✅ ファイルを削除しました');
      
      // 3秒後にホームにリダイレクト
      setTimeout(() => {
        router.push('/');
      }, 3000);
      
    } catch (err) {
      setError(err instanceof Error ? err.message : '削除に失敗しました');
    } finally {
      setDeleting(false);
    }
  };
  
  // ファイルサイズフォーマット
  const formatFileSize = (bytes: number): string => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(2)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
  };
  
  // 日時フォーマット
  const formatDate = (timestamp: number): string => {
    return new Date(timestamp).toLocaleString('ja-JP', {
      timeZone: 'Asia/Tokyo',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    });
  };
  
  // 残り時間計算
  const getRemainingTime = (expiresAt: number): string => {
    const now = Date.now();
    const diff = expiresAt - now;
    
    if (diff <= 0) return '期限切れ';
    
    const days = Math.floor(diff / (1000 * 60 * 60 * 24));
    const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
    
    if (days > 0) return `${days}日 ${hours}時間`;
    return `${hours}時間`;
  };
  
  if (loading) {
    return (
      <div style={styles.container}>
        <div style={styles.loading}>
          <div style={styles.spinner}></div>
          <p>読み込み中...</p>
        </div>
      </div>
    );
  }
  
  if (!fileInfo?.exists) {
    return (
      <div style={styles.container}>
        <Head>
          <title>ファイルが見つかりません - DataGate</title>
        </Head>
        <div style={styles.card}>
          <div style={styles.errorIcon}>❌</div>
          <h1 style={styles.title}>ファイルが見つかりません</h1>
          <p style={styles.message}>
            {fileInfo?.message || 'このファイルは既に削除されているか、存在しません。'}
          </p>
          <button
            onClick={() => router.push('/')}
            style={styles.button}
          >
            ホームに戻る
          </button>
        </div>
      </div>
    );
  }
  
  if (success) {
    return (
      <div style={styles.container}>
        <Head>
          <title>削除完了 - DataGate</title>
        </Head>
        <div style={styles.card}>
          <div style={styles.successIcon}>✅</div>
          <h1 style={styles.title}>削除完了</h1>
          <p style={styles.message}>{success}</p>
          <p style={styles.subMessage}>3秒後にホームにリダイレクトします...</p>
        </div>
      </div>
    );
  }
  
  return (
    <div style={styles.container}>
      <Head>
        <title>ファイル管理 - DataGate</title>
      </Head>
      
      <div style={styles.card}>
        <div style={styles.header}>
          <h1 style={styles.title}>🔒 ファイル管理</h1>
          <p style={styles.subtitle}>送信したファイルの管理</p>
        </div>
        
        <div style={styles.infoSection}>
          <div style={styles.infoRow}>
            <span style={styles.infoLabel}>📄 ファイル名:</span>
            <span style={styles.infoValue}>{fileInfo.fileName}</span>
          </div>
          
          <div style={styles.infoRow}>
            <span style={styles.infoLabel}>📦 ファイルサイズ:</span>
            <span style={styles.infoValue}>
              {formatFileSize(fileInfo.fileSize || 0)}
            </span>
          </div>
          
          <div style={styles.infoRow}>
            <span style={styles.infoLabel}>📧 送信先:</span>
            <span style={styles.infoValue}>{fileInfo.recipient}</span>
          </div>
          
          <div style={styles.infoRow}>
            <span style={styles.infoLabel}>⏰ アップロード日時:</span>
            <span style={styles.infoValue}>
              {formatDate(fileInfo.uploadedAt || 0)}
            </span>
          </div>
          
          <div style={styles.infoRow}>
            <span style={styles.infoLabel}>⏳ 有効期限:</span>
            <span style={{
              ...styles.infoValue,
              color: fileInfo.isExpired ? '#f5576c' : '#667eea',
              fontWeight: 'bold',
            }}>
              {fileInfo.expiresAt 
                ? getRemainingTime(fileInfo.expiresAt)
                : '不明'}
            </span>
          </div>
        </div>
        
        {error && (
          <div style={styles.errorBox}>
            <strong>❌ エラー:</strong> {error}
          </div>
        )}
        
        <div style={styles.actions}>
          {fileInfo.canDelete ? (
            <>
              <button
                onClick={handleDelete}
                disabled={deleting}
                style={{
                  ...styles.button,
                  ...styles.deleteButton,
                }}
              >
                {deleting ? '削除中...' : '🗑️ ファイルを削除する'}
              </button>
              
              <p style={styles.warning}>
                ⚠️ 削除後は復元できません。ご注意ください。
              </p>
            </>
          ) : (
            <div style={styles.expiredBox}>
              <p>このファイルは既に期限切れです。</p>
              <p>自動削除の対象となっています。</p>
            </div>
          )}
        </div>
        
        <button
          onClick={() => router.push('/')}
          style={{
            ...styles.button,
            ...styles.secondaryButton,
          }}
        >
          ホームに戻る
        </button>
      </div>
    </div>
  );
}

// スタイル定義
const styles = {
  container: {
    minHeight: '100vh',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
    padding: '20px',
  },
  card: {
    background: 'white',
    borderRadius: '20px',
    boxShadow: '0 20px 60px rgba(0, 0, 0, 0.3)',
    padding: '40px',
    maxWidth: '600px',
    width: '100%',
  },
  header: {
    textAlign: 'center' as const,
    marginBottom: '30px',
  },
  title: {
    fontSize: '28px',
    fontWeight: 'bold',
    color: '#333',
    margin: '0 0 10px 0',
  },
  subtitle: {
    fontSize: '14px',
    color: '#666',
    margin: '0',
  },
  infoSection: {
    background: '#f9f9f9',
    borderRadius: '10px',
    padding: '20px',
    marginBottom: '20px',
  },
  infoRow: {
    display: 'flex',
    justifyContent: 'space-between',
    padding: '12px 0',
    borderBottom: '1px solid #eee',
  },
  infoLabel: {
    fontWeight: 'bold',
    color: '#667eea',
    fontSize: '14px',
  },
  infoValue: {
    color: '#555',
    fontSize: '14px',
    textAlign: 'right' as const,
    maxWidth: '60%',
    wordBreak: 'break-word' as const,
  },
  actions: {
    marginTop: '30px',
  },
  button: {
    width: '100%',
    padding: '15px',
    fontSize: '16px',
    fontWeight: 'bold',
    border: 'none',
    borderRadius: '10px',
    cursor: 'pointer',
    transition: 'all 0.3s ease',
    marginBottom: '15px',
  },
  deleteButton: {
    background: '#f5576c',
    color: 'white',
  },
  secondaryButton: {
    background: '#e0e0e0',
    color: '#333',
  },
  warning: {
    fontSize: '12px',
    color: '#f5576c',
    textAlign: 'center' as const,
    margin: '10px 0',
  },
  errorBox: {
    background: '#fee',
    border: '1px solid #f5576c',
    borderRadius: '10px',
    padding: '15px',
    color: '#c33',
    marginTop: '20px',
  },
  expiredBox: {
    background: '#fef9e7',
    border: '1px solid #f39c12',
    borderRadius: '10px',
    padding: '20px',
    textAlign: 'center' as const,
    color: '#856404',
  },
  loading: {
    textAlign: 'center' as const,
    color: 'white',
  },
  spinner: {
    border: '4px solid rgba(255, 255, 255, 0.3)',
    borderTop: '4px solid white',
    borderRadius: '50%',
    width: '50px',
    height: '50px',
    animation: 'spin 1s linear infinite',
    margin: '0 auto 20px',
  },
  errorIcon: {
    fontSize: '64px',
    textAlign: 'center' as const,
    marginBottom: '20px',
  },
  successIcon: {
    fontSize: '64px',
    textAlign: 'center' as const,
    marginBottom: '20px',
  },
  message: {
    fontSize: '16px',
    color: '#666',
    textAlign: 'center' as const,
    margin: '20px 0',
  },
  subMessage: {
    fontSize: '14px',
    color: '#999',
    textAlign: 'center' as const,
  },
};