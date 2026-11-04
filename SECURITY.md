# 安全说明

## 插件读什么

- 本机 DSH 会话日志，仅通过宿主 `sessionPersistence` 服务按会话 id 读取；
- 会话 id 来自页面上的当前会话，返回给页面的是聚合后的 token、费用与轮次，不含消息正文；
- 余额查询通过宿主 `credentials` 服务解析 `DEEPSEEK_API_KEY`，键值只在内存中用于一次请求头，不落盘、不打印、不返回给页面。

## 插件不做什么

- 不向任何第三方上传用量或会话内容；
- 不写 DSH 数据；
- 不把会话 id、标题、日志内容或 API Key 写入 localStorage（只有两个用户偏好：缓存过期阈值、单会话预算）。

## 网络面

- 入站：同源的 `GET /api/dsh-session-budget/session?id=…` 与 `GET /api/dsh-session-budget/balance`，带 host / Origin 同源校验与 GET-only 限制。
- 出站：仅余额查询，向 DeepSeek 官方 `https://api.deepseek.com/user/balance` 发一次 GET（20 秒超时），结果缓存 60 秒。除此之外没有出站请求。

## 报告漏洞

请通过 GitHub Security Advisory 私密报告，不要在公开 issue 里贴日志原文、会话 id 或任何凭据。修复发布前请不要公开细节。
