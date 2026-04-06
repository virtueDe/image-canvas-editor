# 文字旋转设计

## 摘要

本设计为当前图片编辑器补齐文字对象的独立旋转能力，并同时覆盖：

- 右侧属性面板旋转控制
- 画布选中态旋转手柄
- 预览渲染与导出渲染一致
- 命中检测、拖拽、编辑、撤销重做、草稿恢复一致

这不是玩具功能。当前文字对象已经具备内容、字号、颜色、位置、对齐等产品属性，但缺少独立旋转后，用户只能把整张图旋转，无法完成常见的角标、贴图标题、斜放标注等真实工作流。只补一个面板滑杆，或者只补一个画布手柄，都会制造半成品交互，因此本设计采用同一状态字段驱动面板与画布两套入口。

## 背景与问题

### 现状

当前 `TextItem` 仅包含：

- `content`
- `xRatio` / `yRatio`
- `fontSize`
- `color`
- `align`
- `lineHeight`

当前系统的限制有：

1. 文字无独立旋转数据。
2. 画布选中态只有移动手柄，没有旋转手柄。
3. 命中检测基于未旋转正文矩形。
4. `renderer.ts` 与 `image-processing.ts` 默认按未旋转文字绘制。
5. 草稿、历史记录与 legacy `textOverlay` 兼容层都没有角度概念。

### 目标

1. 每个文字对象新增独立 `rotation`，范围 `-180 ~ 180`。
2. 右侧属性面板可精确调整当前文字角度。
3. 画布选中态提供旋转手柄，拖动可实时旋转。
4. 旋转后文字仍围绕自身锚点旋转，不发生额外漂移。
5. 预览、导出、命中、编辑、拖动、草稿、撤销重做全部基于同一旋转语义。

### 非目标

- 不实现 3D / 透视 / 弯曲文字
- 不实现多选批量旋转
- 不实现吸附标尺与角度吸附
- 不实现富文本或字级单独旋转

## 方案比较

### 方案 A：只做右侧属性面板旋转

优点：

- UI 改动小
- 交互路径清晰

缺点：

- 画布缺少直接操作能力
- 仍然像“配置项”，不像产品化编辑器

### 方案 B：只做画布旋转手柄

优点：

- 画布交互直观

缺点：

- 无法精确输入角度
- 右侧属性系统缺失一块核心能力

### 方案 C：面板旋转 + 画布旋转手柄，共用同一状态字段

优点：

- 交互完整
- 数据结构单一
- 产品体验一致

缺点：

- 需要一起修改数据、渲染、命中、导出与测试

### 结论

采用方案 C。该仓库面向产品交付，不接受 demo 式单入口最小实现。

## 架构设计

### 数据模型

`editor/core/src/types.ts`

- `TextItem` 新增 `rotation: number`
- `TextOverlay` 新增 `rotation: number`
- `textOverlayToTextItem`
- `mergeTextOverlayIntoTextItem`
- `textItemToTextOverlay`

都要同步带上 `rotation`

默认值：

- 新建文字 `rotation = 0`
- legacy 草稿缺失该字段时按 `0` 归一化

### 分层职责

#### `editor/core`

负责：

- 文字旋转状态
- 旋转几何计算
- 旋转命中
- 旋转手柄角度计算
- 预览与导出渲染
- 历史与草稿兼容

不负责：

- 右侧 Vue 控件细节
- 浏览器 DOM 指针事件装配

#### `editor/vue3`

负责：

- 暴露当前文字旋转角度
- 暴露更新当前文字旋转的方法

不负责：

- 保存第二份旋转状态

#### `apps/web-vue`

负责：

- 右侧属性面板旋转滑杆
- 画布旋转手柄事件接入
- 展示当前角度文案

不负责：

- 旋转几何实现

## 几何与渲染模型

### 核心原则

未旋转文字布局仍然是基础事实；旋转是附加几何层，不侵入 `resolveTextLayout` 的主职责。

### 局部坐标模型

1. `resolveTextLayout` 继续输出未旋转正文布局与 anchor。
2. 以 `layout.anchorX / layout.anchorY` 作为文字旋转中心。
3. 需要命中、渲染、手柄定位时，再做正向或逆向坐标变换。

### 推荐几何辅助函数

放在 `editor/core/src/text-engine.ts` 或配套轻量几何模块中：

- `normalizeTextRotation(rotation)`
- `toLocalTextPoint(pointX, pointY, anchorX, anchorY, rotation)`
- `toScreenTextPoint(localX, localY, anchorX, anchorY, rotation)`
- `resolveRotatedTextScreenBounds(...)`
- `resolveTextRotateHandleScreenPoint(...)`
- `resolveTextRotationFromPointer(...)`

### 命中策略

采用“逆变换回局部坐标后命中”，而不是直接对旋转四边形做专门命中。

流程：

1. 将屏幕点逆向旋转回文字局部坐标
2. 复用未旋转 `bodyRect` 命中
3. 手柄命中则用局部点位映射后的屏幕点做判定

优点：

- 逻辑统一
- 易测
- 能复用现有矩形正文布局

## 交互设计

