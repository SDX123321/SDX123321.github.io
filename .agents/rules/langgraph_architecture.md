# LangGraph & Agent 架构设计规范与 Rules

本文档定义了 LangGraph 与 Agent 系统的核心设计原则，主要关注状态管理、业务解耦、节点微服务化及容错修复策略。

---

## 1. 区分 Graph 流程与业务逻辑（Graph vs Business Logic）
* **控制面与执行面分离**：不要把 LangGraph 当作传统的业务流程图，切忌把业务流程和 Agent 流程混在一起。
* **Graph 只负责状态与路由**：Graph 节点的核心职责是维护状态（State）与决策“下一步去哪里”（Routing / State Machine Transition）。
* **真正的业务下沉至 Service**：具体的业务逻辑、数据处理、外部 API 调用、算法执行等全部沉淀在独立的 Service 层中，Graph 节点仅通过调用 Service 完成具体任务。

---

## 2. State 状态轻量化与引用化（State Minimalism）
* **严禁 Context/State 无限增长**：切忌在运行过程中将大文本、完整的上下文历史或大量中间产物无限制追加到 State 中，这会导致 Context 持续膨胀，LLM 响应变慢且成本激增。
* **State 只存引用，大文本入库**：真正的大文本、大型 JSON、文件内容或大文档全部分离存储在数据库、KV 缓存或文件系统中，State 中仅保留 ID、Key、URL 或引用句柄（Reference）。

---

## 3. Node 微服务化与单一职责（Node as Microservice）
* **单一职责原则**：每个 Graph Node 应该像一个独立的微服务，只专注完成一个特定的单一职责。
* **无缝模型/引擎替换**：确保 Node 的实现与 Graph 框架解耦。这样替换底层模型或规则引擎时，Graph 结构完全无需修改：
  * **Draft 节点**：使用 Claude / Gemini 生成草稿；
  * **Review 节点**：使用 GPT 进行审阅评估；
  * **Quality 节点**：使用确定性的规则引擎或正则表达式检查；

---

## 4. 容错防御与自动自我修复（Fault Tolerance & Self-Correction）
* **不假设 LLM 一次性成功**：线上环境必然会遇到 LLM 输出 JSON 格式非法、必填字段缺失、数据类型不匹配等异常。
* **自动修复重试机制**：系统高可用的保障不是撰写“完美”的 Prompt，而在于输出后的结构化解析校验、异常捕获与自我修复循环（Auto-Correction / Retry Loop）。
  * 遇到格式错误时，捕获异常并将 Error Feedback 喂给 Repair Node 进行自动修复；
  * 具备合理的 Fallback 机制，确保局部 LLM 异常不会阻塞整个流程。

---
