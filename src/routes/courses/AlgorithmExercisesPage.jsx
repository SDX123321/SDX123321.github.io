import { useEffect } from 'react'
import { Link } from 'react-router-dom'
import '../../styles/courses/algorithm-exercises.css'

const SECTIONS = [
  { id: 'dijkstra', title: '一、Dijkstra 最短路径', icon: '🔗' },
  { id: 'knapsack', title: '二、0-1 背包（分支限界法）', icon: '🎒' },
  { id: 'binary', title: '三、二分查找', icon: '🔍' },
  { id: 'matrix1', title: '四、矩阵连乘（A·B·C）', icon: '✖️' },
  { id: 'matrix2', title: '五、矩阵连乘（M1·M2·M3·M4）', icon: '✖️' },
  { id: 'mergesort', title: '六、合并排序复杂度证明', icon: '📊' },
  { id: 'huffman', title: '七、哈夫曼编码', icon: '🌳' },
]

function DijkstraTable({ data }) {
  return (
    <div className="algo-ex-table-wrap">
      <table className="algo-ex-table">
        <thead>
          <tr><th>步骤</th><th>选入 S</th><th>d[0]</th><th>d[1]</th><th>d[2]</th><th>d[3]</th><th>d[4]</th></tr>
        </thead>
        <tbody>
          {data.map((r, i) => <tr key={i}>{r.map((c, j) => <td key={j}>{c}</td>)}</tr>)}
        </tbody>
      </table>
    </div>
  )
}

function ResultBox({ children }) {
  return <div className="algo-ex-result">{children}</div>
}

function CodeBlock({ children }) {
  return <pre className="algo-ex-code">{children}</pre>
}

function KV({ items }) {
  return (
    <div className="algo-ex-kv">
      {items.map((it, i) => (
        <div className="algo-ex-kv-row" key={i}>
          <span className="algo-ex-kv-k">{it[0]}</span>
          <span className="algo-ex-kv-v">{it[1]}</span>
        </div>
      ))}
    </div>
  )
}

