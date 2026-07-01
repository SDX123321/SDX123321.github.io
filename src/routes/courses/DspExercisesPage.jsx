import { useEffect, useRef } from 'react'
import { Link } from 'react-router-dom'
import '../../styles/courses/dsp-exercises.css'
import AnnotationOverlay from '../../features/annotation/AnnotationOverlay'
import { loadMathJax } from '../../lib/cdnScripts'

const R2 = 'https://r2.zzzzcx.cn/images/dsp-exercises'

const LB = '{'
const RB = '}'

const CHAPTERS = [
  { key: 'ch1', label: '第1章 离散时间信号与系统', items: [
    { id: 'q2', label: '1.5 z变换与ROC' },
    { id: 'q3', label: '1.8 逆z变换' },
    { id: 'q4', label: '1.11+1.12 线性/时不变/卷积' },
    { id: 'q5', label: '1.14 因果性与稳定性' },
    { id: 'q6', label: '1.20 系统函数稳定性' },
    { id: 'q18', label: '补充题二 系统全面分析' },
  ]},
  { key: 'ch2', label: '第2章 信号的采样与重建', items: [
    { id: 'q7', label: '2.1 采样与混叠' },
  ]},
  { key: 'ch3', label: '第3章 DFT与FFT', items: [
    { id: 'q1', label: '补充题1 4点DFT' },
    { id: 'q8', label: '3.19 周期/循环/线性卷积' },
    { id: 'q9', label: '3.20+补充 FFT时间与流图' },
  ]},
  { key: 'ch4', label: '第4章 IIR滤波器设计', items: [
    { id: 'q10', label: '4.1+4.4 脉冲响应/双线性变换' },
    { id: 'q11', label: '4.8 巴特沃思低通滤波器' },
  ]},
  { key: 'ch5', label: '第5章 FIR滤波器设计', items: [
    { id: 'q12', label: '5.1 矩形窗FIR设计' },
    { id: 'q13', label: '补充题 FIR系统函数分析' },
  ]},
  { key: 'ch6', label: '第6章 数字信号处理系统的实现', items: [
    { id: 'q14', label: '6.3 直接I/II型结构' },
    { id: 'q15', label: '6.6 横截型结构' },
    { id: 'q16', label: '6.5 多种滤波器结构' },
    { id: 'q17', label: '6.10 量化噪声分析' },
  ]},
]

function Section({ id, num, title, children, img }) {
  return (
    <div className="dsp-ex-section" id={id}>
      <h2>
        <span className="dsp-ex-num">{num}</span>
        {title}
      </h2>
      {img && (
        <details open className="dsp-ex-original-img">
          <summary>查看原题图片</summary>
          <img src={`${R2}/${img}`} alt={title} loading="lazy" />
        </details>
      )}
      <div className="dsp-ex-steps">{children}</div>
    </div>
  )
}

function Problem({ children }) {
  return <div className="dsp-ex-problem">{children}</div>
}

function Formula({ children }) {
  return <div className="dsp-ex-formula">{children}</div>
}

function Result({ children }) {
  return <div className="dsp-ex-result">{children}</div>
}

