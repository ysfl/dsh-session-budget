# 设计说明：会话预算与交接

> 红线：本文与由它衍生的任何仓库文档，不得出现真实的会话 ID、本机绝对路径、内部项目名、内部文档路径、账户余额或真实会话截图。

## 1. 产品边界

一个 DSH Web 插件，只回答一个问题：**这个会话现在值不值得继续，以及该不该交接。**

做：

- 会话顶栏徽标：估算花费、累计 token（M）、轮数；
- 弹出面板：多维判定依据、token 构成、缓存命中率、输出占比、每步均价、闲置时长、账户余额；
- 到阈值时在输入框上方给一条提醒（可「稍后」，升档再出现）；
- 一键交接：把六标题请求写进输入框并发送，由模型产出交接；草稿非空时二次确认，绝不静默覆盖；
- 「任务已完成，交接」入口。

不做：自动停任务、改别的插件数据、上传任何用量数据到远端、把经验阈值写死成唯一答案。

## 2. 架构（双半边）

```
host 半边（Node，跑在 DSH 进程里）
  ├─ 读本机 DSH 会话日志（persistence 新旧两代接口都兼容）
  ├─ 聚合：会话总量 / 逐轮 / 逐调用 prompt 大小 / 逐模型三桶 / 花费
  ├─ 余额：经 credentials 服务解析 DEEPSEEK_API_KEY，请求官方 /user/balance
  ├─ 暴露 GET /api/dsh-session-budget/session?id=<sessionId>  →  JSON
  └─ 暴露 GET /api/dsh-session-budget/balance                 →  JSON（60s 缓存）
client 半边（浏览器，Cordis 插件）
  ├─ 注册两个 Session 作用域的座（见 §4）
  ├─ 拉取上面的接口（带内存缓存 + 订阅刷新）
  └─ 渲染徽标 / 面板 / 提醒条
```

- 宿主接口**只读**，不写任何 DSH 数据。
- 会话 id 白名单校验（字母数字、`-`、`_`，限长 128），拒绝 `..`、路径分隔符、空字节。
- 旧宿主没有的字段一律声明可选，取不到走回退，不抛错；`credentials` 缺失时余额返回 `ok:false`，其余面板照常。
- 路由带 host / Origin 同源校验与 GET-only 限制；会话响应 `cache-control: no-store`，余额响应 `private, max-age=60`，失败时 `no-store`。

## 3. 模块清单

| 模块 | 职责 |
|---|---|
| `src/client/session-budget.ts` | 纯逻辑：阈值、多维判定、压缩计数、占比（最大余数法）、M/K 格式化、交接请求文案、费用三桶 |
| `src/client/handoff.ts` | 草稿保护：非空则先要求二次点击 |
| `src/client/use-handoff.ts` | 组合出 `run()` 与 `needsConfirm` |
| `src/client/session-badge.tsx` | 顶栏徽标与面板 |
| `src/client/handoff-dock.tsx` | 输入框上方提醒条；宽度对齐输入框 |
| `src/client/session-usage.ts` | 会话用量 + 判定快照的 hook；闲置时钟 |
| `src/client/api.ts` | 会话内存缓存 + 余额 60s 缓存 + 在途请求合并 |
| `src/client/store.ts` / `prefs.ts` | localStorage 偏好（前缀 + 版本后缀 + 每次读都校验） |
| `src/client/i18n.tsx` / `locales.ts` | `zh` 为键源，`en: Record<LocaleKey, string>` 由类型强制补齐 |
| `src/client/styles.ts` | 只用宿主主题 token |
| `src/client/dom.ts` | 找 composer 元素并量宽 |
| `src/client/format.ts` | 费用显示 |
| `src/pricing.ts` | 当前生效价目表 + 峰谷判定 |
| `src/usage.ts` | 会话日志解析与聚合，含「最后一次调用的 prompt + 输出」作为上下文口径 |
| `src/balance.ts` | 经 credentials 解析 API Key，请求官方余额接口 |
| `src/memo.ts` | 60s TTL memo；并发调用共享一次加载 |
| `src/index.ts` | host 入口与 `/session`、`/balance` 路由 |
| `src/contract.ts` / `context.ts` / `wire.ts` / `trust-fence.ts` | 契约、服务结构类型、响应、同源校验 |

## 4. 宿主契约

两个座都必须是 **Session 作用域**，否则拿不到发消息所需的 props：

| 座 | 类型 | 用途 | 关键 props |
|---|---|---|---|
| `conversation.session.header.utilities` | list，需 `id` | 徽标 | `t`、`sessionId`、`inputActions`、`useInput` |
| `conversation.input.dock` | list，需 `id` | 提醒条 | 同上 |

- `t` 由注册选项里的 `locale` 触发注入，和座的作用域无关。
- `inputActions` 至少含 `setDraft(text)` 与 `submit()`；`useInput(state => state.draft)` 读当前草稿。
- root 作用域的座（如 `conversation.header.leading`）**只有只读钩子**，发不出消息，不要往那儿挂。
- `conversation.composer.bar` 是 composer 本体（single），替换会顶掉输入框，不要用它做提醒条。

