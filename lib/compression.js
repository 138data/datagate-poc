const zlib = require('zlib');
const { promisify } = require('util');

// Promisify zlib functions
const gzipAsync = promisify(zlib.gzip);
const gunzipAsync = promisify(zlib.gunzip);

/**
 * ファイルを圧縮
 * @param {Buffer} buffer - 圧縮するデータ
 * @returns {Promise<Object>} - 圧縮結果
 */
async function compress(buffer) {
    try {
        const compressed = await gzipAsync(buffer);
        const originalSize = buffer.length;
        const compressedSize = compressed.length;
        const compressionRatio = ((1 - compressedSize / originalSize) * 100).toFixed(2);

        return {
            compressed,
            originalSize,
            compressedSize,
            compressionRatio: parseFloat(compressionRatio)
        };
    } catch (error) {
        throw new Error('圧縮に失敗しました: ' + error.message);
    }
}

/**
 * ファイルを解凍
 * @param {Buffer} buffer - 解凍するデータ
 * @returns {Promise<Buffer>} - 解凍されたデータ
 */
async function decompress(buffer) {
    try {
        return await gunzipAsync(buffer);
    } catch (error) {
        throw new Error('解凍に失敗しました: ' + error.message);
    }
}

/**
 * ファイルが圧縮可能かどうかを判定
 * @param {Buffer} buffer - ファイルデータ
 * @param {string} mimeType - MIMEタイプ
 * @returns {boolean} - 圧縮可能ならtrue
 */
function isCompressible(buffer, mimeType = '') {
    // 圧縮対象のMIMEタイプ（テキストベース）
    const compressibleTypes = [
        'text/',
        'application/json',
        'application/xml',
        'application/javascript',
        'application/x-javascript',
        'application/ecmascript',
        'application/x-www-form-urlencoded',
        'application/xhtml+xml',
        'application/rss+xml',
        'application/atom+xml',
        'image/svg+xml'
    ];

    // MIMEタイプで判定
    if (mimeType) {
        const isCompressibleType = compressibleTypes.some(type => 
            mimeType.toLowerCase().includes(type.toLowerCase())
        );
        
        if (isCompressibleType) {
            return true;
        }
    }

    // バッファの内容で判定（テキストファイルかどうか）
    // 最初の1024バイトをチェック
    const sample = buffer.slice(0, Math.min(1024, buffer.length));
    
    // NULL文字が含まれていればバイナリファイル
    for (let i = 0; i < sample.length; i++) {
        if (sample[i] === 0) {
            return false;
        }
    }

    // テキストファイルとみなす
    return true;
}

module.exports = {
    compress,
    decompress,
    isCompressible
};