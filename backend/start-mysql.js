// 本地开发：经 SSH 隧道连接 MySQL 后启动 server.js
// ⚠️ 不要把真实凭据写进本文件（本仓库是公开仓库）。请先导出环境变量，或使用 backend/.env。
//   示例：
//     export DB_HOST=127.0.0.1 DB_PORT=13306 DB_USER=nfti
//     export DB_PASSWORD='<你的数据库密码>' DB_NAME=nfti
//     node start-mysql.js
process.env.DB_HOST = process.env.DB_HOST || '127.0.0.1'
process.env.DB_PORT = process.env.DB_PORT || '13306'
process.env.DB_USER = process.env.DB_USER || 'nfti'
// 密码只从环境变量读取，绝不硬编码
if (!process.env.DB_PASSWORD) {
  console.error('缺少 DB_PASSWORD 环境变量。请先设置，例如： export DB_PASSWORD=你的密码')
  process.exit(1)
}
process.env.DB_NAME = process.env.DB_NAME || 'nfti'

const srv = require('./server.js')
const PORT = process.env.PORT || 9000
srv.listen(PORT, '0.0.0.0', () => console.log('NFBTI Proxy running on port ' + PORT))
