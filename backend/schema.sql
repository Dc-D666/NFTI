-- NFTI MySQL 数据库结构
-- 推荐 MySQL >= 5.7（需支持 JSON 类型），建议使用 8.0
-- 注意：本文件与 backend/db.mysql.js 内嵌 SCHEMA 必须保持一致。
-- 实际运行以 db.mysql.js 的 initDb 自动建表为准，本文件用于手动建库/文档参考。
-- 创建数据库后执行本文件：mysql -u root -p nfti < schema.sql

CREATE DATABASE IF NOT EXISTS `nfti`
  CHARACTER SET utf8mb4
  COLLATE utf8mb4_unicode_ci;

USE `nfti`;

-- 用户表：通过 QQ 频道的 tiny_id 唯一标识
CREATE TABLE IF NOT EXISTS users (
  id CHAR(36) PRIMARY KEY,
  tiny_id VARCHAR(64) NOT NULL,
  nick VARCHAR(128) DEFAULT NULL,
  gender VARCHAR(16) DEFAULT NULL,
  province VARCHAR(64) DEFAULT NULL,
  country VARCHAR(64) DEFAULT NULL,
  avatar_url TEXT DEFAULT NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  UNIQUE KEY uk_users_tiny_id (tiny_id),
  KEY idx_users_nick (nick)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 测试结果表：assessment_type 区分 NFTI / 霍兰德，guest_id 支持游客
CREATE TABLE IF NOT EXISTS test_results (
  id CHAR(36) PRIMARY KEY,
  assessment_type VARCHAR(32) NOT NULL DEFAULT 'nfti',
  user_id CHAR(36) DEFAULT NULL,
  tiny_id VARCHAR(64) DEFAULT NULL,
  guest_id VARCHAR(64) DEFAULT NULL,
  mode VARCHAR(16) NOT NULL DEFAULT 'full',
  type_code VARCHAR(64) NOT NULL,
  type_name VARCHAR(128) NOT NULL,
  scores JSON NOT NULL,
  answers JSON NOT NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  KEY idx_results_user_id (user_id),
  KEY idx_results_tiny_id (tiny_id),
  KEY idx_results_guest_id (guest_id),
  KEY idx_results_created_at (created_at),
  KEY idx_results_type_code (type_code),
  CONSTRAINT fk_results_user_id
    FOREIGN KEY (user_id) REFERENCES users(id)
    ON DELETE SET NULL
    ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- AI 聊天记录表：每个登录用户最多一条记录
CREATE TABLE IF NOT EXISTS ai_chats (
  id CHAR(36) PRIMARY KEY,
  user_id CHAR(36) DEFAULT NULL,
  tiny_id VARCHAR(64) DEFAULT NULL,
  messages JSON NOT NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  UNIQUE KEY uk_chats_user_id (user_id),
  KEY idx_chats_tiny_id (tiny_id),
  CONSTRAINT fk_chats_user_id
    FOREIGN KEY (user_id) REFERENCES users(id)
    ON DELETE CASCADE
    ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 站点计数器：counter = 完成测试数，page_visits = 页面访问数
CREATE TABLE IF NOT EXISTS app_stats (
  id TINYINT NOT NULL DEFAULT 1 PRIMARY KEY,
  counter BIGINT NOT NULL DEFAULT 0,
  page_visits BIGINT NOT NULL DEFAULT 0
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT IGNORE INTO app_stats (id, counter, page_visits) VALUES (1, 0, 0);

-- NFTI × 霍兰德交叉分析缓存：按用户（或游客）+ 双 code 唯一
CREATE TABLE IF NOT EXISTS cross_analyses (
  id CHAR(36) PRIMARY KEY,
  tiny_id VARCHAR(64) DEFAULT NULL,
  guest_id VARCHAR(64) DEFAULT NULL,
  nfti_code VARCHAR(64) NOT NULL,
  holland_code VARCHAR(64) NOT NULL,
  content TEXT NOT NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  UNIQUE KEY uk_cross_user_codes (tiny_id, nfti_code, holland_code),
  KEY idx_cross_guest (guest_id, nfti_code, holland_code)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 内测邀请码
CREATE TABLE IF NOT EXISTS invite_codes (
  code VARCHAR(32) NOT NULL PRIMARY KEY,
  used TINYINT(1) NOT NULL DEFAULT 0,
  multi_use TINYINT(1) NOT NULL DEFAULT 0,
  browser_fingerprint VARCHAR(128) DEFAULT NULL,
  session_token VARCHAR(64) DEFAULT NULL,
  used_at DATETIME(3) DEFAULT NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  KEY idx_invite_used (used),
  KEY idx_session_token (session_token)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 默契度分享口令：一份测试结果一个口令，30 天过期（惰性判断），可手动停用
CREATE TABLE IF NOT EXISTS share_codes (
  code VARCHAR(20) NOT NULL PRIMARY KEY,
  result_id CHAR(36) NOT NULL,
  owner_tiny_id VARCHAR(64) NOT NULL,
  assessment_type VARCHAR(32) NOT NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  expires_at DATETIME(3) NOT NULL,
  revoked TINYINT(1) NOT NULL DEFAULT 0,
  UNIQUE KEY uk_share_result (result_id),
  KEY idx_share_owner (owner_tiny_id),
  KEY idx_share_expires (expires_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 默契度结果缓存：a（口令主人）× b（配对者）一次一算，AI 剧本随行缓存
CREATE TABLE IF NOT EXISTS match_results (
  id CHAR(36) PRIMARY KEY,
  share_code VARCHAR(20) NOT NULL,
  a_tiny_id VARCHAR(64) NOT NULL,
  b_tiny_id VARCHAR(64) NOT NULL,
  a_result_id CHAR(36) NOT NULL,
  b_result_id CHAR(36) NOT NULL,
  a_assessment VARCHAR(32) NOT NULL,
  b_assessment VARCHAR(32) NOT NULL,
  score INT NOT NULL,
  level VARCHAR(16) NOT NULL,
  data JSON NOT NULL,
  ai_story TEXT DEFAULT NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  KEY idx_match_share (share_code),
  KEY idx_match_owner (a_tiny_id),
  KEY idx_match_b (b_tiny_id),
  UNIQUE KEY uk_match_pair (share_code, a_result_id, b_result_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
