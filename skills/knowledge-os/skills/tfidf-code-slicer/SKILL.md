---
name: tfidf-code-slicer
description: 解析代码文件，提取接口定义与方法调用关系，输出结构化 JSON
triggers:
  - 解析这个代码文件
  - 提取接口和调用关系
  - TF-IDF 代码切片
  - slice code
  - 分析代码依赖
mutating: false
writes_pages: false
---

# tfidf-code-slicer

## 目标

解析业务代码文件（.py / .js / .ts / .java），提取：

1. 接口定义（函数签名、参数、返回值）
2. 方法调用关系
3. 模块归属

输出结构化 JSON，供 `api-graph-builder` 使用。

## 触发条件

- 业务代码更新后
- 用户要求更新 API 依赖图谱
- `api-graph-builder` 调用

## 输入

- `codePath`: 代码文件路径或目录路径
- `language`: 代码语言（可选，自动检测）

## 处理流程

1. 如果是目录，递归收集支持的代码文件
2. 使用 Python 脚本 `scripts/tfidf-slicer.py` 解析 AST
3. 提取函数/方法定义、类定义、调用关系
4. 计算 TF-IDF 相似度（用于识别重复/相似接口）
5. 输出 JSON

## 输出格式

```json
{
  "interfaces": [
    {
      "id": "userService.login",
      "module": "UserService",
      "name": "login",
      "params": ["username", "password"],
      "returns": "Token",
      "file": "src/services/userService.ts"
    }
  ],
  "dependencies": [
    {
      "from": "userService.login",
      "to": "authService.validate",
      "type": "precondition"
    }
  ],
  "similarities": [
    {
      "interfaceA": "userService.login",
      "interfaceB": "adminService.login",
      "score": 0.82
    }
  ]
}
```

## 约束

- 不修改任何文件
- 不调用 LLM
- 仅支持常见语言：Python、JavaScript、TypeScript、Java
- 复杂动态调用可能无法解析，需人工补充

## 调用方式

```bash
python scripts/tfidf-slicer.py <codePath>
```

或通过 Node.js 子进程调用：

```javascript
const { sliceCode } = require('./sdk/python/tfidf-slicer');
const result = sliceCode('./src');
```
