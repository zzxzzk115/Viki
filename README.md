# Viki

个人知识库 · 数学 / 物理 / 计算机 / 图形学 · <https://zzxzzk115.github.io/Viki/>

Markdown 写作，静态导出，无服务器。含间隔重复卡片（进度存在浏览器本地）、PhD 论文笔记、每日 arXiv 推荐。

## 本地开发

需要 Node ≥ 20.9 和 pnpm 10。

```bash
pnpm install
pnpm dev      # http://localhost:3000/Viki/
pnpm build    # 静态导出到 out/
pnpm check    # 类型检查
```

dev 下 basePath 也是 `/Viki`，和线上一致 —— 这样 basePath 相关的 bug 在本地就会暴露，而不是等部署后才发现。

## 注意

`typescript` 锁在 6.x。`typescript@7`（Go 重写版）会让 `next build` 失败：Next 通过 `typescript/lib/typescript.js` 检测 TS，而 TS7 在 7.1 前不暴露该入口，报错会误称「TypeScript 没装」。修复在 Next 16.3 preview（[#95572](https://github.com/vercel/next.js/pull/95572)），稳定版尚未包含。

## 写作

见 [CONTRIBUTING.md](./CONTRIBUTING.md)（frontmatter 字段、卡片语法、wiki-link 用法）。
