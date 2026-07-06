# 后端数据库

本项目后端使用本机 PostgreSQL，默认连接：

```text
postgres://postgres:postgres@127.0.0.1:5432/exam_review
```

常用命令：

```bash
npm run db:setup
npm run db:seed:gaokao
npm run api
```

如果本机密码或端口不同，先设置 `DATABASE_URL`，再运行上面的命令。

## 已入库内容

`server/seed-gaokao.js` 会从 `src/data/` 读取并写入：

- 九科学科画像与复习建议
- 2017-2026 江苏/新高考资料索引
- DOCX 抽取的真实题目样本
- 2026 江苏数学 OCR 样本
- AI 出题基因迁移练习题

导入使用唯一键做幂等处理，重复运行不会重复累加同一批题目。
