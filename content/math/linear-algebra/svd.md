---
title: 奇异值分解 (SVD)
level: intermediate
tags: [线性代数, 矩阵分解]
summary: 任意矩阵都能拆成「旋转-缩放-旋转」，这是 SVD 最有用的直觉。
created: 2026-07-16
---

任何一个 $m \times n$ 的实矩阵 $A$ 都可以分解为：

$$
A = U \Sigma V^\mathsf{T}
$$

其中 $U \in \mathbb{R}^{m \times m}$ 和 $V \in \mathbb{R}^{n \times n}$ 是正交矩阵，$\Sigma \in \mathbb{R}^{m \times n}$ 是对角矩阵，对角线上是奇异值 $\sigma_1 \ge \sigma_2 \ge \cdots \ge 0$。

## 几何直觉

把 $A$ 看成一个线性变换，SVD 说的是：**任何线性变换都等价于「旋转 → 沿坐标轴缩放 → 再旋转」**。

- $V^\mathsf{T}$ 先把输入旋转到一组「合适的」正交基上
- $\Sigma$ 沿各轴独立缩放，缩放倍数就是奇异值
- $U$ 再旋转到输出空间

这个分解对**任意**矩阵都成立——不要求方阵，不要求可逆，不要求对称。这是它比特征值分解通用的地方。

::::card{id=svd-geometry}
SVD 的几何意义是什么？它对什么样的矩阵成立？

:::answer
$A = U \Sigma V^\mathsf{T}$ 说的是：**任何线性变换都等价于「旋转 → 沿坐标轴缩放 → 再旋转」**。

- $V^\mathsf{T}$ 把输入旋转到一组合适的正交基
- $\Sigma$ 沿各轴独立缩放（缩放倍数 = 奇异值）
- $U$ 旋转到输出空间

对**任意**实矩阵都成立——不要求方阵、不要求可逆、不要求对称。这是它比特征值分解通用的地方。
:::
::::

## 与特征值分解的关系

奇异值是 $A^\mathsf{T}A$ 的特征值的平方根：

$$
A^\mathsf{T}A = V \Sigma^\mathsf{T} U^\mathsf{T} U \Sigma V^\mathsf{T} = V (\Sigma^\mathsf{T}\Sigma) V^\mathsf{T}
$$

因为 $U$ 正交，$U^\mathsf{T}U = I$ 被消掉了。所以 $V$ 是 $A^\mathsf{T}A$ 的特征向量矩阵，而 $\sigma_i = \sqrt{\lambda_i}$。

## 低秩近似

只保留前 $k$ 个奇异值，得到的 $A_k$ 是 $A$ 在 Frobenius 范数下的**最优** $k$ 秩近似（Eckart–Young 定理）：

$$
A_k = \sum_{i=1}^{k} \sigma_i u_i v_i^\mathsf{T}
$$

这是 PCA、图像压缩、推荐系统里矩阵补全的共同基础。

```python
import numpy as np

A = np.random.randn(100, 50)
U, s, Vt = np.linalg.svd(A, full_matrices=False)

# 保留前 k 个奇异值的最优低秩近似
k = 10
A_k = (U[:, :k] * s[:k]) @ Vt[:k, :]

print(f"原始秩: {np.linalg.matrix_rank(A)}")
print(f"近似秩: {np.linalg.matrix_rank(A_k)}")
print(f"相对误差: {np.linalg.norm(A - A_k) / np.linalg.norm(A):.4f}")
```

注意 `np.linalg.svd` 返回的是 `Vt`（即 $V^\mathsf{T}$）而不是 $V$，这是个常见的坑。

::::card
Eckart–Young 定理说了什么？

:::answer
截断 SVD 只保留前 $k$ 个奇异值得到的 $A_k = \sum_{i=1}^{k} \sigma_i u_i v_i^\mathsf{T}$，是 $A$ 在 Frobenius 范数（以及谱范数）下的**最优** $k$ 秩近似。

「最优」是强的：不存在任何其他秩 $k$ 矩阵比它更接近 $A$。这是 PCA、图像压缩、推荐系统矩阵补全的共同理论基础。
:::
::::

在渲染里，SVD 用于压缩预计算辐射传输矩阵；相关的采样与立体角基础见 [[physics/optics/radiometry]]。

