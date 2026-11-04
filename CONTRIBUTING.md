# 参与贡献

本仓库是 DSH（DeepSeek Harness）的 Web 插件，只做「这个会话该不该交接」这一件事。动手前请读完这一页，它只约定**本仓库**自己的做法。

## 环境与命令

需要 Node.js ≥ 20 与 pnpm。

```sh
pnpm install
pnpm run typecheck   # tsc --noEmit + 测试 tsconfig
pnpm test            # esbuild 打包 test/*.test.ts 后交给 node --test
pnpm run build       # 产出 lib/（host 半边 + client 半边）
```

提交前 `typecheck`、`test`、`build` 三条都要通过，CI 对 PR 跑同样的三条。

本地看效果：把仓库以 `link:` 方式装进某个 DSH profile，然后重启 DSH。host 半边改动必须重启，纯 client 改动刷新页面即可。

## 代码约定

- **注释写「为什么」，不写「做了什么」**。看起来可以随手改掉的常量、看似绕远的写法，都要交代它挡住的具体问题。
- 纯逻辑下沉到不依赖 React 的文件（`src/client/session-budget.ts`、`src/client/handoff.ts`），由 `test/` 直接覆盖；组件只做渲染与宿主交互。
- 新增阈值或口径，必须同时给出：默认值、为什么是这个默认值、用户能否改。猜出来的数字要在文案与注释里写明是猜测。
- 样式只用宿主主题 token（`--dsw-alias-*`）。写死颜色会在明暗两种主题里失效；新 token 名先在本机 DSH 的 bundle 里核对是否存在。
- 新增宿主能力依赖前，先在宿主 slot / service 里确认它真的存在，并把手取舍写进注释。
- 面向用户的中英文文案都要给：`src/client/locales.ts` 里 `zh` 加键后，`en` 因 `Record<LocaleKey, string>` 会被类型系统强制补齐。

## 提交信息

Conventional Commits，英文 subject，例如：

```
feat(badge): show per-session cost budget
fix(context): read the final call size instead of the turn sum
docs(readme): explain how the context ratio is measured
```

正文建议三段（可省）：`Why` / `What` / `Verify`。`Verify` 写实际跑过的命令与结果，不写「应该没问题」。

## PR 流程

1. 先开 issue 描述问题或想法；错别字、注释、纯文档可以直接开 PR。
2. 从 `main` 拉分支，命名 `feat/<短描述>`、`fix/<短描述>`、`docs/<短描述>`。
3. 一个 PR 只做一件事。行为变化要一并更新 `README.md` 对应段落与测试。
4. PR 描述里勾选模板检查项，说明：改了什么、为什么；怎么验证的；有没有未覆盖的风险。
5. 维护者看三件事：口径是否正确、是否有测试、是否破坏宿主兼容（旧宿主缺字段时必须回退）。

## 兼容性红线

宿主是 developer preview，接口会破坏性变化。凡依赖宿主新字段或新 slot：

- 字段声明为可选，取不到时走回退路径，不允许抛错或整块不渲染；
- 在 PR 描述里写明旧宿主时的行为；
- 涉及服务接口时按代探测（`typeof x === 'function'`），不要锚死版本号。

## Issue 约定

- Bug：给出 DSH 版本、插件版本、复现步骤、期望与实际，以及截图或控制台报错原文。
- 功能建议：说明要解决的实际问题，而不是只给实现方案。
- 请勿粘贴 API Key、余额信息或任何凭据。

## 范围之外

- 自动停任务、改设置、写别的插件的数据；
- 上传任何用量数据到远端服务；
- 把阈值写死成唯一答案——经验值都要可改并标注为经验值。

## 许可证

提交即表示同意以本仓库的 MIT 许可证发布你的贡献。