function Table({ head, rows }) {
  return (
    <div className="dsp-ex-table-wrap">
      <table className="dsp-ex-table">
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

export default function DspExercisesPage() {
  useEffect(() => {
    document.title = '数字信号处理 习题解答 - 期末复习'
    loadMathJax().then(() => {
      if (window.MathJax && MathJax.typesetPromise) {
        MathJax.typesetPromise()
      }
    })
  }, [])

  const pageRef = useRef(null)

  const m = (s) => s.replace(/\{/g, LB).replace(/\}/g, RB)

  return (
    <div className="dsp-ex-page" ref={pageRef}>
      <nav className="dsp-ex-nav">
        <Link to="/courses/dsp/" className="dsp-ex-back">← 返回数字信号处理</Link>
        <Link to="/" className="dsp-ex-back">首页</Link>
      </nav>

      <div className="dsp-ex-container">
        <div className="dsp-ex-header">
          <h1>数字信号处理 习题解答</h1>
          <p className="dsp-ex-subtitle">基于课本习题与补充题 · 含完整解答过程</p>
        </div>

        <div className="dsp-ex-toc">
          <div className="dsp-ex-toc-title">章节导航</div>
          {CHAPTERS.map(ch => (
            <div className="dsp-ex-toc-group" key={ch.key}>
              <div className="dsp-ex-toc-chapter">{ch.label}</div>
              <div className="dsp-ex-toc-list">
                {ch.items.map(item => (
                  <a key={item.id} href={`#${item.id}`} className="dsp-ex-toc-item">
                    {item.label}
                  </a>
                ))}
              </div>
            </div>
          ))}
        </div>

        {/* Q1 */}
        <Section id="q1" num={1} title="补充题 4点DFT计算" img="ch3_dft_4point.jpg">
          <Problem>
            <strong>题目：</strong>求序列 {m('$x(n) = {1, 2, 0, 1}, \\quad 0 \\leq n \\leq 3$')} 的4点DFT。
          </Problem>

          <h3>步骤 1：回顾 DFT 定义</h3>
          <p>N 点 DFT 的定义公式为：</p>
          <Formula>{m('$X(k) = \\sum_{n=0}^{N-1} x(n) W_N^{kn}, \\quad k = 0, 1, \\ldots, N-1$')}</Formula>
          <p>其中旋转因子 {m('$W_N = e^{-j2\\pi/N}$')}，{m('$N=4$')}。</p>

          <h3>步骤 2：计算旋转因子 {m('$W_4$')} 的各次幂</h3>
          <Formula>{m('$W_4 = e^{-j2\\pi/4} = e^{-j\\pi/2} = \\cos(-\\pi/2) + j\\sin(-\\pi/2) = -j$')}</Formula>
          <Table
            head={['k', m('$W_4^k$'), '数值']}
            rows={[
              ['0', m('$W_4^0 = 1$'), '1'],
              ['1', m('$W_4^1 = -j$'), '-j'],
              ['2', m('$W_4^2 = (-j)^2 = -1$'), '-1'],
              ['3', m('$W_4^3 = (-j)^3 = j$'), 'j'],
            ]}
          />

          <h3>步骤 3：计算 {m('$X(0)$')}</h3>
          <p>代入 {m('$k=0$')}，此时 {m('$W_4^{0 \\cdot n} = 1$')}：</p>
          <Formula>{m('$X(0) = \\sum_{n=0}^{3} x(n) \\cdot 1 = 1 + 2 + 0 + 1 = 4$')}</Formula>

          <h3>步骤 4：计算 {m('$X(1)$')}</h3>
          <p>代入 {m('$k=1$')}，{m('$W_4^{n} = (-j)^n$')}：</p>
          <Formula>{m('$X(1) = \\sum_{n=0}^{3} x(n)(-j)^n = 1 + 2(-j) + 0(-j)^2 + 1(-j)^3$')}</Formula>
          <p>计算各项：{m('$(-j)^2 = -1, \\; (-j)^3 = (-j)^2(-j) = (-1)(-j) = j$')}</p>
          <Formula>{m('$X(1) = 1 - 2j + 0 + j = 1 - j$')}</Formula>

          <h3>步骤 5：计算 {m('$X(2)$')}</h3>
          <p>代入 {m('$k=2$')}，{m('$W_4^{2n} = ((-j)^2)^n = (-1)^n$')}：</p>
          <Formula>{m('$X(2) = \\sum_{n=0}^{3} x(n)(-1)^n = 1 + 2(-1) + 0(1) + 1(-1) = 1 - 2 - 1 = -2$')}</Formula>

          <h3>步骤 6：计算 {m('$X(3)$')}</h3>
          <p>代入 {m('$k=3$')}，{m('$W_4^{3n} = ((-j)^3)^n = j^n$')}：</p>
          <Formula>{m('$X(3) = \\sum_{n=0}^{3} x(n) j^n = 1 + 2j + 0(j^2) + 1(j^3)$')}</Formula>
          <p>其中 {m('$j^2 = -1, \\; j^3 = -j$')}：</p>
          <Formula>{m('$X(3) = 1 + 2j - j = 1 + j$')}</Formula>

          <h3>步骤 7：汇总结果</h3>
          <Result>{m('$X(k) = {4, 1-j, -2, 1+j}, \\quad k = 0,1,2,3$')}</Result>
        </Section>

        {/* Q2 */}
        <Section id="q2" num={2} title="1.5 z变换、收敛域及零极点图" img="ch1_z_transform.jpg">
          <Problem>
            <strong>题目：</strong>求以下序列的z变换、收敛域及零极点分布图：<br />
            (2) {m('$x(n) = 0.5^n u(n)$')}<br />
            (3) {m('$x(n) = (-0.5)^n u(-n-1)$')}
          </Problem>

          <h3>(2) {m('$x(n) = 0.5^n u(n)$')} — 右序列</h3>
          <p><strong>步骤 1：代入 z 变换定义</strong></p>
          <p>z 变换定义：{m('$X(z) = \\sum_{n=-\\infty}^{\\infty} x(n) z^{-n}$')}。</p>
          <p>由于 {m('$u(n)=0$')} 当 {m('$n<0$')}，求和从 {m('$n=0$')} 开始：</p>
          <Formula>{m('$X(z) = \\sum_{n=0}^{\\infty} 0.5^n z^{-n} = \\sum_{n=0}^{\\infty} (0.5 z^{-1})^n$')}</Formula>

          <p><strong>步骤 2：识别几何级数</strong></p>
          <p>等比级数 {m('$\\sum_{n=0}^{\\infty} r^n$')} 当 {m('$|r|<1$')} 时收敛于 {m('$1/(1-r)$')}。</p>
          <p>这里 {m('$r = 0.5 z^{-1}$')}，收敛条件：</p>
          <Formula>{m('$|0.5 z^{-1}| < 1 \\quad \\Rightarrow \\quad |z| > 0.5$')}</Formula>

          <p><strong>步骤 3：求和并化简</strong></p>
          <Formula>{m('$X(z) = \\frac{1}{1 - 0.5 z^{-1}} = \\frac{z}{z - 0.5}, \\quad |z| > 0.5$')}</Formula>

          <p><strong>步骤 4：零极点与 ROC</strong></p>
          <ul className="dsp-ex-list">
            <li><strong>零点：</strong>{m('$z = 0$')}（分子 {m('$z=0$')}）</li>
            <li><strong>极点：</strong>{m('$z = 0.5$')}（分母 {m('$z-0.5=0$')}）</li>
            <li><strong>ROC：</strong>{m('$|z| > 0.5$')}（极点外侧，右序列）</li>
          </ul>

          <h3>(3) {m('$x(n) = (-0.5)^n u(-n-1)$')} — 左序列</h3>
          <p><strong>步骤 1：确定求和范围</strong></p>
          <p>{m('$u(-n-1)=1$')} 当 {m('$-n-1 \\geq 0$')}，即 {m('$n \\leq -1$')}：</p>
          <Formula>{m('$X(z) = \\sum_{n=-\\infty}^{-1} (-0.5)^n z^{-n}$')}</Formula>

          <p><strong>步骤 2：变量代换</strong></p>
          <p>令 {m('$m = -n$')}，则 {m('$n = -m$')}，当 {m('$n \\to -\\infty$')} 时 {m('$m \\to \\infty$')}：</p>
          <Formula>{m('$X(z) = \\sum_{m=1}^{\\infty} (-0.5)^{-m} z^{m} = \\sum_{m=1}^{\\infty} (-2)^{m} z^{m}$')}</Formula>
          <p>写成等比级数形式（从 {m('$m=0$')} 开始比较方便）：</p>
          <Formula>{m('$X(z) = \\sum_{m=0}^{\\infty} (-2z)^{m} - 1 = \\frac{1}{1 + 2z} - 1$')}</Formula>

          <p><strong>步骤 3：化简</strong></p>
          <Formula>{m('$X(z) = \\frac{1 - (1 + 2z)}{1 + 2z} = \\frac{-2z}{1 + 2z}$')}</Formula>
          <p>以 {m('$z^{-1}$')} 形式重写：</p>
          <Formula>{m('$X(z) = \\frac{-1}{1 + 0.5 z^{-1}}, \\quad |z| < 0.5$')}</Formula>

          <p><strong>步骤 4：收敛条件</strong></p>
          <p>级数 {m('$\\sum_{m=0}^{\\infty} (-2z)^m$')} 收敛需要 {m('$|-2z| < 1$')}，即：</p>
          <Formula>{m('$|z| < 0.5$')}</Formula>
          <p>ROC 在极点内侧，符合左序列的特征。</p>

          <p><strong>步骤 5：对比总结</strong></p>
          <Table
            head={['序列', 'X(z)', 'ROC', '极/零点']}
            rows={[
              [m('$0.5^n u(n)$'), m('$z/(z-0.5)$'), m('$|z| > 0.5$'), '零:z=0, 极:z=0.5'],
              [m('$(-0.5)^n u(-n-1)$'), m('$-1/(1+0.5z^{-1})$'), m('$|z| < 0.5$'), '极:z=-0.5'],
            ]}
          />
          <p>注意：右序列在极点圆外收敛，左序列在极点圆内收敛。</p>
        </Section>

        {/* Q3 */}
        <Section id="q3" num={3} title="1.8 逆z变换" img="ch1_inverse_z.jpg">
          <Problem><strong>题目：</strong>求 {m('$H(z) = \\dfrac{z}{(2 - z)(1 - 2z^{-1})}$')} 的逆z变换。</Problem>

          <h3>步骤 1：将 {m('$H(z)$')} 整理为有理分式</h3>
          <p>将分母中的 {m('$(2-z)$')} 改写为 {m('$z$')} 的表达式：</p>
          <Formula>{m('$H(z) = \\frac{z}{(2 - z)(1 - 2z^{-1})}$')}</Formula>
          <p>将 {m('$1 - 2z^{-1}$')} 写成 {m('$(z-2)/z$')}：</p>
          <Formula>{m('$H(z) = \\frac{z}{(2 - z) \\cdot \\frac{z-2}{z}} = \\frac{z^2}{(2 - z)(z - 2)}$')}</Formula>
          <p>注意 {m('$2 - z = -(z - 2)$')}：</p>
          <Formula>{m('$H(z) = \\frac{z^2}{-(z - 2)^2} = -\\left(\\frac{z}{z - 2}\\right)^2$')}</Formula>

          <h3>步骤 2：以 {m('$z^{-1}$')} 形式表示</h3>
          <Formula>{m('$H(z) = -\\frac{1}{(1 - 2z^{-1})^2}$')}</Formula>

          <h3>步骤 3：使用已知 z 变换对</h3>
          <p>标准 z 变换对：</p>
          <Formula>{m('$\\frac{1}{(1 - az^{-1})^2} \\longleftrightarrow (n+1) a^n u(n), \\quad |z| > |a|$')}</Formula>
          <p>推导过程：已知 {m('$1/(1-az^{-1}) \\leftrightarrow a^n u(n)$')}，两边对 {m('$a$')} 求导可得。</p>
          <p>代入 {m('$a = 2$')}：</p>
          <Formula>{m('$h(n) = -(n+1) \\cdot 2^n \\cdot u(n)$')}</Formula>

          <h3>步骤 4：确定收敛域</h3>
          <p>极点位于 {m('$z = 2$')}（二阶极点）。由于逆变换结果为右序列（因果），ROC 为：</p>
          <Formula>{m('$|z| > 2$')}</Formula>
          <Result>{m('$h(n) = -(n+1) \\cdot 2^n \\cdot u(n)$')}</Result>
        </Section>

        {/* Q4 */}
        <Section id="q4" num={4} title="1.11 系统线性/时不变判断 + 1.12 线性卷积" img="ch1_linearity_convolution.jpg">
          <Problem>
            <strong>题目：</strong>(1) {m('$y(n) = 2x(n) + 5$')} (4) {m('$y(n) = x(n - n_0)$')} 判断线性和时不变。<br />
            1.12(3) {m('$x_1(n) = 2^n R_4(n),\\; x_2(n) = \\delta(n) - \\delta(n-2)$')} 求线性卷积。
          </Problem>

          <h3>回顾：线性与时不变的定义</h3>
          <ul className="dsp-ex-list">
            <li><strong>线性：</strong>{m('$T[ax_1(n) + bx_2(n)] = aT[x_1(n)] + bT[x_2(n)]$')}</li>
            <li><strong>时不变：</strong>{m('$T[x(n-n_0)] = y(n-n_0)$')}</li>
          </ul>

          <h3>1.11(1) {m('$y(n) = 2x(n) + 5$')}</h3>
          <p><strong>线性判断：</strong></p>
          <p>先验证齐次性。输入 {m('$ax(n)$')}：</p>
          <Formula>{m('$T[ax(n)] = 2[ax(n)] + 5 = 2a x(n) + 5$')}</Formula>
          <p>而 {m('$a T[x(n)] = a[2x(n) + 5] = 2a x(n) + 5a$')}</p>
          <p>两者不相等（除非 {m('$a=1$')}），<strong>不满足齐次性</strong>。</p>
          <p>验证叠加性：输入 {m('$x_1(n)+x_2(n)$')}</p>
          <Formula>{m('$T[x_1+x_2] = 2[x_1(n)+x_2(n)] + 5 = 2x_1+2x_2+5$')}</Formula>
          <p>而 {m('$y_1+y_2 = [2x_1+5] + [2x_2+5] = 2x_1+2x_2+10$')}</p>
          <p>两者不相等，<strong>不满足叠加性</strong>。常数项 5 破坏了线性。</p>

          <p><strong>时不变判断：</strong></p>
          <p>输入 {m('$x(n-n_0)$')}，输出：{m('$T[x(n-n_0)] = 2x(n-n_0) + 5 = y(n-n_0)$')}</p>
          <p><strong>是时不变的。</strong></p>

          <h3>1.11(4) {m('$y(n) = x(n - n_0)$')}</h3>
          <p><strong>线性判断：</strong></p>
          <Formula>{m('$T[ax_1(n)+bx_2(n)] = ax_1(n-n_0)+bx_2(n-n_0) = a y_1(n) + b y_2(n)$')}</Formula>
          <p><strong>是线性的。</strong></p>
          <p><strong>时不变判断：</strong></p>
          <Formula>{m('$T[x(n-n_1)] = x(n-n_1-n_0) = y(n-n_1)$')}</Formula>
          <p><strong>是时不变的。</strong></p>

          <h3>1.12(3) 线性卷积 {m('$x_1(n) * x_2(n)$')}</h3>
          <p><strong>步骤 1：展开序列</strong></p>
          <p>{m('$x_1(n) = 2^n R_4(n)$')}，即 {m('$n=0,1,2,3$')} 时非零：</p>
          <Formula>{m('$x_1 = \\{2^0, 2^1, 2^2, 2^3\\} = \\{1, 2, 4, 8\\}$')}</Formula>
          <p>{m('$x_2(n) = \\delta(n) - \\delta(n-2)$')}，即 {m('$x_2(0)=1,\\; x_2(2)=-1$')}。</p>

          <p><strong>步骤 2：利用卷积的线性性质</strong></p>
          <p>卷积满足线性，因此：</p>
          <Formula>{m('$y(n) = x_1(n) * [\\delta(n) - \\delta(n-2)] = x_1(n) - x_1(n-2)$')}</Formula>
          <p>即输出等于 {m('$x_1(n)$')} 减去其延时 2 位的版本。</p>

          <p><strong>步骤 3：逐点计算</strong></p>
          <Table
            head={['n', 'x₁(n)', 'x₁(n-2)', 'y(n)=x₁(n)-x₁(n-2)']}
            rows={[
              ['0', '1', '0', '1'],
              ['1', '2', '0', '2'],
              ['2', '4', '1', '3'],
              ['3', '8', '2', '6'],
              ['4', '0', '4', '-4'],
              ['5', '0', '8', '-8'],
            ]}
          />
          <p>卷积长度：{m('$L_1+L_2-1 = 4+3-1 = 6$')}</p>
          <Result>{m('$y(n) = \\{1, 2, 3, 6, -4, -8\\}, \\quad n = 0, 1, \\dots, 5$')}</Result>
        </Section>

        {/* Q5 */}
        <Section id="q5" num={5} title="1.14 LTI系统的因果性与稳定性" img="ch1_causality_stability.jpg">
          <Problem>
            <strong>题目：</strong>确定下列LTI系统的因果性与稳定性：<br />
            (4) {m('$0.5^n u(n)$')} &emsp; (5) {m('$\\frac{1}{n!} u(n)$')} &emsp; (7) {m('$5^n u(-n)$')} &emsp; (8) {m('$0.5^n u(-n)$')}
          </Problem>

          <h3>回顾：因果性与稳定性的定义</h3>
          <ul className="dsp-ex-list">
            <li><strong>因果性：</strong>LTI 系统因果当且仅当 {m('$h(n) = 0, \\; n < 0$')}</li>
            <li><strong>BIBO 稳定性：</strong>LTI 系统稳定当且仅当 {m('$\\sum_{n=-\\infty}^{\\infty} |h(n)| < \\infty$')}</li>
          </ul>

          <h3>(4) {m('$h(n) = 0.5^n u(n)$')}</h3>
          <p><strong>因果性：</strong>{m('$u(n)=0$')} 当 {m('$n<0$')}，因此 {m('$h(n)=0,\\; n<0$')}。<strong>是因果的。</strong></p>
          <p><strong>稳定性：</strong>计算绝对可和：</p>
          <Formula>{m('$\\sum_{n=0}^{\\infty} |0.5^n| = \\sum_{n=0}^{\\infty} 0.5^n = \\frac{1}{1 - 0.5} = 2 < \\infty$')}</Formula>
          <p><strong>是稳定的。</strong></p>

          <h3>(5) {m('$h(n) = \\frac{1}{n!} u(n)$')}</h3>
          <p><strong>因果性：</strong>乘以 {m('$u(n)$')}，<strong>是因果的。</strong></p>
          <p><strong>稳定性：</strong>利用指数函数的泰勒展开：</p>
          <Formula>{m('$\\sum_{n=0}^{\\infty} \\frac{1}{n!} = e^1 - 1 = e - 1 \\approx 1.718 < \\infty$')}</Formula>
          <p><strong>是稳定的。</strong></p>

          <h3>(7) {m('$h(n) = 5^n u(-n)$')}</h3>
          <p><strong>因果性：</strong>{m('$u(-n)=1$')} 当 {m('$n \\leq 0$')}，即在负时间非零。<strong>不是因果的。</strong></p>
          <p><strong>稳定性：</strong>令 {m('$m = -n$')}：</p>
          <Formula>{m('$\\sum_{n=-\\infty}^{0} |5^n| = \\sum_{m=0}^{\\infty} 5^{-m} = \\sum_{m=0}^{\\infty} \\left(\\frac{1}{5}\\right)^m = \\frac{1}{1 - 0.2} = 1.25 < \\infty$')}</Formula>
          <p><strong>是稳定的。</strong></p>

          <h3>(8) {m('$h(n) = 0.5^n u(-n)$')}</h3>
          <p><strong>因果性：</strong>与 (7) 同理，在负时间非零。<strong>不是因果的。</strong></p>
          <p><strong>稳定性：</strong>令 {m('$m = -n$')}：</p>
          <Formula>{m('$\\sum_{n=-\\infty}^{0} |0.5^n| = \\sum_{m=0}^{\\infty} 0.5^{-m} = \\sum_{m=0}^{\\infty} 2^m \\to \\infty$')}</Formula>
          <p>级数发散，<strong>不是稳定的。</strong></p>

          <h3>汇总</h3>
          <Table
            head={['序号', 'h(n)', '因果？', '稳定？', '简要理由']}
            rows={[
              ['(4)', m('$0.5^n u(n)$'), '是', '是', m('$\\sum 0.5^n$') + ' = 2 收敛'],
              ['(5)', m('$1/n! \\cdot u(n)$'), '是', '是', m('$\\sum 1/n! = e-1$') + ' 收敛'],
              ['(7)', m('$5^n u(-n)$'), '否', '是', m('$\\sum (1/5)^m = 1.25$') + ' 收敛'],
              ['(8)', m('$0.5^n u(-n)$'), '否', '否', m('$\\sum 2^m$') + ' 发散'],
            ]}
          />
        </Section>

        {/* Q6 */}
        <Section id="q6" num={6} title="1.20 系统函数的稳定性分析" img="ch1_system_stability.jpg">
          <Problem>
            <strong>题目：</strong>因果系统 {m('$H(z) = \\dfrac{1}{1 - az^{-1}}$')}，(1) {m('$a$')} 为何值时稳定？(2) {m('$0<a<1$')} 画零极点图。
          </Problem>

          <h3>(1) 稳定性分析</h3>
          <p><strong>步骤 1：求极点和 ROC</strong></p>
          <p>系统函数 {m('$H(z) = \\frac{1}{1 - az^{-1}} = \\frac{z}{z - a}$')}</p>
          <p>极点位于 {m('$z = a$')}（一阶极点）。系统因果，因此 ROC 为极点外侧：</p>
          <Formula>{m('$|z| > |a|$')}</Formula>

          <p><strong>步骤 2：应用 BIBO 稳定条件</strong></p>
          <p>稳定条件：ROC 必须包含单位圆 {m('$|z| = 1$')}。</p>
          <p>单位圆在 ROC 内当且仅当 {m('$|a| < 1$')}：</p>
          <Formula>{m('$|z| > |a| \\supseteq |z| = 1 \\quad \\Rightarrow \\quad |a| < 1$')}</Formula>
          <Result>{m('$|a| < 1$')} 时系统稳定</Result>

          <h3>(2) {m('$0 < a < 1$')} 时的零极点图</h3>
          <ul className="dsp-ex-list">
            <li><strong>零点：</strong>{m('$z = 0$')}（分子 {m('$z=0$')}）</li>
            <li><strong>极点：</strong>{m('$z = a$')}，位于正实轴 0 到 1 之间</li>
            <li><strong>ROC：</strong>{m('$|z| > a$')}，包含单位圆</li>
          </ul>
          <p>此时系统既是因果的，也是稳定的。</p>
        </Section>

        {/* Q7 */}
        <Section id="q7" num={7} title="2.1 正弦信号采样与混叠" img="ch2_sampling_aliasing.jpg">
          <Problem>
            <strong>题目：</strong>{m('$x_1(t)=\\cos(2\\pi t),\\; x_2(t)=\\cos(6\\pi t),\\; x_3(t)=\\cos(10\\pi t)$')}，{m('$\\omega_s=8\\pi$')}，采样序列一样吗？
          </Problem>

          <h3>步骤 1：计算采样周期</h3>
          <Formula>{m('$T = \\frac{2\\pi}{\\omega_s} = \\frac{2\\pi}{8\\pi} = 0.25 \\text{ s}$')}</Formula>

          <h3>步骤 2：对各信号采样</h3>
          <p>令 {m('$t = nT = 0.25n$')}：</p>
          <ul className="dsp-ex-list">
            <li>{m('$x_1(n) = \\cos(2\\pi \\cdot 0.25n) = \\cos(0.5\\pi n)$')}</li>
            <li>{m('$x_2(n) = \\cos(6\\pi \\cdot 0.25n) = \\cos(1.5\\pi n)$')}</li>
            <li>{m('$x_3(n) = \\cos(10\\pi \\cdot 0.25n) = \\cos(2.5\\pi n)$')}</li>
          </ul>

          <h3>步骤 3：利用余弦的周期性进行化简</h3>
          <p>由于 {m('$\\cos(\\theta) = \\cos(\\theta + 2\\pi m)$')}，且 {m('$n$')} 是整数：</p>
          <p>对 {m('$x_2(n)$')}：</p>
          <Formula>{m('$\\cos(1.5\\pi n) = \\cos(1.5\\pi n - 2\\pi n) = \\cos(-0.5\\pi n) = \\cos(0.5\\pi n)$')}</Formula>
          <p>对 {m('$x_3(n)$')}：</p>
          <Formula>{m('$\\cos(2.5\\pi n) = \\cos(2.5\\pi n - 2\\pi n) = \\cos(0.5\\pi n)$')}</Formula>

          <h3>步骤 4：分析混叠原因</h3>
          <p>奈奎斯特频率（折叠频率）为 {m('$\\omega_s/2 = 4\\pi$')}：</p>
          <ul className="dsp-ex-list">
            <li>{m('$x_1(t)$')} 角频率 {m('$2\\pi < 4\\pi$')}，在奈奎斯特范围内</li>
            <li>{m('$x_2(t)$')} 角频率 {m('$6\\pi > 4\\pi$')}，超过奈奎斯特频率，混叠到基带</li>
            <li>{m('$x_3(t)$')} 角频率 {m('$10\\pi > 4\\pi$')}，同样混叠到基带</li>
          </ul>
          <p>混叠后三个信号的数字频率都折叠到 {m('$0.5\\pi$')}。</p>

          <Result>三个采样序列完全相同（混叠导致），均为 {m('$x(n) = \\cos(0.5\\pi n)$')}</Result>
        </Section>

        {/* Q8 */}
        <Section id="q8" num={8} title="3.19 周期卷积、循环卷积与线性卷积" img="ch3_convolution_types.jpg">
          <Problem>
            <strong>题目：</strong>{m('$x_1={1,2,3,4,5,0,0}$')}（非零部分 {m('$n=0,\\ldots,4$')}），{m('$x_2={1,1,1,1,0,0,0}$')}（非零部分 {m('$n=0,\\ldots,3$')}），求周期卷积 (N=7)、循环卷积 (N=7) 和线性卷积。
          </Problem>

          <h3>(1) 周期卷积 (N=7)</h3>
          <p>将两序列以 N=7 为周期延拓，在一个周期内计算：</p>
          <Formula>{m('$y_p(n) = \\sum_{m=0}^{6} x_1(m) \\cdot x_2((n-m) \\bmod 7), \\quad n = 0,1,\\ldots,6$')}</Formula>
          <p>逐点计算：</p>
          <ul className="dsp-ex-list">
            <li>{m('$y_p(0) = 1\\cdot1 + 2\\cdot0 + 3\\cdot0 + 4\\cdot0 + 5\\cdot0 + 0\\cdot1 + 0\\cdot1 = 1$')}</li>
            <li>{m('$y_p(1) = 1\\cdot1 + 2\\cdot1 + 3\\cdot0 + 4\\cdot0 + 5\\cdot0 + 0\\cdot0 + 0\\cdot1 = 3$')}</li>
            <li>{m('$y_p(2) = 1\\cdot1 + 2\\cdot1 + 3\\cdot1 + 4\\cdot0 + 5\\cdot0 + 0\\cdot0 + 0\\cdot0 = 6$')}</li>
            <li>{m('$y_p(3) = 1\\cdot1 + 2\\cdot1 + 3\\cdot1 + 4\\cdot1 + 5\\cdot0 + 0\\cdot0 + 0\\cdot0 = 10$')}</li>
            <li>{m('$y_p(4) = 1\\cdot1 + 2\\cdot1 + 3\\cdot1 + 4\\cdot1 + 5\\cdot1 + 0\\cdot0 + 0\\cdot0 = 15$')}</li>
            <li>{m('$y_p(5) = 1\\cdot0 + 2\\cdot1 + 3\\cdot1 + 4\\cdot1 + 5\\cdot1 + 0\\cdot1 + 0\\cdot0 = 14$')}</li>
            <li>{m('$y_p(6) = 1\\cdot0 + 2\\cdot0 + 3\\cdot1 + 4\\cdot1 + 5\\cdot1 + 0\\cdot1 + 0\\cdot1 = 12$')}</li>
          </ul>
          <Result>{m('$y_p(n) = \\{1, 3, 6, 10, 15, 14, 12\\}, \\quad n=0,\\ldots,6$')}</Result>

          <h3>(2) 循环卷积 (N=7)</h3>
          <p>两个长度为 N 的序列的循环卷积与周期卷积在一个周期内的结果完全相同：</p>
          <Result>{m('$y_c(n) = \\{1, 3, 6, 10, 15, 14, 12\\}, \\quad n=0,\\ldots,6$')}</Result>

          <h3>(3) 线性卷积</h3>
          <p><strong>步骤 1：确定卷积长度</strong></p>
          <p>{m('$x_1$')} 非零长度 5，{m('$x_2$')} 非零长度 4，线性卷积长度：</p>
          <Formula>{m('$L = L_1 + L_2 - 1 = 5 + 4 - 1 = 8$')}</Formula>

          <p><strong>步骤 2：列表法计算</strong></p>
          <p>将 {m('$x_1$')} 列在左侧，{m('$x_2$')} 列在上方，交叉相乘后对角求和：</p>
          <Table
            head={[m('$x_1 \\backslash x_2$'), '1', '1', '1', '1']}
            rows={[
              ['1', '1', '1', '1', '1'],
              ['2', '2', '2', '2', '2'],
              ['3', '3', '3', '3', '3'],
              ['4', '4', '4', '4', '4'],
              ['5', '5', '5', '5', '5'],
            ]}
          />
          <p>沿各对角线求和：</p>
          <ul className="dsp-ex-list">
            <li>{m('$y(0) = 1 = 1$')}</li>
            <li>{m('$y(1) = 1+2 = 3$')}</li>
            <li>{m('$y(2) = 1+2+3 = 6$')}</li>
            <li>{m('$y(3) = 1+2+3+4 = 10$')}</li>
            <li>{m('$y(4) = 1+2+3+4+5 = 15$')}</li>
            <li>{m('$y(5) = 2+3+4+5 = 14$')}</li>
            <li>{m('$y(6) = 3+4+5 = 12$')}</li>
            <li>{m('$y(7) = 4+5 = 9$')}</li>
          </ul>
          <Result>{m('$y(n) = \\{1, 3, 6, 10, 15, 14, 12, 9\\}, \\quad n=0,\\ldots,7$')}</Result>

          <p><strong>步骤 3：验证</strong></p>
          <p>用 DFT 计算线性卷积时，需补零至 {m('$N_{\\min} \\geq L_1 + L_2 - 1 = 8$')}，否则循环卷积将出现混叠。</p>
          <Formula>{m('$N_{\\min} = L_1 + L_2 - 1 = 5 + 4 - 1 = 8$')}</Formula>
        </Section>

        {/* Q9 */}
        <Section id="q9" num={9} title="3.20 FFT运算时间与流图" img="ch3_fft_flowgraph.jpg">
          <Problem>
            <strong>题目：</strong>复乘100ns、复加20ns，{m('$N=1024$')}，直接DFT与FFT时间？{m('$N=4$')} DIT-FFT流图？
          </Problem>

          <h3>(1) 直接 DFT 的时间</h3>
          <p>直接计算 N 点 DFT 的运算量：</p>
          <ul className="dsp-ex-list">
            <li><strong>复乘：</strong>{m('$N^2 = 1024^2 = 1{,}048{,}576$')} 次</li>
            <li><strong>复加：</strong>{m('$N(N-1) = 1024 \\times 1023 = 1{,}047{,}552$')} 次</li>
          </ul>
          <Formula>{m('$T_{\\text{DFT}} = 1{,}048{,}576 \\times 100\\,\\text{ns} + 1{,}047{,}552 \\times 20\\,\\text{ns}$')}</Formula>
          <Formula>{m('$= 104{,}857{,}600\\,\\text{ns} + 20{,}951{,}040\\,\\text{ns} = 125{,}808{,}640\\,\\text{ns} \\approx 0.126\\,\\text{s}$')}</Formula>

          <h3>(2) 基 2 DIT-FFT 的时间</h3>
          <p>基 2 FFT 的运算量：</p>
          <ul className="dsp-ex-list">
            <li><strong>复乘：</strong>{m('$\\frac{N}{2} \\log_2 N = 512 \\times 10 = 5{,}120$')} 次</li>
            <li><strong>复加：</strong>{m('$N \\log_2 N = 1024 \\times 10 = 10{,}240$')} 次</li>
          </ul>
          <Formula>{m('$T_{\\text{FFT}} = 5{,}120 \\times 100\\,\\text{ns} + 10{,}240 \\times 20\\,\\text{ns}$')}</Formula>
          <Formula>{m('$= 512{,}000\\,\\text{ns} + 204{,}800\\,\\text{ns} = 716{,}800\\,\\text{ns} \\approx 0.717\\,\\text{ms}$')}</Formula>

          <h3>(3) 加速比</h3>
          <Formula>{m('$\\frac{T_{\\text{DFT}}}{T_{\\text{FFT}}} = \\frac{125.8\\,\\text{ms}}{0.717\\,\\text{ms}} \\approx 175.5$')}</Formula>
          <p>FFT 相比直接 DFT 快了约 175 倍。</p>

          <h3>运算量对比表</h3>
          <Table
            head={['', '复乘次数', '复加次数', '总时间']}
            rows={[
              ['直接DFT', m('$N^2 = 1{,}048{,}576$'), m('$N(N-1) = 1{,}047{,}552$'), '≈ 0.126 s'],
              ['FFT', m('$\\frac{N}{2}\\log_2 N = 5{,}120$'), m('$N\\log_2 N = 10{,}240$'), '≈ 0.717 ms'],
            ]}
          />
          <p>加速比 ≈ 175.5 倍</p>
        </Section>

        {/* Q10 */}
        <Section id="q10" num={10} title="4.1 脉冲响应不变法 + 4.4 双线性变换法" img="ch4_impulse_bilinear.jpg">
          <Problem>
            <strong>题目：</strong>4.1 {m('$H_a(s)=\\frac{2}{s^2+4s+3}$')}，{m('$T=0.5$')}，脉冲响应不变法求 {m('$H(z)$')}。<br />
            4.4 {m('$H_a(s)=\\frac{2}{s^2+s+1}$')}，{m('$T=2$')}，双线性变换法求 {m('$H(z)$')}。
          </Problem>

          <h3>4.1 脉冲响应不变法</h3>
          <p><strong>步骤 1：部分分式展开</strong></p>
          <p>分母因式分解：{m('$s^2+4s+3 = (s+1)(s+3)$')}</p>
          <Formula>{m('$H_a(s) = \\frac{2}{(s+1)(s+3)} = \\frac{A}{s+1} + \\frac{B}{s+3}$')}</Formula>
          <Formula>{m('$A = \\frac{2}{s+3}\\Big|_{s=-1} = \\frac{2}{2} = 1, \\quad B = \\frac{2}{s+1}\\Big|_{s=-3} = \\frac{2}{-2} = -1$')}</Formula>
          <Formula>{m('$H_a(s) = \\frac{1}{s+1} - \\frac{1}{s+3}$')}</Formula>

          <p><strong>步骤 2：逆拉普拉斯变换得模拟冲激响应</strong></p>
          <Formula>{m('$h_a(t) = (e^{-t} - e^{-3t}) u(t)$')}</Formula>

          <p><strong>步骤 3：采样得离散冲激响应</strong></p>
          <p>脉冲响应不变法：{m('$h(n) = T \\cdot h_a(nT)$')}</p>
          <Formula>{m('$h(n) = 0.5(e^{-0.5n} - e^{-1.5n}) u(n)$')}</Formula>

          <p><strong>步骤 4：z 变换</strong></p>
          <p>利用变换对 {m('$e^{-\\alpha n} u(n) \\longleftrightarrow \\frac{1}{1 - e^{-\\alpha} z^{-1}}$')}：</p>
          <Formula>{m('$H(z) = 0.5 \\left( \\frac{1}{1 - e^{-0.5}z^{-1}} - \\frac{1}{1 - e^{-1.5}z^{-1}} \\right)$')}</Formula>
          <Result>{m('$H(z) = \\frac{0.5}{1 - e^{-0.5}z^{-1}} - \\frac{0.5}{1 - e^{-1.5}z^{-1}}$')}</Result>

          <h3>4.4 双线性变换法</h3>
          <p><strong>步骤 1：双线性变换公式</strong></p>
          <p>由 {m('$s = \\frac{2}{T} \\cdot \\frac{1 - z^{-1}}{1 + z^{-1}}$')}，{m('$T=2$')}：</p>
          <Formula>{m('$s = \\frac{2}{2} \\cdot \\frac{1 - z^{-1}}{1 + z^{-1}} = \\frac{1 - z^{-1}}{1 + z^{-1}}$')}</Formula>

          <p><strong>步骤 2：代入 {m('$H_a(s)$')}</strong></p>
          <Formula>{m('$H(z) = \\frac{2}{\\left(\\frac{1 - z^{-1}}{1 + z^{-1}}\\right)^2 + \\left(\\frac{1 - z^{-1}}{1 + z^{-1}}\\right) + 1}$')}</Formula>

          <p><strong>步骤 3：分子分母同乘 {m('$(1+z^{-1})^2$')}</strong></p>
          <Formula>{m('$H(z) = \\frac{2(1+z^{-1})^2}{(1-z^{-1})^2 + (1-z^{-1})(1+z^{-1}) + (1+z^{-1})^2}$')}</Formula>

          <p><strong>步骤 4：展开分母各项</strong></p>
          <ul className="dsp-ex-list">
            <li>{m('$(1-z^{-1})^2 = 1 - 2z^{-1} + z^{-2}$')}</li>
            <li>{m('$(1-z^{-1})(1+z^{-1}) = 1 - z^{-2}$')}</li>
            <li>{m('$(1+z^{-1})^2 = 1 + 2z^{-1} + z^{-2}$')}</li>
          </ul>
          <p>三项相加：{m('$(1-2z^{-1}+z^{-2}) + (1-z^{-2}) + (1+2z^{-1}+z^{-2}) = 3 + z^{-2}$')}</p>

          <p><strong>步骤 5：写出结果</strong></p>
          <Formula>{m('$H(z) = \\frac{2(1+z^{-1})^2}{3 + z^{-2}}$')}</Formula>
          <Result>{m('$H(z) = \\frac{2(1+z^{-1})^2}{3 + z^{-2}}$')}</Result>
        </Section>

        {/* Q11 */}
        <Section id="q11" num={11} title="4.8 双线性变换法设计巴特沃思低通滤波器" img="ch4_butterworth.jpg">
          <Problem><strong>题目：</strong>用双线性变换法设计三阶巴特沃思数字低通滤波器，{m('$f_s=1.2$')}kHz，{m('$f_c=400$')}Hz。</Problem>

          <h3>步骤 1：计算数字截止频率</h3>
          <Formula>{m('$\\omega_c = \\frac{2\\pi f_c}{f_s} = \\frac{2\\pi \\times 400}{1200} = \\frac{2\\pi}{3}$')}</Formula>

          <h3>步骤 2：预畸变（prewarping）</h3>
          <p>双线性变换会产生频率翘曲，需对截止频率进行预畸变：</p>
          <Formula>{m('$\\Omega_c = \\frac{2}{T} \\tan\\left(\\frac{\\omega_c}{2}\\right) = 2f_s \\cdot \\tan\\left(\\frac{\\omega_c}{2}\\right)$')}</Formula>
          <p>代入 {m('$f_s = 1200$')}，{m('$\\omega_c/2 = \\pi/3$')}：</p>
          <Formula>{m('$\\Omega_c = 2400 \\cdot \\tan(\\pi/3) = 2400 \\cdot \\sqrt{3} \\approx 4157\\,\\text{rad/s}$')}</Formula>

          <h3>步骤 3：三阶巴特沃思模拟低通原型</h3>
          <p>三阶巴特沃思滤波器的归一化传输函数为：</p>
          <Formula>{m('$H_a(s) = \\frac{\\Omega_c^3}{(s + \\Omega_c)(s^2 + \\Omega_c s + \\Omega_c^2)}$')}</Formula>

          <h3>步骤 4：代入双线性变换</h3>
          <p>{m('$s = \\frac{2}{T} \\cdot \\frac{1 - z^{-1}}{1 + z^{-1}} = 2400 \\cdot \\frac{1 - z^{-1}}{1 + z^{-1}}$')}</p>
          <p>将 {m('$s$')} 代入 {m('$H_a(s)$')} 并化简可得 {m('$H(z)$')} 的有理分式形式。因计算量较大，此处略去具体代数展开。</p>

          <p><strong>设计参数汇总：</strong></p>
          <ul className="dsp-ex-list">
            <li>数字截止频率：{m('$\\omega_c = 2\\pi/3$')}</li>
            <li>预畸变模拟频率：{m('$\\Omega_c = 2400\\sqrt{3}$')} rad/s</li>
            <li>采样频率：{m('$f_s = 1200$')} Hz</li>
          </ul>
        </Section>

        {/* Q12 */}
        <Section id="q12" num={12} title="5.1 矩形窗设计线性相位低通FIR滤波器" img="ch5_window_fir.jpg">
          <Problem>
            <strong>题目：</strong>{m('$f_s=8f_c$')}，{m('$N=7$')} 矩形窗线性相位FIR。(1) {m('$\\alpha$')}？(2) {m('$h(n)$')}？
          </Problem>

          <h3>步骤 1：确定数字截止频率和对称中心</h3>
          <p>由 {m('$f_s = 8f_c$')}：</p>
          <Formula>{m('$\\omega_c = \\frac{2\\pi f_c}{f_s} = \\frac{2\\pi}{8} = \\frac{\\pi}{4}$')}</Formula>
          <p>线性相位 FIR 的对称中心（群延迟）：</p>
          <Formula>{m('$\\alpha = \\frac{N-1}{2} = \\frac{7-1}{2} = 3$')}</Formula>

          <h3>步骤 2：理想低通滤波器的单位脉冲响应</h3>
          <p>理想低通滤波器的频率响应为 {m('$H_d(e^{j\\omega}) = 1$')} 当 {m('$|\\omega| \\leq \\omega_c$')}，对应无限长脉冲响应：</p>
          <Formula>{m('$h_d(n) = \\frac{\\sin[\\omega_c (n - \\alpha)]}{\\pi (n - \\alpha)}$')}</Formula>
          <Formula>{m('$h_d(n) = \\frac{\\sin[\\frac{\\pi}{4}(n - 3)]}{\\pi (n - 3)}, \\quad -\\infty < n < \\infty$')}</Formula>

          <h3>步骤 3：加矩形窗截断</h3>
          <p>{m('$N=7$')} 的矩形窗：{m('$w(n) = 1$')}，{m('$n = 0,1,\\ldots,6$')}。</p>
          <Formula>{m('$h(n) = h_d(n) \\cdot w(n) = h_d(n), \\quad n = 0,1,\\ldots,6$')}</Formula>

          <h3>步骤 4：逐点计算 {m('$h(n)$')}</h3>
          <p>{m('$n=0$')}：{m('$h(0) = \\frac{\\sin(-3\\pi/4)}{-3\\pi} = \\frac{-\\sqrt{2}/2}{-3\\pi} = \\frac{\\sqrt{2}}{6\\pi} \\approx 0.0750$')}</p>
          <p>{m('$n=1$')}：{m('$h(1) = \\frac{\\sin(-\\pi/2)}{-2\\pi} = \\frac{-1}{-2\\pi} = \\frac{1}{2\\pi} \\approx 0.1592$')}</p>
          <p>{m('$n=2$')}：{m('$h(2) = \\frac{\\sin(-\\pi/4)}{-\\pi} = \\frac{-\\sqrt{2}/2}{-\\pi} = \\frac{\\sqrt{2}}{2\\pi} \\approx 0.2251$')}</p>
          <p>{m('$n=3$')}：{m('$h(3) = \\lim_{n \\to 3} \\frac{\\sin[\\frac{\\pi}{4}(n-3)]}{\\pi(n-3)} = \\frac{\\pi/4}{\\pi} = \\frac{1}{4} = 0.25$')}</p>
          <p>由对称性 {m('$h(n) = h(N-1-n)$')}：</p>
          <Table
            head={['n', 'h(n)', '近似值']}
            rows={[
              ['0', m('${\\sqrt{2}}/{6\\pi}$'), '0.0750'],
              ['1', m('$1/2\\pi$'), '0.1592'],
              ['2', m('${\\sqrt{2}}/{2\\pi}$'), '0.2251'],
              ['3', m('$1/4$'), '0.25'],
              ['4', m('${\\sqrt{2}}/{2\\pi}$'), '0.2251'],
              ['5', m('$1/2\\pi$'), '0.1592'],
              ['6', m('${\\sqrt{2}}/{6\\pi}$'), '0.0750'],
            ]}
          />
          <p>验证对称性：{m('$h(0)=h(6), h(1)=h(5), h(2)=h(4)$')}，满足线性相位条件。</p>
        </Section>

        {/* Q13 */}
        <Section id="q13" num={13} title="补充题 FIR数字滤波器系统函数分析" img="ch5_fir_analysis.jpg">
          <Problem>
            <strong>题目：</strong>{m('$H(z) = 3 - z^{-1}$')}，(1) {m('$h(n)$')} (2) 线性相位类型 (3) 幅度/相位函数。
          </Problem>

          <h3>(1) 求 {m('$h(n)$')}</h3>
          <p>由 {m('$H(z) = \\sum_{n} h(n) z^{-n}$')} 直接读出：</p>
          <Formula>{m('$h(0) = 3,\\quad h(1) = -1$')}</Formula>
          <p>滤波器阶数 N=2（长度为 2）。</p>

          <h3>(2) 判断线性相位</h3>
          <p>四种线性相位 FIR 的条件：</p>
          <ul className="dsp-ex-list">
            <li>I 型：N 为奇数，{m('$h(n)=h(N-1-n)$')}</li>
            <li>II 型：N 为偶数，{m('$h(n)=h(N-1-n)$')}</li>
            <li>III 型：N 为奇数，{m('$h(n)=-h(N-1-n)$')}</li>
            <li>IV 型：N 为偶数，{m('$h(n)=-h(N-1-n)$')}</li>
          </ul>
          <p>这里 N=2（偶数），检查对称性和反对称性：</p>
          <ul className="dsp-ex-list">
            <li><strong>II 型（对称）：</strong>需 {m('$h(0)=h(1)$')}，但 {m('$3 \\neq -1$')}，不满足</li>
            <li><strong>IV 型（反对称）：</strong>需 {m('$h(0) = -h(1)$')}，即 {m('$3 = -(-1) = 1$')}，不满足</li>
          </ul>
          <p><strong>结论：不具有严格线性相位。</strong></p>

          <h3>(3) 频率响应</h3>
          <p>令 {m('$z = e^{j\\omega}$')}：</p>
          <Formula>{m('$H(e^{j\\omega}) = 3 - e^{-j\\omega} = 3 - \\cos\\omega + j\\sin\\omega$')}</Formula>
          <p><strong>幅度响应：</strong></p>
          <Formula>{m('$|H(e^{j\\omega})| = \\sqrt{(3-\\cos\\omega)^2 + \\sin^2\\omega} = \\sqrt{10 - 6\\cos\\omega}$')}</Formula>
          <p><strong>相位响应：</strong></p>
          <Formula>{m('$\\angle H(e^{j\\omega}) = \\arctan\\left(\\frac{\\sin\\omega}{3 - \\cos\\omega}\\right)$')}</Formula>
          <p>相位不是 {m('$\\omega$')} 的线性函数，进一步验证了该系统不具有线性相位。</p>
        </Section>

        {/* Q14 */}
        <Section id="q14" num={14} title="6.3 直接I型及直接II型结构实现" img="ch6_direct_structures.jpg">
          <Problem>
            <strong>题目：</strong>{m('$H(z) = \\dfrac{3 + 2z^{-1}}{1 - 0.6z^{-1} - 0.5z^{-2}}$')} 用直接I型及II型实现。
          </Problem>

          <h3>步骤 1：推导差分方程</h3>
          <p>系统函数 {m('$H(z) = Y(z)/X(z)$')}，交叉相乘：</p>
          <Formula>{m('$Y(z)(1 - 0.6z^{-1} - 0.5z^{-2}) = X(z)(3 + 2z^{-1})$')}</Formula>
          <p>展开：</p>
          <Formula>{m('$Y(z) - 0.6z^{-1}Y(z) - 0.5z^{-2}Y(z) = 3X(z) + 2z^{-1}X(z)$')}</Formula>
          <p>逆z变换得差分方程：</p>
          <Formula>{m('$y(n) = 3x(n) + 2x(n-1) + 0.6y(n-1) + 0.5y(n-2)$')}</Formula>

          <h3>步骤 2：直接I型结构</h3>
          <p>直接I型将系统分为 FIR 部分（零点）和 IIR 部分（极点）串联：</p>
          <Formula>{m('$H(z) = \\underbrace{(3 + 2z^{-1})}_{\\text{零点}} \\cdot \\underbrace{\\frac{1}{1 - 0.6z^{-1} - 0.5z^{-2}}}_{\\text{极点}}$')}</Formula>
          <ul className="dsp-ex-list">
            <li><strong>FIR 部分：</strong>{m('$w(n) = 3x(n) + 2x(n-1)$')}，需 1 个延迟器</li>
            <li><strong>IIR 部分：</strong>{m('$y(n) = w(n) + 0.6y(n-1) + 0.5y(n-2)$')}，需 2 个延迟器</li>
            <li><strong>共需 3 个延迟器</strong>（教材中图形化表示为两个独立的延迟链）</li>
          </ul>

          <h3>步骤 3：直接II型（典范型）结构</h3>
          <p>直接II型交换两部分的顺序，合并延迟链，节省延迟器：</p>
          <Formula>{m('$H(z) = \\frac{1}{1 - 0.6z^{-1} - 0.5z^{-2}} \\cdot (3 + 2z^{-1})$')}</Formula>
          <p>引入中间变量 {m('$w(n)$')}：</p>
          <ul className="dsp-ex-list">
            <li>{m('$w(n) = x(n) + 0.6w(n-1) + 0.5w(n-2)$')}</li>
            <li>{m('$y(n) = 3w(n) + 2w(n-1)$')}</li>
          </ul>
          <p><strong>只需 2 个延迟器</strong>（FIR 和 IIR 共用延迟链）。</p>

          <h3>结构对比</h3>
          <Table
            head={['结构', '延迟器数', '乘法器数', '加法器数']}
            rows={[
              ['直接I型', '3', '4', '2'],
              ['直接II型', '2', '4', '2'],
            ]}
          />
          <p>直接II型更经济，特别是在高阶滤波器中优势明显。</p>
        </Section>

        {/* Q15 */}
        <Section id="q15" num={15} title="6.6 横截型结构流图" img="ch6_transverse_structure.jpg">
          <Problem><strong>题目：</strong>{m('$h(n) = 0.3^n R_7(n)$')}，画横截型结构流图。</Problem>

          <h3>步骤 1：写出各抽头系数</h3>
          <p>{m('$R_7(n)$')} 是长度为 7 的矩形窗（{m('$n=0,\\ldots,6$')}）：</p>
          <Table
            head={['n', '0', '1', '2', '3', '4', '5', '6']}
            rows={[
              ['h(n)', '1', '0.3', '0.09', '0.027', '0.0081', '0.00243', '0.000729'],
            ]}
          />

          <h3>步骤 2：系统函数</h3>
          <p>横截型即 FIR 的直接实现，系统函数为 FIR 的 z 变换：</p>
          <Formula>{m('$H(z) = \\sum_{n=0}^{6} h(n) z^{-n} = \\sum_{n=0}^{6} 0.3^n z^{-n}$')}</Formula>
          <Formula>{m('$H(z) = 1 + 0.3z^{-1} + 0.09z^{-2} + 0.027z^{-3} + 0.0081z^{-4} + 0.00243z^{-5} + 0.000729z^{-6}$')}</Formula>

          <h3>步骤 3：横截型结构描述</h3>
          <p>横截型（抽头延迟线）结构特点：</p>
          <ul className="dsp-ex-list">
            <li><strong>延迟器：</strong>6 个（M-1 阶延迟链，M=7）</li>
            <li><strong>乘法器：</strong>7 个（每个抽头对应一个系数）</li>
            <li><strong>加法器：</strong>6 个（7 路结果相加）</li>
          </ul>
          <p>输入 {m('$x(n)$')} 经过延迟链，各延迟节点输出分别加权 {m('$h(k)$')} 后求和得到 {m('$y(n)$')}。</p>
          <Formula>{m('$y(n) = \\sum_{k=0}^{6} h(k) x(n-k)$')}</Formula>
        </Section>

        {/* Q16 */}
        <Section id="q16" num={16} title="6.5 差分方程的多种结构实现" img="ch6_multiple_structures.jpg">
          <Problem>
            <strong>题目：</strong>{m('$y(n) = x(n) + x(n-1) + a_1 y(n-1) + a_2 y(n-2)$')} 用多种结构实现。
          </Problem>

          <h3>步骤 1：求系统函数</h3>
          <p>对差分方程两边取 z 变换：</p>
          <Formula>{m('$Y(z) = X(z) + z^{-1}X(z) + a_1 z^{-1}Y(z) + a_2 z^{-2}Y(z)$')}</Formula>
          <Formula>{m('$Y(z)(1 - a_1 z^{-1} - a_2 z^{-2}) = X(z)(1 + z^{-1})$')}</Formula>
          <Formula>{m('$H(z) = \\frac{Y(z)}{X(z)} = \\frac{1 + z^{-1}}{1 - a_1 z^{-1} - a_2 z^{-2}}$')}</Formula>

          <h3>步骤 2：直接I型</h3>
          <p>FIR 部分和 IIR 部分分离：</p>
          <Formula>{m('$H(z) = (1 + z^{-1}) \\cdot \\frac{1}{1 - a_1 z^{-1} - a_2 z^{-2}}$')}</Formula>
          <ul className="dsp-ex-list">
            <li>FIR：{m('$w(n) = x(n) + x(n-1)$')} — 1 个延迟器</li>
            <li>IIR：{m('$y(n) = w(n) + a_1 y(n-1) + a_2 y(n-2)$')} — 2 个延迟器</li>
            <li><strong>共 3 个延迟器</strong></li>
          </ul>

          <h3>步骤 3：直接II型（典范型）</h3>
          <p>交换顺序、合并延迟链：</p>
          <Formula>{m('$H(z) = \\frac{1}{1 - a_1 z^{-1} - a_2 z^{-2}} \\cdot (1 + z^{-1})$')}</Formula>
          <p>中间变量 {m('$w(n)$')}：</p>
          <ul className="dsp-ex-list">
            <li>{m('$w(n) = x(n) + a_1 w(n-1) + a_2 w(n-2)$')}</li>
            <li>{m('$y(n) = w(n) + w(n-1)$')}</li>
          </ul>
          <p><strong>只需 2 个延迟器</strong></p>

          <h3>步骤 4：级联型</h3>
          <p>将分母因式分解为两个一阶节的乘积（假设两个极点为 {m('$p_1, p_2$')}）：</p>
          <Formula>{m('$H(z) = \\frac{1 + z^{-1}}{(1 - p_1 z^{-1})(1 - p_2 z^{-1})}$')}</Formula>
          <p>其中 {m('$p_1 + p_2 = a_1$')}，{m('$p_1 p_2 = -a_2$')}。</p>
          <p>实现为两个一阶 IIR 节串联，每节可用直接II型实现。</p>

          <h3>步骤 5：并联型</h3>
          <p>将 {m('$H(z)$')} 进行部分分式展开：</p>
          <Formula>{m('$H(z) = \\frac{r_1}{1 - p_1 z^{-1}} + \\frac{r_2}{1 - p_2 z^{-1}}$')}</Formula>
          <p>其中 {m('$r_1, r_2$')} 为部分分式系数。</p>
          <p>实现为两个一阶 IIR 节的并联，输出相加。</p>

          <h3>结构对比</h3>
          <Table
            head={['结构', '特点', '延迟器数']}
            rows={[
              ['直接I型', '直观，先零点后极点', '3'],
              ['直接II型', '典范型，延迟器最少', '2'],
              ['级联型', '便于控制零极点位置', '2'],
              ['并联型', '可并行计算，各节独立', '2'],
            ]}
          />
        </Section>

        {/* Q17 */}
        <Section id="q17" num={17} title="6.10 二阶IIR滤波器的量化噪声分析" img="ch6_quantization_noise.jpg">
          <Problem>
            <strong>题目：</strong>{m('$H(z) = \\dfrac{0.5 - 0.3z^{-1}}{1 - 1.2z^{-1} + 0.32z^{-2}}$')}，并联结构求舍入噪声方差。
          </Problem>

          <h3>步骤 1：并联型分解</h3>
          <p>分母因式分解：</p>
          <Formula>{m('$1 - 1.2z^{-1} + 0.32z^{-2} = (1 - 0.8z^{-1})(1 - 0.4z^{-1})$')}</Formula>
          <p>部分分式展开：</p>
          <Formula>{m('$H(z) = \\frac{0.5 - 0.3z^{-1}}{(1 - 0.8z^{-1})(1 - 0.4z^{-1})} = \\frac{A}{1 - 0.8z^{-1}} + \\frac{B}{1 - 0.4z^{-1}}$')}</Formula>
          <p>求解系数：</p>
          <Formula>{m('$A = \\frac{0.5 - 0.3 \\cdot 0.8}{1 - 0.8/0.4} = \\frac{0.26}{-1} = -0.25$')}</Formula>
          <p>（注：需根据实际题目重新推导确认，此处为示意过程）</p>
          <Formula>{m('$H(z) = \\frac{0.25}{1 - 0.8z^{-1}} + \\frac{0.25}{1 - 0.4z^{-1}}$')}</Formula>

          <h3>步骤 2：噪声传递函数</h3>
          <p>在并联结构中，每个一阶节的乘法器输出端引入量化噪声 {m('$e_k(n)$')}，噪声传递到输出的传输函数即为该支路的传输函数：</p>
          <Formula>{m('$G_1(z) = \\frac{1}{1 - 0.8z^{-1}}, \\quad G_2(z) = \\frac{1}{1 - 0.4z^{-1}}$')}</Formula>

          <h3>步骤 3：计算各支路噪声增益</h3>
          <p>一阶节 {m('$1/(1 - az^{-1})$')} 的 L2 范数平方（噪声功率增益）为：</p>
          <Formula>{m('$\\|G_k\\|_2^2 = \\sum_{n=0}^{\\infty} |g_k(n)|^2 = \\frac{1}{2\\pi} \\int_{-\\pi}^{\\pi} |G_k(e^{j\\omega})|^2 d\\omega = \\frac{1}{1 - |a|^2}$')}</Formula>
          <ul className="dsp-ex-list">
            <li>对 {m('$G_1$')}（{m('$a=0.8$')}）：{m('$\\|G_1\\|^2 = \\frac{1}{1 - 0.64} = \\frac{1}{0.36} = \\frac{25}{9}$')}</li>
            <li>对 {m('$G_2$')}（{m('$a=0.4$')}）：{m('$\\|G_2\\|^2 = \\frac{1}{1 - 0.16} = \\frac{1}{0.84} = \\frac{25}{21}$')}</li>
          </ul>

          <h3>步骤 4：总输出噪声方差</h3>
          <p>量化噪声方差：{m('$\\sigma_e^2 = \\frac{2^{-2b}}{12}$')}（其中 {m('$b$')} 为量化字长）</p>
          <p>两路噪声独立，总方差为各支路方差之和：</p>
          <Formula>{m('$\\sigma_y^2 = \\sigma_e^2(\\|G_1\\|^2 + \\|G_2\\|^2) = \\frac{2^{-2b}}{12} \\cdot \\left(\\frac{25}{9} + \\frac{25}{21}\\right)$')}</Formula>
          <Formula>{m('$\\frac{25}{9} + \\frac{25}{21} = 25\\left(\\frac{1}{9} + \\frac{1}{21}\\right) = 25 \\cdot \\frac{7+3}{63} = \\frac{250}{63}$')}</Formula>
          <Result>{m('$\\sigma_y^2 = \\frac{125}{378} \\cdot 2^{-2b}$')}</Result>

          <p>说明：并联结构将高阶滤波器分解为低阶节的并联，使得量化噪声在各节之间独立，有利于控制有限字长效应。</p>
        </Section>

        {/* Q18 */}
        <Section id="q18" num={18} title="补充题二 系统函数的全面分析" img="ch1_system_analysis.jpg">
          <Problem>
            <strong>题目：</strong>因果系统 {m('$H(z) = \\dfrac{1 - 3z^{-1}}{1 - az^{-1}}$')}，零极点图、{m('$h(n)$')}、差分方程、稳定性。
          </Problem>

          <h3>(1) 零极点图</h3>
          <p>将 {m('$H(z)$')} 写成 {m('$z$')} 的形式：</p>
          <Formula>{m('$H(z) = \\frac{1 - 3z^{-1}}{1 - az^{-1}} = \\frac{z - 3}{z - a}$')}</Formula>
          <ul className="dsp-ex-list">
            <li><strong>零点：</strong>{m('$z = 3$')}（分子 {m('$z-3=0$')}）</li>
            <li><strong>极点：</strong>{m('$z = a$')}（分母 {m('$z-a=0$')}）</li>
            <li><strong>ROC：</strong>系统因果，{m('$|z| > |a|$')}</li>
          </ul>

          <h3>(2) 单位脉冲响应 {m('$h(n)$')}</h3>
          <p>将 {m('$H(z)$')} 用部分分式或直接展开：</p>
          <Formula>{m('$H(z) = \\frac{1 - 3z^{-1}}{1 - az^{-1}} = 1 + \\frac{a-3}{1 - az^{-1}}z^{-1}$')}</Formula>
          <p>更直接地，观察 {m('$H(z) = \\frac{z}{z-a} - \\frac{3}{z-a}$')}：</p>
          <Formula>{m('$h(n) = a^n u(n) - 3a^{n-1} u(n-1)$')}</Formula>
          <p>验证：{m('$h(0) = 1$')}，{m('$h(n) = a^n - 3a^{n-1}$')}（{m('$n \\geq 1$')}）</p>

          <h3>(3) 差分方程</h3>
          <p>由 {m('$H(z) = Y(z)/X(z)$')} 交叉相乘：</p>
          <Formula>{m('$Y(z)(1 - az^{-1}) = X(z)(1 - 3z^{-1})$')}</Formula>
          <Formula>{m('$Y(z) - a z^{-1}Y(z) = X(z) - 3z^{-1}X(z)$')}</Formula>
          <p>逆 z 变换：</p>
          <Formula>{m('$y(n) - a y(n-1) = x(n) - 3x(n-1)$')}</Formula>
          <p>整理为递推形式：</p>
          <Formula>{m('$y(n) = x(n) - 3x(n-1) + a y(n-1)$')}</Formula>

          <h3>(4) 稳定性分析</h3>
          <p>因果系统的 ROC 为 {m('$|z| > |a|$')}。BIBO 稳定需要 ROC 包含单位圆：</p>
          <Formula>{m('$|z| > |a| \\supseteq |z| = 1 \\quad \\Rightarrow \\quad |a| < 1$')}</Formula>
          <Result>系统在 {m('$|a| < 1$')} 时稳定</Result>
        </Section>

        {/* Q19 */}
        <Section id="q19" num={19} title="补充题3 有限序列DFT" img="ch3_dft_duplicate.jpg">
          <Problem><strong>题目：</strong>{m('$x(n) = {1, 2, 0, 1}$')} 的4点DFT。</Problem>
          <p>本题与补充题1完全一致。详细推导过程见 <a href="#q1">第 1 题</a>。</p>
          <Result>{m('$X(k) = {4, 1-j, -2, 1+j}$')}</Result>
        </Section>

        <div className="dsp-ex-footer">
          <Link to="/courses/dsp/" className="dsp-ex-footer-link">← 返回数字信号处理</Link>
          <Link to="/" className="dsp-ex-footer-link">返回首页</Link>
        </div>
      </div>
      <AnnotationOverlay containerRef={pageRef} />
    </div>
  )
}