### 右侧属性面板

新增“旋转”属性：

- 滑杆范围 `-180 ~ 180`
- 显示当前角度文本，如 `-24°`
- 只作用于当前激活文字
- 拖动过程中预览，释放后提交独立历史记录

### 画布选中态

保留现有移动手柄，同时新增独立旋转手柄：

- 位置：正文包围框上方中点外侧
- 语义：只负责旋转，不复用移动手柄
- 显示条件：选中且非编辑态

### 旋转拖拽

1. 按下旋转手柄进入 `rotating-text` 交互态
2. 记录起始角度与文字锚点中心
3. 根据鼠标相对锚点的极角变化计算新角度
4. 拖动时实时预览
5. 松手后提交一条独立历史记录

### 编辑态关系

- 正在编辑文字时，不显示旋转手柄
- 结束编辑后恢复旋转手柄
- 文字内容变化不应重置 `rotation`

## 状态机调整

当前 `TextToolState` 包含 `idle / inserting / editing / dragging`。

新增：

- `rotating`

建议字段：

- `textId`
- `startClientX`
- `startClientY`
- `originRotation`
- `anchorX`
- `anchorY`

要求：

- `dragging` 与 `rotating` 为互斥态
- 旋转与移动各自形成独立历史会话

## 预览与导出一致性

### `renderer.ts`

选中框、自定义光标、手柄都要基于旋转后的屏幕几何结果绘制。

### `image-processing.ts`

导出必须与预览一致：

1. 先计算未旋转布局
2. `ctx.save()`
3. `ctx.translate(anchorX, anchorY)`
4. `ctx.rotate(rotationRadians)`
5. 在局部坐标中逐行绘制文字
6. `ctx.restore()`

不能让预览转了、导出没转，或者旋转中心不同。

## 持久化与兼容性

### 历史记录

- `captureHistorySnapshot`
- `applyHistorySnapshot`
- 快照比较逻辑

全部纳入 `rotation`

### 草稿持久化

- 新草稿结构直接保存 `rotation`
- 恢复旧草稿时缺失 `rotation` 的项按 `0` 处理

### Legacy `textOverlay`

兼容策略：

- 读取旧结构时补 `rotation: 0`
- 单文字 legacy shim 在双向转换时保留 `rotation`

## 错误处理

1. 无激活文字时，旋转属性控件禁用。
2. 文字不存在时，旋转态自动回退为 `idle`。
3. 极端情况下指针落在锚点正中心，角度解算失败时保持原角度。
4. 输入角度超范围时统一归一化到 `-180 ~ 180`。

## 测试策略

### 单元测试

新增或扩展：

- `types` / `history` / `persistence`
  - `rotation` 存取、快照、恢复、兼容
- `text-engine`
  - 旋转坐标变换
  - 旋转手柄点位
  - 旋转命中
  - 角度计算

### workflow 测试

- 新建文字后旋转
- 面板调角度
- 手柄拖拽旋转
- 旋转后继续编辑内容
- 旋转后继续拖动位置
- 撤销 / 重做旋转

### 导出测试

- 导出绘制调用包含旋转语义
- 多行文字围绕同一锚点旋转

## 验证标准

1. 面板调整角度后，画布立即变化。
2. 拖动画布旋转手柄后，面板角度同步变化。
3. 导出 PNG 与预览角度一致。
4. 旋转后文字仍可被正确选中、拖动、编辑。
5. 草稿恢复后角度不丢失。
6. 撤销 / 重做能恢复旋转前后状态。

## 实施结果备注

- `editor/core` 已按设计补齐 `rotation` 状态、历史与草稿兼容、旋转几何、命中、预览渲染、导出渲染，以及画布双手柄交互。
- 画布选中态当前保留方形移动手柄，并新增圆形旋转手柄；编辑态会隐藏旋转手柄，避免与文字输入状态冲突。
- 文字旋转拖拽与文字移动拖拽都已固定 preview baseline 到交互开始前的 committed state，避免 undo 回到脏的 `dragging` / `rotating` 工具态。
- `editor/vue3` 已暴露 `activeTextRotation`、`previewActiveTextRotation`、`updateActiveTextRotation`、`commitActiveTextRotation`，`apps/web-vue` 已接入右侧文字面板旋转滑杆。
- 当前实现没有为旋转控件新增专门样式或图标组件改动，直接复用现有 `input-range` 与面板样式；这是刻意保持最小必要改动，不是遗漏。

## 回滚策略

本次改动应拆为干净 patch：

1. `rotation` 数据结构与兼容层
2. 旋转几何与命中
3. 预览与导出渲染
4. UI 面板与旋转手柄

若线上出现回归，可整体回退第 2~4 组 patch，同时保留或一并回退 `rotation` 字段扩展；不应影响现有文字新增、编辑、拖动主链路。

## 实施顺序建议

1. 先补 `rotation` 数据结构与兼容层
2. 再补 `text-engine` 的旋转几何与命中
3. 再补 `renderer` 与 `image-processing`
4. 最后接入 `editor/vue3` 与 `apps/web-vue`
5. 每一步都补对应测试
