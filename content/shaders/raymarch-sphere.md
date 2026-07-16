---
title: Raymarching 光线步进球
level: intermediate
tags: [着色器, raymarching, SDF, 3D]
summary: 用有符号距离场 + sphere tracing 在片元着色器里渲染 3D——不经过任何三角形。
created: 2026-07-17
---

Raymarching 是片元着色器里的「无几何 3D」：场景用**有符号距离函数**（SDF）描述，从相机出发沿视线步进，每步走「当前点到场景的最近距离」——这就是 sphere tracing，距离场保证走这么远绝不会穿过表面。

::::shader{height=320}
```glsl
// 场景 SDF：一个球 + 一个地面
float sdScene(vec3 p) {
    float sphere = length(p - vec3(0.0, 0.0, 0.0)) - 1.0;
    float ground = p.y + 1.0;
    return min(sphere, ground);
}

// SDF 的数值梯度 = 表面法线
vec3 calcNormal(vec3 p) {
    vec2 e = vec2(0.001, 0.0);
    return normalize(vec3(
        sdScene(p + e.xyy) - sdScene(p - e.xyy),
        sdScene(p + e.yxy) - sdScene(p - e.yxy),
        sdScene(p + e.yyx) - sdScene(p - e.yyx)));
}

void mainImage(out vec4 fragColor, in vec2 fragCoord) {
    // NDC，保持纵横比
    vec2 uv = (fragCoord * 2.0 - iResolution.xy) / iResolution.y;

    // 绕场景旋转的相机
    float a = iTime * 0.5;
    vec3 ro = vec3(3.0 * sin(a), 1.2, 3.0 * cos(a));   // 相机位置
    vec3 target = vec3(0.0);
    vec3 fwd = normalize(target - ro);
    vec3 right = normalize(cross(fwd, vec3(0.0, 1.0, 0.0)));
    vec3 up = cross(right, fwd);
    vec3 rd = normalize(fwd * 1.5 + right * uv.x + up * uv.y); // 视线

    // sphere tracing
    float t = 0.0;
    bool hit = false;
    for (int i = 0; i < 96; i++) {
        vec3 p = ro + rd * t;
        float d = sdScene(p);
        if (d < 0.001) { hit = true; break; }
        t += d;
        if (t > 20.0) break;
    }

    vec3 col = vec3(0.08, 0.09, 0.12); // 背景
    if (hit) {
        vec3 p = ro + rd * t;
        vec3 n = calcNormal(p);
        vec3 lightDir = normalize(vec3(0.6, 0.8, 0.3));
        float diff = max(dot(n, lightDir), 0.0);
        float amb = 0.15;
        // 球是暖色、地面棋盘格
        vec3 base = p.y > -0.99 ? vec3(0.9, 0.5, 0.3)
                  : mix(vec3(0.25), vec3(0.6),
                        mod(floor(p.x) + floor(p.z), 2.0));
        col = base * (amb + diff);
        // 简易软阴影：朝光源再 march 一次
        float sh = 1.0;
        float st = 0.02;
        for (int i = 0; i < 32; i++) {
            float d = sdScene(p + lightDir * st);
            if (d < 0.001) { sh = 0.2; break; }
            sh = min(sh, 10.0 * d / st);
            st += d;
            if (st > 5.0) break;
        }
        col *= sh;
    }

    fragColor = vec4(pow(col, vec3(0.4545)), 1.0); // gamma
}
```
::::

## 核心概念

- **SDF**：`sdScene(p)` 返回点 `p` 到最近表面的有符号距离（内负外正）。`min` 是场景并集——加物体就是加一个 `min` 项，这是 SDF 建模的魔力。
- **Sphere tracing**：每步走 `d = sdScene(p)`，因为「最近表面在 d 之外」是距离场的定义——这保证安全，也解释了为什么掠射表面时收敛慢（d 一直很小，见循环上限 96 的用途）。
- **法线 = 梯度**：SDF 在表面处的梯度方向就是法线，中央差分数值近似即可（`calcNormal`）。
- **软阴影**：向光源二次 march，用途中的 `d/st` 最小值当遮蔽系数——Quilez 的经典技巧，一次循环换软半影。

与:term[路径追踪]的关系：raymarching 解决的是**求交**（对 SDF 场景），光照仍是普通着色；把 [[cs/rendering/brdf]] 的 Cook-Torrance 搬进 `if (hit)` 分支就是 PBR 版。
