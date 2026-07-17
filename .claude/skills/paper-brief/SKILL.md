---
name: paper-brief
description: 根据 DOI / arXiv ID / 标题把论文导入本仓库并生成中文导读初稿。Import a paper into this knowledge base by DOI, arXiv ID, or title, then draft its Chinese brief (贡献/方法) into content/papers/. Use when the user gives a paper reference and wants it added, imported, summarized, or briefed（导入论文 / 论文导读 / 加论文）.
---

# 论文导入 + 导读

把一篇论文加进本仓库的知识库,并写出与网页版「AI 导读」**完全同构**的中文导读初稿。
输入可以是 DOI、arXiv ID、论文标题或 URL,支持一次多篇。

管线(不可跳步,bib 是唯一事实来源):

```
scratch/related-work.bib  --pnpm import-bibtex-->  content/papers/<slug>.md  --填导读-->  pnpm content 校验
```

## 第 0 步:去重

先确认这篇论文不在库里:

- `scratch/related-work.bib` 里按 DOI(`doi = {...}` 字段,小写、去 `https://doi.org/` 前缀后比较)或 arXiv ID(`eprint` 字段 / `arXiv.<id>`)查;
- `content/papers/*.md` 的 frontmatter 里按 `doi:` 或标题(去大小写和标点后)查。

已存在的处理:占位页的「贡献/方法」两节仍是空的(或只有 AI 初稿标记)→ 跳过导入,直接去第 3 步补导读;两节已有人工内容 → **什么都不改**,向用户报告即可。

## 第 1 步:取元数据与摘要

用 WebFetch,按输入类型选来源:

| 输入 | 来源 |
|---|---|
| arXiv ID | `https://export.arxiv.org/api/query?id_list=<id>`(Atom XML,含摘要) |
| DOI | `https://api.openalex.org/works/doi:<doi>`(`abstract_inverted_index` 按词的位置还原成摘要;也可用 Crossref 兜底) |
| 标题 | `https://api.openalex.org/works?search=<url编码标题>`,取最匹配一条;有歧义时把候选列给用户确认,不要猜 |

有条件时优先再读一层全文(arXiv 摘要页或 `https://ar5iv.org/abs/<id>` 的 HTML)——导读质量会高于只看摘要;拿不到全文就只用摘要,并遵守第 3 步的 hedging 规则。

## 第 2 步:追加 BibTeX 条目

编辑 `scratch/related-work.bib`,在文件末尾追加(条目之间**恰好一个空行**,文件以换行结尾)。

arXiv 预印本用这个精确形状(key = `arxiv` + ID 中非字母数字换成 `_`;`howpublished` 驱动 importer 的 venue 推导,勿改措辞):

```bibtex
@misc{arxiv2510_03964,
  title        = {Paper Title Here},
  author       = {First Author and Second Author},
  year         = {2025},
  eprint       = {2510.03964},
  archiveprefix = {arXiv},
  howpublished = {arXiv preprint arXiv:2510.03964},
  doi          = {10.48550/arXiv.2510.03964},
  url          = {https://arxiv.org/abs/2510.03964}
}
```

正式发表的用 `@article`(期刊,`journal` 字段)或 `@inproceedings`(会议,`booktitle` 字段),对照文件里现有条目的风格:两空格缩进、`=` 对齐、值用花括号、必带 `doi`。转义规则:`&`→`\&`,`%`→`\%`;标题里不要留裸花括号和反斜杠(仓库自己的解析器会被弄糊)。

## 第 3 步:生成占位页并写导读

1. 跑 `pnpm import-bibtex`,确认输出「✓ 新建 1 篇占位页」;在 `content/papers/` 里按 frontmatter 的 `doi` 找到新文件。
2. 只填 `## 贡献` 和 `## 方法` 两节。**每节正文的第一行必须是这个精确标记**(网页端的合并与重跑逻辑靠它逐字识别,一个字符都不能差):

   ```
   <!-- AI 初稿（基于摘要生成），待核对 -->
   ```

   填完后单节形如:

   ```markdown
   ## 贡献

   <!-- AI 初稿（基于摘要生成），待核对 -->

   1. 提出了……（一句话一条）
   2. ……

   ## 方法
   ```

3. 写作规范(与网页版 prompt 一致):
   - 简体中文;专业术语首次出现时括注英文;
   - `## 贡献` = 编号列表,每条一句话;`## 方法` = 要点式段落;
   - 绝不编造材料之外的数字、实验结果或结论;只看了摘要时,推测性内容逐条标「（待核对）」;完全没有摘要时每一条都要带;
   - 不写任何评价性内容——评价是库主人的。

4. **红线**:frontmatter、`## 我的评价`、`<!-- 从 BibTeX 导入的占位页。… -->` 这行导入注释,一律不动(注释由库主人真正读完后自己删)。唯一例外:importer 推出的 `tags: []` 为空且你有把握时,可以补 1–2 个与现有词典风格一致的中文标签。已有人工内容的节(节内有文字且不以 AI 初稿标记开头)绝不覆盖。

## 第 4 步:校验与提交

1. `pnpm content` 必须通过(论文计数应 +1,注意输出里的警告);
2. `git add` 只加 `scratch/related-work.bib` 和新的 `content/papers/*.md`,提交信息用简短祈使句(参考 `git log --oneline` 的既有风格),未经要求不要 push;
3. 向用户汇报:新页面路径、导读基于摘要还是全文、哪些点标了「待核对」。
