# @ysfl/dsh-session-budget

DSH（DeepSeek Harness）Web 插件，只回答一个问题：**这个会话现在值不值得继续，以及该不该交接。**

会话顶栏显示徽标，接近收尾阈值时在输入框上方给一条提醒，点一下就把交接请求发进当前对话，由模型按六个标题汇总。会话数字来自本机会话日志，余额来自 DeepSeek 官方接口；不写任何 DSH 数据，不上传用量。

## 能看到什么

- **顶栏徽标**：估算花费 · 累计 token · 完成轮数，按状态变色。
- **弹出面板**：上下文占用、每轮新增、缓存命中率、上下文压缩次数、输出占比（token 与花费两条）、每步均价、闲置时长、单会话预算、模型调用次数、账户余额。
- **输入框提醒**：任一判断依据命中时出现，可「稍后」，升档后再次出现。
- **一键交接**：把六标题请求写进输入框并发送；输入框已有内容时，第一次点击只提示、不覆盖，第二次点击才替换。
- **任务已完成，交接**：话题结束时主动交接，不靠计数器猜。

## 安装

四种装法任选一种，装好后重启 DSH 生效。`--profile` 换成你实际在跑的 profile：桌面端是 `desktop`，命令行 Web 端是 `web`。host 半边改动需要重启，纯 client 改动刷新页面即可；插件管理器热加载时可能无需重启。

### 从 npm（已发布时）

```sh
dsh plugin --profile web add @ysfl/dsh-session-budget
```

### 从 GitHub

```sh
dsh plugin --profile web add github:ysfl/dsh-session-budget
```

仓库推送到 GitHub 后即可用，不需要 npm 账号。

### 从本地 Git 仓（不需要 GitHub 或 npm 账号）

在已经 clone 到本机的仓库目录外执行：

```sh
dsh plugin --profile web add git+file:///path/to/dsh-session-budget
```

Git 装法会在本机跑一次 `prepare` 构建 `lib/`，需要 Node.js ≥ 20；首次安装会比 npm 慢一些。

### 从本地目录或打包文件

```sh
git clone https://github.com/ysfl/dsh-session-budget.git
cd dsh-session-budget
pnpm install
pnpm run build
dsh plugin --profile web add /path/to/dsh-session-budget
```

也可以先 `pnpm pack`，再装生成的压缩包：

```sh
dsh plugin --profile web add ./ysfl-dsh-session-budget-0.1.0.tgz
```

## 口径

| 维度 | 怎么算 |
|---|---|
| 上下文占用 | 最近一轮**最后一次模型调用**的 prompt + 输出，占窗口 1,000,000 的比例。不是轮级累计，也不是会话累计。 |
| 每轮新增 | 最近两次调用的上下文差；压缩后会变成负数。 |
| 上下文压缩 | 某次调用相对前高骤降 ≥40%，并计次数。启发式，只可能过早提醒。 |
| 缓存命中率 | `cache / (input + cache)`。`input` 只计未命中部分。 |
| 输出占比 | token 占比与花费占比分别展示。输出单价是输入的 4 倍、缓存命中的约 200 倍。 |
| 每步均价 | 最近 10 轮与之前 10 轮比较；不足 20 轮时对半分。 |
| 闲置时长 | 距最后一条用量记录的时间。默认 3 小时，可改；官方未公布前缀缓存 TTL，这个数是估算。 |
| 会话预算 | 用户设定的单会话花费，默认关闭；没有普适默认值。 |
| 模型调用 | 只有上下文已 ≥50% 时才计入判断。单独的次数不算理由。 |
| 账户余额 | 通过宿主凭据服务读取 `DEEPSEEK_API_KEY`，向 DeepSeek 官方 `/user/balance` 查询；结果缓存 60 秒。未配置 Key 时面板显示「未取到余额」。 |

累计 token 只展示，不参与判断。

判定阈值：上下文 50% 提醒、75% 该走；模型调用 150 / 300 次；缓存命中率低于 50%；闲置超过设定时长；发生过上下文压缩；超过单会话预算。任一条命中就建议交接。

### 费用估算

保留费用估算，价目表只维护**当前生效**的一档：峰时 09:00–12:00、14:00–18:00（北京时间，周一至周五），闲时为峰时的一半，单位 CNY / 1M tokens。

| 模型 | 峰时 缓存命中 / 输入 / 输出 | 闲时 |
|---|---|---|
| `deepseek-flash` | 0.04 / 2 / 8 | 0.02 / 1 / 4 |
| `deepseek-v4-pro` | 0.30 / 9 / 27 | 0.15 / 4.5 / 13.5 |

旧会话按今天的价目表重算，不做历史档位追溯——这里回答的是「这个会话现在值多少」，不是「上月账单为什么是这个数」。价目表变化时改 `src/pricing.ts` 一处即可。

## 隐私与边界

- 会话用量只读本机日志，经同源接口 `/api/dsh-session-budget/session?id=…` 返回给页面；不写 DSH 数据。
- 余额通过宿主凭据服务解析 `DEEPSEEK_API_KEY`，只向 DeepSeek 官方 `/user/balance` 发一次 GET；Key 不落库、不打印、不转发到其他地址。
- 会话 id 走白名单校验（字母、数字、`-`、`_`，限长 128），拒绝路径分隔符、`..` 与空字节。
- 不向任何第三方上传用量数据；除余额查询外没有出站请求。
- 测试与示例使用合成会话 id 与合成数值。

## 已知限制

- 上下文窗口按 1,000,000 估算；宿主没有按模型暴露窗口的接口，换模型后可能不准。
- 余额依赖本机已配置的 `DEEPSEEK_API_KEY`；未配置或接口不可用时，面板显示「未取到余额」，其余数字照常。
- 价格表是手工维护的；官方调价后需要发版。
- 旧宿主若不带 `lastCallTokens`，上下文回退为「本轮总 token ÷ 调用次数」。
- 一句话：数字是估算，用来判断该不该交接，不用来对账。

## 开发

需要 Node.js ≥ 20 与 pnpm。

```sh
pnpm install
pnpm run typecheck   # tsc --noEmit + 测试 tsconfig
pnpm test            # esbuild 打包 test/*.test.ts 后交给 node --test
pnpm run build       # 产出 lib/（host 半边 + client 半边）
```

设计说明见 [docs/DESIGN.md](./docs/DESIGN.md)，参与方式见 [CONTRIBUTING.md](./CONTRIBUTING.md)。

## 许可证

MIT
