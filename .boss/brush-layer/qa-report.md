# QA 测试报告

## 摘要

- 画笔图层主流程已接通：进入画笔模式、绘制、橡皮擦、整笔撤销、导出参与构建。
- 本轮新增修复已验证：画笔预览缓存会随笔触失效、`旋转 + 翻转` 组合下落笔坐标正确、画布有画笔预览光标。
- 核心验证通过：`pnpm typecheck`、`pnpm build`、`pnpm exec vitest run editor/core/src/editor-workflow.test.ts editor/core/src/renderer.test.ts editor/core/src/image-processing.test.ts`。
- 默认沙箱下 `vitest/vite` 会因 `spawn EPERM` 阻塞；切到提权执行后，目标测试已全部通过。

## 测试结果

| 项目 | 结果 | 说明 |
|------|------|------|
| `pnpm typecheck` | 通过 | Web 壳与桥接层类型通过 |
| `pnpm build` | 通过 | `editor-core` / `editor-vue` / `web-vue` 全量构建通过 |
| `pnpm exec vitest run editor/core/src/editor-workflow.test.ts editor/core/src/renderer.test.ts editor/core/src/image-processing.test.ts` | 通过 | 44 个断言全部通过，覆盖画笔工作流、缓存失效与导出链路 |
| 默认沙箱下直接运行 Vitest | 环境阻塞 | `vite/esbuild` 在 Windows 沙箱下 `spawn EPERM`，不是业务断言失败 |

## 重点回归项

- 文字编辑在属性面板调整时不再丢内容
- 画笔模式下不会误触文字双击编辑
- 每一笔撤销/重做按整笔回退
- 旋转与翻转同时存在时，落笔坐标仍与预览一致
- 画笔笔触变化后，预览缓存会正确失效，不再复用旧 canvas
- 构建产物可生成，说明跨包接口已闭合

## 残余风险

- 长时间大面积连续涂抹的性能尚未做专门压力测试
- 仍未做人工 UI 冒烟，尤其是超大笔刷与移动端触控体验
