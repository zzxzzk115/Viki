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

## 专业术语（重要）

中文技术笔记不标英文，查文献时就断链了。术语走 [content/_glossary.yml](content/_glossary.yml)，笔记里用 `:term[…]` 引用：

```markdown
:term[辐射亮度]沿真空中的光线传播不变。
:term[最小可分辨角]随离心率线性增长。
```

渲染成：

> **辐射亮度 (radiance)** 沿真空中的光线传播不变。
> **最小可分辨角 (minimum angle of resolution, MAR)** 随离心率线性增长。

虚线下划线，悬停显示定义。有缩写的术语会带上缩写——**缩写才是文献里实际用的形式**。

### 规则

| 场景 | 行为 |
|---|---|
| 一篇笔记里**首次**出现 | 标注英文：辐射亮度 (radiance) |
| 同一篇里**再次**出现 | 只显示中文，英文仅在悬停提示里 |
| 出现在 `::::card` 里 | **总是**标注英文——卡片是脱离上下文单独复习的，读者看不到前文 |
| 术语不在 `_glossary.yml` 里 | **构建失败**并告诉你哪个文件哪个词 |

术语表是译法的**唯一来源**，所以「辐射亮度」不会在这篇里叫「辐射率」、那篇里叫别的。

### 语法

```markdown
:term[辐射亮度]            首次标英文，之后不标
:term[辐射亮度]{as=亮度}   显示「亮度」，但仍解析辐射亮度这一条
:term[辐射亮度]{en}        强制标英文（非首次也标）
```

`{en}` 在卡片里不需要写——插件会自动处理。

### 加术语

```yaml
最小可分辨角:
  en: minimum angle of resolution   # 必填，英文全拼，不是缩写
  abbr: MAR                          # 可选，标准缩写
  def: 视觉系统能分辨的最小角度…      # 可选，悬停显示 + 术语表页
  aka: [可分辨角]                     # 可选，其他中文译法，只进搜索索引
  see: papers/foveated-3d-graphics   # 可选，详解这个术语的笔记
```

**`en` 填全拼，缩写填 `abbr`。** 不要把 `en: BRDF` 这样写——那样页面上只有缩写，全拼丢了；正确写法是 `en: bidirectional reflectance distribution function` + `abbr: BRDF`。

`aka` 只放**其他中文译法**（用于搜索），不放缩写。

术语的 `en`、`abbr`、`aka` 都会拼进该笔记的搜索文本——**搜 "radiance" 或 "SVD" 能搜到从没写过这些字母的中文笔记**。

在 `_glossary.yml` 里但没被任何笔记用到的术语，构建时给个警告（不阻断）——预置词汇是允许的。

## 算法演示

网页内嵌的步进式演示（[实例：基数排序](content/cs/algorithms/radix-sort.md)）：

````markdown
::::demo{title="LSD 基数排序"}

:::step{caption="初始数组"}
::array{values="170 45 75 90"}

每步都是**完整的 markdown** —— 公式 $O(d(n+k))$、代码块、表格都能用。
:::

:::step{caption="按个位分桶"}
::array{values="170 90" label="桶 0" highlight="0 1"}
::array{values="45 75" label="桶 5" highlight="0 1"}
:::

::::
````

规则：

- `::::demo` 四冒号，`:::step` 三冒号（同卡片，remark-directive 的嵌套规则）。
- `demo` 里除了 `step` 之外的内容会被丢弃——散落的正文会在每一步下面都出现，读起来像是每步的一部分。
- 没有 `step` 的 `demo`、没有 `values` 的 `array`，都会构建失败。

### `::array` 参数

| 参数 | 作用 |
|---|---|
| `values` | 必填。空格或逗号分隔 |
| `highlight` | 下标，高亮成蓝色（从 0 开始） |
| `dim` | 下标，淡化 |
| `label` | 左侧标签，如「个位」「桶 0」 |

### 为什么不是 Manim

Manim 渲染的是**视频**：CI 里要装 Python + cairo + ffmpeg（官方 action 光装依赖就 ~4 分钟），产物是几 MB 的二进制文件进仓库，部署从 30 秒变成好几分钟。而笔记真正需要的是「能一步步看懂」，幻灯片就够了——而且每步是 markdown，公式和代码直接复用现成管道。

**所有步骤都在静态 HTML 里**，`DemoPlayer` 挂载后才逐步显示。所以关掉 JS 整个演示仍然可读，搜索索引也能看到全部内容——换成 canvas 动画或视频，这两点都做不到。

## 在线编辑器

每篇笔记/论文底部有「在线编辑」——textarea + 实时预览（卡片/术语/公式/wiki-link 与站点渲染一致，唯一差别是代码块不做高亮），直接提交到 GitHub。主页「待读论文」的编辑链接也进这里。

