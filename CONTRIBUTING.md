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
venueType: conference        # 可选：journal | conference | preprint | report | talk | book | course
---
```

`venueType` 决定论文表「发表于」列的类型徽章（期刊/会议/预印本/…）。BibTeX 导入会从 `@article`/`@inproceedings` 等条目类型自动派生，手写论文页时才需要自己填；不填就没有徽章，不影响构建。

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

### 单词卡片（`::::word`，独立轨道）

单词和知识卡片**分开**：知识讲解用 `::::card`（进 `/复习`），背单词用 `::::word`（进 `/单词`，自己的 SM-2 进度 `viki:vocab:v1`，不和图形学卡片混一个复习堆）。

````markdown
::::word{ipa="/əˈbændən/" pos=v}
abandon

:::meaning
放弃，抛弃（释义可中可英）
:::

:::example
He abandoned his car in the snow.
:::
::::
````

- 第一行是**单词本身**；`:::meaning` 必填（构建失败点名），`:::example` 可选，`ipa`/`pos` 属性可选。
- `/english`（导航「单词」）有两种模式：**记单词**（看词→翻出释义+例句，自评 忘/模糊/记得）和**拼写**（给释义+挖空例句，回忆并拼出单词，对=记得/错=忘记）。
- 单词 id 走独立命名空间（`word::` 前缀哈希），永不与知识卡片 id 冲突；配置 token 后单词进度与复习进度一起同步。
- 释义中英皆可——每日单词拉的是英文释义（E-E 练习），手写时想用中文也行。

### 刷题模式：选择题与填空题

`/cards` 有两种模式，喂的都是同一批卡：

- **翻卡**：看问题 → 自评（忘了/模糊/记得），经典 SM-2。任何卡都能翻。
- **刷题**：10 题一轮的闯关。结果按「选择答对 = 记得一般（grade 3）、填空答对 = 记得很清楚（grade 5）、答错 = 忘了（grade 0）」写回同一个 SM-2 进度——刷题不是独立的游戏，刷完间隔调度会真的变。

**选择题的选项是手写的**，在卡片里加 `:::quiz` 块（`:::answer` 之后）：

````markdown
::::card{id=...}
问题？

:::answer
答案。
:::

:::quiz
- ✓ 正确的简短表述
- 貌似合理的错误 1
- 貌似合理的错误 2
- 貌似合理的错误 3
:::
::::
````

规则（构建强制）：**恰好 4 项、恰好 1 个 `✓`**。选项要短、平行、完整显示；干扰项写「常见的错误理解」而不是随机废话——好的干扰项本身就是教学。懒得手写就把卡片内容丢给 AI 让它生成，再人工过一遍。

> 为什么不自动生成干扰项？试过两版「从其他卡的答案里采集」——干扰项和题目不同主题，一眼就能排除，题目形同虚设。选项只有作者（或 AI）针对**这道题**写才有意义。

**填空题零语法成本**：自动挖答案里的 `:term[…]` 术语（接受中文/英文/缩写/别名）或 `**加粗**` 关键短语（2-24 字、且全文只出现一次才会被挖，避免旁边漏答案）。想让一张卡可以被挖空，就把关键术语写成 `:term[]`、关键结论加粗——这两件事本来就该做。

没有 `:::quiz` 也没有可挖关键词的卡不会进刷题（翻卡不受影响）。

### 复习进度跨设备同步（仅站主）

进度默认只在本机浏览器。配置 GitHub token 后（见「在线编辑器」一节），SM-2 进度和刷题统计会自动提交到 **data 分支**的 `srs/progress.json`：换设备打开 /cards 自动拉取合并（按每张卡最后复习日期取新的一方），本地复习后延迟几秒自动推送。没有 token 的访客一切照旧、零请求。注意仓库公开，同步的进度数据（卡片 id、难度系数、复习日期）也是公开的——没有笔记内容，介意的话不配 token 即可。

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

## 实时 Shader

`content/shaders/` 下一效果一页，正文里用 `::::shader` 内嵌 GLSL，页面上**直接实时运行**（WebGL2），同时出现在 [/shaders 画廊](https://zzxzzk115.github.io/Viki/shaders/)：

`````markdown
::::shader{height=280}
```glsl
void mainImage(out vec4 fragColor, in vec2 fragCoord) {
    vec2 uv = fragCoord / iResolution.xy;
    fragColor = vec4(uv, 0.5 + 0.5 * sin(iTime), 1.0);
}
```
::::
`````

规则：

- **Shadertoy 惯例**：写 `mainImage(out vec4, in vec2)`，可用的 uniform 是 `iTime`（秒）、`iResolution`（像素，z=1）、`iMouse`（xy = 最近一次点击位置，仅点击时更新——所以手机上滑动不会被 canvas 劫持）。Shadertoy 上的单 pass 效果基本可以直接粘贴。
- `::::shader` 里**必须**有一个 ` ```glsl ` 代码块，没有会构建失败。`height` 可选，默认 260px。
- **GLSL 编译错误不阻断构建**（构建时不跑 GPU），但页面上 canvas 的位置会显示编译错误和行号，代码本身仍然可读——和 wiki 死链同一哲学：坏了要看得见，不是致命。
- 代码块保持可见：关 JS 仍是一段 shiki 高亮的源码，也进搜索索引。运行器读的就是这个代码块的文本，源码只有一份。
- 画廊页多个 canvas 同屏——滚出视口的会自动暂停渲染，不用担心费电。

