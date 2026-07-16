# 写作指南

给未来的自己看的。所有规则都由构建强制——写错会让 `pnpm content` 失败并告诉你哪个文件哪个字段，不会静默上线。

## 加一篇笔记

丢一个 `.md` 到 `content/<科目>/` 下就行，任意深度的子目录都可以。**不用改任何代码**：列表页、科目页、标签页、卡片库都会自动收录。

```
content/math/linear-algebra/svd.md   ->  /notes/math/linear-algebra/svd/
content/cs/rendering/brdf.md         ->  /notes/cs/rendering/brdf/
```

第一层目录名就是**科目**。新建一个目录就是新建一个科目。

## Frontmatter

### 笔记

```yaml
---
title: 奇异值分解 (SVD)      # 必填
level: intermediate          # basic | intermediate | advanced，默认 basic
tags: [线性代数, 矩阵分解]    # 可选
summary: 一句话摘要           # 可选，显示在列表页
created: 2026-07-16          # 可选
updated: 2026-07-20          # 可选，影响「最近更新」排序
draft: false                 # 可选，true 则只在本地可见，不会部署
---
```

`level` 是**属性不是目录**。同一主题从基础写到高阶，只改这一行，不用挪文件、不用改链接。

### 论文（`content/papers/*.md`）

```yaml
---
title: 3D Gaussian Splatting for Real-Time Radiance Field Rendering
authors: [Bernhard Kerbl, Georgios Kopanas, ...]
venue: SIGGRAPH 2023         # 必填
year: 2023                   # 必填
arxiv: '2308.04079'          # 可选，注意加引号（否则 YAML 当成数字）
doi: 10.1145/3592433         # 可选
project: https://...         # 可选
code: https://...            # 可选
tags: [渲染, 辐射场]
rating: 5                    # 可选，1-5
status: read                 # to-read | reading | read，默认 read
---
```

## 知识卡片

写在笔记正文里，构建时提取到卡片库，同时在正文原地渲染成可折叠的块。

````markdown
::::card{id=可选的稳定id}
问题写在这里。可以有公式 $E = mc^2$、代码、列表——和正文一样。

:::answer
答案写在这里。

```python
print("代码块也没问题")
```
:::
::::
````

规则：

- **外层四个冒号 `::::`，内层三个 `:::`**。这不是风格问题——remark-directive 要求外层容器的冒号比内层多，写反了解析不出来。
- `:::answer` **之前**的所有内容是问题，`:::answer` **里面**的是答案。
- 别用 `---` 分隔问答。`问题？` 后面跟一行 `---` 会被 Markdown 解析成 **setext 二级标题**，把问题静默吃掉。
- 卡片会自动记住它上方最近的标题，复习时能跳回原文那一节。

### 关于 `{id=...}` —— 这条最重要

卡片 id 是**复习进度在浏览器里的主键**。

不写 `{id=}` 时，id = `sha1(笔记slug + 问题的源文本)`。这意味着：

| 你改了什么 | 复习进度 |
|---|---|
| 改**答案** | ✅ 保留（这是最常见的编辑） |
| 改**问题的措辞** | ❌ 丢失（对系统来说这是另一张卡了） |
| 升级 KaTeX / shiki | ✅ 保留（哈希基于源文本，不是渲染结果） |
| 移动笔记文件 | ❌ 丢失（slug 变了） |

**打算日后改写问题措辞的卡，现在就钉一个 `{id=...}`。** 一旦钉了，改问题也不丢进度。

id 重复会**直接构建失败**——因为两张卡共用一份进度是静默的数据损坏。

## Wiki 链接

```markdown
[[cs/rendering/brdf]]              -> 显示目标笔记的 title
[[cs/rendering/brdf|BRDF 模型]]     -> 显示自定义文字
```

目标写**完整 slug**（不含 `content/` 前缀和 `.md` 后缀）。

链接不存在的目标**不会阻断构建**——它会在页面上标红（红色波浪线，鼠标悬停显示找不到的目标），构建时打印警告。这是刻意的：一个因为你重命名了文件就构建不出来的知识库，是一个你会停止往里写的知识库。链接腐烂应该**看得见**，而不是**致命**。

反向链接（「被引用于」）自动生成，显示在笔记页脚。

## 科目配置

`content/<科目>/_subject.yml`，可选。不写就用目录名当显示名。

```yaml
name: 数学                    # 显示名
icon: mdi:function-variant    # Iconify 图标名，可选
order: 1                      # 排序，越小越靠前，默认 99
```

### 图标

用 [Iconify](https://icon-sets.iconify.design/) 的命名：`<图标集>:<图标名>`。已安装的图标集：

| 前缀 | 图标集 | 浏览 |
|---|---|---|
| `mdi` | Material Design Icons | <https://icon-sets.iconify.design/mdi/> |
| `fa6-solid` | Font Awesome 6 Solid | <https://icon-sets.iconify.design/fa6-solid/> |
| `lucide` | Lucide | <https://icon-sets.iconify.design/lucide/> |

图标在**构建时**解析成内联 SVG，不走 CDN，只有真正用到的会进产物。写错图标名会构建失败并告诉你哪个集里没有这个图标。

要用别的图标集，`pnpm add -D @iconify-json/<集名>` 然后在 [src/lib/icons.ts](src/lib/icons.ts) 的 `SETS` 里加一行。**不要**装全量的 `@iconify/json`，那是 417MB。

## 本地跑

```bash
pnpm dev          # http://localhost:3000/Viki/
pnpm content      # 只重建内容索引
pnpm test         # SM-2 单测
pnpm check        # 类型检查
pnpm build        # 完整静态导出到 out/
```

`pnpm dev` **不会**在你改 markdown 时自动重建索引（内容管道是独立的 CLI 步骤，不是 bundler 插件）。改了内容另开一个终端跑：

```bash
pnpm content:watch
```

## 几个会咬人的地方

- **不要用 PowerShell 编辑中文文件。** PowerShell 5.1 的 `Set-Content -Encoding utf8` 会写 BOM，`Get-Content -Raw` 按 ANSI 读，中文直接损坏。用编辑器或 node。
- **`typescript` 锁在 6.x。** 7.x 会让 `next build` 失败，且报错误称「TypeScript 没装」。见 [README](README.md)。
- **别在客户端组件里 `import cards.json`。** Next 会把整个 JSON 内联进 bundle，知识库长大后每个页面都跟着变大。运行时 `fetch(withBase('/data/cards.json'))`。
