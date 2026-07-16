---
title: BRDF 与 Cook-Torrance 模型
level: advanced
tags: [渲染, PBR, 图形学]
summary: BRDF 描述光在表面如何反射；Cook-Torrance 用微表面理论把它拆成 D、F、G 三项。
created: 2026-07-16
---

:term[双向反射分布函数]描述了从方向 $\omega_i$ 入射的光有多少会朝方向 $\omega_o$ 反射：

$$
f_r(\omega_i, \omega_o) = \frac{\mathrm{d}L_o(\omega_o)}{\mathrm{d}E_i(\omega_i)}
$$

单位是 $\mathrm{sr}^{-1}$。它出现在:term[渲染方程]的核心：

$$
L_o(\omega_o) = L_e(\omega_o) + \int_{\Omega} f_r(\omega_i, \omega_o) \, L_i(\omega_i) \, (\omega_i \cdot n) \, \mathrm{d}\omega_i
$$

## 物理约束

一个合法的 BRDF 必须满足三条：

1. **非负性**：$f_r \ge 0$
2. **:term[亥姆霍兹互易性]**：$f_r(\omega_i, \omega_o) = f_r(\omega_o, \omega_i)$ —— 光路可逆
3. **:term[能量守恒]**：$\int_{\Omega} f_r(\omega_i, \omega_o)(\omega_i \cdot n)\,\mathrm{d}\omega_i \le 1$

互易性是双向:term[路径追踪]能成立的前提。能量守恒不满足的话，多次弹射会让画面越来越亮。

::::card{id=brdf-reciprocity}
:term[双向反射分布函数]必须满足的三条物理约束是什么？各自不满足会怎样？

:::answer
1. **非负性** $f_r \ge 0$ —— 否则出现负光照
2. **:term[亥姆霍兹互易性]** $f_r(\omega_i, \omega_o) = f_r(\omega_o, \omega_i)$ —— 不满足则双向:term[路径追踪]失效（从光源和从相机出发结果不一致）
3. **:term[能量守恒]** $\int_{\Omega} f_r (\omega_i \cdot n)\,\mathrm{d}\omega_i \le 1$ —— 不满足则多次弹射后画面越来越亮
:::

:::quiz
- ✓ 非负性、亥姆霍兹互易性（光路可逆）、能量守恒——违反则分别出现负光照、双向方法失效、多次弹射后画面越来越亮
- 线性、平移不变、旋转不变——违反则 BRDF 无法预积分成查找表
- 非负性、积分归一化到 1、各向同性——违反则重要性采样发散
- 连续性、可微性、有界性——违反则蒙特卡洛估计的方差无限大
:::
::::

关于 $(\omega_i \cdot n)$ 这个余弦项的物理来源（:term[投影面积]），见 [[physics/optics/radiometry]]。

## Cook-Torrance 镜面项

基于:term[微表面]理论，把表面看成无数个微小的完美镜面：

$$
f_{\text{spec}} = \frac{D \, F \, G}{4 (\omega_i \cdot n)(\omega_o \cdot n)}
$$

::::card{id=ct-dfg}
Cook-Torrance 的镜面项由哪三个函数组成？分母的 $4(\omega_i \cdot n)(\omega_o \cdot n)$ 是什么？

:::answer
$$
f_{\text{spec}} = \frac{D \, F \, G}{4 (\omega_i \cdot n)(\omega_o \cdot n)}
$$

- $D$ —— :term[法线分布函数]（多少:term[微表面]朝向:term[半程向量] $h$）
- $F$ —— :term[菲涅尔项]（掠射角反射率上升）
- $G$ —— :term[几何遮蔽项]（微表面自遮挡与自阴影）

分母**不是**凑出来的归一化常数，它是从微表面坐标变换到宏观坐标的:term[雅可比行列式]。
:::

:::quiz
- ✓ D 法线分布、F 菲涅尔、G 几何遮蔽；分母是微表面坐标到宏观坐标的雅可比行列式，不是凑的归一化常数
- D 漫反射项、F 菲涅尔、G 高光项；分母把结果归一化到 [0, 1] 区间
- D 法线分布、F 滤波项、G 伽马校正；分母抵消半程向量的双倍计数
- D 深度衰减、F 菲涅尔、G 几何遮蔽；分母是半球立体角 2π 的近似值
:::
::::

三项各司其职：

- $D$ —— :term[法线分布函数]，多少比例的微表面法线朝向:term[半程向量] $h$
- $F$ —— :term[菲涅尔项]，掠射角反射率上升
- $G$ —— :term[几何遮蔽项]，微表面之间的自遮挡与自阴影

分母的 $4(\omega_i \cdot n)(\omega_o \cdot n)$ 是微表面坐标到宏观坐标的:term[雅可比行列式]，不是随便凑的归一化常数。

### GGX 分布

$D$ 最常用 GGX（Trowbridge-Reitz），因为它的长尾更贴近实测数据：

$$
D_{\text{GGX}}(h) = \frac{\alpha^2}{\pi \left( (n \cdot h)^2 (\alpha^2 - 1) + 1 \right)^2}
$$

其中 $\alpha = \text{roughness}^2$ —— 这个平方是 Disney 的经验映射，让 roughness 滑条在感知上更线性。

```glsl
float D_GGX(float NoH, float roughness) {
    float a = roughness * roughness;
    float a2 = a * a;
    float d = NoH * NoH * (a2 - 1.0) + 1.0;
    return a2 / (PI * d * d);
}

vec3 F_Schlick(float VoH, vec3 f0) {
    float f = pow(1.0 - VoH, 5.0);
    return f0 + (1.0 - f0) * f;
}

// Smith 高度相关可见性项，已经把 BRDF 分母的 4·NoL·NoV 吸收进来了
float V_SmithGGXCorrelated(float NoV, float NoL, float roughness) {
    float a2 = pow(roughness, 4.0);
    float lv = NoL * sqrt(NoV * NoV * (1.0 - a2) + a2);
    float ll = NoV * sqrt(NoL * NoL * (1.0 - a2) + a2);
    return 0.5 / (lv + ll);
}
```

注意最后那个 `V_` 而不是 `G_`：可见性项 $V = \frac{G}{4(\omega_i \cdot n)(\omega_o \cdot n)}$ 已经把分母吸收了。实践中直接算 $V$ 更省，也避免了掠射角上 $0/0$ 的数值问题。

实时渲染里，这套逐像素的 BRDF 求值正是:term[注视点渲染]要省掉的大头——周边区域的镜面高光细节，眼睛本来就分辨不出来。见 [[papers/foveated-3d-graphics]]。
