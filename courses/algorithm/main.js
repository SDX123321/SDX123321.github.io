// ==================== QUIZ DATA ====================
const quizzes = {
ch1: [
  {q:"算法的四大基本性质不包括以下哪项？", opts:["有限性","确定性","并行性","可行性"], ans:2, explain:"算法四大性质：有限性、确定性、可行性、输入/输出。并行性不是算法的基本性质。"},
  {q:"以下关于算法输入的说法正确的是？", opts:["算法必须有至少一个输入","算法可以没有输入(0个)","算法必须有多个输入","没有输入的不是算法"], ans:1, explain:"算法可以有0个或多个输入。例如计算常数的算法不需要输入。"},
  {q:"快速排序的算法复杂度通常用什么来分析？", opts:["最坏情况","最好情况","平均情况","空间复杂度"], ans:2, explain:"快速排序的特例：使用平均时间复杂度O(n log n)来分析，而非最坏情况O(n²)。"},
  {q:"本书中log n默认以什么为底？", opts:["10","e","2","任意"], ans:2, explain:"本书默认log n以2为底。与通信领域(常用10为底)不同。"},
  {q:"10·log₃ⁿ的渐进表达式是？", opts:["O(log n)","O(n)","O(n log n)","O(n²)"], ans:1, explain:"10·log₃ⁿ = 10·n·log₃，去掉常数得O(n)。"},
  {q:"O(n log n)与O(n)的复杂度关系是？", opts:["O(n log n)更低","相同","O(n log n)更高","无法比较"], ans:2, explain:"O(n log n)的增长速度快于O(n)，复杂度更高。"},
  {q:"f(n)=O(g(n))表示什么含义？", opts:["f的阶高于g","f的阶不高于g","f与g同阶","f的阶不低于g"], ans:1, explain:"O(低阶)表示f的阶不高于g，即存在C使得f(n)≤Cg(n)。"}
],
ch2: [
  {q:"递归函数的两要素是什么？", opts:["分解与合并","递归体与递归出口","输入与输出","参数与返回值"], ans:1, explain:"递归函数需要：递归体(递归调用部分)和递归出口(边界条件)。"},
  {q:"分治法的三个步骤依次是？", opts:["搜索、剪枝、输出","分解、递归求解、合并","初始化、迭代、终止","选择、交换、排序"], ans:1, explain:"分治法：分解问题→递归求解子问题→合并子问题的解。"},
  {q:"分治法的子问题具有什么特征？", opts:["重叠且不独立","独立且平衡","独立但不平衡","重叠且平衡"], ans:1, explain:"分治法要求子问题独立(无重叠)且平衡(规模大致相等)。"},
  {q:"快速排序的平均时间复杂度是？", opts:["O(n)","O(n log n)","O(n²)","O(log n)"], ans:1, explain:"快速排序平均O(n log n)，最坏O(n²)(已排序时)。"},
  {q:"归并排序与快速排序相比，哪个是稳定的？", opts:["快速排序","都稳定","归并排序","都不稳定"], ans:2, explain:"归并排序是稳定排序，快速排序是不稳定的。"},
  {q:"T(n)=2T(n/2)+n 的解是？", opts:["O(n)","O(n log n)","O(n²)","O(log n)"], ans:1, explain:"用主方法：a=2,b=2,f(n)=n, n^(log₂2)=n，情况2，T(n)=θ(n log n)。"},
  {q:"没有递归出口的递归函数会导致？", opts:["编译错误","栈溢出/死循环","正常运行","返回0"], ans:1, explain:"没有递归出口意味着无限递归，最终导致栈溢出。"},
  {q:"二分查找的时间复杂度是？", opts:["O(n)","O(log n)","O(n log n)","O(1)"], ans:1, explain:"二分查找每次排除一半元素，时间复杂度O(log n)。"}
],
ch3: [
  {q:"动态规划的两个核心性质是？", opts:["贪心选择+最优子结构","最优子结构+重叠子问题","独立子问题+平衡子问题","约束+限界"], ans:1, explain:"动态规划：最优子结构性质+重叠子问题性质。"},
  {q:"动态规划的求解方向是？", opts:["自顶向下","自底向上","随机","从左到右"], ans:1, explain:"标准动态规划是自底向上，从最小规模子问题开始求解。"},
  {q:"备忘录方法的求解方向是？", opts:["自底向上","自顶向下","随机","无所谓"], ans:1, explain:"备忘录方法是自顶向下的递归+缓存方式。两者复杂度相同。"},
  {q:"矩阵连乘满足什么运算律？", opts:["交换律","结合律","交换律+结合律","分配律"], ans:1, explain:"矩阵连乘满足结合律但不满足交换律，所以计算顺序影响计算量。"},
  {q:"状态转移方程与递归方程的关系是？", opts:["完全不同","概念类似但有区别","完全相同","互斥"], ans:1, explain:"状态转移方程和递归方程概念类似但有区别，是动态规划中的特定概念。"},
  {q:"斐波那契数列递归解的时间复杂度和DP解分别是？", opts:["O(n)和O(n)","O(2^n)和O(n)","O(n²)和O(n)","O(n!)和O(n)"], ans:1, explain:"直接递归O(2^n)(重叠子问题)，动态规划O(n)。"},
  {q:"LCS(最长公共子序列)不要求子序列？", opts:["有序","连续","非空","不同"], ans:1, explain:"子序列不要求连续，但要保持相对顺序。子串才要求连续。"},
  {q:"动态规划和分治法的关键区别是？", opts:["子问题是否独立","是否有递归","是否用数组","是否排序"], ans:0, explain:"分治法=独立子问题，动态规划=重叠子问题。这是关键区别。"}
],
ch4: [
  {q:"贪心算法与动态规划的相同点是？", opts:["都有贪心选择性质","都有最优子结构性质","都自底向上","都求所有解"], ans:1, explain:"两者都有最优子结构性质。区别：贪心有贪心选择性质，DP有重叠子问题。"},
  {q:"多段图最短路径问题能用贪心算法求解吗？", opts:["能","不能","有时能","视情况而定"], ans:1, explain:"多段图最短路径能用动态规划，但不能用贪心算法。这是复习课重点！"},
  {q:"哈夫曼编码是什么类型的压缩？", opts:["有损压缩","无损压缩","混合压缩","不压缩"], ans:1, explain:"哈夫曼编码是无损数据压缩(文本压缩)。图像视频才是有损压缩。"},
  {q:"前缀码的定义是什么？", opts:["所有编码等长","一个编码不是另一个的前缀","编码长度最短","使用二进制"], ans:1, explain:"前缀码：任何字符的代码都不是其他字符代码的前缀，避免解码歧义。"},
  {q:"Dijkstra算法每次从V-S中选择什么顶点加入S？", opts:["距离最远的","距离最近的","度数最大的","编号最小的"], ans:1, explain:"贪心选择：从V-S中选distance最小(距源点最近)的顶点加入S。"},
  {q:"Kruskal最小生成树算法的策略是？", opts:["每次选最近顶点","每次选最小边","每次选最大边","随机选边"], ans:1, explain:"Kruskal每次选全局最小的边(如果不成环就加入)。Prim是从顶点扩展。"},
  {q:"分数背包的贪心策略是？", opts:["选最轻的","选最贵的","选单位价值最大的","选体积最小的"], ans:2, explain:"分数背包按v/w(单位重量价值)降序排列，依次装入。"},
  {q:"用贪心算法求解不一定能得到最优解，但一般能？", opts:["得到最差解","得到精确解","接近最优解","无解"], ans:2, explain:"即使不满足贪心选择性质，贪心算法一般也能接近最优解。在分支限界中用于求下界。"}
],
ch5: [
  {q:"回溯法的搜索方式是？", opts:["BFS","DFS","随机搜索","贪心搜索"], ans:1, explain:"回溯法 = DFS + 剪枝，深度优先搜索解空间树。"},
  {q:"回溯法的目的是？", opts:["找最优解","找所有解","找一个解","排序"], ans:1, explain:"回溯法目的是找出所有满足条件的解。分支限界法才找最优解。"},
  {q:"0-1背包问题的解空间树是什么类型？", opts:["排列树","子集树","满m叉树","二叉搜索树"], ans:1, explain:"0-1背包每个物品选或不选，对应子集树(2^n个叶子节点)。"},
  {q:"旅行售货员问题(TSP)的解空间树是什么类型？", opts:["子集树","满m叉树","排列树","线性表"], ans:2, explain:"TSP是排列树(n!个叶子节点)，枚举城市的所有排列。"},
  {q:"约束函数剪枝去掉的是什么？", opts:["最优解","可行解","不可行解","所有解"], ans:2, explain:"约束函数去掉不满足约束条件的不可行解。限界函数去掉可行但非最优的解。"},
  {q:"回溯法的空间复杂度通常是？", opts:["O(2^n)","O(n!)","O(n)","O(n²)"], ans:2, explain:"空间复杂度为递归深度O(n)，这是回溯法的一个优势。"},
  {q:"子集树的时间复杂度(不剪枝)是？", opts:["O(n)","O(n²)","O(2^n)","O(n!)"], ans:2, explain:"子集树有2^n个叶子节点，总结点数O(2^n)。"},
  {q:"N皇后问题的约束条件是？", opts:["不同行","不同列","不同行+不同列+不同斜线","只是不同行"], ans:2, explain:"N皇后：任意两皇后不同行、不同列、不同对角线。|i-j|≠|x[i]-x[j]|。"}
],
ch6: [
  {q:"分支限界法的搜索方式是？", opts:["DFS","BFS","随机","贪心"], ans:1, explain:"分支限界法 = BFS + 剪枝，广度优先搜索。"},
  {q:"分支限界法的目的是？", opts:["找所有解","找最优解","找一个可行解","排序"], ans:1, explain:"分支限界法目的是找最优解(单个)，而回溯法找所有解。"},
  {q:"优先队列式分支限界法中，上界值越高表示？", opts:["越不值得扩展","越值得优先扩展","无所谓","已找到最优解"], ans:1, explain:"上界值越高，说明该分支越有可能产生最优解，应优先扩展。"},
  {q:"分支限界法扩展结点的方式是？", opts:["一次扩展一个孩子","一次扩展所有孩子","随机扩展","不扩展"], ans:1, explain:"分支限界法一次性产生当前扩展结点的所有孩子结点。"},
  {q:"队列式分支限界法使用什么数据结构？", opts:["栈","优先队列","普通队列","二叉树"], ans:2, explain:"队列式用普通队列(FIFO)，优先队列式用堆(按优先级)。"},
  {q:"分支限界法与回溯法最大的区别是？", opts:["剪枝方式","搜索方式(DFS vs BFS)","时间复杂度","空间复杂度"], ans:1, explain:"最核心区别是搜索方式：回溯法用DFS，分支限界用BFS。"}
],
ch7: [
  {q:"蒙特卡洛算法的特点是？", opts:["结果一定正确，时间不确定","大概率正确，可能出错","完全正确且时间确定","随机且无意义"], ans:1, explain:"蒙特卡洛：大概率正确，小概率出错(概率容错)，时间确定。"},
  {q:"拉斯维加斯算法的特点是？", opts:["大概率正确","完全正确，时间不确定","一定在O(n)内完成","可能返回错误结果"], ans:1, explain:"拉斯维加斯：结果完全正确，但运行时间不确定。"},
  {q:"以下哪个应用适合使用随机算法？", opts:["排序","图像去噪中的噪声模拟","查找","字符串匹配"], ans:1, explain:"图像处理中噪声是随机的，适合用随机算法模拟和处理。"},
  {q:"蒙特卡洛搜索(MCTS)的典型应用是？", opts:["排序","AlphaGo围棋AI","编译器","数据库"], ans:1, explain:"MCTS(蒙特卡洛树搜索)广泛用于博弈AI，如AlphaGo。"},
  {q:"复现随机实验的正确方法是？", opts:["改变算法","保存随机种子或噪声图，多组数据取平均","增加数据量","重新编译"], ans:1, explain:"保存噪声图像/使用相同随机种子，或用多组随机数据取平均值。"}
],
final: [
  {q:"[第1章] 算法的输入个数可以是？", opts:["必须1个","必须多个","0个或多个","不能为0"], ans:2, explain:"算法可以有0个或多个输入。"},
  {q:"[第2章] 分治法和动态规划的关键区别？", opts:["子问题是否独立","是否用递归","是否有最优解","是否用数组"], ans:0, explain:"分治=独立子问题，DP=重叠子问题。"},
  {q:"[第3章] 动态规划求解矩阵连乘的时间复杂度是？", opts:["O(n)","O(n²)","O(n³)","O(2^n)"], ans:2, explain:"矩阵连乘DP解法时间复杂度O(n³)。"},
  {q:"[第3章] DP与备忘录方法的算法复杂度？", opts:["DP更快","备忘录更快","相同","无法比较"], ans:2, explain:"虽然求解方向不同，但两者算法复杂度相同。"},
  {q:"[第4章] Dijkstra算法属于什么类型算法？", opts:["动态规划","分治","贪心","回溯"], ans:2, explain:"Dijkstra是贪心算法，每次选距源点最近的顶点。"},
  {q:"[第4章] 哈夫曼编码中，频率高的字符编码应该？", opts:["更长","更短","等长","随机"], ans:1, explain:"频率高的字符离根更近，编码更短(实现压缩)。"},
  {q:"[第5章] 回溯法解N皇后问题，解空间树是？", opts:["子集树","排列树","满n叉树","都可以"], ans:1, explain:"N皇后用排列树(每行选一列放置皇后)。"},
  {q:"[第5章] 限界函数剪掉的是？", opts:["不可行解","可行非最优解","最优解","所有解"], ans:1, explain:"限界函数剪去可行但不可能是最优解的分支。"},
  {q:"[第6章] 分支限界法使用什么数据结构？", opts:["栈","队列或优先队列","链表","哈希表"], ans:1, explain:"队列式用队列，优先队列式用堆。"},
  {q:"[第6章] 分支限界法找的是？", opts:["所有可行解","最优解","最大解","任意解"], ans:1, explain:"分支限界法目的：找出最优解。"},
  {q:"[第7章] 拉斯维加斯算法的缺点是？", opts:["结果可能错误","时间不确定","需要大量空间","无法并行"], ans:1, explain:"拉斯维加斯算法结果一定正确，但运行时间不确定。"},
  {q:"[综合] 0-1背包不能用什么算法求最优解？", opts:["动态规划","回溯法","贪心算法","分支限界法"], ans:2, explain:"0-1背包不能用贪心求最优(分数背包才能用贪心)。"},
  {q:"[综合] 以下哪个问题最适合用动态规划？", opts:["全排列","最长公共子序列","图着色","随机采样"], ans:1, explain:"LCS具有最优子结构和重叠子问题，最适合DP。"},
  {q:"[综合] 时间复杂度O(n!)对应什么解空间树？", opts:["子集树","排列树","满m叉树","平衡树"], ans:1, explain:"排列树叶子节点数=n!，如TSP问题。"},
  {q:"[综合] 哪种排序算法是分治法的典型应用且不稳定？", opts:["冒泡排序","归并排序","快速排序","插入排序"], ans:2, explain:"快速排序是分治法典型应用，不稳定。归并排序虽然也是分治但稳定。"}
]
};

