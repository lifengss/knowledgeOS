---
type: test-case
case_id: TC-001
status: active
related_rules: [QR-001]
api_dependencies: [userService.login, authService.validate]
created: 2026-07-15
updated: 2026-07-15
---

# 测试用例：用户登录

## Compiled Truth

正向用例：使用有效账号密码登录，验证返回 token 和用户信息。

## Timeline

- 2026-07-15: 初始创建
