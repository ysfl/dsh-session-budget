# 安全说明

## 插件读什么

- 本机 DSH 会话日志，仅通过宿主 `sessionPersistence` 服务按会话 id 读取；
- 会话 id 来自页面上的当前会话，返回给页面的是聚合后的 token、费用与轮次，不含消息正文。

## 插件不做什么

- 不读取凭据，不请求账户余额；
- 不向任何远端服务上传用量或会话内容；
- 不写 DSH 数据；
- 不把会话 id、标题或日志内容写入 localStorage（只有两个用户偏好：缓存过期阈值、单会话预算）。

## 网络面

唯一的路由是同源的 `GET /api/dsh-session-budget/session?id=…`，带 host / Origin 同源校验与 GET-only 限制。除此之外没有出站请求。

## 报告漏洞

请通过 GitHub Security Advisory 私密报告，不要在公开 issue 里贴日志原文、会话 id 或任何凭据。修复发布前请不要公开细节。