// ==================== FLASHCARDS ====================
const flashcards = [
  {front:"算法四大性质", back:"有限性、确定性、可行性、输入(0个或多个)/输出(1个或多个)"},
  {front:"分治法三步骤", back:"分解 → 递归求解 → 合并\n子问题：独立 + 平衡"},
  {front:"动态规划两要素", back:"1. 最优子结构性质\n2. 重叠子问题性质\n求解方向：自底向上"},
  {front:"贪心算法两性质", back:"1. 贪心选择性质\n2. 最优子结构性质\n局部最优 → 全局最优"},
  {front:"回溯法 vs 分支限界", back:"回溯：DFS + 剪枝 → 所有解\n分支限界：BFS + 剪枝 → 最优解"},
  {front:"子集树 vs 排列树", back:"子集树：2^n 叶子(背包、子集)\n排列树：n! 叶子(TSP、N皇后)"},
  {front:"蒙特卡洛 vs 拉斯维加斯", back:"MC：大概率正确，时间确定\nLV：完全正确，时间不确定"},
  {front:"约束函数 vs 限界函数", back:"约束：去不可行解\n限界：去可行非最优解"},
  {front:"前缀码定义", back:"任何字符的代码都不是其他字符代码的前缀\n→ 保证解码唯一性"},
  {front:"Dijkstra核心思想", back:"贪心：每次从V-S选distance最小的顶点\n加入S集合，更新distance数组"},
  {front:"矩阵连乘关键", back:"满足结合律，不满足交换律\nDP: O(n³)\n状态：m[i][j] = A_i到A_j最少乘法次数"},
  {front:"LCS状态转移", back:"c[i][j] = \n  c[i-1][j-1]+1    若 x_i = y_j\n  max(c[i-1][j], c[i][j-1])  否则"},
  {front:"快速排序特点", back:"分治法、不稳定\n平均O(n log n)、最坏O(n²)\n用平均复杂度分析！"},
  {front:"哈夫曼树特点", back:"无度为1的节点\n权值越大离根越近 → 编码越短\n用于无损压缩"},
  {front:"DP vs 备忘录", back:"DP：自底向上，迭代填表\n备忘录：自顶向下，递归+缓存\n复杂度相同！"},
  {front:"0-1背包各方法", back:"DP: O(nW) | 回溯: O(2^n)\n分支限界: 指数级\n贪心：分数背包才能用！"},
  {front:"递归函数两要素", back:"1. 递归体(递归调用)\n2. 递归出口(边界条件)\n没有出口 = 死循环"},
  {front:"log n的底", back:"本书默认 log n 以 2 为底\n与通信领域(10为底)不同"},
  {front:"空间复杂度(递归)", back:"= 每层辅助空间 × 递归深度\n回溯法：O(n)"},
  {front:"优先队列分支限界", back:"用堆实现\n上界越高越优先扩展\n注意大根堆/小根堆的选择"}
];