## 5. 判定模型

| 维度 | 触发 | 备注 |
|---|---|---|
| 上下文占用 | 最后一次**模型调用**的 prompt+输出占窗口 ≥50% 提醒、≥75% 该走 | 窗口默认 1,000,000，取自宿主配置，换模型可能不准 |
| 每轮新增 | 只展示 | 看变重速度 |
| 上下文压缩 | 某次调用相对前高骤降 ≥40%，**并计次数** | 启发式，只可能过早提醒 |
| 缓存命中率 | <50% | 每步都在按未命中价重读 |
| 闲置时长 | 超过设定阈值（默认 3 小时，**猜测值，可改**） | 官方未公布前缀缓存 TTL，文案必须写「估算」 |
| 输出占比 | 只展示（token 占比 + **花费占比**） | 输出单价是输入的 4 倍、缓存命中的约 200 倍 |
| 每步均价 | 最近 10 步 vs 之前 10 步（不足 20 步对半分） | 只展示涨跌 |
| 会话预算 | 超过用户设定的单会话花费 | 默认关闭，没有普适默认值 |
| 模型调用 | 上下文已 ≥50% 时，≥150/≥300 才计入 | **单独步数不算理由**：实测一次 292 次调用、上下文 36%、缓存 99.7% 的健康会话，被裸阈值误报 |

**累计 token 只展示、不参与判定。** 上下文用「最后一次调用」口径，不要用「轮级累计」或「会话累计」。

## 6. 已定决策

1. 包名与 scope：`@ysfl/dsh-session-budget`，插件 id `dsh-session-budget`。
2. 保留费用估算，只维护当前生效价目表（峰谷价），不追溯历史档位。旧会话按今天的表重算。
3. 默认阈值沿用本文：上下文 50%/75%、调用 150/300、缓存 50%、闲置 3 小时、预算默认关闭。
4. 做账户余额：经宿主 `credentials` 服务读取 `DEEPSEEK_API_KEY`，只向 DeepSeek 官方 `/user/balance` 发 GET，60 秒缓存；Key 不落库、不打印、不转发。`credentials` 缺失时余额返回 `ok:false`，面板显示「未取到余额」，其余数字照常。
5. 安装不依赖 npm 账号：提供 GitHub（`github:ysfl/dsh-session-budget`）、本地 Git 仓（`git+file:///…`）、本地目录与 `pnpm pack` 压缩包四种装法；Git 安装由 `prepare` 在本机构建 `lib/`。

## 7. 隐私红线

- 代码、注释、测试、文档、截图里**不得出现**：真实会话 ID、本机绝对路径、内部项目名、内部文档路径、客户名称、账户余额真值。
- 测试与示例用**合成 ID** 与合成数值；余额测试用假 Key 与假响应，不请求真实接口。
- 截图用构造数据重拍：会话标题用中性占位，不拍真实侧栏与会话列表。
- 不提交任何 `.env`、凭据、token 文件；`.gitignore` 覆盖 `node_modules/`、`lib/`、`*.log`。
- 提交前自检：`git ls-files` 全量检查上述禁项，外加常见密钥前缀、私钥头与本机绝对路径。
- `.gitignore` 对**已跟踪**文件无效，判断「会不会被发布」必须用 `git ls-files`。

## 8. 验证方案

- 单测（`pnpm test`）：阈值边界、占比恒等 100、压缩计数、上下文口径（单轮多步不被误判）、草稿保护、预算触发；宿主侧聚合覆盖两代 persistence 接口、非法 id、坏记录跳过；余额覆盖成功解析、缺凭据/缺 Key、HTTP 失败、响应不可解析，以及路由的 60s memo 与 `?refresh=1` 绕过。
- 隔离渲染实测：esbuild 打包组件 → 静态页 + 伪造 `/session` 与 `/balance` 响应 → 量宽度、查溢出、验证三档变色、Escape 归焦、发送调用记录；明暗两套主题各跑一遍。已完成 14 项检查（徽标文案、dock 与输入框等宽、面板 9 个维度、账户余额行、面板不出视口、无横向溢出、Escape 关闭、空草稿一键发送、非空草稿二次确认、无页面错误），截图留在本机临时目录，未随仓库发布。
- 门槛：`typecheck`、`test`、`build` 三条；截图与几何数据留档。

## 9. 里程碑

1. **骨架**：仓结构 + 双半边 + CI + 空实现跑通 build/test。
2. **内核**：搬纯逻辑 + 测试，28 条断言全绿。
3. **接线**：宿主侧会话聚合 + `/session` 路由；客户端两个座 + 面板 + 提醒条；单测覆盖聚合。
4. **实测**：用构造数据做隔离渲染并出截图（已完成，见 §8）。
