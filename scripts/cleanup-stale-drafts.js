/**
 * 缓冲层过期草稿定时清理脚本
 * 清理超过阈值（默认 30 天）仍处于 pending 状态的草稿
 */

const Database = require('better-sqlite3');
const path = require('path');

const DB_PATH = process.env.CACHE_DB_PATH || path.join(__dirname, '..', 'cache', 'drafts.db');
const STALE_DAYS = parseInt(process.env.STALE_DRAFT_DAYS || '30', 10);

function cleanupStaleDrafts() {
  const db = new Database(DB_PATH);
  try {
    const thresholdDate = new Date();
    thresholdDate.setDate(thresholdDate.getDate() - STALE_DAYS);
    const threshold = thresholdDate.toISOString();

    const stmt = db.prepare(`
      UPDATE drafts
      SET status = 'expired', updated_at = datetime('now')
      WHERE status = 'pending' AND created_at < ?
    `);
    const result = stmt.run(threshold);

    console.log(`[cleanup-stale-drafts] 已清理 ${result.changes} 条过期草稿（超过 ${STALE_DAYS} 天）`);

    // 记录审计日志
    const auditStmt = db.prepare(`
      INSERT INTO audit_log (id, action, operator, target, detail, created_at)
      VALUES (lower(hex(randomblob(16))), 'cleanup_stale_drafts', 'system', 'drafts', ?, datetime('now'))
    `);
    auditStmt.run(JSON.stringify({ expiredCount: result.changes, threshold }));
  } finally {
    db.close();
  }
}

if (require.main === module) {
  cleanupStaleDrafts();
}

module.exports = { cleanupStaleDrafts };