// ==================== STATE ====================
let visited = JSON.parse(localStorage.getItem('algo_visited') || '{}');
let quizScores = JSON.parse(localStorage.getItem('algo_quiz') || '{}');

// ==================== RENDER ====================
function init() {
  renderQuizzes();
  renderFlashcards();
  updateProgress();
  setupNav();
  showSection('home');
  // Expand all cards except quiz cards
  document.querySelectorAll('.card').forEach(c => {
    if(!c.querySelector('.quiz-container')) c.classList.add('open');
  });
  document.querySelectorAll('.chapter').forEach(c => c.classList.add('open'));
}

function renderQuizzes() {
  document.querySelectorAll('.quiz-container').forEach(el => {
    const id = el.dataset.quiz;
    const qs = quizzes[id];
    if (!qs) return;
    let html = '';
    qs.forEach((q, i) => {
      html += `<div class="quiz-q" data-qi="${i}">
        <h4>${i+1}. ${q.q}</h4>
        <div class="opts">
          ${q.opts.map((o,j) => `<div class="quiz-opt" data-qi="${i}" data-oi="${j}" onclick="selectAnswer('${id}',${i},${j})">${String.fromCharCode(65+j)}. ${o}</div>`).join('')}
        </div>
        <div class="quiz-result" id="qr-${id}-${i}"></div>
      </div>`;
    });
    html += `<div style="margin-top:16px;text-align:center"><button class="btn btn-primary" onclick="scoreQuiz('${id}')">查看得分</button> <span id="score-${id}" style="margin-left:12px;font-weight:600"></span></div>`;
    el.innerHTML = html;
  });
}

