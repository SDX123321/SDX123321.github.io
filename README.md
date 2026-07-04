# 期末复习笔记

**2025-2026 学年第二学期** 知识点总结与例题精讲

🔗 **在线访问：** [https://web.zzzzcx.com](https://web.zzzzcx.com)

---

## 课程目录

| 课程 | 内容 | 特色 |
|------|------|------|
| [概率论与数理统计](https://web.zzzzcx.com/courses/probability/) | 7 章：随机事件、随机变量、多维随机变量、数字特征、大数定律与 CLT、参数估计、假设检验 | KaTeX 公式、经典例题精讲、常用分布速查表、易错点汇总 |
| [操作系统](https://web.zzzzcx.com/courses/os/) | 5 章：概述、处理器管理、存储管理、设备管理、文件系统 | 交互式调度算法计算器、银行家算法模拟器、磁盘调度可视化 |
| [算法设计与分析](https://web.zzzzcx.com/courses/algorithm/) | 6 章：算法概述、分治法、动态规划、贪心算法、回溯法、分支限界法 | 算法可视化演示、互动测验、复杂度分析 |
| [数字信号处理 DSP](https://web.zzzzcx.com/courses/dsp/) | 4 章：离散时间信号、Z 变换、DFT/FFT、数字滤波器设计 | FFT 蝶形运算图解、MathJax 公式渲染、互动练习 |
| [马克思主义基本原理](https://web.zzzzcx.com/courses/marxism/) | 7 章：唯物辩证法、认识论、唯物史观、资本主义本质与规律、社会主义发展 | 互动复习卡、知识卡片、暗色模式 |
| [毛泽东思想和中国特色社会主义理论体系概论](https://web.zzzzcx.com/courses/maogai/) | 复习提纲与考试重点 | 结构化的复习资料 |
| [高等数学（重修）](https://web.zzzzcx.com/courses/calculus/) | 5 大专题：常微分方程、多元微分、多元积分、复变函数 | 考试分值标注、复习课笔记、互动练习 |
| [信号与系统B](https://web.zzzzcx.com/courses/signals/) | 6 章：信号分类、时域分析、傅里叶变换、拉普拉斯变换、Z 变换 | 公式速查、20+ 互动练习题、快速判断法总结 |

---

## 资料来源

- **PDF 教材** — 各章教材课件
- **PPT** — 课件幻灯片
- **Markdown** — 手动整理的知识点大纲
- **DOCX** — 复习课录音转写文本、知识点总结文档

---

## 技术栈

| 类别 | 技术 |
|------|------|
| 框架 | [React 18](https://react.dev/) + [Vite 6](https://vitejs.dev/) |
| 路由 | [React Router v6](https://reactrouter.com/) |
| 动画 | [GSAP 3](https://gsap.com/) (`@gsap/react`) |
| 数学渲染 | [KaTeX](https://katex.org/)（概率论/算法/高数） / [MathJax 3](https://www.mathjax.org/)（DSP/信号与系统） |
| 评论系统 | [Giscus](https://giscus.app/)（基于 GitHub Discussions） |
| 访问统计 | [busuanzi](http://busuanzi.ibruce.info/) 不蒜子 |
| 人机验证 | [Cloudflare Turnstile](https://www.cloudflare.com/zh-cn/products/turnstile/) |
| 部署 | GitHub Pages + GitHub Actions |
| CDN 图片 | Cloudflare R2 对象存储 |

---

## 本地使用

```bash
git clone https://github.com/SDX123321/SDX123321.github.io.git
cd SDX123321.github.io
npm install        # 安装依赖
npm run dev        # 启动开发服务器（默认 http://localhost:5173）
npm run build      # 构建生产版本 → dist/
```

---

## 功能特性

- 🔍 **全局搜索** — 在首页搜索所有课程内容
- 📋 **收藏集锦** — 快速跳转到常用页面
- 📘 **错题本** — 自动收集做错的题目，方便复习
- 🎯 **随机测验** — 随机抽取题目自测
- 📐 **公式参考** — 快速查看课程核心公式
- 🖨️ **打印模式** — 一键排版，适合打印复习
- 📊 **章节进度** — 跟踪各章节学习进度
- 📖 **滚动记忆** — 回到上次离开的位置
- ↔️ **跨课程关联** — 在不同课程间导航关联知识点
- 🌙 **深色/浅色模式** — 自适应系统偏好或手动切换
- 📱 **响应式布局** — 桌面/手机均可正常使用
- ⌨️ **键盘快捷键** — `Ctrl+K` 搜索 / `T` 切换主题 / `P` 打印等

---

## 开发约定

- UI 语言：中文（zh-CN）
- 命名风格：驼峰式命名（JS 文件）、kebab-case（CSS 类名）、小写英文课程目录
- 状态持久化：统一使用 `localStorage`，键前缀 `site_theme`、`scroll_*`、`mastery_data` 等
- Git 流程：本地 `git add -A && git commit`，不主动推送

---

## 更新日志

```text
2026-07-02  feat: 信号与系统B 互动复习页面
2026-06-28  feat: GSAP 滚动动画、滚动记忆恢复
2026-06-27  feat: Cloudflare Turnstile 集成、文件卡片悬浮提示
2026-06-25  feat: busuanzi 访问统计、主页底部访客计数
2026-06-20  fix: 操作系统习题解答错误修复、笔记批注功能
2026-05-15  feat: 主页卡片排序、评论区恢复
2026-05-10  feat: 操作系统慕课版习题与解答
2026-04-28  fix: 算法真题内容补充、考场信息修复
2026-04-20  feat: shared feature components（Phase 5 迁移）
2026-04-15  feat: 算法抽认卡 + 马原互动复习（Phase 4）
2026-04-08  feat: OS 模拟器 + 算法测验数据（Phase 4）
2026-04-01  feat: 课程内容管线 + KaTeX 数学渲染（Phase 3）
2026-03-25  feat: ThemeContext、共享 hooks、PWA（Phase 2）
2026-03-18  feat: Vite + React 重构（Phase 1）
```

---

## 觉得有帮助？

如果这份笔记对你有帮助，欢迎给个 ⭐ **Star** 鼓励一下！

---

> Built with ❤️ by [@SDX123321](https://github.com/SDX123321)
