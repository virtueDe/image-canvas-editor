# image-canvas-editor

一个面向浏览器的图片编辑器 Monorepo，基于 `pnpm workspace`、`Vue 3`、`TypeScript`、`UnoCSS` 和 `Canvas 2D`。

当前支持：

- 本地图片上传
- 旋转、翻转、裁剪
- 滤镜与基础参数调整
- 画笔绘制与橡皮擦
- 文字覆盖层编辑
- 画布预览缩放、平移、复位
- 撤销 / 重做
- 浏览器本地草稿保存与恢复
- PNG 导出

## 仓库结构

```text
apps/
└─ web-vue/                  # Web 应用壳

editor/
├─ core/                     # 编辑器内核：状态、渲染、导出、草稿
└─ vue3/                     # Vue 3 响应式桥接层

scripts/
└─ build-output/             # 工作区构建与产物校验脚本

tests/
├─ contract/                 # 构建产物合同测试
├─ integration/              # 构建集成测试
└─ unit/                     # 构建规则单元测试
```

分层边界：

- `apps/web-vue`：只放页面、浏览器交互、文件输入、提示文案
- `editor/vue3`：只做 Vue 响应式桥接，不承载业务内核
- `editor/core`：负责编辑状态、Canvas 渲染、草稿持久化、导出，不依赖具体 UI 框架

## 快速开始

环境要求：

- `Node.js >= 20.18.3 < 21`
- `pnpm 9.15.0`

安装依赖：

```bash
pnpm install
```

启动开发：

```bash
pnpm dev
```

常用命令：

| 命令 | 说明 |
| --- | --- |
| `pnpm dev` | 启动 Web 开发环境 |
| `pnpm build` | 构建全部工作区并校验产物布局 |
| `pnpm preview` | 预览 Web 构建结果 |
| `pnpm typecheck` | 执行 Web 应用类型检查 |
| `pnpm test:unit-build` | 构建规则单元测试 |
| `pnpm test:integration-build` | 构建集成测试 |
| `pnpm test:contract-build` | 构建产物合同测试 |

## 开发约束

- 不直接编辑根 `dist/`
- 新测试优先放在 `editor/core/src/*.test.ts`
- 没有真实痛点，不引入新的状态库或额外抽象层
- 涉及状态、草稿、导出的改动，要评估兼容性和回滚路径

## 提交规范

- Commit 格式：`type(scope): summary`
- 推荐 scope：`editor-core`、`editor-vue`、`web-vue`
- PR 说明应包含：动机、影响范围、验证方式
