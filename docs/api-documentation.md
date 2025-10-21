# 📗 138DataGate - API仕様書

**最終更新日**: 2025年10月14日  
**バージョン**: 1.0  
**ベースURL**: `https://datagate-a136pipbb-138datas-projects.vercel.app`

---

## 📌 目次

1. [概要](#概要)
2. [認証](#認証)
3. [エンドポイント一覧](#エンドポイント一覧)
4. [共通仕様](#共通仕様)
5. [エラーハンドリング](#エラーハンドリング)

---

## 概要

### APIの特徴
- RESTful API
- JSON形式のレスポンス
- JWT認証
- レート制限あり

### 対象ユーザー
- 管理者
- システム開発者
- 外部連携サービス

---

## 認証

### JWT (JSON Web Token)

すべての保護されたエンドポイントは JWT 認証が必要です。

#### トークンの取得

**エンドポイント**: `POST /api/auth/login`

**リクエスト**:
```json
{
  "username": "admin",
  "password": "Admin123!"
}
```

**レスポンス（成功）**:
```json
{
  "success": true,
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "user": {
    "id": "1",
    "username": "admin",
    "role": "admin"
  }
}
```

#### トークンの使用

**Authorizationヘッダー**:
```
Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
```

#### トークンの有効期限

- **有効期間**: 24時間
- **延長**: 不可（再ログイン必要）

---

## エンドポイント一覧

### 1. 認証API

#### 1-1. ログイン

**エンドポイント**: `POST /api/auth/login`

**説明**: ユーザー認証を行い、JWTトークンを発行

**認証**: 不要

**レート制限**: 5回/15分

**リクエスト**:
```json
{
  "username": "admin",
  "password": "Admin123!"
}
```

**レスポンス（成功）**:
```json
{
  "success": true,
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "user": {
    "id": "1",
    "username": "admin",
    "role": "admin"
  }
}
```

**レスポンス（失敗）**:
```json
{
  "success": false,
  "message": "ユーザー名またはパスワードが間違っています"
}
```

**レスポンス（レート制限）**:
```json
{
  "success": false,
  "message": "ログイン試行回数が多すぎます。15分後に再試行してください。"
}
```

---

### 2. ファイル管理API

#### 2-1. ファイルアップロード

**エンドポイント**: `POST /api/files/upload`

**説明**: ファイルをアップロードし、AES-256-GCMで暗号化して保存

**認証**: 不要（ただし、将来的に要認証化を推奨）

**Content-Type**: `multipart/form-data`

**リクエスト（フォームデータ）**:
| フィールド | 型 | 必須 | 説明 |
|-----------|-----|------|------|
| `file` | File | ✅ | アップロードするファイル |
| `sender` | String | ✅ | 送信者のメールアドレス |
| `recipient` | String | ✅ | 受信者のメールアドレス |
| `message` | String | ❌ | メッセージ（オプション） |

**制限**:
- 最大ファイルサイズ: 100MB
- 同時アップロード数: 1

**レスポンス（成功）**:
```json
{
  "success": true,
  "message": "ファイルが正常にアップロードされました",
  "file": {
    "id": "6aeadefd-b4bc-4eae-a8a7-c592d843cfc8",
    "encryptedFileName": "encrypted_filename_data...",
    "size": 161,
    "uploadedAt": "2025-10-14T01:06:24.721Z",
    "expiresAt": "2025-10-21T01:06:24.721Z"
  }
}
```

**レスポンス（失敗）**:
```json
{
  "success": false,
  "error": "ファイルのアップロードに失敗しました",
  "details": "エラーの詳細メッセージ"
}
```

**処理フロー**:
1. ファイル受信（formidable）
2. ファイルをBufferに読み込み
3. AES-256-GCMで暗号化
4. 暗号化ファイルを `storage/*.enc` として保存
5. メタデータ（ファイル名、送信者、受信者）を暗号化
6. KVに暗号化メタデータを保存（7日TTL）
7. 一時ファイル削除
8. レスポンス返却

---

#### 2-2. ファイルダウンロード

**エンドポイント**: `GET /api/files/download`

**説明**: 暗号化されたファイルを復号してダウンロード

**認証**: ファイルIDによる認証

**クエリパラメータ**:
| パラメータ | 型 | 必須 | 説明 |
|-----------|-----|------|------|
| `fileId` | String | ✅ | ファイルID（UUID） |

**リクエスト例**:
```
GET /api/files/download?fileId=6aeadefd-b4bc-4eae-a8a7-c592d843cfc8
```

**レスポンス（成功）**:
- Content-Type: `application/octet-stream`
- Content-Disposition: `attachment; filename="original_filename.txt"`
- Body: 復号されたファイルのバイナリデータ

**レスポンス（失敗）**:
```json
{
  "success": false,
  "error": "ファイルが見つかりません",
  "details": "指定されたファイルIDは存在しないか、期限切れです"
}
```

**処理フロー**:
1. ファイルID受信
2. KVからメタデータ取得
3. 期限チェック
4. 暗号化ファイルを読み込み（`storage/*.enc`）
5. ファイルを復号
6. ファイル名を復号
7. 元のファイルとしてレスポンス返却

---

#### 2-3. ファイル一覧取得

**エンドポイント**: `GET /api/files/list`

**説明**: 管理者がすべてのファイルの一覧を取得

**認証**: JWT必須

**リクエスト例**:
```
GET /api/files/list
Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
```

**レスポンス（成功）**:
```json
{
  "success": true,
  "files": [
    {
      "id": "6aeadefd-b4bc-4eae-a8a7-c592d843cfc8",
      "fileName": "test-file.txt",
      "sender": "sender@example.com",
      "recipient": "recipient@example.com",
      "size": 161,
      "uploadedAt": "2025-10-14T01:06:24.721Z",
      "expiresAt": "2025-10-21T01:06:24.721Z"
    },
    {
      "id": "c7c61871-d495-4d7c-8744-64e8ac076e26",
      "fileName": "document.pdf",
      "sender": "user@example.com",
      "recipient": "client@example.com",
      "size": 2048,
      "uploadedAt": "2025-10-13T10:30:00.000Z",
      "expiresAt": "2025-10-20T10:30:00.000Z"
    }
  ],
  "count": 2
}
```

**レスポンス（失敗 - 認証エラー）**:
```json
{
  "success": false,
  "error": "認証が必要です"
}
```

**処理フロー**:
1. JWT認証チェック
2. KVから全ファイルのメタデータ取得
3. 各メタデータを復号
   - ファイル名の復号
   - 送信者の復号
   - 受信者の復号
4. ファイル一覧をJSON形式で返却

---

### 3. 統計情報API

#### 3-1. ダッシュボード統計取得

**エンドポイント**: `GET /api/stats`

**説明**: ダッシュボードに表示する統計情報を取得

**認証**: JWT必須

**リクエスト例**:
```
GET /api/stats
Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
```

**レスポンス（成功）**:
```json
{
  "success": true,
  "stats": {
    "users": 3,
    "files": 15,
    "logs": 1250,
    "storage": {
      "used": 52428800,
      "usedFormatted": "50.0 MB",
      "total": 10737418240,
      "totalFormatted": "10.0 GB",
      "percentage": 0.49
    },
    "recentActivity": [
      {
        "type": "file_upload",
        "user": "admin",
        "fileName": "report.pdf",
        "timestamp": "2025-10-14T10:30:00.000Z"
      },
      {
        "type": "file_download",
        "user": "guest",
        "fileName": "document.docx",
        "timestamp": "2025-10-14T09:15:00.000Z"
      }
    ]
  }
}
```

**レスポンス（失敗）**:
```json
{
  "success": false,
  "error": "認証が必要です"
}
```

---

### 4. システム設定API

#### 4-1. 設定取得

**エンドポイント**: `GET /api/settings/get`

**説明**: システム設定を取得

**認証**: JWT必須

**リクエスト例**:
```
GET /api/settings/get
Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
```

**レスポンス（成功）**:
```json
{
  "success": true,
  "settings": {
    "smtp": {
      "host": "smtp.gmail.com",
      "port": 587,
      "user": "138data@gmail.com",
      "from": "138data@gmail.com"
    },
    "fileRetention": {
      "days": 7
    },
    "security": {
      "jwtExpiration": "24h",
      "encryptionAlgorithm": "AES-256-GCM",
      "keyDerivation": "PBKDF2",
      "iterations": 100000
    }
  }
}
```

**注意**: パスワードなどの機密情報は返却されません。

---

#### 4-2. SMTP接続テスト

**エンドポイント**: `GET /api/health/smtp`

**説明**: SMTP接続を確認

**認証**: JWT必須

**レート制限**: 3回/5分

**リクエスト例**:
```
GET /api/health/smtp
Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
```

**レスポンス（成功）**:
```json
{
  "success": true,
  "message": "SMTP接続に成功しました",
  "responseTime": 245,
  "details": {
    "host": "smtp.gmail.com",
    "port": 587,
    "secure": false
  }
}
```

**レスポンス（失敗）**:
```json
{
  "success": false,
  "error": "SMTP接続に失敗しました",
  "details": "Error: Invalid login: 535-5.7.8 Username and Password not accepted"
}
```

---

#### 4-3. テストメール送信

**エンドポイント**: `POST /api/settings/test-mail`

**説明**: テストメールを送信

**認証**: JWT必須

**レート制限**: 3回/5分

**リクエスト**:
```json
{
  "to": "test@example.com",
  "subject": "テストメール",
  "body": "これはテストメールです。"
}
```

**レスポンス（成功）**:
```json
{
  "success": true,
  "message": "テストメールが正常に送信されました",
  "messageId": "<abc123@gmail.com>"
}
```

**レスポンス（失敗）**:
```json
{
  "success": false,
  "error": "メール送信に失敗しました",
  "details": "エラーの詳細メッセージ"
}
```

---

### 5. ユーザー管理API

#### 5-1. ユーザー一覧取得

**エンドポイント**: `GET /api/users/list`

**説明**: すべてのユーザーを取得

**認証**: JWT必須（管理者のみ）

**リクエスト例**:
```
GET /api/users/list
Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
```

**レスポンス（成功）**:
```json
{
  "success": true,
  "users": [
    {
      "id": "1",
      "username": "admin",
      "email": "admin@example.com",
      "role": "admin",
      "createdAt": "2025-01-01T00:00:00.000Z"
    },
    {
      "id": "2",
      "username": "user1",
      "email": "user1@example.com",
      "role": "user",
      "createdAt": "2025-02-15T10:30:00.000Z"
    }
  ],
  "count": 2
}
```

---

#### 5-2. ユーザー作成

**エンドポイント**: `POST /api/users/create`

**説明**: 新しいユーザーを作成

**認証**: JWT必須（管理者のみ）

**リクエスト**:
```json
{
  "username": "newuser",
  "email": "newuser@example.com",
  "password": "SecurePass123!",
  "role": "user"
}
```

**レスポンス（成功）**:
```json
{
  "success": true,
  "message": "ユーザーが正常に作成されました",
  "user": {
    "id": "3",
    "username": "newuser",
    "email": "newuser@example.com",
    "role": "user",
    "createdAt": "2025-10-14T12:00:00.000Z"
  }
}
```

**レスポンス（失敗 - ユーザー名重複）**:
```json
{
  "success": false,
  "error": "ユーザー名が既に存在します"
}
```

---

#### 5-3. ユーザー更新

**エンドポイント**: `PUT /api/users/update`

**説明**: 既存ユーザーの情報を更新

**認証**: JWT必須（管理者のみ）

**リクエスト**:
```json
{
  "id": "2",
  "email": "updated@example.com",
  "role": "admin"
}
```

**レスポンス（成功）**:
```json
{
  "success": true,
  "message": "ユーザーが正常に更新されました",
  "user": {
    "id": "2",
    "username": "user1",
    "email": "updated@example.com",
    "role": "admin",
    "updatedAt": "2025-10-14T12:30:00.000Z"
  }
}
```

---

#### 5-4. ユーザー削除

**エンドポイント**: `DELETE /api/users/delete`

**説明**: ユーザーを削除

**認証**: JWT必須（管理者のみ）

**リクエスト**:
```json
{
  "id": "2"
}
```

**レスポンス（成功）**:
```json
{
  "success": true,
  "message": "ユーザーが正常に削除されました"
}
```

**レスポンス（失敗 - 自分自身を削除）**:
```json
{
  "success": false,
  "error": "自分自身を削除することはできません"
}
```

---

### 6. Cron Job API

#### 6-1. 自動削除ジョブ

**エンドポイント**: `GET /api/cron/cleanup`

**説明**: 期限切れファイルを自動削除

**認証**: CRON_SECRETヘッダー必須

**スケジュール**: 毎日午前2時（UTC）

**リクエスト例**:
```
GET /api/cron/cleanup
X-Cron-Secret: 8551f8f77176e90113b873c641576459
```

**レスポンス（成功）**:
```json
{
  "success": true,
  "summary": {
    "total": 10,
    "deleted": 3,
    "skipped": 7,
    "errors": 0
  },
  "deletedFiles": [
    {
      "id": "abc123...",
      "fileName": "expired-file1.txt",
      "expiresAt": "2025-10-07T00:00:00.000Z"
    },
    {
      "id": "def456...",
      "fileName": "expired-file2.pdf",
      "expiresAt": "2025-10-06T12:00:00.000Z"
    },
    {
      "id": "ghi789...",
      "fileName": "expired-file3.docx",
      "expiresAt": "2025-10-05T08:00:00.000Z"
    }
  ],
  "timestamp": "2025-10-14T02:00:00.000Z"
}
```

**レスポンス（失敗 - 認証エラー）**:
```json
{
  "success": false,
  "error": "不正なCronシークレット"
}
```

**処理フロー**:
1. CRON_SECRET検証
2. KVから全ファイルのメタデータ取得
3. 期限切れファイルを検出（7日以上経過）
4. 物理ファイルの削除（`storage/*.enc`）
5. KVメタデータの削除
6. 削除ログの記録
7. 削除統計の返却

---

## 共通仕様

### HTTPメソッド

| メソッド | 用途 |
|---------|------|
| GET | データの取得 |
| POST | データの作成、認証 |
| PUT | データの更新 |
| DELETE | データの削除 |

### ステータスコード

| コード | 意味 | 例 |
|-------|------|-----|
| 200 | 成功 | リクエスト成功 |
| 201 | 作成 | ユーザー作成成功 |
| 400 | 不正なリクエスト | パラメータ不足 |
| 401 | 認証エラー | トークン無効 |
| 403 | 権限エラー | 管理者権限なし |
| 404 | 見つからない | ファイルが存在しない |
| 429 | レート制限 | 試行回数超過 |
| 500 | サーバーエラー | 内部エラー |

### レスポンス形式

**成功時**:
```json
{
  "success": true,
  "data": { ... },
  "message": "処理が成功しました"
}
```

**失敗時**:
```json
{
  "success": false,
  "error": "エラーメッセージ",
  "details": "詳細なエラー情報（オプション）"
}
```

### タイムスタンプ形式

すべてのタイムスタンプは **ISO 8601** 形式:
```
2025-10-14T12:00:00.000Z
```

---

## エラーハンドリング

### エラーコード一覧

| コード | エラータイプ | 説明 |
|-------|------------|------|
| `AUTH_REQUIRED` | 認証エラー | JWTトークンが必要 |
| `AUTH_INVALID` | 認証エラー | JWTトークンが無効 |
| `AUTH_EXPIRED` | 認証エラー | JWTトークンが期限切れ |
| `PERMISSION_DENIED` | 権限エラー | 管理者権限が必要 |
| `RATE_LIMIT_EXCEEDED` | レート制限 | 試行回数超過 |
| `FILE_NOT_FOUND` | ファイルエラー | ファイルが存在しない |
| `FILE_EXPIRED` | ファイルエラー | ファイルが期限切れ |
| `FILE_ENCRYPTION_FAILED` | ファイルエラー | 暗号化に失敗 |
| `FILE_DECRYPTION_FAILED` | ファイルエラー | 復号に失敗 |
| `SMTP_CONNECTION_FAILED` | SMTPエラー | SMTP接続に失敗 |
| `SMTP_AUTH_FAILED` | SMTPエラー | SMTP認証に失敗 |
| `VALIDATION_ERROR` | バリデーションエラー | パラメータが不正 |
| `INTERNAL_ERROR` | サーバーエラー | 内部エラー |

### エラーレスポンス例

**認証エラー**:
```json
{
  "success": false,
  "error": "AUTH_REQUIRED",
  "message": "認証が必要です",
  "details": "Authorizationヘッダーにトークンを含めてください"
}
```

**レート制限エラー**:
```json
{
  "success": false,
  "error": "RATE_LIMIT_EXCEEDED",
  "message": "ログイン試行回数が多すぎます",
  "retryAfter": 900,
  "details": "15分後に再試行してください"
}
```

**ファイルエラー**:
```json
{
  "success": false,
  "error": "FILE_NOT_FOUND",
  "message": "ファイルが見つかりません",
  "details": "指定されたファイルIDは存在しないか、期限切れです"
}
```

---

## レート制限

### 制限ポリシー

| エンドポイント | 制限 | ウィンドウ |
|--------------|------|-----------|
| `/api/auth/login` | 5回 | 15分 |
| `/api/settings/test-mail` | 3回 | 5分 |
| `/api/health/smtp` | 3回 | 5分 |

### レート制限レスポンス

**ヘッダー**:
```
X-RateLimit-Limit: 5
X-RateLimit-Remaining: 0
X-RateLimit-Reset: 1697280000
```

**レスポンス**:
```json
{
  "success": false,
  "error": "RATE_LIMIT_EXCEEDED",
  "message": "リクエスト制限を超えました",
  "retryAfter": 900
}
```

---

## セキュリティ

### HTTPS必須

すべてのAPIエンドポイントは **HTTPS** 経由でのみアクセス可能です。

### CORS設定

デフォルトでは同一オリジンのみ許可。

### 暗号化

#### ファイル暗号化
- **アルゴリズム**: AES-256-GCM
- **鍵導出**: PBKDF2 (100,000反復)
- **認証タグ**: 16バイト

#### メタデータ暗号化
- ファイル名、送信者、受信者を個別に暗号化
- 各フィールドに固有の salt, iv, authTag

#### パスワードハッシュ
- **アルゴリズム**: bcrypt
- **ソルトラウンド**: 10

---

## サンプルコード

### JavaScript (Fetch API)

#### ログイン
```javascript
async function login(username, password) {
  const response = await fetch('/api/auth/login', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ username, password })
  });
  
  const data = await response.json();
  
  if (data.success) {
    localStorage.setItem('token', data.token);
    return data.token;
  } else {
    throw new Error(data.message);
  }
}
```

#### ファイルアップロード
```javascript
async function uploadFile(file, sender, recipient) {
  const formData = new FormData();
  formData.append('file', file);
  formData.append('sender', sender);
  formData.append('recipient', recipient);
  
  const response = await fetch('/api/files/upload', {
    method: 'POST',
    body: formData
  });
  
  return await response.json();
}
```

#### ファイルダウンロード
```javascript
async function downloadFile(fileId) {
  const response = await fetch(`/api/files/download?fileId=${fileId}`);
  
  if (response.ok) {
    const blob = await response.blob();
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'filename.txt'; // 適切なファイル名を設定
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    window.URL.revokeObjectURL(url);
  }
}
```

#### ファイル一覧取得
```javascript
async function getFileList() {
  const token = localStorage.getItem('token');
  
  const response = await fetch('/api/files/list', {
    headers: {
      'Authorization': `Bearer ${token}`
    }
  });
  
  return await response.json();
}
```

---

### PowerShell

#### ログイン
```powershell
$body = @{
    username = "admin"
    password = "Admin123!"
} | ConvertTo-Json

$response = Invoke-RestMethod -Uri "https://datagate-a136pipbb-138datas-projects.vercel.app/api/auth/login" `
    -Method POST `
    -ContentType "application/json" `
    -Body $body

$token = $response.token
```

#### ファイルアップロード
```powershell
$filePath = "C:\Users\138data\test-file.txt"
$uri = "https://datagate-a136pipbb-138datas-projects.vercel.app/api/files/upload"

$form = @{
    file = Get-Item -Path $filePath
    sender = "sender@example.com"
    recipient = "recipient@example.com"
}

$response = Invoke-RestMethod -Uri $uri -Method POST -Form $form
```

#### クリーンアップジョブ実行
```powershell
$headers = @{
    "X-Cron-Secret" = "8551f8f77176e90113b873c641576459"
}

$response = Invoke-RestMethod -Uri "https://datagate-a136pipbb-138datas-projects.vercel.app/api/cron/cleanup" `
    -Headers $headers
```

---

## 付録

### A. JWT ペイロード構造

```json
{
  "userId": "1",
  "username": "admin",
  "role": "admin",
  "iat": 1697280000,
  "exp": 1697366400
}
```

### B. 暗号化ファイルの構造

**storageディレクトリ**:
```
storage/
├── 6aeadefd-b4bc-4eae-a8a7-c592d843cfc8.enc  ← 暗号化されたファイル
└── c7c61871-d495-4d7c-8744-64e8ac076e26.enc
```

**KVに保存されるメタデータ**:
```json
{
  "id": "6aeadefd-b4bc-4eae-a8a7-c592d843cfc8",
  "fileName": "encrypted_data...",
  "fileNameSalt": "salt_data...",
  "fileNameIv": "iv_data...",
  "fileNameAuthTag": "authTag_data...",
  "sender": "encrypted_data...",
  "senderSalt": "salt_data...",
  "senderIv": "iv_data...",
  "senderAuthTag": "authTag_data...",
  "recipient": "encrypted_data...",
  "recipientSalt": "salt_data...",
  "recipientIv": "iv_data...",
  "recipientAuthTag": "authTag_data...",
  "size": 161,
  "uploadedAt": "2025-10-14T01:06:24.721Z",
  "expiresAt": "2025-10-21T01:06:24.721Z"
}
```

### C. バージョン履歴

| バージョン | 日付 | 変更内容 |
|-----------|------|---------|
| 1.0 | 2025-10-14 | 初版リリース |

---

## お問い合わせ

**プロジェクト**: 138DataGate  
**メール**: 138data@gmail.com

---

**ドキュメント作成日**: 2025年10月14日  
**最終更新日**: 2025年10月14日  
**バージョン**: 1.0

---

*本ドキュメントは138DataGateプロジェクトのAPI仕様書です。*
