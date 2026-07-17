---
title: Strudel 入门：用代码写节奏与旋律
level: basic
tags: [音乐, Strudel, live-coding]
summary: TidalCycles 的 JavaScript 后裔——浏览器里现场编码音乐。mini-notation 一行写一个循环，点开就能改。
created: 2026-07-17
---

[Strudel](https://strudel.cc) 是 TidalCycles 的 JavaScript 移植：**模式（pattern）即代码**，一行 mini-notation 描述一个循环，实时改实时响。笔记里的示例点「加载播放器」后会内嵌 strudel.cc 的 REPL——代码可以当场改了重跑，这比任何乐理解释都直观。

## 第一个节奏

mini-notation 的空格是**均分时间**：`"bd hh sd hh"` 把一个循环切成四份——底鼓、踩镲、军鼓、踩镲，就是最基本的 backbeat。

::::strudel{height=300}
```js
s("bd hh sd hh")
```
::::

改成 `"bd hh [sd sd] hh"` 试试：方括号把一格再细分，军鼓变成两连击。

## 旋律：把乐理笔记跑起来

[[music/theory/scales-intervals]] 里说:term[大调音阶]是「全全半全全全半」——听听看。`note()` 接音名，`c4 d4 e4 f4 g4 a4 b4 c5` 正是 C 大调一个八度：

::::strudel{height=300}
```js
note("c4 d4 e4 f4 g4 a4 b4 c5").sound("piano").slow(2)
```
::::

把其中的 `e4` 改成 `eb4`（降三音）再听——大调的「开朗」瞬间变小调的「阴郁」，那就是大三度与小三度一个:term[半音]的差距。

## 叠起来

`stack()` 同时跑多个模式——节奏 + 低音线，纯五度（`c2 g2`）的稳定感一听便知：

::::strudel{height=340}
```js
stack(
  s("bd hh sd hh"),
  note("c2 g2 c2 g2").sound("sawtooth").lpf(600)
)
```
::::

## 为什么是 iframe 而不是内置运行器

Strudel 的运行时是一整套 Web Audio 合成器（几 MB），塞进本站会让所有页面为它买单。所以走 strudel.cc 的分享链接格式内嵌，且**点击才加载**——不点播放的访客不会向 strudel.cc 发任何请求。代码本身始终是页面上可见、可搜索的代码块（和 [[shaders/plasma|::::shader]] 同一哲学）。