export default function AlgorithmExercisesPage() {
  useEffect(() => {
    document.title = '算法习题解答 - 期末复习'
    // Render KaTeX if available
    if (window.renderMathInElement) {
      window.renderMathInElement(document.querySelector('.algo-exercises-page'), {
        delimiters: [
          { left: '$$', right: '$$', display: true },
          { left: '$', right: '$', display: false },
        ],
      })
    }
  }, [])

  return (
    <div className="algo-exercises-page">
      {/* Nav bar */}
      <div className="algo-ex-nav">
        <Link to="/courses/algorithm/" className="algo-ex-back">← 返回算法笔记</Link>
        <Link to="/" className="algo-ex-back">← 返回首页</Link>
      </div>

      <div className="algo-ex-container">
        <header className="algo-ex-header">
          <h1>算法设计与分析 · 习题解答</h1>
          <p className="algo-ex-subtitle">作业讲解 + 习题课完整解答（共 7 题）</p>
        </header>

        {/* Table of contents */}
        <nav className="algo-ex-toc">
          <div className="algo-ex-toc-title">题目导航</div>
          <div className="algo-ex-toc-list">
            {SECTIONS.map(s => (
              <a key={s.id} href={`#${s.id}`} className="algo-ex-toc-item">
                <span className="algo-ex-toc-icon">{s.icon}</span>
                <span>{s.title}</span>
              </a>
            ))}
          </div>
        </nav>

        {/* ==================== 1. Dijkstra ==================== */}
        <section id="dijkstra" className="algo-ex-section">
          <h2><span className="algo-ex-num">一</span>Dijkstra 最短路径</h2>

          <div className="algo-ex-img">
            <img src="https://pub-0e031b3dd57041d0928acde612f1d662.r2.dev/images/algorithm-exercises/ex1.png" alt="Dijkstra 题目" />
          </div>

          <div className="algo-ex-problem">
            <strong>题目：</strong>已知有 5 个顶点（编号 0~4）的无向带权图，邻接关系如下。请用 Dijkstra 算法求从顶点 0 到其余所有顶点的最短路径长度。

        ```
        <div className="algo-ex-matrix">
          <div className="algo-ex-matrix-title">边及权值</div>
          <div className="algo-ex-matrix-grid">
            <KV items={[
              ['0→1:', '5'], ['0→3:', '3'],
              ['1→2:', '3'], ['1→4:', '4'],
              ['2→3:', '8'], ['2→4:', '1'],
              ['3→4:', '7']
            ]} />
          </div>
        </div>
        ```

          </div>

          <h3>1. 无向带权图</h3>
          <div className="ex1">
            <img src="https://pub-0e031b3dd57041d0928acde612f1d662.r2.dev/images/algorithm-exercises/ex1.1.png" alt="无向带权图" />
          </div>

          <h3>2. Dijkstra 逐步求解表</h3>
          <DijkstraTable data={[
            ['初始', '—', '0', '5', '∞', '3', '∞'],
            ['①', '0', '0', '5', '∞', '3', '∞'],
            ['②', '3', '0', '5', '11', '3', '10'],
            ['③', '1', '0', '5', '8', '3', '9'],
            ['④', '2', '0', '5', '8', '3', '9'],
            ['⑤', '4', '0', '5', '8', '3', '9'],
          ]} />

          <div className="algo-ex-steps">
            <p><strong>步骤详解：</strong></p>
            <ol>
              <li><strong>初始化：</strong>d[0]=0, d[1]=5, d[2]=∞, d[3]=3, d[4]=∞。S=∅</li>

        ```
          <li><strong>①</strong> 选取 0（最小）：S={'{'}0{'}'}。更新：
            d[1]=5，d[3]=3（保持不变）
          </li>

          <li><strong>②</strong> 选取 3（d=3）：S={'{'}0,3{'}'}。更新：
            d[2]=3+8=11，
            d[4]=3+7=10
          </li>

          <li><strong>③</strong> 选取 1（d=5）：S={'{'}0,3,1{'}'}。更新：
            d[2]=min(11,5+3)=8，
            d[4]=min(10,5+4)=9
          </li>

          <li><strong>④</strong> 选取 2（d=8）：S={'{'}0,3,1,2{'}'}。更新：
            d[4]=min(9,8+1)=9（不变）
          </li>

          <li><strong>⑤</strong> 选取 4（d=9）：S={'{'}0,3,1,2,4{'}'}。算法结束</li>
        </ol>
        ```

          </div>

          <h3>3. 最终最短路径长度</h3>
          <div className="algo-ex-table-wrap">
            <table className="algo-ex-table algo-ex-table-result">
              <thead>
                <tr>
                  <th>起点</th><th>终点</th><th>最短路径长度</th><th>路径</th>
                </tr>
              </thead>
              <tbody>
                <tr><td>0</td><td>0</td><td>0</td><td>0</td></tr>
                <tr><td>0</td><td>1</td><td>5</td><td>0 → 1</td></tr>
                <tr><td>0</td><td>2</td><td>8</td><td>0 → 1 → 2</td></tr>
                <tr><td>0</td><td>3</td><td>3</td><td>0 → 3</td></tr>
                <tr><td>0</td><td>4</td><td>9</td><td>0 → 1 → 4</td></tr>
              </tbody>
            </table>
          </div>

          <ResultBox>
            顶点 0 到 0,1,2,3,4 的最短路径长度分别为：0, 5, 8, 3, 9
          </ResultBox>
        </section>


        {/* ==================== 2. 0-1 Knapsack ==================== */}
        <section id="knapsack" className="algo-ex-section">
          <h2><span className="algo-ex-num">二</span>0-1 背包（分支限界法）</h2>
          <div className="algo-ex-img">
            <img src="https://pub-0e031b3dd57041d0928acde612f1d662.r2.dev/images/algorithm-exercises/problem_slide4.png" alt="0-1 背包题目" />
          </div>
          <div className="algo-ex-problem">
            <strong>题目：</strong>物品数量 n=3，背包容量 C=6，重量 W={2,3,5}，价值 V={6,3,10}。
            <ol>
              <li>确定合理上界，并用贪心算法求下界；</li>
              <li>采用优先队列式分支限界法剪枝，求最优值及最优解。</li>
            </ol>
          </div>

          <h3>（1）贪心求下界 & 上界计算</h3>
          <p>按单位重量价值降序排列：</p>
          <div className="algo-ex-table-wrap">
            <table className="algo-ex-table">
              <thead>
                <tr><th>物品</th><th>重量 w</th><th>价值 v</th><th>单位价值 v/w</th></tr>
              </thead>
              <tbody>
                <tr><td>1</td><td>2</td><td>6</td><td>3.0</td></tr>
                <tr><td>3</td><td>5</td><td>10</td><td>2.0</td></tr>
                <tr><td>2</td><td>3</td><td>3</td><td>1.0</td></tr>
              </tbody>
            </table>
          </div>
          <p><strong>贪心下界：</strong>依次装入物品 1（w=2, v=6），物品 3（w=5, 总 w=2+5=7 &gt; 6，无法装入），改试物品 2（w=3, 总 w=2+3=5 ≤ 6, v=3）。下界 = 6+3 = <strong>9</strong>，对应解 (1,1,0)。</p>
          <p><strong>上界函数：</strong>UB = 已选价值 + (剩余容量 × 剩余物品中最高单位价值)。初始根节点 UB = 0 + 6×3.0 = <strong>18</strong>。</p>

          <h3>（2）优先队列式分支限界法搜索过程</h3>
          <div className="algo-ex-steps">
            <p>优先队列按 UB 降序排列；最优值初始为下界 9；扩展顺序：</p>

            <p><strong>第一层：扩展根节点</strong></p>
            <ul>
              <li><strong>左子（选物品1）：</strong>w=2, v=6。UB = 6 + 4×2.0 = 14。入队。</li>
              <li><strong>右子（不选物品1）：</strong>w=0, v=0。UB = 0 + 6×2.0 = 12。入队。</li>
            </ul>

            <p><strong>第二层：扩展节点 [选1, UB=14]</strong></p>
            <ul>
              <li><strong>左子（选1+选3）：</strong>w=2+5=7 &gt; 6 → <strong>剪枝（不可行）</strong></li>
              <li><strong>右子（选1+不选3）：</strong>w=2, v=6。UB = 6 + 4×1.0 = 10。入队。</li>
            </ul>

            <p><strong>第三层：扩展节点 [不选1, UB=12]</strong></p>
            <ul>
              <li><strong>左子（不选1+选3）：</strong>w=5, v=10。UB = 10 + 1×1.0 = 11。入队。此时更新最优值 = <strong>10</strong>（可行解）。</li>
              <li><strong>右子（不选1+不选3）：</strong>w=0, v=0。UB = 0 + 6×1.0 = 6。UB=6 &lt; 最优值=10 → <strong>剪枝</strong></li>
            </ul>

            <p><strong>第四层：扩展节点 [选1+不选3, UB=10]</strong></p>
            <ul>
              <li><strong>左子（选1+不选3+选2）：</strong>w=2+3=5, v=6+3=9。叶子节点，更新最优值 = max(10,9) = 10。</li>
              <li><strong>右子（选1+不选3+不选2）：</strong>w=2, v=6。叶子节点，v=6 &lt; 10，不更新。</li>
            </ul>

            <p><strong>第五层：扩展节点 [不选1+选3, UB=11]</strong></p>
            <ul>
              <li><strong>左子（不选1+选3+选2）：</strong>w=5+3=8 &gt; 6 → <strong>剪枝（不可行）</strong></li>
              <li><strong>右子（不选1+选3+不选2）：</strong>w=5, v=10。叶子节点，v=10（不更新，已有最优值=10）。</li>
            </ul>
            <p>优先队列为空（其余节点 UB ≤ 10），算法结束。</p>
          </div>

          <h3>搜索树示意</h3>
          <CodeBlock>{`
                  根 (w=0, v=0, UB=18)
                 /                      \\
        选1 (2,6,14)                不选1 (0,0,12)
        /          \\                /           \\
    选3 剪枝   不选3(2,6,10)   选3(5,10,11)  不选3 剪枝
    (w=7>6)    /       \\       /        \\
          选2(5,9)  不选2   选2 剪枝  不选2(5,10)
           叶子    (2,6)   (w=8>6)    叶子
`}</CodeBlock>

          <ResultBox>
            <strong>最优值：</strong>10 &nbsp; | &nbsp; <strong>最优解：</strong>(0, 0, 1) — 只装入物品 3（w=5, v=10）
          </ResultBox>
        </section>

        {/* ==================== 3. Binary Search ==================== */}
        <section id="binary" className="algo-ex-section">
          <h2><span className="algo-ex-num">三</span>二分查找</h2>
          <div className="algo-ex-img">
            <img src="https://pub-0e031b3dd57041d0928acde612f1d662.r2.dev/images/algorithm-exercises/problem_slide6.png" alt="二分查找题目" />
          </div>
          <div className="algo-ex-problem">
            <strong>题目：</strong>在有序数组 [2, 5, 8, 12, 16, 23, 38, 56, 72, 91] 中，使用二分查找查找元素 23。写出每一步的左边界、右边界、中间位置索引及对应元素值。
          </div>

          <div className="algo-ex-array">
            <div className="algo-ex-array-header">
              {['i=0','i=1','i=2','i=3','i=4','i=5','i=6','i=7','i=8','i=9'].map((h,i) => <span key={i}>{h}</span>)}
            </div>
            <div className="algo-ex-array-body">
              {[2,5,8,12,16,23,38,56,72,91].map((v,i) => (
                <span key={i} className={v === 23 ? 'algo-ex-highlight' : ''}>{v}</span>
              ))}
            </div>
          </div>

          <div className="algo-ex-table-wrap">
            <table className="algo-ex-table">
              <thead>
                <tr><th>查找次数</th><th>left</th><th>right</th><th>mid 索引</th><th>A[mid]</th><th>比较</th></tr>
              </thead>
              <tbody>
                <tr>
                  <td>1</td><td>0</td><td>9</td><td>4</td><td>16</td>
                  <td>16 &lt; 23 → left = mid + 1 = 5</td>
                </tr>
                <tr>
                  <td>2</td><td>5</td><td>9</td><td>7</td><td>56</td>
                  <td>56 &gt; 23 → right = mid - 1 = 6</td>
                </tr>
                <tr className="algo-ex-found">
                  <td>3</td><td>5</td><td>6</td><td>5</td><td>23</td>
                  <td>23 = 23 → <strong>找到！</strong>返回索引 5</td>
                </tr>
              </tbody>
            </table>
          </div>
          <ResultBox>共比较 3 次，在索引 5 处找到目标元素 23。</ResultBox>
        </section>

        {/* ==================== 4. Matrix Chain 1 ==================== */}
        <section id="matrix1" className="algo-ex-section">
          <h2><span className="algo-ex-num">四</span>矩阵连乘 A×B×C</h2>
          <div className="algo-ex-img">
            <img src="https://pub-0e031b3dd57041d0928acde612f1d662.r2.dev/images/algorithm-exercises/problem_slide8.png" alt="矩阵连乘 A×B×C 题目" />
          </div>
          <div className="algo-ex-problem">
            <strong>题目：</strong>A(2×3), B(3×4), C(4×5)。用动态规划求最少乘法次数及最优计算顺序。
          </div>

          <p><strong>维度序列：</strong>p = [2, 3, 4, 5]（p₀=2, p₁=3, p₂=4, p₃=5）</p>

          <div className="algo-ex-steps">
            <p><strong>情况 1：(A×B)×C</strong></p>
            <ul><li>A×B：2×3×4 = 24 次乘法，结果 2×4</li><li>再 ×C：2×4×5 = 40 次</li><li>合计：24 + 40 = <strong>64</strong></li></ul>

            <p><strong>情况 2：A×(B×C)</strong></p>
            <ul><li>B×C：3×4×5 = 60 次乘法，结果 3×5</li><li>A×(结果)：2×3×5 = 30 次</li><li>合计：60 + 30 = <strong>90</strong></li></ul>
          </div>

          <div className="algo-ex-table-wrap">
            <table className="algo-ex-table">
              <thead>
                <tr><th>计算顺序</th><th>第一步</th><th>第二步</th><th>总次数</th></tr>
              </thead>
              <tbody>
                <tr className="algo-ex-found"><td>(A×B)×C</td><td>2×3×4=24</td><td>2×4×5=40</td><td><strong>64</strong></td></tr>
                <tr><td>A×(B×C)</td><td>3×4×5=60</td><td>2×3×5=30</td><td>90</td></tr>
              </tbody>
            </table>
          </div>

          <ResultBox>最少乘法次数：<strong>64</strong>。最优计算顺序：<strong>(A×B)×C</strong></ResultBox>
        </section>

        {/* ==================== 5. Matrix Chain 2 ==================== */}
        <section id="matrix2" className="algo-ex-section">
          <h2><span className="algo-ex-num">五</span>矩阵连乘 M1×M2×M3×M4</h2>
          <div className="algo-ex-img">
            <img src="https://pub-0e031b3dd57041d0928acde612f1d662.r2.dev/images/algorithm-exercises/problem_slide9.png" alt="矩阵连乘 M1~M4 题目" />
          </div>
          <div className="algo-ex-problem">
            <strong>题目：</strong>M1(3×5), M2(5×2), M3(2×7), M4(7×4)。用动态规划求最少乘法次数。
          </div>

          <p><strong>维度序列：</strong>p = [3, 5, 2, 7, 4]</p>

          <div className="algo-ex-steps">
            <p><strong>DP 填表过程：</strong>定义 m[i][j] 为 M_i × ... × M_j 的最少乘法次数。</p>

            <p><strong>对角线 1（单个矩阵）：</strong>m[i][i] = 0</p>
            <p><strong>对角线 2（两个矩阵）：</strong></p>
            <ul>
              <li>m[1][2] = 3×5×2 = 30</li>
              <li>m[2][3] = 5×2×7 = 70</li>
              <li>m[3][4] = 2×7×4 = 56</li>
            </ul>

            <p><strong>对角线 3（三个矩阵）：</strong></p>
            <ul>
              <li>m[1][3] = min(m[1][1]+m[2][3]+p₀p₁p₃, m[1][2]+m[3][3]+p₀p₂p₃) = min(0+70+105, 30+0+84) = <strong>114</strong>（k=2）</li>
              <li>m[2][4] = min(m[2][2]+m[3][4]+p₁p₂p₄, m[2][3]+m[4][4]+p₁p₃p₄) = min(0+56+40, 70+0+100) = <strong>96</strong>（k=2）</li>
            </ul>

            <p><strong>对角线 4（四个矩阵）：</strong></p>
            <ul>
              <li>k=1: m[1][1]+m[2][4]+p₀p₁p₄ = 0+96+60 = 156</li>
              <li>k=2: m[1][2]+m[3][4]+p₀p₂p₄ = 30+56+84 = <strong>170</strong></li>
              <li>k=3: m[1][3]+m[4][4]+p₀p₃p₄ = 114+0+84 = <strong>198</strong></li>
            </ul>
            <p>m[1][4] = min(156, 170, 198) = <strong>156</strong>（k=1）</p>
          </div>

          <div className="algo-ex-table-wrap">
            <table className="algo-ex-table algo-ex-table-result">
              <thead>
                <tr><th>m[i][j]</th><th>1</th><th>2</th><th>3</th><th>4</th></tr>
              </thead>
              <tbody>
                <tr><td><strong>1</strong></td><td>0</td><td>30</td><td>114</td><td>156</td></tr>
                <tr><td><strong>2</strong></td><td></td><td>0</td><td>70</td><td>96</td></tr>
                <tr><td><strong>3</strong></td><td></td><td></td><td>0</td><td>56</td></tr>
                <tr><td><strong>4</strong></td><td></td><td></td><td></td><td>0</td></tr>
              </tbody>
            </table>
          </div>

          <h3>最优括号化方案回溯</h3>
          <p>由 s[1][4]=1 知从 k=1 分割：((M1×M2)×M3)×M4</p>
          <div className="algo-ex-table-wrap">
            <table className="algo-ex-table">
              <thead>
                <tr><th>步骤</th><th>运算</th><th>乘法次数</th></tr>
              </thead>
              <tbody>
                <tr><td>1</td><td>M1×M2 → 结果(3×2)</td><td>3×5×2 = 30</td></tr>
                <tr><td>2</td><td>(M1×M2)×M3 → 结果(3×7)</td><td>3×2×7 = 42</td></tr>
                <tr><td>3</td><td>((M1×M2)×M3)×M4 → 结果(3×4)</td><td>3×7×4 = 84</td></tr>
              </tbody>
            </table>
          </div>

          <ResultBox>
            最少乘法次数：<strong>156</strong>。最优计算顺序：<strong>((M1×M2)×M3)×M4</strong>（从左到右依次相乘）
          </ResultBox>
        </section>

        {/* ==================== 6. Merge Sort ==================== */}
        <section id="mergesort" className="algo-ex-section">
          <h2><span className="algo-ex-num">六</span>合并排序时间复杂度证明</h2>
          <div className="algo-ex-img">
            <img src="https://pub-0e031b3dd57041d0928acde612f1d662.r2.dev/images/algorithm-exercises/problem_slide11.png" alt="合并排序题目" />
          </div>
          <div className="algo-ex-problem">
            <strong>题目：</strong>合并排序中合并与复制操作的时间复杂度为 O(n)，给出递推公式并证明 T(n) = O(n log n)。
          </div>

          <h3>递推公式</h3>
          <details className="algo-ex-original-img">
            <summary>📷 查看 PPT 原图 · 递归树</summary>
            <img src="https://pub-0e031b3dd57041d0928acde612f1d662.r2.dev/images/algorithm-exercises/image6.png" alt="合并排序递归树 PPT 原图" />
          </details>
          <div className="algo-ex-formula">
            {`$$T(n) = \\begin{cases} O(1) & n = 1 \\\\ 2T\\left(\\frac{n}{2}\\right) + O(n) & n > 1 \\end{cases}$$`}
          </div>

          <h3>证明（递归树法）</h3>
          <div className="algo-ex-steps">
            <p>将递推展开为递归树：</p>
            <ul>
              <li><strong>第 0 层（根）：</strong>问题规模 n，工作量 cn</li>
              <li><strong>第 1 层：</strong>2 个子问题，每个规模 n/2，总工作量 2·c(n/2) = cn</li>
              <li><strong>第 2 层：</strong>4 个子问题，每个规模 n/4，总工作量 4·c(n/4) = cn</li>
              <li><strong>第 k 层：</strong>2^k 个子问题，每个规模 n/2^k，总工作量 = cn</li>
            </ul>
            <p>递归在 n/2^k = 1 即 k = log₂n 时终止，共 log₂n + 1 层。</p>
          </div>

          <CodeBlock>{`
第0层:              cn                  ← 总工作量 cn
                 /       \\
第1层:         cn/2       cn/2          ← 总工作量 cn
             /   \\       /   \\
第2层:     cn/4 cn/4 cn/4 cn/4          ← 总工作量 cn
           ...   ...  ...   ...
第log₂n层:  c   c    c ... c  c          ← 总工作量 cn
`}</CodeBlock>

          <div className="algo-ex-formula">
            {`$$T(n) = \\sum_{k=0}^{\\log_2 n} cn = cn \\cdot (\\log_2 n + 1) = O(n \\log n)$$`}
          </div>

          <h3>证明（数学归纳法）</h3>
          <div className="algo-ex-steps">
            <p><strong>命题：</strong>当 n 为 2 的幂时，T(n) ≤ cn log₂n（c 为常数）。</p>
            <p><strong>基础：</strong>T(1) = 1 ≤ c·1·log₂1 = 0？不对，改用 T(n) ≤ cn log₂n + n。</p>
            <p><strong>归纳假设：</strong>假设 T(n/2) ≤ c(n/2) log₂(n/2)。</p>
            <p><strong>归纳步骤：</strong></p>
            <CodeBlock>{`
T(n) = 2T(n/2) + n
     ≤ 2 · [c(n/2) log₂(n/2)] + n
     = cn·log₂(n/2) + n
     = cn·(log₂n - 1) + n
     = cn·log₂n - cn + n
     = cn·log₂n - (c-1)n
     ≤ cn·log₂n      （当 c ≥ 1 时）
`}</CodeBlock>
          </div>

          <ResultBox>证毕：T(n) = 2T(n/2) + O(n) 的解为 T(n) = O(n log n)。</ResultBox>
        </section>

        {/* ==================== 7. Huffman ==================== */}
        <section id="huffman" className="algo-ex-section">
          <h2><span className="algo-ex-num">七</span>哈夫曼编码</h2>
          <div className="algo-ex-img">
            <img src="https://pub-0e031b3dd57041d0928acde612f1d662.r2.dev/images/algorithm-exercises/problem_slide15.png" alt="哈夫曼编码题目" />
          </div>
          <div className="algo-ex-problem">
            <strong>题目：</strong>字符 a~d 的频度分别为 8, 1, 4, 6。
            <ol>
              <li>构造哈夫曼编码树，求平均码长；</li>
              <li>对 "aabcbd" 编码；</li>
              <li>对 "10010011000" 解码。</li>
            </ol>
          </div>

          <h3>（1）构造哈夫曼树</h3>
          <div className="algo-ex-steps">
            <p><strong>步骤：</strong>每次合并频度最小的两个结点。</p>
            <ol>
              <li>初始：a=8, b=1, c=4, d=6</li>
              <li>合并 b(1) + c(4) → bc(5)。剩余：a=8, d=6, bc=5</li>
              <li>合并 bc(5) + d(6) → bcd(11)。剩余：a=8, bcd=11</li>
              <li>合并 a(8) + bcd(11) → 根(19)</li>
            </ol>
          </div>

          <CodeBlock>{`
           [19]
          /    \\
       a:8    [11]
             /    \\
          [5]     d:6
         /    \\
       b:1   c:4
`}</CodeBlock>

          <details className="algo-ex-original-img">
            <summary>📷 查看 PPT 原图 · 哈夫曼树</summary>
            <img src="https://pub-0e031b3dd57041d0928acde612f1d662.r2.dev/images/algorithm-exercises/image5.png" alt="哈夫曼树 PPT 原图" />
          </details>

          <p><strong>编码表：</strong></p>
          <div className="algo-ex-table-wrap">
            <table className="algo-ex-table">
              <thead>
                <tr><th>字符</th><th>频度</th><th>编码</th><th>码长</th></tr>
              </thead>
              <tbody>
                <tr><td>a</td><td>8</td><td>0</td><td>1</td></tr>
                <tr><td>b</td><td>1</td><td>100</td><td>3</td></tr>
                <tr><td>c</td><td>4</td><td>101</td><td>3</td></tr>
                <tr><td>d</td><td>6</td><td>11</td><td>2</td></tr>
              </tbody>
            </table>
          </div>

          <div className="algo-ex-formula">
            {`平均码长 = $\\frac{1 \\times 8 + 3 \\times 1 + 3 \\times 4 + 2 \\times 6}{8+1+4+6} = \\frac{8+3+12+12}{19} = \\frac{35}{19} \\approx 1.84$`}
          </div>

          <h3>（2）"aabcbd" 编码</h3>
          <div className="algo-ex-encode">
            <div className="algo-ex-encode-chain">
              <span className="algo-ex-ch">a→0</span>
              <span className="algo-ex-ch">a→0</span>
              <span className="algo-ex-ch">b→100</span>
              <span className="algo-ex-ch">c→101</span>
              <span className="algo-ex-ch">b→100</span>
              <span className="algo-ex-ch">d→11</span>
            </div>
          </div>
          <ResultBox>编码结果：<code>0010010110011</code>（共 15 位）</ResultBox>

          <h3>（3）"10010011000" 解码</h3>
          <div className="algo-ex-encode">
            <div className="algo-ex-encode-chain">
              <span className="algo-ex-ch">100→b</span>
              <span className="algo-ex-ch">100→b</span>
              <span className="algo-ex-ch">11→d</span>
              <span className="algo-ex-ch">100→b</span>
              <span className="algo-ex-ch">0→a</span>
              <span className="algo-ex-ch">0→a</span>
            </div>
          </div>
          <ResultBox>解码结果：<code>bbdbaa</code></ResultBox>
        </section>

        {/* Footer */}
        <footer className="algo-ex-footer">
          <Link to="/courses/algorithm/" className="algo-ex-footer-link">← 返回「算法设计与分析」笔记</Link>
          <Link to="/" className="algo-ex-footer-link">← 返回首页</Link>
        </footer>
      </div>
    </div>
  )
}
