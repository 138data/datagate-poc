/**
 * Policy Analytics - 統計データに基づくポリシー推奨値の算出
 * Phase 43-Step 4: データドリブンなポリシー最適化
 * 
 * 機能:
 * - ファイルサイズ分布の分析
 * - 添付直送成功率の計算
 * - 推奨閾値の算出
 */

import { kv } from '@vercel/kv';

/**
 * ファイルサイズのパーセンタイル計算
 * @param {Array<number>} sizes - ファイルサイズの配列（バイト）
 * @param {number} percentile - パーセンタイル（0-100）
 * @returns {number} パーセンタイル値
 */
function calculatePercentile(sizes, percentile) {
  if (sizes.length === 0) return 0;
  
  const sorted = [...sizes].sort((a, b) => a - b);
  const index = Math.ceil((percentile / 100) * sorted.length) - 1;
  return sorted[Math.max(0, index)];
}

/**
 * 監査ログからファイルサイズデータを抽出
 * @param {number} days - 分析対象の日数
 * @returns {Promise<Array<Object>>} ファイルサイズデータ
 */
async function extractFileSizeData(days = 7) {
  try {
    const now = Date.now();
    const cutoffTime = now - (days * 86400000);
    
    // 監査ログのキーを取得
    const keys = await kv.keys('audit:*');
    const sizeData = [];
    
    for (const key of keys) {
      const log = await kv.get(key);
      if (!log) continue;
      
      // 期間内のログのみ対象
      if (log.timestamp < cutoffTime) continue;
      
      if (log.size && log.size > 0) {
        sizeData.push({
          size: log.size,
          mode: log.mode,
          reason: log.reason,
          timestamp: log.timestamp
        });
      }
    }
    
    return sizeData;
  } catch (error) {
    console.error('Failed to extract file size data:', error);
    return [];
  }
}

/**
 * ファイルサイズ分布の分析
 * @param {number} days - 分析対象の日数
 * @returns {Promise<Object>} 分析結果
 */
export async function analyzeFileSizeDistribution(days = 7) {
  try {
    const sizeData = await extractFileSizeData(days);
    
    if (sizeData.length === 0) {
      return {
        totalFiles: 0,
        p50: 0,
        p75: 0,
        p95: 0,
        p99: 0,
        max: 0,
        average: 0
      };
    }
    
    const sizes = sizeData.map(d => d.size);
    const total = sizes.reduce((a, b) => a + b, 0);
    
    return {
      totalFiles: sizes.length,
      p50: calculatePercentile(sizes, 50),
      p75: calculatePercentile(sizes, 75),
      p95: calculatePercentile(sizes, 95),
      p99: calculatePercentile(sizes, 99),
      max: Math.max(...sizes),
      average: Math.round(total / sizes.length)
    };
  } catch (error) {
    console.error('Failed to analyze file size distribution:', error);
    throw error;
  }
}

/**
 * 添付直送の成功率分析
 * @param {number} days - 分析対象の日数
 * @returns {Promise<Object>} 成功率データ
 */
export async function analyzeDirectAttachSuccessRate(days = 7) {
  try {
    const sizeData = await extractFileSizeData(days);
    
    if (sizeData.length === 0) {
      return {
        totalAttempts: 0,
        successCount: 0,
        successRate: 0,
        fallbackReasons: {}
      };
    }
    
    const directAttachAttempts = sizeData.filter(d => 
      d.mode === 'attach' || d.mode === 'link'
    );
    
    const successCount = sizeData.filter(d => d.mode === 'attach').length;
    const fallbackCount = sizeData.filter(d => d.mode === 'link').length;
    
    // フォールバック理由の集計
    const fallbackReasons = {};
    sizeData.forEach(d => {
      if (d.mode === 'link' && d.reason) {
        fallbackReasons[d.reason] = (fallbackReasons[d.reason] || 0) + 1;
      }
    });
    
    return {
      totalAttempts: directAttachAttempts.length,
      successCount,
      fallbackCount,
      successRate: directAttachAttempts.length > 0 
        ? Math.round((successCount / directAttachAttempts.length) * 100) 
        : 0,
      fallbackReasons
    };
  } catch (error) {
    console.error('Failed to analyze direct attach success rate:', error);
    throw error;
  }
}

/**
 * 推奨ポリシー値の算出
 * @param {number} days - 分析対象の日数
 * @returns {Promise<Object>} 推奨ポリシー値
 */
