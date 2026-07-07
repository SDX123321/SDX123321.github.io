# 高考题库 LangSmith JSONL 数据集

本目录由 `npm run gaokao:langsmith` 从 PostgreSQL 表 `gaokao_questions` 导出。

每个学科一个 JSONL 文件，每行是一个 LangSmith example：

```json
{
  "inputs": {
    "question": "题干",
    "subject": "数学",
    "question_type": "选择题",
    "year": 2026
  },
  "outputs": {
    "answer": "标准答案",
    "solution": ["分步题解 1", "分步题解 2"],
    "solution_text": "分步题解 1\n分步题解 2"
  },
  "metadata": {
    "question_key": "...",
    "subject_key": "math",
    "source": "..."
  }
}
```

默认导出规则：

- 排除 `metadata.cleanup.status = soft_deleted` 的题目。
- 排除题干缺失、标准答案缺失或标准答案为 `答案待补全` 的题目。
- 排除没有题解步骤的题目。

文件说明：

- `gaokao-*.jsonl`：按学科拆分的 LangSmith 数据集文件。
- `manifest.json`：导出参数、总数与各学科文件清单。
- `skipped.jsonl`：被跳过题目的审计清单，不是 LangSmith example 文件。

常用命令：

```bash
npm run gaokao:langsmith
node scripts/export-gaokao-langsmith-jsonl.mjs --subject math
node scripts/export-gaokao-langsmith-jsonl.mjs --include-answer-only --out datasets/langsmith/gaokao-answer-only
```
