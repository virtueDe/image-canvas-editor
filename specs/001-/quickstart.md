# Quickstart: 按包结构生成构建产物

> 下面的步骤是本特性完成实现后用于验收的最短路径。它们故意只覆盖 1 条主成功路径、1 条边界场景、1 条失败场景。

## 0. 准备

1. 在仓库根目录执行 `pnpm install`
2. 确认当前工作区干净，避免旧产物干扰
3. 若存在旧的 `apps/web-vue/dist`、`editor/core/dist`、`editor/vue3/dist`、`dist`，先记录当前时间戳或文件摘要，便于后续比较

## 1. 主成功路径：一次构建拿到 3 个包的独立产物

1. 在仓库根目录执行 `pnpm build`
2. 验证 `apps/web-vue/dist/` 存在，且至少包含：
   - `index.html`
   - `assets/`
3. 验证 `editor/core/dist/` 存在，且至少包含：
   - `index.js`
   - `index.d.ts`
4. 验证 `editor/vue3/dist/` 存在，且至少包含：
   - `index.js`
   - `index.d.ts`
5. 验证根 `dist/` 仍存在，并且可作为 web 应用兼容出口使用：
   - 至少包含 `index.html`
   - 至少包含 `assets/`
6. 结论：3 个包都有独立产物，且旧的根 `dist/` 兼容出口仍可用

## 2. 边界场景：只重建一个包时不覆盖其他包产物

1. 先完成一次 `pnpm build`
2. 记录以下目录的时间戳或文件摘要：
   - `editor/core/dist/`
   - `editor/vue3/dist/`
   - `apps/web-vue/dist/`
   - `dist/`
3. 仅执行 `pnpm --filter @image-canvas-editor/editor-core build`
4. 验证：
   - `editor/core/dist/` 被刷新
   - `editor/vue3/dist/` 未被删除或清空
   - `apps/web-vue/dist/` 未被删除或清空
   - 根 `dist/` 未被删除或清空
5. 结论：单包重建只影响目标包的规范产物

## 3. 失败场景：库包缺少必需产物时构建失败

1. 在临时分支或未提交工作区中，制造一个**仅用于验收**的失败条件，例如让 `editor/vue3` 的类型声明产出配置失效
2. 执行 `pnpm --filter @image-canvas-editor/editor-vue build`
3. 预期结果：
   - 命令返回非 0 退出码
   - 终端明确报告缺少必需产物（至少是脚本或 `.d.ts` 之一）
   - 不得输出“构建成功”之类的误导性结果
4. 恢复临时改动，重新执行正常构建，确保产物可恢复

## 4. 验收记录建议

- 把 4 个输出目录的实际文件树贴到 PR 描述
- 记录单包重建前后的目录差异
- 说明根 `dist/` 与 `apps/web-vue/dist/` 的兼容关系