function selectAnswer(qi, qIdx, oIdx) {
  const container = document.querySelector(`.quiz-container[data-quiz="${qi}"]`);
  const opts = container.querySelectorAll(`.quiz-opt[data-qi="${qIdx}"]`);
  const q = quizzes[qi][qIdx];
  opts.forEach(o => o.classList.remove('selected','correct','wrong','disabled'));
  opts[oIdx].classList.add('selected');
  if (oIdx === q.ans) {
    opts[oIdx].classList.add('correct');
  } else {
    opts[oIdx].classList.add('wrong');
    opts[q.ans].classList.add('correct');
  }
  opts.forEach(o => o.classList.add('disabled'));
  const res = document.getElementById(`qr-${qi}-${qIdx}`);
  res.textContent = oIdx === q.ans ? '✓ 正确！' : '✗ 错误。' + q.explain;
  res.className = 'quiz-result show ' + (oIdx === q.ans ? 'pass' : 'fail');
  quizScores[`${qi}-${qIdx}`] = oIdx === q.ans;
  localStorage.setItem('algo_quiz', JSON.stringify(quizScores));
}

function scoreQuiz(qi) {
  const qs = quizzes[qi];
  let correct = 0, total = qs.length;
  qs.forEach((q, i) => { if (quizScores[`${qi}-${i}`]) correct++; });
  document.getElementById(`score-${qi}`).textContent = `得分: ${correct}/${total} (${Math.round(correct/total*100)}%)`;
}

