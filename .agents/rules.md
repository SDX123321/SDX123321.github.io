# Project Rules & Guidelines

- [LangGraph & Agent 架构设计规范](file:///c:/Users/zzz/Desktop/site/.agents/rules/langgraph_architecture.md)
- [Git 修改与 Commit 工作流规范](file:///c:/Users/zzz/Desktop/site/.agents/rules/git_workflow.md)

## 规则摘要

### 1. LangGraph & Agent 核心原则
1. **业务与流程解耦**：Graph 只负责状态流转与路由决策（下一步去哪），业务逻辑全部下沉给 Service。
2. **State 只存引用**：避免上下文无限膨胀与 LLM 成本激增，大文本存数据库，State 只保存引用 ID/Key。
3. **Node 微服务化**：每个节点单职责，支持模型无缝替换（如 Draft 用 Claude，Review 用 GPT，Quality 用规则引擎），不改变 Graph。
4. **输出自动修复**：不依赖 Prompt 100% 成功，建立输出后的校验、错误捕获与 Self-Correction 自动修复机制。

### 2. 代码修改与 Git Commit 规范
1. **检查分支**：每次修改代码后，首先判断修改位于哪一个分支。
2. **总结改动**：对改动内容进行明确总结。
3. **进行 Commit**：确认后及时执行 git commit 提交改动。
