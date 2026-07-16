---
title: Plasma 等离子流动
level: basic
tags: [着色器, 程序化, 2D]
summary: 几层正弦波叠加 + 调色板映射——最经典的入门程序化动画，全屏两条 uniform 就能动起来。
created: 2026-07-17
---

Plasma 是程序化着色的 "Hello World"：没有纹理、没有几何，只有坐标、时间和正弦。它教会你的是**把标量场映射成颜色**这个最基本的思维。

::::shader{height=280}
```glsl
// 经典 plasma：多层不同方向/频率的正弦叠加成标量场 v，再映射到调色板。
void mainImage(out vec4 fragColor, in vec2 fragCoord) {
    vec2 uv = fragCoord / iResolution.xy;
    vec2 p = uv * 6.0;
    float t = iTime * 0.8;

    float v = 0.0;
    v += sin(p.x + t);
    v += sin((p.y + t) * 0.7);
    v += sin((p.x + p.y + t) * 0.6);
    // 径向项让图案不再是纯平移条纹
    vec2 c = p + vec2(sin(t * 0.5), cos(t * 0.3)) * 2.0;
    v += sin(length(c) + t);
    v *= 0.25; // 归一到大约 [-1,1]

    // 三相调色板：同一标量按不同相位取 cos，天然连续循环
    vec3 col = 0.5 + 0.5 * cos(6.28318 * (v + vec3(0.0, 0.33, 0.67)));
    fragColor = vec4(col, 1.0);
}
```
::::

## 拆解

1. **标量场**：`v` 是若干正弦波的和。每项的方向（`p.x`、`p.y`、`p.x+p.y`、`length`）和频率不同，叠加后失去周期感——这就是「流动」错觉的全部来源。
2. **时间**：`t` 加进每一项的相位。改系数就是改各层流速。
3. **调色板**：`0.5 + 0.5*cos(2π(v + 相位))` 是 Iñigo Quilez 推广的余弦调色板——一个标量进、连续循环的 RGB 出，三个相位偏移决定色相走向。改 `vec3(0.0, 0.33, 0.67)` 试试别的配色。

练习：把 `p * 6.0` 的 6 改大（更密的条纹）；给 `v` 乘上 `uv.y`（垂直渐隐）；用 `iMouse.xy / iResolution.xy` 替换 `vec2(sin, cos)` 的中心（点击画布移动焦点）。
