---
title: 辐射度量学基础
level: basic
tags: [光学, 渲染, 图形学]
summary: 辐射通量、辐照度、辐射亮度的区别——渲染方程里每个符号的物理含义都在这里。
created: 2026-07-16
---

:term[渲染方程]里的每个量都有明确的物理定义。搞混它们是图形学入门最常见的坑，尤其是:term[辐照度]和:term[辐射亮度]。

## 四个基本量

| 量 | 符号 | 单位 | 含义 |
|---|---|---|---|
| :term[辐射通量] | $\Phi$ | W | 单位时间的总能量 |
| :term[辐射强度] | $I$ | W/sr | 每单位:term[立体角]的通量 |
| :term[辐照度] | $E$ | W/m² | 每单位**面积**的通量 |
| :term[辐射亮度] | $L$ | W/(m²·sr) | 每单位面积、每单位立体角 |

::::card
:term[辐照度] $E$ 和:term[辐射亮度] $L$ 的区别是什么？为什么:term[渲染方程]用 $L$ 而不是 $E$？

:::answer
$E$ 是**每单位面积**的功率（W/m²），把所有方向来的光都加在一起了。$L$ 是**每单位面积每单位:term[立体角]**（W/(m²·sr)），还保留了方向信息。

$$
L = \frac{\mathrm{d}^2\Phi}{\mathrm{d}A^{\perp} \mathrm{d}\omega}
$$

渲染方程用 $L$ 是因为：**$L$ 沿真空中的光线传播不变**。这条性质让「摄像机看到的亮度 = 光线击中点的出射亮度」成立，光线追踪才能work。$E$ 没有这个性质。
:::

:::quiz
- ✓ E 是每单位面积的功率（所有方向叠加），L 每面积每立体角、保留方向；用 L 因为它沿光线传播不变，光线追踪才成立
- E 保留方向信息而 L 把所有方向加总；用 L 因为它的单位更简单
- 两者只差一个 4π 的常数因子；用 L 纯粹是历史习惯
- E 是入射量、L 是出射量，本质是同一个量；用 L 因为相机测到的是出射光
:::
::::

## 立体角

:term[立体角]是「方向的面积」，单位球面上的一块面积。整个球面是 $4\pi$ sr，半球是 $2\pi$ sr。

$$
\mathrm{d}\omega = \sin\theta \, \mathrm{d}\theta \, \mathrm{d}\phi
$$

那个 $\sin\theta$ 是球坐标的:term[雅可比行列式]因子——极点附近的「一格」比赤道附近小得多。**在半球上均匀采样时忘掉它，是最经典的采样 bug**：结果会往极点聚集。

::::card{id=solid-angle-jacobian}
在半球上做均匀采样时，为什么不能直接对 $\theta$ 和 $\phi$ 均匀取值？

:::answer
因为 $\mathrm{d}\omega = \sin\theta \, \mathrm{d}\theta \, \mathrm{d}\phi$ 里有 $\sin\theta$ 因子（球坐标的:term[雅可比行列式]）。对 $\theta$ 均匀采样会让样本在极点附近过密（那里 $\sin\theta \to 0$，实际:term[立体角]很小却分到了同样多的样本）。

正确做法是对 $\cos\theta$ 均匀采样：

```python
import numpy as np

def uniform_hemisphere(u1, u2):
    cos_theta = u1              # 对 cos(theta) 均匀，不是对 theta
    sin_theta = np.sqrt(1 - cos_theta**2)
    phi = 2 * np.pi * u2
    return np.array([sin_theta * np.cos(phi),
                     sin_theta * np.sin(phi),
                     cos_theta])
```

pdf 是 $\frac{1}{2\pi}$（半球立体角的倒数）。
:::

:::quiz
- ✓ dω = sinθ dθ dφ 里的 sinθ 是球坐标的雅可比因子——对 θ 均匀取值会让样本挤向极点；正确做法是对 cosθ 均匀采样
- φ 的范围是 2π 而 θ 只有 π/2，直接均匀取值会让 φ 方向的样本过密
- 浮点数在 0 附近精度更高，对 θ 均匀采样会引入系统性数值偏差
- 半球立体角是 2π 而不是 4π，直接均匀取值会把一半样本采到下半球
:::
::::

## 余弦项从哪来

:term[渲染方程]里那个 $(\omega_i \cdot n)$ 不是随便加的。它来自:term[投影面积]：斜射的光束照亮的面积更大，单位面积上分到的功率就更少。

$$
\mathrm{d}A^{\perp} = \mathrm{d}A \cos\theta
$$

这就是为什么 $L$ 的定义里是 $\mathrm{d}A^{\perp}$ 而不是 $\mathrm{d}A$。理解了这一点，[[cs/rendering/brdf]] 里 Cook-Torrance 分母的 $4(\omega_i \cdot n)(\omega_o \cdot n)$ 也就不神秘了。

相关：[[math/linear-algebra/svd|SVD]] 在预计算辐射传输（PRT）里用来压缩传输矩阵；:term[注视点渲染]则利用视觉系统对周边细节的不敏感来省下这些计算，见 [[papers/foveated-3d-graphics]]。
