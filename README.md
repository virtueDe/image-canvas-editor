# image-canvas-editor

一个基于 **Vite + TypeScript + UnoCSS + Canvas 2D** 的在线图片编辑器。

## 当前能力

- 上传本地图片
- 旋转（90° 快捷旋转 + 任意角度）
- 水平 / 垂直翻转
- 裁剪（画布内交互式框选）
- 滤镜预设（原图 / 黑白 / 暖色 / 冷调 / 复古 / 淡褪）
- 基础调节
  - 对比度
  - 曝光
  - 高光
- 本地保存编辑草稿
- 导出下载 PNG

## 技术选型

- **Vite**：开发与构建
- **TypeScript**：类型约束
- **UnoCSS**：原子化 CSS
- **Canvas 2D**：渲染与导出

## 目录结构

```text
src/
├─ core/
│  ├─ image-processing.ts   # 图像处理与导出
│  ├─ persistence.ts        # 草稿保存/恢复
│  ├─ presets.ts            # 滤镜预设
│  ├─ renderer.ts           # 预览渲染与裁剪覆盖层
│  ├─ store.ts              # 极简状态管理
│  ├─ types.ts              # 核心类型定义
│  └─ utils.ts              # 工具函数
├─ app.ts                   # UI 组装与交互绑定
├─ main.ts                  # 入口
└─ styles.css               # 少量补充样式
```

## 开发

```bash
npm install
npm run dev
```

## 构建

```bash
npm run build
```

## 设计原则

1. **原图永远不直接修改**
2. **编辑状态独立存储**
3. **预览与导出共用同一条渲染管线**
4. **裁剪坐标始终基于原图坐标，避免状态混乱**

## 后续建议

- 增加撤销 / 重做
- 增加蒙版与标注图层
- 将预览处理改为 `OffscreenCanvas + Worker`
- 对超大图增加分级采样与分块处理
