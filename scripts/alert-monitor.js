/**
 * 异常告警监控脚本
 * 监控冲突堆积、入库失败、向量嵌入异常，输出到告警日志文件
 */

const Database = require('better-sqlite3');
const fs = require('fs');
const path = require('path');

const DB_PATH = process.env.CACHE_DB_PATH || path.join(__dirname, '..', 'cache', 'drafts.db');
const ALERT_LOG_PATH = process.env.ALERT_LOG_PATH || path.join(__dirname, '..', 'cache', 'alerts.log');

const CONFLICT_THRESHOLD = parseInt(process.env.CONFLICT_ALERT_THRESHOLD || '10', 10);
const COMMIT_FAIL_THRESHOLD = parseInt(process.env.COMMIT_FAIL_ALERT_THRESHOLD || '5', 10);
const EMBED_FAIL_THRESHOLD = parseInt(process.env.EMBED_FAIL_ALERT_THRESHOLD || '3', 10);

function writeAlert(level, category, message, detail) {
  const timestamp = new Date().toISOString();
  const line = `[${timestamp}] [${level}] [${category}] ${message} | ${JSON.stringify(detail)}\n`;
  fs.appendFileSync(ALERT_LOG_PATH, line);
  console.log(`[alert-monitor] ${line.trim()}`);
}

function checkConflicts(db) {
  const stmt = db.prepare(`SELECT COUNT(*) as count FROM conflicts WHERE resolution IS NULL`);
  const { count } = stmt.get();
  if (count >= CONFLICT_THRESHOLD) {
    writeAlert('WARNING', 'conflict_pileup', `未处理冲突数量 ${count}，超过阈值 ${CONFLICT_THRESHOLD}`, { count });
  }
}

function checkCommitFailures(db) {
  const stmt = db.prepare(`
    SELECT COUNT(*) as count FROM audit_log
    WHERE action = 'commit' AND detail LIKE '%failed%'
      AND created_at > datetime('now', '-1 hour')
  `);
  const { count } = stmt.get();
  if (count >= COMMIT_FAIL_THRESHOLD) {
    writeAlert('ERROR', 'commit_failure', `近 1 小时入库失败 ${count} 次，超过阈值 ${COMMIT_FAIL_THRESHOLD}`, { count });
  }
}

function checkEmbedFailures() {
  // 读取 GBrain 嵌入日志或检查索引状态，这里简化为检查环境变量模拟
  const embedFailCount = parseInt(process.env.EMBED_FAIL_COUNT || '0', 10);
  if (embedFailCount >= EMBED_FAIL_THRESHOLD) {
    writeAlert('ERROR', 'embed_failure', `向量嵌入失败 ${embedFailCount} 次，超过阈值 ${EMBED_FAIL_THRESHOLD}`, { count: embedFailCount });
  }
}

function runAlertMonitor() {
  const db = new Database(DB_PATH);
  try {
    checkConflicts(db);
    checkCommitFailures(db);
    checkEmbedFailures();
    console.log('[alert-monitor] 监控检查完成');
  } finally {
    db.close();
  }
}

if (require.main === module) {
  runAlertMonitor();
}

module.exports = { runAlertMonitor };
