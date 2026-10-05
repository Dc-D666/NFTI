const { execFile } = require('child_process')
const fs = require('fs')
const http = require('http')
const https = require('https')
const path = require('path')

const CLI = (() => {
  const isWin = process.platform === 'win32'
  const candidates = isWin ? [
    // Windows: 优先 .exe 直调，跳过 Node.js 包装器
    path.resolve(__dirname, 'node_modules', 'tencent-channel-cli-win32-x64', 'bin', 'tencent-channel-cli.exe'),
    path.resolve(__dirname, 'node_modules', '.bin', 'tencent-channel-cli.cmd'),
    path.resolve(__dirname, 'node_modules', '.bin', 'tencent-channel-cli'),
    'tencent-channel-cli',
  ] : [
    // Linux/其他: 优先原生二进制，跳过 Node.js 包装器
    path.resolve(__dirname, 'node_modules', 'tencent-channel-cli-linux-x64', 'bin', 'tencent-channel-cli'),
    path.resolve(__dirname, 'node_modules', 'tencent-channel-cli-linux-arm64', 'bin', 'tencent-channel-cli'),
    path.resolve(__dirname, 'node_modules', '.bin', 'tencent-channel-cli'),
    'tencent-channel-cli',
  ]
  for (const p of candidates) {
    if (fs.existsSync(p)) return p
  }
  return candidates[0]
})()

function clearWindowsCredential() {
  if (process.platform !== 'win32') return
  try {
    require('child_process').execSync('cmdkey /delete:LegacyGeneric:target=qq-cli:token', { stdio: 'ignore', timeout: 5000 })
  } catch (_) {}
}

function saveBase64Image(homeDir, base64Data) {
  const pure = base64Data.replace(/^data:image\/\w+;base64,/, '')
  const buffer = Buffer.from(pure, 'base64')
  const filePath = path.join(homeDir, 'share-card.png')
  fs.writeFileSync(filePath, buffer)
  return filePath
}

function runCli(args, timeoutMs = 60000, env) {
  return new Promise((resolve, reject) => {
    const fullArgs = [...args, '--json']
    const options = { timeout: timeoutMs }
    if (env) {
      options.env = { ...process.env, ...env }
    }

    execFile(CLI, fullArgs, options, (error, stdout, stderr) => {
      const jsonLines = (stdout || '').split('\n').filter(l => l.trim().startsWith('{'))
      if (jsonLines.length > 0) {
        try {
          resolve(JSON.parse(jsonLines[jsonLines.length - 1]))
          return
        } catch (_) {}
      }

      if (error) {
        if (error.code === 'ETIMEDOUT' || error.killed) {
          resolve({ success: false, data: { status: 'pending_authorization' }, _timeout: true })
          return
        }
        return reject(new Error(`CLI error: ${error.message}\nstderr: ${stderr}\nstdout: ${stdout}`))
      }

      reject(new Error(`Invalid JSON output. stdout: ${stdout}\nstderr: ${stderr}`))
    })
  })
}

function runCliWithStdin(stdinJson, args, timeoutMs = 60000, env) {
  return new Promise((resolve, reject) => {
    const { spawn } = require('child_process')
    const fullArgs = [...args, '--json']
    const options = { timeout: timeoutMs, stdio: ['pipe', 'pipe', 'pipe'] }
    if (process.platform === 'win32') options.shell = true
    if (env) {
      options.env = { ...process.env, ...env }
    }

    const child = spawn(CLI, fullArgs, options)
    let stdout = ''
    let stderr = ''

    child.stdout.on('data', (data) => { stdout += data.toString() })
    child.stderr.on('data', (data) => { stderr += data.toString() })

    child.stdin.write(stdinJson)
    child.stdin.end()

    child.on('close', (code) => {
      const jsonLines = stdout.split('\n').filter(l => l.trim().startsWith('{'))
      if (jsonLines.length > 0) {
        try {
          resolve(JSON.parse(jsonLines[jsonLines.length - 1]))
          return
        } catch (_) {}
      }
      if (code !== 0 && stderr) {
        resolve({ success: false, error: { message: stderr.trim() } })
        return
      }
      resolve({ success: false, error: { message: `stdout: ${stdout.slice(0, 100)}` } })
    })

    child.on('error', (err) => {
      reject(new Error(`CLI spawn error: ${err.message}`))
    })
  })
}

