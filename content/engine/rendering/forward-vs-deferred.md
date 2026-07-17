---
title: 前向渲染与延迟渲染
level: intermediate
tags: [引擎, 渲染管线, 架构]
summary: 两种光照架构的真实取舍：光源数量、带宽、MSAA、透明物体——以及为什么移动端和桌面端选择相反。
created: 2026-07-17
---

选前向还是延迟，是引擎渲染架构的第一个分岔口。教科书说「延迟适合多光源」，工程上真正的决策因素是**带宽和硬件形态**。

## 两种架构

**前向（Forward）**：每个物体一个 pass，片元着色器里直接遍历影响它的光源算完光照。着色成本 ≈ 物体片元数 × 光源数。

**延迟（Deferred）**：几何 pass 先把材质属性（albedo、法线、粗糙度、深度）写进 G-Buffer，光照 pass 再逐像素读回来算光。着色成本 ≈ 屏幕像素数 × 光源数，**与场景复杂度解耦**，且天然零 overdraw 浪费（只给可见像素算光）。

代价：G-Buffer 是一组全屏 RT（典型 3-4 张），**写出再读回**——带宽开销巨大；MSAA 在 G-Buffer 上代价爆炸（每 RT 每 sample 存一份）；透明物体没法进 G-Buffer（一个像素只存一层表面），得回落前向补画。

:::gallery
![延迟渲染的 G-Buffer 数据流](/img/gbuffer.svg)
![渲染管线全景（对照：延迟只是重排了片元着色的时机）](/img/pipeline.svg)
:::

::::card{id=deferred-tradeoffs}
延迟渲染换来了什么、付出了什么？为什么透明物体是它的死角？

:::answer
**换来**：光照成本与场景复杂度解耦（只给可见像素算光、多光源可逐光源做屏幕空间剔除）；材质与光照解耦（G-Buffer 之后加光照特性不用改所有材质 shader）。

**付出**：G-Buffer 的写出+读回带宽（3-4 张全屏 RT）；MSAA 几乎不可用（每 RT × 每 sample 的存储和着色开销）→ 只能靠后处理 AA（:term[时域抗锯齿]/FXAA）；材质模型被 G-Buffer 布局锁死。

**透明物体**：G-Buffer 每像素只存**一层**表面属性，而透明需要多层混合——所以透明物体只能在延迟光照之后用前向补画（这就是引擎里 Transparent 队列永远走 forward 的原因）。
:::

:::quiz
- ✓ 换来光照成本与场景复杂度解耦，付出 G-Buffer 带宽和 MSAA；透明物体需要多层混合而 G-Buffer 每像素只存一层，只能回落前向
- 换来更低的显存占用，付出更高的 CPU 提交成本；透明物体因为排序开销太大而不支持
- 换来 MSAA 免费开启，付出每帧只能处理一个光源；透明物体因深度写入被关闭而无法参与
- 透明物体的问题在于 G-Buffer 的渲染目标格式不带 alpha 通道，换 RGBA16F 即可解决
:::
::::

## Tiled / Clustered：两头的好处

现代主流是折中：**Tiled/Clustered 着色**把屏幕切成 tile（再沿深度切成 cluster），先算出每个 tile/cluster 受哪些光影响，着色时只遍历本格的光源列表。Forward+ 用它做前向（保住 MSAA 和透明），tiled deferred 用它砍延迟的逐光 pass。这条线的奠基工作见 [[papers/tiled-shading]] 和 [[papers/clustered-shading]]。

::::card{id=tiled-clustered}
Tiled 着色解决了什么问题？Clustered 比 Tiled 多切了哪一刀、为什么值得？

:::answer
解决「每个像素遍历所有光源」的浪费：把屏幕切成 tile（如 16×16），每帧先求出每个 tile 的**受影响光源列表**，着色时只算列表内的光。几百个点光源因此可行。

Tiled 的弱点是**深度不连续**：一个 tile 里同时有近处角色和远处天空时，光源列表是两者的并集，两边都白算一堆。Clustered 沿深度再切一刀（tile → 视锥体积里的 cluster），列表按 3D 格子算，深度差异大的像素不再互相拖累。代价是格子数量和构建开销上升——但它对前向（Forward+）和延迟同样适用，且对透明物体友好（透明片元也能查 cluster 列表）。
:::

:::quiz
- ✓ 解决每像素遍历所有光源的浪费（每 tile 先算受影响光源列表）；Clustered 沿深度再切一刀，解决 tile 内深度不连续时光源列表互相拖累
- 解决 overdraw 浪费；Clustered 只是把 tile 从 16×16 缩小到 8×8，粒度更细
- 解决 G-Buffer 带宽问题；Clustered 增加了按法线方向的切分，用来剔除背面光源
- 解决阴影贴图的重复采样；Clustered 按光源类型分组，点光源和聚光灯分开遍历
:::
::::

## 移动端为什么倾向前向？

移动 GPU 是 TBDR（tile-based）架构，片上 tile memory 让「一个 pass 内的读改写」几乎免费，但**把 G-Buffer 写回主存再读回来**恰好踩中它最贵的路径（主存带宽 = 功耗）。所以移动端要么纯前向，要么用 subpass/framebuffer fetch 把延迟做在片上（Vulkan subpass 的设计初衷）。

工程决策清单：光源规模、MSAA 需求、透明占比、目标硬件带宽、材质多样性——按这五项打分，而不是按流行度。