function renderFlashcards() {
  const grid = document.getElementById('flashcardGrid');
  if (!grid) return;
  grid.innerHTML = flashcards.map((fc, i) =>
    `<div class="flashcard" onclick="this.classList.toggle('flipped')">
      <div class="flashcard-inner">
        <div class="flashcard-front">${fc.front}</div>
        <div class="flashcard-back">${fc.back.replace(/\n/g,'<br>')}</div>
      </div>
    </div>`
  ).join('');
}

function setupNav() {
  document.querySelectorAll('#nav a').forEach(a => {
    a.addEventListener('click', e => {
      e.preventDefault();
      const sec = a.getAttribute('href').substring(1);
      showSection(sec);
      document.querySelectorAll('#nav a').forEach(n => n.classList.remove('active'));
      a.classList.add('active');
      document.getElementById('sidebar').classList.remove('open');
    });
  });
}

function showSection(id) {
  document.querySelectorAll('.chapter-section').forEach(s => s.classList.add('hidden'));
  const sec = document.getElementById(id);
  if (sec) {
    sec.classList.remove('hidden');
    const ch = sec.querySelector('.chapter');
    if (ch) ch.classList.add('open');
    // Expand all cards except quiz cards
    sec.querySelectorAll('.card').forEach(c => {
      if(!c.querySelector('.quiz-container')) c.classList.add('open');
    });
    visited[id] = true;
    localStorage.setItem('algo_visited', JSON.stringify(visited));
    updateProgress();
    // Scroll to section after a brief delay for DOM update
    setTimeout(() => {
      const topBar = document.querySelector('.top-bar');
      const offset = topBar ? topBar.offsetHeight + 16 : 16;
      const rect = sec.getBoundingClientRect();
      window.scrollBy(0, rect.top - offset);
    }, 50);
  }
}

