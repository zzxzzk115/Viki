---
title: 基数排序 (Radix Sort)
level: intermediate
tags: [算法, 排序]
summary: 不比较任何两个元素就能排好序——按位分桶，从低位到高位。稳定性是它成立的前提，不是附加属性。
created: 2026-07-16
---

比较排序的下界是 $\Omega(n \log n)$，因为 $n!$ 种排列需要 $\log_2(n!) \approx n\log_2 n$ 次二元比较才能区分。

基数排序**不比较任何两个元素**，所以这个下界管不到它。它的复杂度是 $O(d \cdot (n + k))$，其中 $d$ 是位数、$k$ 是基数（十进制是 10）。

## 演示

从**最低位**开始，按当前位把元素分到 10 个桶里，再按桶顺序收回来。重复到最高位。

::::demo{title="LSD 基数排序"}

:::step{caption="初始数组，最大值 802 有 3 位，所以要跑 3 轮"}
::array{values="170 45 75 90 802 24 2 66"}

需要处理的位数 $d = 3$（个位、十位、百位）。
:::

:::step{caption="第 1 轮：看个位"}
::array{values="170 45 75 90 802 24 2 66" label="个位"}

各元素的个位：**0**、**5**、**5**、**0**、**2**、**4**、**2**、**6**
:::

:::step{caption="第 1 轮：按个位分桶。注意 170 在 90 前面 —— 它们个位都是 0，保持原有相对顺序"}
::array{values="170 90" label="桶 0" highlight="0 1"}
::array{values="802 2" label="桶 2" highlight="0 1"}
::array{values="24" label="桶 4" highlight="0"}
::array{values="45 75" label="桶 5" highlight="0 1"}
::array{values="66" label="桶 6" highlight="0"}
:::

:::step{caption="第 1 轮结束：按桶顺序收回。现在个位有序"}
::array{values="170 90 802 2 24 45 75 66"}

个位：0、0、2、2、4、5、5、6 ✓
:::

:::step{caption="第 2 轮：看十位"}
::array{values="170 90 802 2 24 45 75 66" label="十位"}

十位：**7**、**9**、**0**、**0**、**2**、**4**、**7**、**6**（802 和 2 的十位是 0）
:::

:::step{caption="第 2 轮：分桶。桶 7 里 170 在 75 前面 —— 这是第 1 轮留下的顺序"}
::array{values="802 2" label="桶 0" highlight="0 1"}
::array{values="24" label="桶 2" highlight="0"}
::array{values="45" label="桶 4" highlight="0"}
::array{values="66" label="桶 6" highlight="0"}
::array{values="170 75" label="桶 7" highlight="0 1"}
::array{values="90" label="桶 9" highlight="0"}
:::

:::step{caption="第 2 轮结束：后两位有序"}
::array{values="802 2 24 45 66 170 75 90"}

后两位：02、02、24、45、66、70、75、90 ✓
:::

:::step{caption="第 3 轮：看百位。大部分元素百位是 0"}
::array{values="802 2 24 45 66 170 75 90" label="百位"}

百位：**8**、**0**、**0**、**0**、**0**、**1**、**0**、**0**
:::

:::step{caption="第 3 轮：分桶。桶 0 里的顺序完全来自第 2 轮 —— 这就是稳定性在起作用"}
::array{values="2 24 45 66 75 90" label="桶 0" highlight="0 1 2 3 4 5"}
::array{values="170" label="桶 1" highlight="0"}
::array{values="802" label="桶 8" highlight="0"}
:::

:::step{caption="完成"}
::array{values="2 24 45 66 75 90 170 802" highlight="0 1 2 3 4 5 6 7"}

排好了。全程没有比较过任何两个元素的大小。
:::

::::

## 为什么稳定性是前提而不是附加属性

上面第 3 轮，桶 0 里是 `2 24 45 66 75 90`——这个顺序**完全来自第 2 轮的结果**，第 3 轮没有对它们做任何排序（它们百位都是 0，无法区分）。

::::card{id=radix-stability}
基数排序为什么必须用稳定的分桶？不稳定会怎样？

:::answer
因为 LSD 基数排序的正确性**依赖于前几轮的结果被保留**。

处理第 $i$ 位时，所有第 $i$ 位相同的元素之间，正确顺序已经由第 $1..i-1$ 位决定了。如果这一轮打乱它们的相对顺序，之前所有轮的工作就白做了。

举个反例：`[45, 25]` 已按个位排好（5、5，顺序无所谓）。处理十位时，4 和 2 → `[25, 45]` 正确。但如果处理个位时不稳定，`[45, 25]` 可能变成 `[25, 45]` 或 `[45, 25]`——这里碰巧无所谓。真正出问题的是 `[170, 90]`：个位都是 0，十位 7 > 9？不，7 < 9，所以第 2 轮会把 90 排到 170 后面。看 `[45, 75]`：个位都是 5，第 2 轮按十位 4 < 7 正确排序。

**关键情形**是某一位上元素相同时：那一位无法区分它们，只能靠继承。不稳定 = 继承断裂 = 前面的轮次全部作废。
:::
::::

## 实现

```python
def radix_sort(arr):
    if not arr:
        return arr
    max_val = max(arr)
    exp = 1
    while max_val // exp > 0:
        arr = counting_sort_by_digit(arr, exp)
        exp *= 10
    return arr


def counting_sort_by_digit(arr, exp):
    n = len(arr)
    output = [0] * n
    count = [0] * 10

    for x in arr:
        count[(x // exp) % 10] += 1

    # 前缀和：count[d] 变成「数字 <= d 的元素个数」，
    # 也就是数字 d 的元素在输出里的结束位置
    for d in range(1, 10):
        count[d] += count[d - 1]

    # 必须从后往前遍历！从前往后会让相同数字的元素倒序，
    # 破坏稳定性，进而毁掉前几轮的结果。
    for i in range(n - 1, -1, -1):
        d = (arr[i] // exp) % 10
        count[d] -= 1
        output[count[d]] = arr[i]

    return output
```

::::card{id=radix-reverse-loop}
基数排序每一位用的**计数排序**子过程里，那个 `for i in range(n-1, -1, -1)` 为什么必须**倒序**遍历？

:::answer
因为 `count[d]` 经过前缀和后表示「数字 $d$ 的元素在输出中的**结束**位置」。

倒序遍历时，先取到的是原数组里靠后的元素，把它放在这个数字区间的最后一格，然后 `count[d] -= 1`。这样原数组里靠前的元素最终落在靠前的位置——**相对顺序被保留**。

正序遍历的话，先取到靠前的元素，却把它放在区间末尾，结果相同数字的元素被完全倒序——排序变得不稳定，而基数排序的正确性依赖稳定性，整个算法就错了。

这是个静默的 bug：单轮看起来「排好了」，多轮下来结果才是错的。
:::
::::

## 什么时候真的比快排快

$O(d(n+k))$ 里的 $d$ 不是常数——它是 $\log_k(\max)$。对 32 位整数、$k=256$ 时 $d = 4$。

所以基数排序在 $n$ 很大、值域有限、且数据是定长整数或定长字符串时才划算。$n$ 小的时候，快排的缓存局部性完全碾压基数排序的多轮分桶。

图形学里的典型用例：GPU 上对几百万个粒子按 Morton 码排序、光线追踪里对光线按方向哈希排序——都是「$n$ 极大 + 定长键 + 可并行」的场景。相关的采样与:term[立体角]基础见 [[physics/optics/radiometry]]。