module.exports = { runCli, runCliWithStdin, runCliCaptureRaw, extractOwnTinyId, CLI, clearWindowsCredential, saveBase64Image }

// ─── 原始 MCP 响应捕获（身份直取用，2026-08-15 与 PatPlayer 同源）───
// CLI 的 get-user-info 展示层丢弃 msgUserInfo.uint64MemberTinyid（本人 tiny_id），
// 但底层 MCP 网关原始响应包含完整字段（本地代理转发捕获）。
// 直取本人 tiny_id → 无需成员搜索 → 彻底规避同名歧义（如频道内几十个 "." 昵称）。

// QQ MCP 网关地址（CLI 默认目标）
const MCP_TARGET = 'https://graph.qq.com/mcp_gateway/open_platform_agent_mcp/mcp'

/**
 * 运行 CLI 并捕获原始 MCP 响应。
 * @returns {Promise<{stdout: string, captured: string[], error: Error|null}>}
 */
function runCliCaptureRaw(args, timeoutMs = 60000, env) {
  return new Promise((resolve, reject) => {
    const captured = []
    const server = http.createServer((req, res) => {
      const chunks = []
      req.on('data', (c) => chunks.push(c))
      req.on('end', () => {
        const body = Buffer.concat(chunks)
        const headers = {}
        for (const [k, v] of Object.entries(req.headers)) {
          if (['host', 'content-length', 'connection', 'accept-encoding'].includes(k)) continue
          headers[k] = v
        }
        const preq = https.request(MCP_TARGET, { method: 'POST', headers }, (pres) => {
          const rchunks = []
          pres.on('data', (c) => rchunks.push(c))
          pres.on('end', () => {
            const rbody = Buffer.concat(rchunks)
            captured.push(rbody.toString('utf8'))
            res.writeHead(pres.statusCode || 200, {
              'Content-Type': 'application/json',
              'Content-Length': rbody.length,
            })
            res.end(rbody)
          })
        })
        preq.on('error', () => {
          res.writeHead(502, { 'Content-Length': '0' })
          res.end()
        })
        preq.write(body)
        preq.end()
      })
    })
    server.on('error', reject)
    server.listen(0, '127.0.0.1', () => {
      const port = server.address().port
      const runEnv = {
        ...process.env,
        ...(env || {}),
        QQ_AI_CONNECT_MCP_URL: `http://127.0.0.1:${port}/mcp`,
      }
      execFile(CLI, [...args, '--json'], { timeout: timeoutMs, env: runEnv }, (error, stdout) => {
        try { server.close() } catch (_) { /* 已关闭 */ }
        resolve({ stdout: stdout || '', captured, error })
      })
    })
  })
}

/**
 * 从原始 MCP 响应中提取本人 tiny_id（get-user-info 场景）。
 * 字段 uint64MemberTinyid 即当前会话（token）所属账号的 tiny_id，无同名歧义。
 */
function extractOwnTinyId(captured) {
  for (const text of captured || []) {
    try {
      const data = JSON.parse(text)
      const sc = data && data.result && data.result.structuredContent
      if (sc && sc.msgUserInfo && sc.msgUserInfo.uint64MemberTinyid) {
        return String(sc.msgUserInfo.uint64MemberTinyid)
      }
    } catch (_) { /* 非 JSON 跳过 */ }
    const m = text.match(/"uint64MemberTinyid"\s*:\s*"(\d+)"/)
    if (m) return m[1]
  }
  return ''
}