function toggleChapter(header) {
  header.closest('.chapter').classList.toggle('open');
}

function toggleCard(header) {
  header.closest('.card').classList.toggle('open');
}

function toggleAllChapters() {
  const chapters = document.querySelectorAll('.chapter');
  const anyOpen = [...chapters].some(c => c.classList.contains('open'));
  chapters.forEach(c => c.classList.toggle('open', !anyOpen));
}

function updateProgress() {
  const total = 10; // sections
  const done = Object.keys(visited).length;
  const pct = Math.round(done / total * 100);
  document.getElementById('progressPct').textContent = pct + '%';
  document.getElementById('progressBar').style.width = pct + '%';
}

function resetProgress() {
  if (confirm('确定要重置所有学习进度和测验记录吗？')) {
    visited = {};
    quizScores = {};
    localStorage.removeItem('algo_visited');
    localStorage.removeItem('algo_quiz');
    updateProgress();
    document.querySelectorAll('.quiz-result').forEach(r => r.className = 'quiz-result');
    document.querySelectorAll('.quiz-opt').forEach(o => o.classList.remove('selected','correct','wrong','disabled'));
    document.querySelectorAll('[id^="score-"]').forEach(s => s.textContent = '');
    document.querySelectorAll('.flashcard').forEach(f => f.classList.remove('flipped'));
  }
}

// Keyboard shortcuts
document.addEventListener('keydown', e => {
  if (e.key === 'Escape') document.getElementById('sidebar').classList.remove('open');
});

init();

// Theme toggle
function applyTheme(dark){
  document.body.classList.toggle('dark',dark);
  document.getElementById('themeBtn').innerHTML=dark?'&#9789;':'&#9790;';
  localStorage.setItem('theme',dark?'dark':'light');
}
function toggleTheme(){applyTheme(!document.body.classList.contains('dark'));}
(function(){
  var t=localStorage.getItem('theme');
  if(t==='dark') applyTheme(true);
  else applyTheme(false);
})();

if(!localStorage.getItem('sg_done_algo')) document.getElementById('subGuide').style.display='flex';

// KaTeX auto-render
function renderKatex(){
  if(typeof renderMathInElement==='function'){
    renderMathInElement(document.body,{delimiters:[{left:'\\(',right:'\\)',display:false},{left:'\\[',right:'\\]',display:true},{left:'$$',right:'$$',display:true}],throwOnError:false});
  }
}
document.addEventListener('DOMContentLoaded',renderKatex);
window.addEventListener('load',renderKatex);
