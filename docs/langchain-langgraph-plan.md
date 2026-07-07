# LangChain / LangGraph 集成计划

## 当前落地

高考题库的数据集导出已经改为 LangGraph 编排，入口仍然兼容原命令：

```bash
npm run gaokao:langsmith
```

也可以直接运行图入口：

```bash
npm run gaokao:langgraph -- --print-graph-plan
```

图结构在 `scripts/langchain/gaokao-dataset-graph.mjs` 中定义，节点如下：

1. `loadRows`：从 PostgreSQL 读取 `gaokao_questions`、标签和元数据。
2. `auditRows`：过滤软删除、缺题干、缺答案、缺题解等不适合进入 LangSmith 的样本。
3. `enrichMissingSolutions`：可选节点，使用 LangChain chat model + structured output 为缺题解样本生成分步题解。
4. `groupBySubject`：按学科拆分为 JSONL examples。
5. `writeDatasets`：写入 `gaokao-*.jsonl`、`manifest.json` 和 `skipped.jsonl`。

## 推荐图结构

```mermaid
flowchart TD
  A[loadRows] --> B[auditRows]
  B --> C[enrichMissingSolutions]
  C --> D[groupBySubject]
  D --> E[writeDatasets]
```

## 可继续编排的高阶能力

- **Structured output**：题解补全、题型标注、知识点标注都应该返回稳定 schema，而不是自由文本。
- **Checkpointing**：当前使用 `MemorySaver`，后续可换成 Postgres/Redis checkpoint，让长任务可恢复。
- **LangSmith tracing**：设置 `LANGSMITH_TRACING=true`、`LANGSMITH_API_KEY`、`LANGSMITH_PROJECT` 后，可观察每个节点的输入输出和耗时。
- **Human-in-the-loop**：对作文、材料题、OCR 不完整题，不自动进入训练集；后续可增加人工审核节点。
- **Conditional routing**：将题目按 `complete`、`needs_review`、`needs_enrichment`、`delete_candidate` 分流。
- **Map-reduce fan-out**：后续对九个学科并行跑清洗、题解补全、评测汇总，再 reduce 成全局 manifest。
- **Evaluator pipeline**：用 LangSmith dataset 跑标准答案一致性、题解步骤完整性、幻觉风险等自动评测。

## 本地模型补全

默认导出不会调用模型。如果需要让 LangChain 节点尝试补全缺失题解：

```bash
$env:LOCAL_MODEL_URL="http://127.0.0.1:11434/v1"
$env:LOCAL_MODEL_NAME="your-local-chat-model"
npm run gaokao:langgraph -- --enrich-missing-solutions --enrich-limit 10
```

补全结果只写入本次导出的 JSONL，不直接覆盖数据库。需要写回数据库时，应单独增加 `persistEnrichment` 节点，并保留人工复核状态。

## 设计边界

- PostgreSQL 仍是题库权威数据源。
- Rust 后端继续负责高响应 API 服务。
- LangChain / LangGraph 先用于离线数据工程、题解补全、评测与导出流程，不塞进前端运行时。
- `skipped.jsonl` 是审计文件，不作为 LangSmith example 导入。
