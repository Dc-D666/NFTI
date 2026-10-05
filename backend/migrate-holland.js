// 数据库迁移：霍兰德职业测评所需字段
// 用法: node migrate-holland.js
// 从环境变量读取数据库配置（与 db.mysql.js 一致）
const mysql = require('mysql2/promise');

const config = {
  host: process.env.DB_HOST || '127.0.0.1',
  port: Number(process.env.DB_PORT || 13306),
  user: process.env.DB_USER || 'nfti',
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME || 'nfti',
};

if (!config.password) {
  console.error('请设置环境变量 DB_PASSWORD');
  process.exit(1);
}

(async () => {
  const conn = await mysql.createConnection(config);
  try {
    await conn.execute(`ALTER TABLE test_results ADD COLUMN assessment_type VARCHAR(32) NOT NULL DEFAULT 'nfti'`);
    console.log('ADD COLUMN assessment_type done');
  } catch (e) {
    if (e.errno === 1060) console.log('Column assessment_type already exists');
    else throw e;
  }
  try {
    await conn.execute(`ALTER TABLE test_results MODIFY COLUMN type_code VARCHAR(64) NOT NULL`);
    console.log('MODIFY type_code done');
  } catch (e) { console.log('MODIFY type_code:', e.message) }
  try {
    await conn.execute(`ALTER TABLE test_results MODIFY COLUMN type_name VARCHAR(128) NOT NULL`);
    console.log('MODIFY type_name done');
  } catch (e) { console.log('MODIFY type_name:', e.message) }
  await conn.end();
  console.log('Migration complete');
})()
