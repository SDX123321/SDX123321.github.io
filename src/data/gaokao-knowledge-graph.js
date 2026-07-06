export const knowledgeNodes = [
  { id: 'chinese.evidence-chain', subject: 'chinese', label: '文本证据链', group: '阅读', description: '从原文证据、选项改写和推断边界判断答案。' },
  { id: 'chinese.argument-writing', subject: 'chinese', label: '材料作文立意', group: '写作', description: '把材料关系转化为分论点和论证链。' },
  { id: 'math.derivative', subject: 'math', label: '函数与导数', group: '函数', description: '参数、单调性、极值、零点与证明链。' },
  { id: 'math.geometry', subject: 'math', label: '解析几何', group: '几何', description: '圆锥曲线、直线关系、设而不求和运算控制。' },
  { id: 'math.probability', subject: 'math', label: '概率统计', group: '统计', description: '随机变量定义、分布、期望与数据解释。' },
  { id: 'english.discourse', subject: 'english', label: '篇章衔接', group: '阅读', description: '代词指代、转折递进、段落功能与七选五。' },
  { id: 'english.rewrite', subject: 'english', label: '同义改写', group: '阅读', description: '定位句与选项之间的语义改写。' },
  { id: 'physics.modeling', subject: 'physics', label: '物理建模', group: '模型', description: '对象、过程、规律和守恒关系。' },
  { id: 'physics.graph', subject: 'physics', label: '图像信息', group: '实验', description: '斜率、面积、截距和误差来源。' },
  { id: 'chemistry.equilibrium', subject: 'chemistry', label: '反应平衡', group: '原理', description: '条件改变、热效应、计量关系和证据表达。' },
  { id: 'chemistry.experiment', subject: 'chemistry', label: '实验评价', group: '实验', description: '试剂作用、除杂、现象证据和方案评价。' },
  { id: 'biology.experiment', subject: 'biology', label: '实验变量', group: '实验', description: '自变量、因变量、无关变量和对照组。' },
  { id: 'biology.genetics', subject: 'biology', label: '遗传推断', group: '遗传', description: '亲本、子代、基因型与概率解释。' },
  { id: 'politics.material', subject: 'politics', label: '材料术语结合', group: '主观题', description: '主体、行为、意义与教材术语扣合。' },
  { id: 'politics.governance', subject: 'politics', label: '基层治理', group: '政治', description: '民主协商、信息公开和多元协同。' },
  { id: 'history.evidence', subject: 'history', label: '史料实证', group: '史学', description: '在材料限制内定位时空、主体和史实。' },
  { id: 'history.argument', subject: 'history', label: '观点论证', group: '论证', description: '观点、史实、解释和回扣。' },
  { id: 'geography.region', subject: 'geography', label: '区域认知', group: '综合', description: '位置、要素、过程、影响和措施。' },
  { id: 'geography.measure', subject: 'geography', label: '措施对应问题', group: '综合', description: '每条治理措施对应材料中的风险点。' },
]

export const knowledgeEdges = [
  ['chinese.evidence-chain', 'chinese.argument-writing', '证据到论证'],
  ['math.derivative', 'math.geometry', '参数讨论'],
  ['math.probability', 'physics.graph', '数据解释'],
  ['english.discourse', 'english.rewrite', '定位改写'],
  ['physics.modeling', 'physics.graph', '模型到图像'],
  ['chemistry.equilibrium', 'chemistry.experiment', '原理到证据'],
  ['biology.experiment', 'chemistry.experiment', '实验设计'],
  ['politics.material', 'politics.governance', '术语落点'],
  ['history.evidence', 'history.argument', '史实论证'],
  ['geography.region', 'geography.measure', '问题措施'],
]

export const questionKnowledgeMap = {
  'math-gene-derivative-01': ['math.derivative'],
  'chinese-reading-01': ['chinese.evidence-chain'],
  'english-seven-five-01': ['english.discourse', 'english.rewrite'],
  'physics-experiment-01': ['physics.graph', 'physics.modeling'],
  'chemistry-equilibrium-01': ['chemistry.equilibrium'],
  'biology-experiment-01': ['biology.experiment'],
  'politics-material-01': ['politics.material', 'politics.governance'],
  'history-evidence-01': ['history.evidence', 'history.argument'],
  'geography-region-01': ['geography.region', 'geography.measure'],
}

const subjectFallback = {
  chinese: ['chinese.evidence-chain'],
  math: ['math.derivative'],
  english: ['english.discourse'],
  physics: ['physics.modeling'],
  chemistry: ['chemistry.experiment'],
  biology: ['biology.experiment'],
  politics: ['politics.material'],
  history: ['history.evidence'],
  geography: ['geography.region'],
}

export function getQuestionKnowledgeIds(question) {
  return questionKnowledgeMap[question.id] || subjectFallback[question.subject] || []
}

export function summarizeKnowledgeAttempts(attempts) {
  const nodeStats = {}
  Object.values(attempts || {}).forEach(attempt => {
    const result = attempt.result === 'correct' ? 'correct' : 'wrong'
    ;(attempt.knowledgeIds || []).forEach(id => {
      if (!nodeStats[id]) nodeStats[id] = { total: 0, correct: 0, wrong: 0 }
      nodeStats[id].total += 1
      nodeStats[id][result] += 1
    })
  })
  const weakNodes = Object.entries(nodeStats)
    .filter(([, stat]) => stat.wrong > 0)
    .map(([id, stat]) => ({
      id,
      ...stat,
      accuracy: stat.total ? stat.correct / stat.total : 0,
      node: knowledgeNodes.find(item => item.id === id),
    }))
    .sort((left, right) => right.wrong - left.wrong || left.accuracy - right.accuracy)
  return { nodeStats, weakNodes }
}

export function recommendPracticeQuestions(questions, attempts, limit = 6) {
  const { weakNodes } = summarizeKnowledgeAttempts(attempts)
  const weakIds = weakNodes.map(item => item.id)
  const scored = questions.map(question => {
    const knowledgeIds = getQuestionKnowledgeIds(question)
    const attempt = attempts?.[question.id]
    const weakHit = knowledgeIds.filter(id => weakIds.includes(id)).length
    const priority = (attempt?.result === 'wrong' ? 4 : 0) + weakHit * 3 + (attempt ? 0 : 1)
    return { question, knowledgeIds, priority }
  })
  return scored
    .filter(item => item.priority > 0)
    .sort((left, right) => right.priority - left.priority)
    .slice(0, limit)
}