export async function calculateRecommendedPolicy(days = 7) {
  try {
    const [sizeDistribution, successRate] = await Promise.all([
      analyzeFileSizeDistribution(days),
      analyzeDirectAttachSuccessRate(days)
    ]);
    
    // 推奨サイズ閾値の計算
    // P95をベースに、少し余裕を持たせる（+10%）
    const recommendedMaxSize = Math.min(
      Math.ceil(sizeDistribution.p95 * 1.1),
      10485760 // 最大10MB
    );
    
    // サイズ超過によるフォールバックが多い場合は閾値を上げる提案
    const sizeExceededCount = successRate.fallbackReasons['size_exceeded'] || 0;
    const shouldIncreaseSize = sizeExceededCount > (successRate.totalAttempts * 0.1);
    
    // 添付直送の有効化推奨判定
    // 成功率が80%以上なら有効化を推奨
    const recommendEnableDirectAttach = successRate.successRate >= 80;
    
    return {
      analysis: {
        period: `${days}日間`,
        totalFiles: sizeDistribution.totalFiles,
        sizeDistribution: {
          p50: sizeDistribution.p50,
          p75: sizeDistribution.p75,
          p95: sizeDistribution.p95,
          p99: sizeDistribution.p99,
          average: sizeDistribution.average
        },
        successRate: {
          total: successRate.totalAttempts,
          success: successRate.successCount,
          fallback: successRate.fallbackCount,
          rate: successRate.successRate,
          fallbackReasons: successRate.fallbackReasons
        }
      },
      recommendations: {
        enableDirectAttach: recommendEnableDirectAttach,
        directAttachMaxSize: recommendedMaxSize,
        reason: {
          enableDirectAttach: recommendEnableDirectAttach 
            ? `成功率${successRate.successRate}%で安定しています` 
            : `成功率${successRate.successRate}%のため、改善が必要です`,
          directAttachMaxSize: shouldIncreaseSize
            ? `サイズ超過が${sizeExceededCount}件発生しています。P95(${Math.round(sizeDistribution.p95 / 1048576 * 10) / 10}MB)ベースで推奨`
            : `P95(${Math.round(sizeDistribution.p95 / 1048576 * 10) / 10}MB)を基準に算出`
        }
      },
      insights: generateInsights(sizeDistribution, successRate)
    };
  } catch (error) {
    console.error('Failed to calculate recommended policy:', error);
    throw error;
  }
}

/**
 * インサイトの生成
 * @param {Object} sizeDistribution - サイズ分布データ
 * @param {Object} successRate - 成功率データ
 * @returns {Array<string>} インサイトメッセージ
 */
function generateInsights(sizeDistribution, successRate) {
  const insights = [];
  
  // サイズ分布のインサイト
  if (sizeDistribution.p95 > 5242880) { // 5MB
    insights.push('⚠️ P95サイズが5MBを超えています。大容量ファイルの利用が多い傾向です。');
  }
  
  if (sizeDistribution.average < 1048576) { // 1MB
    insights.push('✅ 平均ファイルサイズが1MB未満で、軽量ファイルが中心です。');
  }
  
  // 成功率のインサイト
  if (successRate.successRate < 70) {
    insights.push('⚠️ 添付直送の成功率が70%未満です。閾値の見直しを推奨します。');
  } else if (successRate.successRate >= 90) {
    insights.push('✅ 添付直送の成功率が90%以上で、非常に良好です。');
  }
  
  // フォールバック理由のインサイト
  const topReason = Object.entries(successRate.fallbackReasons)
    .sort((a, b) => b[1] - a[1])[0];
  
  if (topReason) {
    const [reason, count] = topReason;
    const percentage = Math.round((count / successRate.totalAttempts) * 100);
    insights.push(`📊 フォールバックの主要因は「${reason}」(${percentage}%)です。`);
  }
  
  // データ量のインサイト
  if (sizeDistribution.totalFiles < 10) {
    insights.push('ℹ️ データ量が少ないため、推奨値の精度が限定的です。');
  }
  
  return insights;
}

/**
 * ポリシー推奨APIレスポンスの生成
 * @param {number} days - 分析対象の日数
 * @returns {Promise<Object>} APIレスポンス形式の推奨データ
 */
export async function getPolicyRecommendations(days = 7) {
  try {
    const recommended = await calculateRecommendedPolicy(days);
    
    return {
      success: true,
      analysis: recommended.analysis,
      recommendations: recommended.recommendations,
      insights: recommended.insights,
      generatedAt: Date.now()
    };
  } catch (error) {
    console.error('Failed to get policy recommendations:', error);
    return {
      success: false,
      error: error.message,
      generatedAt: Date.now()
    };
  }
}