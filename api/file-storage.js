// DataGate File-based Storage
const fs = require('fs');
const path = require('path');

// ストレージディレクトリ
const STORAGE_DIR = path.join(process.cwd(), 'storage');

// ディレクトリ作成
if (!fs.existsSync(STORAGE_DIR)) {
    fs.mkdirSync(STORAGE_DIR, { recursive: true });
}

class FileStorage {
    // ファイル保存
    static save(fileId, fileInfo) {
        const filePath = path.join(STORAGE_DIR, `${fileId}.json`);
        const dataPath = path.join(STORAGE_DIR, `${fileId}.data`);
        
        // メタデータ保存（fileDataを除く）
        const metadata = { ...fileInfo };
        delete metadata.fileData;
        fs.writeFileSync(filePath, JSON.stringify(metadata));
        
        // ファイルデータ保存
        fs.writeFileSync(dataPath, fileInfo.fileData);
        
        console.log(`[FileStorage] Saved: ${fileId}`);
        return true;
    }
    
    // ファイル取得
    static get(fileId) {
        const filePath = path.join(STORAGE_DIR, `${fileId}.json`);
        const dataPath = path.join(STORAGE_DIR, `${fileId}.data`);
        
        if (!fs.existsSync(filePath) || !fs.existsSync(dataPath)) {
            console.log(`[FileStorage] Not found: ${fileId}`);
            return null;
        }
        
        // メタデータ読み込み
        const metadata = JSON.parse(fs.readFileSync(filePath, 'utf8'));
        
        // ファイルデータ読み込み
        const fileData = fs.readFileSync(dataPath);
        
        return { ...metadata, fileData };
    }
    
    // ファイル一覧
    static list() {
        if (!fs.existsSync(STORAGE_DIR)) return [];
        
        return fs.readdirSync(STORAGE_DIR)
            .filter(file => file.endsWith('.json'))
            .map(file => file.replace('.json', ''));
    }
    
    // ファイル削除
    static delete(fileId) {
        const filePath = path.join(STORAGE_DIR, `${fileId}.json`);
        const dataPath = path.join(STORAGE_DIR, `${fileId}.data`);
        
        if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
        if (fs.existsSync(dataPath)) fs.unlinkSync(dataPath);
        
        console.log(`[FileStorage] Deleted: ${fileId}`);
        return true;
    }
    
    // ダウンロードカウント更新
    static updateDownloadCount(fileId) {
        const fileInfo = this.get(fileId);
        if (!fileInfo) return false;
        
        fileInfo.downloadCount++;
        this.save(fileId, fileInfo);
        return true;
    }
}

module.exports = FileStorage;