## 图片与画廊

图片就是普通 markdown 图片，放 `public/img/` 下、根相对路径引用（`![说明](/img/xxx.svg)`，basePath 自动补）。**站内所有正文图片点击即全屏查看**（lightbox）：Esc 关闭、←/→ 在本页图片间切换、再点一次图片放大细看。alt 文字会显示为图注——好好写。

多图用 `:::gallery` 排成响应式网格（图片保持原始纵横比、不裁切）：

```markdown
:::gallery
![图一说明](/img/a.jpg)
![图二说明](/img/b.jpg)
:::
```

画廊里的图同样进 lightbox，←/→ 顺序浏览。**用途是图组**——多张截图、照片、效果对比；宽幅示意图（流程图、架构图）直接全宽内联，塞进多列网格会小到读不清。

## 音乐模式（Strudel）

`::::strudel` 内嵌 [strudel.cc](https://strudel.cc)（TidalCycles 的 JS 移植）live-coding 播放器：

`````markdown
::::strudel{height=300}
```js
s("bd hh sd hh")
```
::::
`````

- 代码保持为可见代码块（JS-off 可读、进搜索），**点「加载播放器」才创建 iframe**——不点播放的访客不会向 strudel.cc 发任何请求。
- 加载后是完整 REPL：读者可以当场改代码重跑，这是它比音频文件强的地方。
- 没有代码块会构建失败；`height` 可选，默认 300px。
- 为什么不自托管：Strudel 运行时是几 MB 的 Web Audio 合成器栈，不该让全站为它买单。

## 在线编辑器

每篇笔记/论文底部有「在线编辑」——textarea + 实时预览（卡片/术语/公式/wiki-link 与站点渲染一致，唯一差别是代码块不做高亮），直接提交到 GitHub。主页「待读论文」的编辑链接也进这里。

**提交需要 token**：在 [GitHub 设置](https://github.com/settings/personal-access-tokens/new) 创建 fine-grained PAT，只授权 Viki 一个仓库、只给 Contents 读写权限。在站点的 **/settings 页**（或编辑器、或任何提示需要 token 的地方的快捷设置框）贴一次即可，全站共用；存在**本机浏览器**（localStorage），不会上传到任何地方。用 PAT 提交是普通 push，会正常触发部署（约 1 分钟生效）。

没有 token 的访客只能加载和预览，提交按钮禁用——写权限由 GitHub 锁死，想贡献走 fork + PR。

安全边界：编辑器只接受 `content/`、`scratch/` 下的 `.md/.mdx/.yml/.bib` 路径，workflow、脚本等一律拒绝；提交用文件 sha 做乐观锁，别处改过会得到 409 提示而不是静默覆盖。

## 视频收藏与笔记

一视频一页:在 `/videos` 粘贴 YouTube/Bilibili 链接就自动建一篇 `content/videos/*.md`,frontmatter 带 `video: { platform, id }`,页面在正文上方嵌入播放器,正文是你的手写笔记——复用整套笔记管道(搜索/卡片/术语/编辑/AI)。正文里写 `@12:34` 会变成点击跳转的时间戳(YouTube 用 IFrame API,Bilibili 重设 `&t=`)。手写视频笔记的 frontmatter:

```yaml
video: { platform: youtube, id: "jNQXAC9IVRw", channel: "jawed" }
```

**订阅发现**:`config/video-sources.ts` 按领域列 YouTube 频道(`@handle` 或 `UC…` id,脚本自动解析);`videos.yml` 每天抓各频道最新上传写进 data 分支,主页「今日推荐视频」+ /videos「订阅发现」展示,一键「收藏」成视频笔记。YouTube 频道 RSS 无 key 稳定;**Bilibili 无官方 RSS**,自动发现 best-effort(RSSHub),但手动收藏完整支持。本地试跑:`pnpm videos`。

## 推荐阅读 + 每日单词（定时数据源）

`/read`（导航「阅读」）和主页「今日推荐阅读 / 每日单词」由 `reading.yml` 每天定时抓取,和 arXiv feed 一样写进 `data` 孤儿分支(零 secret)、再 `workflow_call` 重部署。

- **推荐阅读**:源在 [config/reading-sources.ts](config/reading-sources.ts)——三类(英语学习 / 技术研究 / 通识文化),支持 `wikipedia`(今日精选)、`wiki-random`(随机词条摘要,分级英语)、`hn`(Hacker News)、`rss`(任意 RSS/Atom)。全部无 key、CORS 干净、只存**摘要 + 原文链接**(不转载全文,版权安全)。加源就改这一个文件;抓取失败的源会被跳过并记日志,不阻断。本地试跑:`pnpm reading`。
- **每日单词**:[config/word-list.txt](config/word-list.txt) 里日期种子挑一个词,`fetch-word.ts` 从 [dictionaryapi.dev](https://dictionaryapi.dev)(无 key)取音标/词性/英文释义/例句,写 `data/vocab/daily.json`。主页「加入单词本」一键把它提成 `::::word` 提交进 [content/english/vocab/collected.md](content/english/vocab/collected.md),CI 物化后进单词轨道。本地试跑:`pnpm word`。
- **读后问 AI**:配置了 AI 提供商时,每条阅读旁有「问 AI / 记笔记」——打开侧边栏并把文章摘要作为上下文,聊完可走草稿流程沉淀成笔记。

## AI 功能（可选，全部需要在 /settings 配置提供商）

在设置页配好 AI 提供商（Anthropic 支持浏览器直连；OpenAI 兼容端点需自填允许 CORS 的 baseURL，如本地 Ollama——OpenAI 官方 API 不允许浏览器直连）后解锁三处：

- **AI 论文导读**：待读论文页出现「✨ AI 导读」，进编辑器一键生成——从 OpenAlex 按 DOI 拉摘要，AI 只基于**元数据+摘要**写 `贡献/方法` 初稿（带「AI 初稿，待核对」标记），填入编辑器供人工核对后走正常提交。**`我的评价` 永远不让 AI 碰**——没读过的论文写评价是造假；重跑会替换标记块而不是叠加；已有人工内容的小节拒绝覆盖。
- **AI 侧边栏**：右下角 ✨ 按钮，问知识点；答完可「沉淀成笔记草稿」——AI 提议路径/标签/正文，路径过白名单校验+重名探测，**预览渲染与站点一致**，你改完确认才会提交入库（走 PAT，和编辑器同一通道）。对话存 sessionStorage，关标签页即弃。
- 所有 AI 调用直接从你的浏览器发往提供商，本站没有中转服务器；key 存本机。

## Zotero 导入

设置页配好 Zotero userID（数字）+ 只读 API key 后，[/import](https://zzxzzk115.github.io/Viki/import/) 页可以浏览收藏夹、勾选条目导入：BibTeX 由 Zotero API 原样导出（零转换），按 DOI 与现有 .bib 去重（「已在库」徽章），一次 commit 追加，CI 照常生成待读页。arXiv 条目会从 URL 合成 `10.48550/arXiv.<id>` 参与去重，所以和「加入待读」按钮加过的不会重复。

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