**提交需要 token**：在 [GitHub 设置](https://github.com/settings/personal-access-tokens/new) 创建 fine-grained PAT，只授权 Viki 一个仓库、只给 Contents 读写权限。贴进编辑器后存在**本机浏览器**（localStorage），不会上传到任何地方。用 PAT 提交是普通 push，会正常触发部署（约 1 分钟生效）。

没有 token 的访客只能加载和预览，提交按钮禁用——写权限由 GitHub 锁死，想贡献走 fork + PR。

安全边界：编辑器只接受 `content/`、`scratch/` 下的 `.md/.mdx/.yml/.bib` 路径，workflow、脚本等一律拒绝；提交用文件 sha 做乐观锁，别处改过会得到 409 提示而不是静默覆盖。

## 批量导入论文（BibTeX）

把 BibTeX 追加到 [scratch/related-work.bib](scratch/related-work.bib)，然后：

```bash
pnpm import-bibtex:dry   # 预览每条派生出的 slug/venue/tags，不写文件
pnpm import-bibtex       # 生成 content/papers/*.md 占位页
```

全部**从 BibTeX 自动派生**，无需手写映射：
- slug 从标题（去停用词，取前几个实词）
- venue 从 journal/booktitle/note，经缩写词典规范化
- tags 从关键词词典（同 [config/feeds.ts](config/feeds.ts) 的思路）

**幂等**：按 DOI/标题去重，重跑不会重复生成，也不覆盖你已填的正文。数据集/3D 模型（note 里含 "3D model"/"ORCA" 等）自动跳过。作者名的 LaTeX 转义（`{\ss}`、`{\v{s}}`、`{\'e}`）会解析成 Unicode。

tags 是关键词猜的，约八成准——个别不对就直接改生成的 md。生成的是占位页（`status: to-read`，正文空），读完补 `贡献/方法/评价`。

## 论文引用关系图

`/papers/graph` 的引用网络由 [OpenAlex](https://openalex.org) 按 DOI 拉取。加了新论文后刷新一次：

```bash
pnpm citations   # 拉 OpenAlex → data/citations/edges.json
```

引用关系存在 data 分支（外部 API 派生、更新不频繁，和 arXiv feed 一样不进 master 历史）。CI 上手动触发 `citations.yml` workflow 会拉取、提交到 data 分支并重新部署。

无 DOI 的灰色文献（GDC talk、course notes）用标题搜 OpenAlex 兜底；搜不到的仍是图上的节点，只是没有引用边，靠主题聚类定位。

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

## 搜索

搜索索引在构建时生成，用 `Intl.Segmenter` 分中文词。中文没有空格，minisearch 的默认分词器会把「辐射亮度沿真空中的光线传播不变」当成**一个 token**，搜什么都是零结果——这条实测过。

术语的英文和缩写会拼进所在笔记的搜索文本，所以**搜 `radiance` 或 `SVD` 能找到从没写过这些字母的中文笔记**。论文额外可按会议、年份、作者搜。

## 本地跑

```bash
pnpm data:pull    # 拉 arXiv feed（在 data 分支上，不拉也能构建，只是 /arxiv 为空）
pnpm dev          # http://localhost:3000/Viki/
pnpm content      # 只重建内容索引
pnpm test         # 单测：SM-2 / 术语 / 搜索 / basePath
pnpm check        # 类型检查
pnpm build        # 内容 → 静态导出 → 死链检查
pnpm papers:dry   # 试跑 arXiv 抓取，只打印不写文件
```

`pnpm dev` **不会**在你改 markdown 时自动重建索引（内容管道是独立的 CLI 步骤，不是 bundler 插件）。改了内容另开一个终端跑：

```bash
pnpm content:watch
```

## 链接和图片的路径

站点部署在 `/Viki` 下。笔记正文里的**根相对路径会自动补上 `/Viki` 前缀**（由 [rehype-base-path](src/plugins/rehype-base-path.ts) 在构建时处理），所以你直接写就行：

```markdown
[SVD](/notes/math/linear-algebra/svd/)   ->  自动变成 /Viki/notes/...
![图](/img/diagram.png)                   ->  自动变成 /Viki/img/diagram.png
```

锚点（`#标题`）、外链（`https://`）、相对路径（`./x`）都不会被动。

这个自动处理是必要的：笔记 HTML 是构建时生成后直接注入页面的，Next 不会碰里面的 href——没有这层，链接看起来正常，一点就 404。

## 几个会咬人的地方

- **不要用 PowerShell 编辑中文文件。** PowerShell 5.1 的 `Set-Content -Encoding utf8` 会写 BOM，`Get-Content -Raw` 按 ANSI 读，中文直接损坏。用编辑器或 node。
- **`typescript` 锁在 6.x。** 7.x 会让 `next build` 失败，且报错误称「TypeScript 没装」。见 [README](README.md)。
- **别在客户端组件里 `import cards.json`。** Next 会把整个 JSON 内联进 bundle，知识库长大后每个页面都跟着变大。运行时 `fetch(withBase('/data/cards.json'))`。
