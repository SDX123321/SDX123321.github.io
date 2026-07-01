import { useEffect, useRef } from 'react'
import { Link } from 'react-router-dom'
import '../../styles/courses/dmath-review.css'
import { loadMathJax } from '../../lib/cdnScripts'

const LB = '{'
const RB = '}'

const m = (s) => s.replace(/\{/g, LB).replace(/\}/g, RB)

const CHAPTERS = [
  { key: 'ch1', label: '第1章 命题逻辑', items: [
    { id: 's1-1', label: '命题与联结词' },
    { id: 's1-2', label: '命题公式与分类' },
    { id: 's1-3', label: '等值演算' },
    { id: 's1-4', label: '范式与主范式' },
    { id: 's1-7', label: '推理理论' },
  ]},
  { key: 'ch2', label: '第2章 一阶逻辑', items: [
    { id: 's2-1', label: '基本概念（个体词/谓词/量词）' },
    { id: 's2-2', label: '合式公式与解释' },
    { id: 's2-3', label: '等值式与前束范式' },
  ]},
  { key: 'ch3', label: '第3章 集合论', items: [
    { id: 's3-1', label: '集合基本概念与运算' },
    { id: 's3-2', label: '集合恒等式与证明' },
    { id: 's3-3', label: '包含排斥原理' },
  ]},
  { key: 'ch4', label: '第4章 二元关系与函数', items: [
    { id: 's4-1', label: '笛卡尔积与关系' },
    { id: 's4-2', label: '关系的运算' },
    { id: 's4-3', label: '关系的性质' },
    { id: 's4-4', label: '关系的闭包' },
    { id: 's4-5', label: '等价关系与偏序关系' },
    { id: 's4-6', label: '函数' },
  ]},
]

/* ── Helpers ── */
function Section({ id, title, children }) {
  return (
    <div className="dm-section" id={id}>
      <h2 className="dm-section-title">{title}</h2>
      <div className="dm-section-body">{children}</div>
    </div>
  )
}

function DefBox({ label, children }) {
  return (
    <div className="dm-def">
      <div className="dm-def-label">{label}</div>
      <div className="dm-def-body">{children}</div>
    </div>
  )
}

function Theorem({ label, children }) {
  return (
    <div className="dm-theorem">
      <strong>{label}</strong> {children}
    </div>
  )
}

function ExBox({ children }) {
  return <div className="dm-example"><strong>例 </strong>{children}</div>
}

