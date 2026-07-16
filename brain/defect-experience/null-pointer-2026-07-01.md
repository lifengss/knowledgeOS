---
type: defect
defect_id: DEF-001
defect_type: null-pointer
severity: high
related_cases: [TC-001]
created: 2026-07-01
---

# 空指针异常：用户服务 getUserById 方法

## Compiled Truth

调用 getUserById 时未校验入参 userId 是否为 null，导致 NPE。

## Timeline

- 2026-07-01: 缺陷发现，JIRA TICKET-001
- 2026-07-03: 修复并补充校验规则 QR-045
