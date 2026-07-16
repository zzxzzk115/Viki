# Viki

个人知识库 · 数学 / 物理 / 计算机 / 图形学 · <https://zzxzzk115.github.io/Viki/>

Markdown 写作，静态导出，无服务器。含间隔重复卡片（进度存在浏览器本地）、中英术语表、PhD 论文笔记 + 引用关系图、每日 arXiv 推荐（近期相关 + 经典混排）、在线编辑器（PAT 直接提交回仓库）。

## 本地开发

需要 Node ≥ 20.9 和 pnpm 10。

```bash
pnpm install
pnpm data:pull   # 拉 arXiv feed（在 data 分支上，见下）
pnpm dev         # http://localhost:3000/Viki/
```

| 命令 | 作用 |
|---|---|
| `pnpm dev` | 开发服务器 |
| `pnpm build` | 内容 → 静态导出 → 死链检查 |
| `pnpm content` | 只重建内容索引 |
| `pnpm content:watch` | 改 markdown 时自动重建索引（`dev` **不会**自动重建） |
| `pnpm test` | 单测（SM-2、术语、搜索、basePath） |
| `pnpm check` | 类型检查 |
| `pnpm papers:dry` | 试跑 arXiv 抓取，打印排序但不写文件 |
| `pnpm data:pull` | 从 data 分支拉 feed |

dev 下 basePath 也是 `/Viki`，和线上一致 —— basePath 相关的 bug 会在本地就暴露，而不是部署后才发现。

## 分支

| 分支 | 内容 |
|---|---|
| `master` | 全部源码和笔记 |
| `data` | 只有 arXiv feed（`data/papers/`），由定时任务每天重写 |

feed 单独放一个孤儿分支，是因为它每天被机器人重写——放在 master 上一年会多出约 365 个 `chore(papers)` 提交，把真实的内容提交淹没，而且你在定时任务跑的时候改代码会撞 rebase 冲突。

用孤儿分支而不是单独建一个仓库：`GITHUB_TOKEN` 的权限只覆盖当前仓库，推到第二个仓库必须建 PAT 密钥并定期轮换，跨仓库触发部署还要走 `repository_dispatch`，且 `git clone && pnpm build` 不再能独立跑通。同仓库分支，零密钥。

CI 会自动拉 data 分支。本地跑 `pnpm data:pull`（不拉也能构建，只是 `/arxiv` 页面为空）。

## 写作

见 [CONTRIBUTING.md](./CONTRIBUTING.md) —— frontmatter 字段、卡片语法、术语表、wiki-link。

## arXiv 推荐

方向和关键词都在 [config/feeds.ts](./config/feeds.ts)，改那一个文件即可。改完 `pnpm papers:dry` 看排序（含落选的几篇，方便调阈值）。

## 注意

`typescript` 锁在 6.x。`typescript@7`（Go 重写版）会让 `next build` 失败：Next 通过 `typescript/lib/typescript.js` 检测 TS，而 TS7 在 7.1 前不暴露该入口，报错会误称「TypeScript 没装」。修复在 Next 16.3 preview（[#95572](https://github.com/vercel/next.js/pull/95572)），稳定版尚未包含。

不要用 PowerShell 编辑含中文的文件。PowerShell 5.1 的 `Set-Content -Encoding utf8` 会写 BOM，`Get-Content -Raw` 按 ANSI 读，中文直接损坏。