function Table({ head, rows }) {
  return (
    <div className="dm-table-wrap">
      <table className="dm-table">
        {head && <thead><tr>{head.map((h, i) => <th key={i}>{h}</th>)}</tr></thead>}
        <tbody>
          {rows.map((row, i) => (
            <tr key={i}>
              {row.map((c, j) => <td key={j}>{c}</td>)}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function Formula({ children }) {
  return <div className="dm-formula">{children}</div>
}

export default function DmathReviewPage() {
  useEffect(() => {
    document.title = '离散数学基础 复习 - 期末复习'
    loadMathJax().then(() => {
      if (window.MathJax && MathJax.typesetPromise) {
        MathJax.typesetPromise()
      }
    })
  }, [])

  const pageRef = useRef(null)

  return (
    <div className="dm-page" ref={pageRef}>
      <nav className="dm-nav">
        <Link to="/" className="dm-back">← 首页</Link>
      </nav>

      <div className="dm-container">
        <div className="dm-header">
          <h1>离散数学基础 复习</h1>
          <p className="dm-subtitle">第1章 命题逻辑 · 第2章 一阶逻辑 · 第3章 集合论 · 第4章 二元关系与函数</p>
        </div>

        <div className="dm-toc">
          <div className="dm-toc-title">章节导航</div>
          {CHAPTERS.map(ch => (
            <div className="dm-toc-group" key={ch.key}>
              <div className="dm-toc-chapter">{ch.label}</div>
              <div className="dm-toc-list">
                {ch.items.map(item => (
                  <a key={item.id} href={`#${item.id}`} className="dm-toc-item">{item.label}</a>
                ))}
              </div>
            </div>
          ))}
        </div>

        {/* ════════════════ 第1章 命题逻辑 ════════════════ */}
        <h2 className="dm-chapter-title" id="ch1">第1章 命题逻辑</h2>

        <Section id="s1-1" title="1.1 命题与联结词">
          <DefBox label="命题">
            判断结果惟一的陈述句。真值为真或假，但不能同时为真和假。
          </DefBox>
          <DefBox label="联结词">
            <p>5个基本联结词：</p>
            <Table head={['联结词', '符号', '含义', '真值条件']}
              rows={[
                ['否定', m('$\\neg$'), '非', m('$\\neg p$ 为真当且仅当 $p$ 为假')],
                ['合取', m('$\\wedge$'), '且', m('$p\\wedge q$ 为真当且仅当 $p,q$ 都真')],
                ['析取', m('$\\vee$'), '或', m('$p\\vee q$ 为假当且仅当 $p,q$ 都假')],
                ['蕴涵', m('$\\rightarrow$'), '如果…则…', m('$p\\rightarrow q$ 为假当且仅当 $p$ 真 $q$ 假')],
                ['等价', m('$\\leftrightarrow$'), '当且仅当', m('$p\\leftrightarrow q$ 为真当且仅当 $p,q$ 同真或同假')],
              ]} />
          </DefBox>
          <DefBox label="蕴涵式的重要表述">
            <p>{m('$p\\rightarrow q$')} 的逻辑关系：{m('$q$')} 是 {m('$p$')} 的必要条件。</p>
            <p>不同表述："若 <em>p</em> 则 <em>q</em>"、"只要 <em>p</em> 就 <em>q</em>"、"<em>p</em> 仅当 <em>q</em>"、"只有 <em>q</em> 才 <em>p</em>"。</p>
            <p>注意 {m('$p\\rightarrow q$')} 与 {m('$\\neg q\\rightarrow\\neg p$')} 等值（逆否命题）。</p>
          </DefBox>
        </Section>

        <Section id="s1-2" title="1.2 命题公式与分类">
          <DefBox label="合式公式">
            <p>(1) 命题常项/变项是公式；</p>
            <p>(2) 若 A,B 是公式，则 {m('$(\\neg A), (A\\wedge B), (A\\vee B), (A\\rightarrow B), (A\\leftrightarrow B)$')} 也是公式。</p>
          </DefBox>
          <DefBox label="公式分类">
            <p><strong>重言式（永真式）：</strong>所有赋值下为真。</p>
            <p><strong>矛盾式（永假式）：</strong>所有赋值下为假。</p>
            <p><strong>可满足式：</strong>存在成真赋值（非矛盾式）。</p>
          </DefBox>
          <DefBox label="联结词优先级">
            <p>{m('$\\neg$')} &gt; {m('$\\wedge,\\vee$')} &gt; {m('$\\rightarrow$')} &gt; {m('$\\leftrightarrow$')}</p>
          </DefBox>
        </Section>

        <Section id="s1-3" title="1.3 等值演算">
          <DefBox label="基本等值式（重要）">
            <Table head={['定律', '公式']}
              rows={[
                ['双重否定', m('$\\neg\\neg A \\Leftrightarrow A$')],
                ['等幂律', m('$A\\vee A \\Leftrightarrow A,\\; A\\wedge A \\Leftrightarrow A$')],
                ['交换律', m('$A\\vee B \\Leftrightarrow B\\vee A,\\; A\\wedge B \\Leftrightarrow B\\wedge A$')],
                ['结合律', m('$(A\\vee B)\\vee C \\Leftrightarrow A\\vee(B\\vee C)$')],
                ['分配律', m('$A\\vee(B\\wedge C) \\Leftrightarrow (A\\vee B)\\wedge(A\\vee C)$')],
                ['D.M 律', m('$\\neg(A\\vee B) \\Leftrightarrow \\neg A\\wedge\\neg B,\\; \\neg(A\\wedge B)\\Leftrightarrow\\neg A\\vee\\neg B$')],
                ['吸收律', m('$A\\vee(A\\wedge B)\\Leftrightarrow A,\\; A\\wedge(A\\vee B)\\Leftrightarrow A$')],
                ['零律', m('$A\\vee1\\Leftrightarrow1,\\; A\\wedge0\\Leftrightarrow0$')],
                ['同一律', m('$A\\vee0\\Leftrightarrow A,\\; A\\wedge1\\Leftrightarrow A$')],
                ['排中律', m('$A\\vee\\neg A\\Leftrightarrow1$')],
                ['矛盾律', m('$A\\wedge\\neg A\\Leftrightarrow0$')],
                ['蕴涵等值式', m('$A\\rightarrow B \\Leftrightarrow \\neg A\\vee B$')],
                ['等价等值式', m('$A\\leftrightarrow B \\Leftrightarrow (A\\rightarrow B)\\wedge(B\\rightarrow A)$')],
                ['假言易位', m('$A\\rightarrow B \\Leftrightarrow \\neg B\\rightarrow\\neg A$')],
                ['归谬论', m('$(A\\rightarrow B)\\wedge(A\\rightarrow\\neg B)\\Leftrightarrow\\neg A$')],
              ]} />
          </DefBox>
          <ExBox>
            <p>证明 {m('$p\\rightarrow(q\\rightarrow r) \\Leftrightarrow (p\\wedge q)\\rightarrow r$')}</p>
            <Formula>{m('$p\\rightarrow(q\\rightarrow r) \\Leftrightarrow \\neg p\\vee(\\neg q\\vee r) \\Leftrightarrow (\\neg p\\vee\\neg q)\\vee r \\Leftrightarrow \\neg(p\\wedge q)\\vee r \\Leftrightarrow (p\\wedge q)\\rightarrow r$')}</Formula>
          </ExBox>
        </Section>

        <Section id="s1-4" title="1.4 范式与主范式">
          <DefBox label="基本概念">
            <p><strong>文字：</strong>命题变项及其否定（{m('$p,\\neg q$')}）。</p>
            <p><strong>简单析取式：</strong>文字或有限个文字的析取，如 {m('$p\\vee\\neg q$')}。</p>
            <p><strong>简单合取式：</strong>文字或有限个文字的合取，如 {m('$p\\wedge\\neg q$')}。</p>
            <p><strong>析取范式：</strong>有限个合取子句的析取。</p>
            <p><strong>合取范式：</strong>有限个析取子句的合取。</p>
          </DefBox>
          <DefBox label="极小项与极大项">
            <p>n个命题变项的极小项有 2<sup>n</sup> 个，每个极小项只有唯一成真赋值。</p>
            <p>极小项记作 {m('$m_i$')}，极大项记作 {m('$M_i$')}，其中 i 为对应赋值的十进制数。</p>
            <p>{m('$\\neg m_i \\Leftrightarrow M_i$')}</p>
          </DefBox>
          <DefBox label="主范式用途">
            <p><strong>成真赋值：</strong>主析取范式中极小项对应的赋值；</p>
            <p><strong>判断公式类型：</strong>重言式 ↔ 主析取范式含全部极小项；矛盾式 ↔ 主析取范式为0；</p>
            <p><strong>判断等值：</strong>两公式等值 ↔ 主析取范式（主合取范式）相同。</p>
          </DefBox>
          <ExBox>
            <p>某公司要从赵、钱、孙、李、周中派人出差，条件：</p>
            <p>(1) 若赵去则钱去；(2) 李、周至少一人去；(3) 钱、孙仅一人去；</p>
            <p>(4) 孙、李同去或同不去；(5) 若周去则赵、钱也去。</p>
            <p>求主析取范式可得两组解：<strong>孙、李去</strong> 或 <strong>赵、钱、周去</strong>。</p>
          </ExBox>
        </Section>

        <Section id="s1-7" title="1.7 推理理论">
          <DefBox label="推理形式结构">
            <p>推理正确当且仅当 {m('$A_1\\wedge A_2\\wedge\\cdots\\wedge A_k\\rightarrow B$')} 是重言式。</p>
            <p>记作 {m('$A_1,A_2,\\ldots,A_k \\Rightarrow B$')}。</p>
          </DefBox>
          <DefBox label="重要推理定律">
            <Table head={['定律', '形式']}
              rows={[
                ['附加律', m('$A \\Rightarrow A\\vee B$')],
                ['化简律', m('$A\\wedge B \\Rightarrow A$')],
                ['假言推理', m('$(A\\rightarrow B)\\wedge A \\Rightarrow B$')],
                ['拒取式', m('$(A\\rightarrow B)\\wedge\\neg B \\Rightarrow \\neg A$')],
                ['析取三段论', m('$(A\\vee B)\\wedge\\neg B \\Rightarrow A$')],
                ['假言三段论', m('$(A\\rightarrow B)\\wedge(B\\rightarrow C) \\Rightarrow (A\\rightarrow C)$')],
                ['构造性二难', m('$(A\\rightarrow B)\\wedge(C\\rightarrow D)\\wedge(A\\vee C) \\Rightarrow (B\\vee D)$')],
              ]} />
          </DefBox>
          <DefBox label="构造证明法">
            <p><strong>直接证明法：</strong>从前提逐步推理到结论。</p>
            <p><strong>附加前提法：</strong>结论是 {m('$C\\rightarrow B$')} 时，将 C 作为附加前提证 B。</p>
            <p><strong>归谬法（反证法）：</strong>将结论的否定加入前提，推出矛盾。</p>
          </DefBox>
        </Section>

        {/* ════════════════ 第2章 一阶逻辑 ════════════════ */}
        <h2 className="dm-chapter-title" id="ch2">第2章 一阶逻辑</h2>

        <Section id="s2-1" title="2.1 基本概念">
          <DefBox label="三大要素">
            <p><strong>个体词：</strong>研究对象中的客体（常项 a,b,c / 变项 x,y,z）。</p>
            <p><strong>谓词：</strong>表示个体性质或关系的词。一元谓词表示性质，多元谓词（n≥2）表示关系。</p>
            <p><strong>量词：</strong>{m('$\\forall$')}（全称量词：所有的、任意的）、{m('$\\exists$')}（存在量词：有的、存在）。</p>
          </DefBox>
          <DefBox label="命题符号化（重要）">
            <p>引入特性谓词 {m('$F(x)$')}（x是人）：</p>
            <p>① "人都爱美"：{m('$\\forall x(F(x)\\rightarrow G(x))$')} — 全称量词用 {m('$\\rightarrow$')}</p>
            <p>② "有人用左手写字"：{m('$\\exists x(F(x)\\wedge G(x))$')} — 存在量词用 {m('$\\wedge$')}</p>
            <p>注意：全称量词与存在量词不能随意交换顺序。</p>
          </DefBox>
          <DefBox label="常见符号化">
            <p>"没有不吃饭的人"：{m('$\\neg\\exists x(M(x)\\wedge\\neg F(x)) \\Leftrightarrow \\forall x(M(x)\\rightarrow F(x))$')}</p>
            <p>"素数不全是奇数"：{m('$\\neg\\forall x(F(x)\\rightarrow G(x)) \\Leftrightarrow \\exists x(F(x)\\wedge\\neg G(x))$')}</p>
            <p>"正数都大于负数"：{m('$\\forall x\\forall y(F(x)\\wedge G(y)\\rightarrow L(x,y))$')}</p>
          </DefBox>
        </Section>

        <Section id="s2-2" title="2.2 合式公式与解释">
          <DefBox label="合式公式">
            <p>在命题公式基础上增加量词规则：若 A 是公式，则 {m('$\\forall xA$')}、{m('$\\exists xA$')} 也是公式。</p>
            <p><strong>约束出现：</strong>量词辖域中 x 的出现。</p>
            <p><strong>自由出现：</strong>不在量词辖域中的变项出现。</p>
            <p><strong>闭式：</strong>不含自由出现变项的公式。</p>
          </DefBox>
          <DefBox label="公式分类">
            <p><strong>永真式（逻辑有效式）：</strong>任何解释和赋值下为真。</p>
            <p><strong>矛盾式：</strong>任何解释和赋值下为假。</p>
            <p><strong>可满足式：</strong>存在成真的解释和赋值。</p>
            <p>重言式的代换实例都是逻辑有效式。</p>
          </DefBox>
        </Section>

        <Section id="s2-3" title="2.3 等值式与前束范式">
          <DefBox label="量词否定等值式">
            <Formula>{m('$\\neg\\forall xA(x) \\Leftrightarrow \\exists x\\neg A(x)$')}</Formula>
            <Formula>{m('$\\neg\\exists xA(x) \\Leftrightarrow \\forall x\\neg A(x)$')}</Formula>
          </DefBox>
          <DefBox label="量词辖域收缩与扩张">
            <Table head={['全称量词', '存在量词']}
              rows={[
                [m('$\\forall x(A(x)\\vee B) \\Leftrightarrow \\forall xA(x)\\vee B$'), m('$\\exists x(A(x)\\vee B) \\Leftrightarrow \\exists xA(x)\\vee B$')],
                [m('$\\forall x(A(x)\\wedge B) \\Leftrightarrow \\forall xA(x)\\wedge B$'), m('$\\exists x(A(x)\\wedge B) \\Leftrightarrow \\exists xA(x)\\wedge B$')],
                [m('$\\forall x(A(x)\\rightarrow B) \\Leftrightarrow \\exists xA(x)\\rightarrow B$'), m('$\\exists x(A(x)\\rightarrow B) \\Leftrightarrow \\forall xA(x)\\rightarrow B$')],
                [m('$\\forall x(B\\rightarrow A(x)) \\Leftrightarrow B\\rightarrow\\forall xA(x)$'), m('$\\exists x(B\\rightarrow A(x)) \\Leftrightarrow B\\rightarrow\\exists xA(x)$')],
              ]} />
          </DefBox>
          <DefBox label="前束范式">
            <p>所有量词都在公式最前端且辖域延伸至公式末端的形式：{m('$Q_1x_1Q_2x_2\\cdots Q_kx_kB$')}。</p>
            <p>任何一阶逻辑公式都存在与之等值的前束范式。</p>
          </DefBox>
          <ExBox>
            <p>苏格拉底三段论的形式化证明：</p>
            <Formula>{m('$\\forall x(F(x)\\rightarrow G(x)), F(a) \\Rightarrow G(a)$')}</Formula>
            <p>由 {m('$\\forall x(F(x)\\rightarrow G(x))$')} 得 {m('$F(a)\\rightarrow G(a)$')}，与 {m('$F(a)$')} 假言推理得 {m('$G(a)$')}。</p>
          </ExBox>
        </Section>

        {/* ════════════════ 第3章 集合论 ════════════════ */}
        <h2 className="dm-chapter-title" id="ch3">第3章 集合论</h2>

        <Section id="s3-1" title="3.1 集合基本概念与运算">
          <DefBox label="基本概念">
            <p><strong>集合：</strong>一些个体组成的全体。元素属于集合记作 {m('$\\in$')}，不属于记作 {m('$\\notin$')}。</p>
            <p><strong>子集：</strong>{m('$A\\subseteq B \\Leftrightarrow \\forall x(x\\in A\\rightarrow x\\in B)$')}</p>
            <p><strong>相等：</strong>{m('$A = B \\Leftrightarrow A\\subseteq B \\wedge B\\subseteq A$')}</p>
            <p><strong>空集：</strong>{m('$\\varnothing$')} 是任何集合的子集，且唯一。</p>
            <p><strong>幂集：</strong>{m('$P(A) = \\{x\\mid x\\subseteq A\\}$')}，若 {m('$|A|=n$')}，则 {m('$|P(A)|=2^n$')}。</p>
          </DefBox>
          <DefBox label="基本运算">
            <Table head={['运算', '定义']}
              rows={[
                ['并', m('$A\\cup B = \\{x \\mid x\\in A \\vee x\\in B\\}$')],
                ['交', m('$A\\cap B = \\{x \\mid x\\in A \\wedge x\\in B\\}$')],
                ['相对补', m('$A-B = \\{x \\mid x\\in A \\wedge x\\notin B\\}$')],
                ['对称差', m('$A\\oplus B = (A-B)\\cup(B-A) = (A\\cup B)-(A\\cap B)$')],
                ['绝对补', m('$\\sim A = E-A$')],
              ]} />
          </DefBox>
          <DefBox label="运算律（重要）">
            <p>交换律、结合律、分配律（∩对∪、∪对∩）、吸收律、</p>
            <p>德·摩根律：{m('$\\sim(B\\cup C)=\\sim B\\cap\\sim C$')}、{m('$\\sim(B\\cap C)=\\sim B\\cup\\sim C$')}</p>
            <p>同一律：{m('$A\\cup\\varnothing=A$')}、{m('$A\\cap E=A$')}</p>
            <p>零律：{m('$A\\cup E=E$')}、{m('$A\\cap\\varnothing=\\varnothing$')}</p>
            <p>排中律：{m('$A\\cup\\sim A=E$')}、矛盾律：{m('$A\\cap\\sim A=\\varnothing$')}</p>
          </DefBox>
        </Section>

        <Section id="s3-2" title="3.2 集合恒等式与证明">
          <DefBox label="证明方法">
            <p><strong>命题演算法：</strong>任取 x，通过逻辑等价证明 {m('$x\\in X \\Leftrightarrow x\\in Y$')}。</p>
            <p><strong>包含传递法：</strong>找到 T 使 {m('$X\\subseteq T\\subseteq Y$')}。</p>
            <p><strong>反证法：</strong>假设不成立推出矛盾。</p>
            <p><strong>运算法：</strong>利用已知等式通过运算推导。</p>
          </DefBox>
          <ExBox>
            <p>证明 {m('$A\\subseteq B \\Leftrightarrow A\\cup B = B \\Leftrightarrow A\\cap B = A \\Leftrightarrow A-B = \\varnothing$')}</p>
            <p>证明 {m('$A-(B\\cup C)=(A-B)\\cap(A-C)$')} 常用命题演算法。</p>
          </ExBox>
        </Section>

        <Section id="s3-3" title="3.3 包含排斥原理">
          <DefBox label="公式">
            <Formula>{m('$\\left|\\overline{A_1}\\cap\\overline{A_2}\\cap\\cdots\\cap\\overline{A_m}\\right| = |S| - \\sum|A_i| + \\sum_{i<j}|A_i\\cap A_j| - \\sum_{i<j<k}|A_i\\cap A_j\\cap A_k| + \\cdots + (-1)^m|A_1\\cap A_2\\cap\\cdots\\cap A_m|$')}</Formula>
          </DefBox>
          <ExBox>
            <p>求1~1000中既不能被5和6整除，也不能被8整除的数的个数。</p>
            <p>设 {m('$A,B,C$')} 分别为能被5、6、8整除的数。</p>
            <Formula>{m('$N = 1000 - (200+166+125) + (33+25+41) - 8 = 600$')}</Formula>
          </ExBox>
        </Section>

        {/* ════════════════ 第4章 二元关系与函数 ════════════════ */}
        <h2 className="dm-chapter-title" id="ch4">第4章 二元关系与函数</h2>

        <Section id="s4-1" title="4.1 笛卡尔积与二元关系">
          <DefBox label="有序对">
            <p>由两个客体 x,y 按一定顺序组成的二元组 {m('$\\langle x,y\\rangle$')}。</p>
            <p>性质：{m('$\\langle x,y\\rangle = \\langle u,v\\rangle \\Leftrightarrow x=u \\wedge y=v$')}</p>
          </DefBox>
          <DefBox label="笛卡尔积">
            <p>{m('$A\\times B = \\{\\langle x,y\\rangle \\mid x\\in A \\wedge y\\in B\\}$')}</p>
            <p>性质：不满足交换律、结合律；对并交满足分配律。</p>
            <p>若 {m('$|A|=m, |B|=n$')}，则 {m('$|A\\times B| = mn$')}。</p>
          </DefBox>
          <DefBox label="二元关系">
            <p>{m('$A\\times B$')} 的任何子集是从 A 到 B 的二元关系。A 上的关系是 {m('$A\\times A$')} 的子集。</p>
            <p>重要关系：<strong>空关系</strong> ∅、<strong>全域关系</strong> {m('$E_A = A\\times A$')}、<strong>恒等关系</strong> {m('$I_A = \\{\\langle x,x\\rangle\\mid x\\in A\\}$')}。</p>
            <p>关系表示：集合表达式、<strong>关系矩阵</strong>（布尔矩阵）、<strong>关系图</strong>（有向图）。</p>
          </DefBox>
        </Section>

        <Section id="s4-2" title="4.2 关系的运算">
          <DefBox label="基本运算">
            <Table head={['运算', '定义']}
              rows={[
                ['定义域', m('$\\text{dom}R = \\{x\\mid\\exists y(\\langle x,y\\rangle\\in R)\\}$')],
                ['值域', m('$\\text{ran}R = \\{y\\mid\\exists x(\\langle x,y\\rangle\\in R)\\}$')],
                ['逆', m('$R^{-1} = \\{\\langle y,x\\rangle\\mid\\langle x,y\\rangle\\in R\\}$')],
                ['合成', m('$R\\circ S = \\{\\langle x,z\\rangle\\mid\\exists y(\\langle x,y\\rangle\\in S \\wedge \\langle y,z\\rangle\\in R)\\}$')],
                ['限制', m('$F\\upharpoonright A = \\{\\langle x,y\\rangle\\mid xFy \\wedge x\\in A\\}$')],
                ['像', m('$F[A] = \\text{ran}(F\\upharpoonright A)$')],
              ]} />
          </DefBox>
          <DefBox label="幂运算">
            <p>{m('$R^0 = I_A$')}，{m('$R^{n+1} = R^n \\circ R$')}</p>
            <p>性质：{m('$R^m\\circ R^n = R^{m+n},\\; (R^m)^n = R^{mn}$')}</p>
            <p>有穷集上关系存在 s≠t 使得 {m('$R^s = R^t$')}。</p>
          </DefBox>
        </Section>

        <Section id="s4-3" title="4.3 关系的性质">
          <DefBox label="五种性质">
            <Table head={['性质', '定义', '充要条件', '矩阵特点', '图特点']}
              rows={[
                ['自反', m('$\\forall x(\\langle x,x\\rangle\\in R)$'), m('$I_A\\subseteq R$'), '主对角线全1', '每个顶点有环'],
                ['反自反', m('$\\forall x(\\langle x,x\\rangle\\notin R)$'), m('$R\\cap I_A=\\varnothing$'), '主对角线全0', '每个顶点无环'],
                ['对称', m('$\\langle x,y\\rangle\\in R\\rightarrow\\langle y,x\\rangle\\in R$'), m('$R=R^{-1}$'), '矩阵对称', '有边必有反向边'],
                ['反对称', m('$\\langle x,y\\rangle\\in R\\wedge\\langle y,x\\rangle\\in R\\rightarrow x=y$'), m('$R\\cap R^{-1}\\subseteq I_A$'), '对称位置至少一个0', '无双向边'],
                ['传递', m('$\\langle x,y\\rangle\\in R\\wedge\\langle y,z\\rangle\\in R\\rightarrow\\langle x,z\\rangle\\in R$'), m('$R\\circ R\\subseteq R$'), '见教材', '连通必有边'],
              ]} />
          </DefBox>
          <ExBox>
            <p>设 {m('$A=\\{1,2,3\\}$')}：</p>
            <p>{m('$R_1=\\{\\langle1,1\\rangle,\\langle2,2\\rangle\\}$')} — 既不自反也不反自反；对称、反对称；传递。</p>
            <p>{m('$R_2=\\{\\langle1,1\\rangle,\\langle2,2\\rangle,\\langle3,3\\rangle,\\langle1,2\\rangle\\}$')} — 自反；反对称；传递。</p>
            <p>{m('$R_3=\\{\\langle1,3\\rangle\\}$')} — 反自反；反对称；传递。</p>
          </ExBox>
        </Section>

        <Section id="s4-4" title="4.4 关系的闭包">
          <DefBox label="定义">
            <p>自反闭包 {m('$r(R)$')}、对称闭包 {m('$s(R)$')}、传递闭包 {m('$t(R)$')}：</p>
            <p>包含 R 且具有相应性质的最小关系。</p>
          </DefBox>
          <DefBox label="构造方法">
            <Formula>{m('$r(R) = R \\cup R^0 = R \\cup I_A$')}</Formula>
            <Formula>{m('$s(R) = R \\cup R^{-1}$')}</Formula>
            <Formula>{m('$t(R) = R \\cup R^2 \\cup R^3 \\cup \\cdots$')}</Formula>
            <p>对有穷集 A（{m('$|A|=n$')}），传递闭包的并最多不超过 {m('$R^n$')}。</p>
          </DefBox>
        </Section>

        <Section id="s4-5" title="4.5 等价关系与偏序关系">
          <DefBox label="等价关系">
            <p>同时满足<strong>自反、对称、传递</strong>的关系。记作 {m('$x\\sim y$')}。</p>
            <p>例如：模3相等关系、三角形相似关系。</p>
            <p><strong>等价类：</strong>{m('$[x]_R = \\{y\\mid xRy\\}$')}</p>
            <p><strong>商集：</strong>{m('$A/R = \\{[x]_R\\mid x\\in A\\}$')}</p>
            <p>等价关系与集合的划分一一对应。</p>
          </DefBox>
          <ExBox>
            <p>设 {m('$A=\\{1,2,\\ldots,8\\}$')}，R为模3相等关系：</p>
            <p>等价类：{m('$[1]=[4]=[7]=\\{1,4,7\\},\\; [2]=[5]=[8]=\\{2,5,8\\},\\; [3]=[6]=\\{3,6\\}$')}</p>
            <p>商集：{m('$A/R = \\{\\{1,4,7\\},\\{2,5,8\\},\\{3,6\\}\\}$')}</p>
          </ExBox>
          <DefBox label="偏序关系">
            <p>同时满足<strong>自反、反对称、传递</strong>的关系，记作 {m('$\\preccurlyeq$')}。</p>
            <p><strong>全序：</strong>任意两个元素都可比。</p>
            <p><strong>覆盖：</strong>{m('$x\\prec y$')} 且不存在 z 使 {m('$x\\prec z\\prec y$')}。</p>
            <p><strong>哈斯图：</strong>简化的关系图，去掉环、传递边，用位置高低表示序。</p>
            <p><strong>特殊元素：</strong>极大元、极小元、最大元、最小元、上界、下界、上确界、下确界。</p>
          </DefBox>
          <ExBox>
            <p>偏序集 {m('$\\langle\\{2,3,6,12,24,36\\}, R_{\\text{整除}}\\rangle$')}：</p>
            <p>极小元：2,3 &emsp; 极大元：24,36 &emsp; 无最大/最小元</p>
            <p>{m('$B=\\{6,12\\}$')}的上界：12,24,36 &emsp; 上确界：12</p>
          </ExBox>
        </Section>

        <Section id="s4-6" title="4.6~4.7 函数">
          <DefBox label="函数定义">
            <p>F 是函数当且仅当 {m('$\\forall x\\in\\text{dom}F$')} 存在<strong>唯一</strong>的 y 使 xFy 成立。</p>
            <p>{m('$f:A\\rightarrow B$')}：{m('$\\text{dom}f = A,\\; \\text{ran}f \\subseteq B$')}</p>
            <p>从 A 到 B 的函数全体记作 {m('$B^A$')}，{m('$|B^A| = |B|^{|A|}$')}。</p>
          </DefBox>
          <DefBox label="函数性质">
            <p><strong>满射：</strong>{m('$\\text{ran}f = B$')}，即 {m('$\\forall y\\in B,\\; \\exists x\\in A$')} 使 {m('$f(x)=y$')}。</p>
            <p><strong>单射：</strong>{m('$f(x_1)=f(x_2) \\Rightarrow x_1=x_2$')}。</p>
            <p><strong>双射：</strong>既是满射又是单射。</p>
          </DefBox>
          <DefBox label="重要函数">
            <p><strong>常函数：</strong>{m('$\\forall x\\in A,\\; f(x)=c$')}。</p>
            <p><strong>恒等函数：</strong>{m('$I_A(x)=x$')}。</p>
            <p><strong>特征函数：</strong>{m('$\\chi_{A\'}(a)=1$')} 当 {m('$a\\in A\'$')}，否则0。</p>
            <p><strong>自然映射：</strong>{m('$g:A\\rightarrow A/R,\\; g(a)=[a]$')}</p>
          </DefBox>
          <DefBox label="函数复合与反函数">
            <p>{m('$f:A\\rightarrow B,\\; g:B\\rightarrow C$')} 则 {m('$(g\\circ f)(x) = g(f(x))$')}。</p>
            <p>满射复合→满射；单射复合→单射；双射复合→双射。</p>
            <p><strong>反函数存在条件：</strong>{m('$f:A\\rightarrow B$')} 是<strong>双射</strong>。反函数 {m('$f^{-1}:B\\rightarrow A$')} 也是双射。</p>
            <p>{m('$f^{-1}\\circ f = I_A,\\; f\\circ f^{-1} = I_B$')}。</p>
          </DefBox>
        </Section>

      </div>
    </div>
  )
}
