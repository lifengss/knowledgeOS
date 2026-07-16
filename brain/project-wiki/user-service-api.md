---
type: project-wiki
page_id: PW-001
category: api-contracts
status: active
created: 2026-07-15
updated: 2026-07-15
---

# API 契约：用户服务接口

## Compiled Truth

用户服务提供登录、登出、获取用户信息三个核心接口。
- 登录接口：POST /api/users/login，入参 username/password，返回 token
- 获取用户：GET /api/users/{id}，需携带 token

## Timeline

- 2026-07-15: 初始创建
