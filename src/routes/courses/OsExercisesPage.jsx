import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import '../../styles/courses/os-exercises.css'

const SECTIONS = [
  { id: 'ex1', title: '习题 1 — 操作系统概述', icon: '🖥️' },
  { id: 'ex2', title: '习题 2 — 进程管理', icon: '⚙️' },
  { id: 'ex3', title: '习题 3 — 存储管理', icon: '💾' },
  { id: 'ex4', title: '习题 4 — 设备管理', icon: '💿' },
  { id: 'ex5', title: '习题 5 — 文件管理', icon: '📁' },
]

function Answer({ children }) {
  return <div className="os-ex-answer">{children}</div>
}

function Code({ children }) {
  return <pre className="os-ex-code">{children}</pre>
}

function Table({ head, body }) {
  return (
    <div className="os-ex-tbl">
      <table>
        {head && <thead><tr>{head.map((h,i) => <th key={i}>{h}</th>)}</tr></thead>}
        <tbody>{body.map((row,ri) => <tr key={ri}>{row.map((c,ci) => <td key={ci}>{c}</td>)}</tr>)}</tbody>
      </table>
    </div>
  )
}

function Q({ id, children }) {
  return <div id={id} className="os-ex-q">{children}</div>
}

function Opts({ items, answer }) {
  return (
    <div className="os-ex-opts">
      {items.map((o, i) => (
        <span key={i} className={`os-ex-opt${i === answer ? ' os-ex-correct' : ''}`}>{o}</span>
      ))}
    </div>
  )
}

export default function OsExercisesPage() {
  useEffect(() => { document.title = '操作系统习题解答 - 期末复习' }, [])
  const [sbOpen, setSbOpen] = useState(true)

  return (
    <div className="os-ex-page">
      <div className="os-ex-nav">
        <Link to="/courses/os/" className="os-ex-back">← 返回操作系统笔记</Link>
        <Link to="/" className="os-ex-back">← 返回首页</Link>
      </div>

      <div className="os-ex-container">
        <header className="os-ex-header">
          <h1>🖥️ 操作系统习题解答</h1>
          <p className="os-ex-subtitle">基于《操作系统习题》文档（共 5 套习题）</p>
        </header>

        <div className="os-ex-layout">
          <button className="os-ex-sb-toggle" onClick={() => setSbOpen(o => !o)} title="切换侧边栏">
            {sbOpen ? '◀' : '▶'}
          </button>

          {/* Sidebar */}
          <aside className={`os-ex-sidebar${sbOpen ? '' : ' os-ex-sidebar-hide'}`}>
            <div className="os-ex-sb-title">📋 习题导航</div>
            <nav className="os-ex-sb-nav">
              {SECTIONS.map(s => (
                <a key={s.id} href={`#${s.id}`} className="os-ex-sb-item">
                  <span className="os-ex-sb-icon">{s.icon}</span>
                  <span>{s.title}</span>
                </a>
              ))}
            </nav>
            <div className="os-ex-sb-back">
              <Link to="/courses/os/" className="os-ex-sb-link">← 操作系统笔记</Link>
              <Link to="/" className="os-ex-sb-link">← 首页</Link>
            </div>
          </aside>

          {/* Main content */}
          <main className="os-ex-main">

        {/* =========================== 习题 1 =========================== */}
        <section id="ex1" className="os-ex-section">
          <h2><span className="os-ex-num">一</span>习题 1 — 操作系统概述</h2>

          <div className="os-ex-group">
            <h3>1. 选择题</h3>

            <Q id="ex1-1"><b>（1）</b>作为资源管理者，操作系统负责管理和控制计算机系统的（  B  ）。<br/>A. 软件资源  B. 硬件和软件资源  C. 用户所用资源  D. 硬件资源</Q>
            <Answer>B.操作系统管理所有硬件（CPU、内存、设备等）和软件（文件、进程等）资源。</Answer>

            <Q id="ex1-2"><b>（2）</b>在计算机系统中，操作系统是一种（  B  ）。<br/>A. 应用软件  B. 系统软件  C. 用户软件  D. 支撑软件</Q>
            <Answer>B.操作系统是核心系统软件。</Answer>

            <Q id="ex1-3"><b>（3）</b>计算机系统中两个或多个事件在同一时刻发生指的是（  A  ）。<br/>A. 并行性  B. 并发性  C. 串行性  D. 多发性</Q>
            <Answer>A.并行 = 同一时刻；并发 = 同一时间间隔内交替执行。</Answer>

            <Q id="ex1-4"><b>（4）</b>以下不属于现代操作系统主要特性的是（  A  ）。<br/>A. 实时性  B. 虚拟性  C. 并发性  D. 不确定性</Q>
            <Answer>A.四大特性：并发、共享、虚拟、异步（不确定性）。实时性不是所有 OS 的特性。</Answer>

            <Q id="ex1-5"><b>（5）</b>下列关于多道程序设计技术的说法中，错误的是（  B  ）。<br/>A. 需要中断技术支持  B. 在某时间点 CPU 可由多个进程共享使用<br/>C. 在某时间点内存可由多个进程共享使用  D. 可以提高 CPU 利用率</Q>
            <Answer>B.单核 CPU 在某时间点只能运行一个进程，是交替执行（并发），不是并行。</Answer>

            <Q id="ex1-6"><b>（6）</b>允许在一台主机上同时联接多台终端，且多个用户通过各自终端交互使用计算机的操作系统是（  C  ）。<br/>A. 网络OS  B. 分布式OS  C. 分时OS  D. 实时OS</Q>
            <Answer>C.分时操作系统通过时间片轮转，让多个用户共享主机资源。</Answer>

            <Q id="ex1-7"><b>（7）</b>设计多道批处理系统时，首先要考虑的是（  C  ）。<br/>A. 灵活性和可适应性  B. 交互性和响应时间  C. 系统效率和吞吐量  D. 实时性和可靠性</Q>
            <Answer>C.批处理系统追求高吞吐量和高效率，不强调交互性。</Answer>
          </div>

          <div className="os-ex-group">
            <h3>2. 填空题</h3>

            <Q id="ex1-8"><b>（1）</b>Linus Torvalds 因成功开发 <strong>Linux</strong> 操作系统内核，获得 2014 年计算机先驱奖。</Q>
            <Q id="ex1-9"><b>（2）</b>用户和操作系统之间的接口主要分为 <strong>命令</strong> 界面、<strong>系统调用</strong> 接口和图形化界面。</Q>
            <Q id="ex1-10"><b>（3）</b>现代操作系统的四大主要管理模块是指 <strong>处理器管理</strong>、<strong>存储器管理</strong>、<strong>设备管理</strong> 和 <strong>文件管理</strong>。</Q>
            <Q id="ex1-11"><b>（4）</b>吞吐量是指系统在一段时间内的 <strong>作业处理</strong> 能力。</Q>
          </div>

          <div className="os-ex-group">
            <h3>3. 简答题</h3>

            <Q id="ex1-12"><b>（1）</b>现代操作系统一般要满足哪些主要的设计目标？</Q>
            <Answer>
              <ol>
                <li><strong>方便性：</strong>提供用户接口，方便使用计算机。</li>
                <li><strong>有效性：</strong>提高系统资源利用率和吞吐量。</li>
                <li><strong>可扩展性：</strong>方便增加新功能。</li>
                <li><strong>开放性：</strong>遵循标准，便于互操作。</li>
              </ol>
            </Answer>

            <Q id="ex1-13"><b>（2）</b>操作系统的作用可从哪些方面来理解？</Q>
            <Answer>
              <ol>
                <li><strong>用户与计算机的接口：</strong>用户通过 OS 使用计算机。</li>
                <li><strong>资源管理者：</strong>管理和分配硬件/软件资源。</li>
                <li><strong>扩充机/虚拟机：</strong>在裸机上扩展功能，提供虚拟环境。</li>
              </ol>
            </Answer>

            <Q id="ex1-14"><b>（3）</b>请描述现代操作系统的定义和主要特性。</Q>
            <Answer>
              <strong>定义：</strong>操作系统是管理计算机硬件和软件资源、控制程序运行、改善人机界面、合理组织计算机工作流程并为用户提供良好运行环境的系统软件。<br/>
              <strong>四大特性：</strong>
              <ol>
                <li><strong>并发性：</strong>多个程序同时在系统中执行。</li>
                <li><strong>共享性：</strong>资源可被多个进程共同使用。</li>
                <li><strong>虚拟性：</strong>将物理实体映射为多个虚拟实体。</li>
                <li><strong>异步性（不确定性）：</strong>进程执行进度不可预知。</li>
              </ol>
            </Answer>

            <Q id="ex1-15"><b>（4）</b>分别叙述批处理、分时、实时操作系统的基本特点。</Q>
            <Answer>
              <ul>
                <li><strong>批处理：</strong>批量处理作业，追求高吞吐量，无交互。</li>
                <li><strong>分时：</strong>时间片轮转，多用户交互，响应及时。</li>
                <li><strong>实时：</strong>响应时间严格受限（毫秒级），用于控制领域。</li>
              </ul>
            </Answer>

            <Q id="ex1-16"><b>（5）</b>如何理解"内存中的多个程序执行过程交织在一起，各个进程都在走走停停"？</Q>
            <Answer>这是多道程序设计的并发执行现象。单核 CPU 在多个进程间快速切换，任一时刻只有一个进程在运行，但由于切换速度极快，宏观上看所有进程都在"同时"推进。当某个进程等待 I/O 时，CPU 立即切换执行另一个进程，从而实现 CPU 与 I/O 并行工作，提高资源利用率。</Answer>
          </div>

          <div className="os-ex-group">
            <h3>4. 解答题</h3>

            <Q id="ex1-17"><b>程序 A：</b>计算50ms → 打印100ms → 计算50ms → 打印100ms → 结束<br/><b>程序 B：</b>计算50ms → 输入80ms → 计算100ms → 结束<br/><em>输入机和打印机各一台，程序 A 先开始运行。</em></Q>
            <Answer>
              <p><strong>时间线分析（单 CPU，非抢占，多道程序）：</strong></p>
              <Table head={['时间(ms)', 'A 状态', 'B 状态', 'CPU 使用', '打印机', '输入机']} body={[
                ['0~50', '计算', '—', 'A', '空', '空'],
                ['50~100', '打印', '计算', 'B', 'A', '空'],
                ['100~150', '打印', '输入', '空', 'A', 'B'],
                ['150~200', '计算', '输入', 'A', '空', 'B'],
                ['200~300', '打印', '计算', 'B', 'A', '空'],
              ]} />
              <p><strong>说明：</strong></p>
              <ul>
                <li>0~50ms：A 第一次计算，占 CPU。</li>
                <li>50ms：A 请求打印 → 阻塞等待 I/O（打印机），CPU 空闲。B 开始第一次计算。</li>
                <li>100ms：B 第一次计算结束，请求输入 → 阻塞等待 I/O（输入机）。此时 A 仍在打印，B 在输入，CPU 空闲。</li>
                <li><strong>150ms：A 打印结束</strong>，第二次计算（需 CPU，50ms）。CPU 空闲，A 获得 CPU 开始计算。</li>
                <li><strong>180ms：B 输入结束</strong>，第二次计算（需 CPU，100ms）。但 CPU 被 A 占用，B 等待。</li>
                <li><strong>200ms：A 第二次计算结束</strong>，请求第二次打印（打印机，100ms）。CPU 空闲，B 获得 CPU 开始计算。</li>
                <li><strong>300ms：A 打印结束，B 计算结束</strong>，全部完成。</li>
              </ul>

              <p><strong>① CPU 有无空闲等待？</strong></p>
              <p>有。在 <strong>100~150ms</strong> 期间，CPU 空闲 <strong>50ms</strong>。原因：此时 A 在打印（I/O）、B 在输入（I/O），两个进程均处于 I/O 等待状态，没有进程需要使用 CPU。</p>
              <p>CPU 利用率 = 250ms / 300ms = <strong>83.3%</strong></p>

              <p><strong>② 程序有无等待 CPU 的情况？</strong></p>
              <p>有。B 在 <strong>180ms</strong> 输入结束后试图开始第二次计算，但此时 A 正在计算（150~200ms），B 必须等待到 200ms 才能获得 CPU，B 等待 CPU 的时间为 <strong>20ms</strong>。</p>
            </Answer>
          </div>
        </section>

        {/* =========================== 习题 2 =========================== */}
        <section id="ex2" className="os-ex-section">
          <h2><span className="os-ex-num">二</span>习题 2 — 进程管理</h2>

          <div className="os-ex-group">
            <h3>1. 选择题</h3>

            <Q id="ex2-1"><b>（1）</b>不属于进程关键要素的是（D）。<br/>A. 程序  B. 数据和栈  C. PCB  D. 原语</Q>
            <Answer>D.进程三要素：程序、数据、PCB.原语是操作系统的底层操作，不属于进程要素。</Answer>

            <Q id="ex2-2"><b>（2）</b>OS 的管理程序运行状态具备较高特权级别称为（C）。<br/>A. 用户态  B. 目态  C. 管态  D. 普通态</Q>
            <Answer>C.管态（核心态/系统态）有最高特权，可执行特权指令。用户态(目态)是普通进程的受限状态。</Answer>

            <Q id="ex2-3"><b>（3）</b>PSW 的中文全称是（A）。<br/>A. 程序状态字  B. 进程标识符  C. 作业控制块  D. 进程控制块</Q>
            <Answer>A.Program Status Word，存放 CPU 状态信息（中断屏蔽、条件码等）。</Answer>

            <Q id="ex2-4"><b>（4）</b>CPU 暂停执行程序、保留现场并转去处理异步事件，完成后返回断点，称为（D）。<br/>A. 作业调度  B. 页面置换  C. 磁盘调度  D. 中断</Q>
            <Answer>D.中断的定义——CPU 对异步事件的响应机制。</Answer>

            <Q id="ex2-5"><b>（5）</b>关于进程的说法，错误的是（B）。<br/>A. 进程是程序的一次执行过程  B. 一个进程由若干作业组成<br/>C. 进程仍是资源分配的基本单位  D. 进程可创建其他进程</Q>
            <Answer>B.一个作业由若干进程组成（反过来不对）。进程是资源分配基本单位，线程是 CPU 调度基本单位。</Answer>

            <Q id="ex2-6"><b>（6）</b>关于父/子进程的叙述，正确的是（D）。<br/>A. 父进程执行完子进程才能执行  B. 子进程执行完父进程才能执行<br/>C. 撤销子进程时同时撤销父进程  D. 一个子进程只有一个父进程</Q>
            <Answer>D.父/子进程可并发运行，各自独立，子进程只有唯一父进程。</Answer>

            <Q id="ex2-7"><b>（7）</b>任何两个并发进程之间（D）。<br/>A. 一定互斥  B. 一定同步  C. 一定独立无关  D. 可能存在同步或互斥关系</Q>
            <Answer>D.并发进程间的关系不确定——可能独立、可能合作（同步）、可能竞争（互斥）。</Answer>

            <Q id="ex2-8"><b>（8）</b>每个进程轮流运行一个时间片，结束后排到就绪队列末尾，称为（D）。<br/>A. 最高响应比  B. FCFS  C. SJF  D. 时间片轮转(RR)</Q>
            <Answer>D.时间片轮转(Round Robin)调度的特征描述。</Answer>

            <Q id="ex2-9"><b>（9）</b>当前进程因时间片用完而让出处理器时应转变为（A）。<br/>A. 就绪  B. 等待  C. 运行  D. 完成</Q>
            <Answer>A.时间片用完不是等待事件，只是 CPU 被抢占，进入就绪队列等待下次调度。</Answer>

            <Q id="ex2-10"><b>（10）</b>单核处理器系统有 3 个进程，一个处于运行态，则就绪态最多有（B）个。<br/>A. 1  B. 2  C. 3  D. 4</Q>
            <Answer>B.最多 3-1=2 个就绪（剩下的可能处于阻塞态）。共 3 个进程，1 个运行 + 2 个就绪 + 0 个阻塞。</Answer>

            <Q id="ex2-11"><b>（11）</b>与作业运行时间和等待时间有关的调度算法是（D）。<br/>A. FCFS  B. SJF  C. 均衡  D. 最高响应比</Q>
            <Answer>D.响应比 = 1 + 等待时间/运行时间，同时考虑了等待时间和运行时间。</Answer>

            <Q id="ex2-12"><b>（12）</b>作业 8:00 到达，运行 1h，9:00 开始执行，响应比为（A）。<br/>A. 2  B. 1  C. 3  D. 0.5</Q>
            <Answer>A.响应比 = 1 + 等待时间/运行时间 = 1 + 1h/1h = 2。</Answer>

            <Q id="ex2-13"><b>（13）</b>临界区是指并发进程中访问共享变量的（D）段。<br/>A. 管理信息  B. 信息存储  C. 数据  D. 程序</Q>
            <Answer>D.临界区是访问共享变量的程序代码段（程序段），不是数据本身。</Answer>

            <Q id="ex2-14"><b>（14）</b>信号量初值=3, 当前=-1。M=可用个数, N=等待进程数，则 M,N 为（A）。<br/>A. 0, 1  B. 1, 0  C. 1, 2  D. 2, 0</Q>
            <Answer>A.信号量&lt;0 时绝对值为等待进程数(1)，资源可用数为 0。公式：M = max(0, S) = 0, N = |min(0, S)| = 1。</Answer>

            <Q id="ex2-15"><b>（15）</b>执行 V(S) 时发现（A），则唤醒等待队列中的一个进程。<br/>A. S ≤ 0  B. S ≥ 5  C. S &lt; 5  D. S &gt; 5</Q>
            <Answer>A.V 操作先 S++，若 S ≤ 0 说明原值 ≤ -1，有进程在等待，需唤醒一个。</Answer>

            <Q id="ex2-16"><b>（16）</b>不属于产生死锁原因的是（B）。<br/>A. 系统资源不足  B. 调度算法效率低下  C. 进程推进顺序不合适  D. 资源分配不当</Q>
            <Answer>B.死锁原因：资源不足 + 推进顺序不当 + 分配不当。调度算法效率低下不会直接导致死锁。</Answer>

            <Q id="ex2-17"><b>（17）</b>不会因竞争（C）而产生死锁。<br/>A. 打印机  B. 磁带机  C. CPU  D. 磁盘</Q>
            <Answer>C.CPU 是可抢占资源（时间片用完就被抢占），竞争 CPU 不会导致死锁。死锁需要不可抢占资源。</Answer>

            <Q id="ex2-18"><b>（18）</b>每类资源只有一个实例时，不正确的是（A）。<br/>A. 有环必死锁  B. 死锁必有环  C. 有环不一定死锁  D. 死锁进程全在环中</Q>
            <Answer>A.单实例资源分配图中，有环不一定死锁（若有进程不在等待资源则不构成死锁）。但有环是死锁的必要条件。</Answer>

            <Q id="ex2-19"><b>（19）</b>关于死锁的描述，正确的是（C）。<br/>A. 一个进程进入死锁  B. 竞争 CPU 进入死锁<br/>C. 竞争互斥资源互不相让进入死锁  D. 调用 V 操作造成死锁</Q>
            <Answer>C.死锁至少需要两个进程；CPU 是可抢占资源不导致死锁；V 操作为释放资源不会导致死锁。</Answer>

            <Q id="ex2-20"><b>（20）</b>进程-资源分配图用于（D）。<br/>A. 死锁预防  B. 静态方法  C. 死锁避免  D. 死锁检测与解除</Q>
            <Answer>D.资源分配图是死锁检测工具，检测是否有循环等待。</Answer>
          </div>

          <div className="os-ex-group">
            <h3>2. 填空题</h3>

            <Q id="ex2-21"><b>（1）</b>Linux 按事件来源和实现手段将中断分为 <strong>硬中断</strong>、<strong>软中断</strong>。</Q>
            <Q id="ex2-22"><b>（2）</b>系统调用通过 <strong>中断（或陷入/ trap）</strong> 来实现；发生系统调用时处理器的状态从目态变为管态。</Q>
            <Q id="ex2-23"><b>（3）</b>Linux 中创建进程的原语是 <strong>fork()</strong>。</Q>
            <Q id="ex2-24"><b>（4）</b>五状态模型比三状态模型增加的两种状态是 <strong>新建态</strong> 和 <strong>终止态</strong>。</Q>
            <Q id="ex2-25"><b>（5）</b>系统中进程存在的唯一标志是 <strong>PCB（进程控制块）</strong>。</Q>
            <Q id="ex2-26"><b>（6）</b>进程上下文包括 3 部分：<strong>用户级上下文</strong>、<strong>系统级上下文</strong> 和 <strong>寄存器上下文</strong>。</Q>
            <Q id="ex2-27"><b>（7）</b>低级调度又称为进程调度，调度方式通常有 <strong>抢占式</strong> 和 <strong>非抢占式</strong> 两种。</Q>
            <Q id="ex2-28"><b>（8）</b>信号量 S 初值 10，16 次 P 操作和 15 次 V 操作后，S = <strong>9</strong>。<br/><em>解：10 - 16 + 15 = 9</em></Q>
          </div>

          <div className="os-ex-group">
            <h3>3. 简答题</h3>

            <Q id="ex2-29"><b>（1）</b>请简单描述进程三态模型中进程状态的转换情况。</Q>
            <Answer>
              <ul>
                <li><strong>运行 → 就绪：</strong>时间片用完或被高优先级进程抢占。</li>
                <li><strong>运行 → 等待（阻塞）：</strong>进程请求 I/O 或等待事件。</li>
                <li><strong>等待 → 就绪：</strong>I/O 完成或事件发生。</li>
                <li><strong>就绪 → 运行：</strong>进程调度程序选中该进程。</li>
              </ul>
            </Answer>

            <Q id="ex2-30"><b>（2）</b>请描述进程的创建过程。</Q>
            <Answer>
              <ol>
                <li>申请空白 PCB（进程控制块）。</li>
                <li>分配进程所需资源（内存、文件等）。</li>
                <li>初始化 PCB（PID、状态、寄存器上下文等）。</li>
                <li>将新进程插入就绪队列。</li>
              </ol>
            </Answer>

            <Q id="ex2-31"><b>（3）</b>请简述时间片轮转调度算法的工作流程及确定时间片大小需要考虑的因素。</Q>
            <Answer>
              <p><strong>工作流程：</strong>调度程序将 CPU 分配给就绪队列首进程运行一个时间片，时间片用完后强迫该进程让出 CPU，排到就绪队列末尾，调度下一个进程。</p>
              <p><strong>时间片大小考虑因素：</strong></p>
              <ul>
                <li>系统响应时间要求（时间片越小响应越快）。</li>
                <li>CPU 开销（时间片过小 ⇒ 频繁上下文切换 ⇒ 开销大）。</li>
                <li>进程运行特征（CPU 密集 vs I/O 密集）。</li>
              </ul>
            </Answer>

            <Q id="ex2-32"><b>（4）</b>P1、P2 并发执行后，x、y、z 的值有几种可能？各为多少？</Q>
            <Code>{`P1:              P2:
y=0;             x=2;
y=y+4; → y=4    x=x+6; → x=8
V(S1);           P(S1);
z=y+3; → z=7    x=x+y;
P(S2);           V(S2);
y=z+y;           z=z+x;`}</Code>
            <Answer>
              <p>S1、S2 初值均为 0，x=y=z=0。</p>
              <p><strong>分析：</strong>P1 先 V(S1) 后 P(S2)，P2 先 P(S1) 后 V(S2)。P1 中 P(S2) 须等 P2 执行 V(S2) 后才能继续；P2 中 P(S1) 须等 P1 执行 V(S1) 后才能继续。</p>
              <p>如果 P1 先执行 V(S1) 后，P2 可能被唤醒。有两种可能的执行交错：</p>
              <p><strong>情况 1：</strong>P1 完全执行完 y=0→y=4→V(S1)→z=7→P(S2)【阻塞】→ P2 执行 x=2→x=8→P(S1)（S1=0 不阻塞）→x=x+y=8+4=12→V(S2)（唤醒 P1）→z=z+x=7+12=19 → P1 继续 y=z+y=19+4=23</p>
              <p>结果：x=12, y=23, z=19</p>
              <p><strong>情况 2：</strong>P1 算完 y=4 后切换 P2：x=2→x=8→P(S1)【阻塞，S1=0】→ P1 继续 V(S1)→z=7→P(S2)【阻塞】→ P2 继续 x=x+y=8+4=12→V(S2)(唤醒 P1)→z=z+x=0+12=12 → P1 继续 y=z+y=12+4=16</p>
              <p>结果：x=12, y=16, z=12</p>
              <p>共 <strong>2 种</strong> 可能结果。</p>
            </Answer>

            <Q id="ex2-33"><b>（5）</b>为什么说最高响应比优先是对 FCFS 和 SJF 的折衷？</Q>
            <Answer>
              <ul>
                <li><strong>FCFS：</strong>只考虑等待时间（对长作业有利）。</li>
                <li><strong>SJF：</strong>只考虑运行时间（对短作业有利，长作业可能饥饿）。</li>
                <li><strong>最高响应比优先：</strong>响应比 = 1 + 等待时间/运行时间，兼顾了两者。等待时间越长响应比越高（避免饥饿），运行时间越短响应比越高（照顾短作业）。</li>
              </ul>
            </Answer>

            <Q id="ex2-34"><b>（6）</b>请对比"死锁"和"饥饿"问题。</Q>
            <Answer>
              <Table head={['对比项', '死锁', '饥饿']} body={[
                ['定义', '多个进程因竞争资源互不相让而无限等待', '高优先级进程始终占用资源，低优先级进程永远无法运行'],
                ['资源', '涉及不可抢占资源', '涉及 CPU 或资源调度优先级'],
                ['状态', '进程都处于阻塞态', '进程处于就绪态（但总选不上）'],
                ['结果', '系统瘫痪', '低优先级进程无法推进'],
                ['解决', '预防/避免/检测解除', '老化技术（逐渐提升优先级）'],
              ]} />
            </Answer>

            <Q id="ex2-35"><b>（7）</b>6 台打印设备，n 个进程各需最多 2 台。n 最多为多少时系统不死锁？</Q>
            <Answer>
              每个进程最多需要 2 台打印机。最坏情况：每个进程都占 1 台（共 n 台），都在等待第 2 台。要使系统不死锁，必须保证至少有一个进程能获得 2 台：<br/>
              n &lt; 6（即 n ≤ 5）。若 n=6，每个进程各 1 台则全部等待，死锁。因此 n 最多 <strong>5</strong>。
            </Answer>

            <Q id="ex2-36"><b>（8）</b>P1 需 S3+S1, P2 需 S1+S2, P3 需 S2+S3。资源分配图与策略。</Q>
            <Answer>
              <p><strong>① 死锁时的资源分配图：</strong></p>
              <p>P1→S3, P2→S1, P3→S2（各进程请求另一资源）形成循环等待。即：P1 持有 S1 请求 S3, P2 持有 S2 请求 S1, P3 持有 S3 请求 S2 ⇒ 循环等待链。</p>
              <p><strong>② 防止死锁的策略：</strong></p>
              <p>破除"循环等待条件"：对资源编号 S1&lt;S2&lt;S3，要求所有进程按序号递增申请资源（<strong>有序资源分配法</strong>）。例如 P1 要先申请 S1 再申请 S3，P2 先 S1 后 S2，P3 先 S2 后 S3，就不会形成环路。</p>
            </Answer>
          </div>

          <div className="os-ex-group">
            <h3>4. 解答题</h3>

            <Q id="ex2-37"><b>（1）</b>三个作业到达时间 8.8/9.0/9.5，CPU 时间 1.5/0.4/1.0，全部到达后采用响应比高者优先调度。</Q>
            <Answer>
              <p>所有作业在 9.5 全部到达后开始调度：</p>
              <ul>
                <li>9.5 计算响应比：作业1 = 1 + (9.5-8.8)/1.5 = 1+0.7/1.5 = 1.47；作业2 = 1 + (9.5-9.0)/0.4 = 1+0.5/0.4 = 2.25 <strong>最高</strong>；作业3 = 1 + (9.5-9.5)/1.0 = 1</li>
                <li>先运行作业2（0.4h），完成时间 9.9。</li>
                <li>9.9 重算：作业1 = 1 + (9.9-8.8)/1.5 = 1+1.1/1.5 = 1.73；作业3 = 1 + (9.9-9.5)/1.0 = 1+0.4/1.0 = 1.4。作业1 优先。</li>
                <li>再运行作业1（1.5h），完成时间 11.4。</li>
                <li>最后运行作业3（1.0h），完成时间 12.4。</li>
              </ul>
              <Table head={['作业', '到达', '运行', '开始', '完成', '周转']} body={[
                ['1', '8.8', '1.5', '9.9', '11.4', '2.6'],
                ['2', '9.0', '0.4', '9.5', '9.9', '0.9'],
                ['3', '9.5', '1.0', '11.4', '12.4', '2.9'],
              ]} />
            </Answer>

            <Q id="ex2-38"><b>（2）</b>SJF 非抢占式作业调度 + 抢占式进程调度（优先数越小优先级越高）。</Q>
            <Answer>
              <p><strong>作业序列：</strong>A(10:00,40min,优先数5), B(10:20,30min,3), C(10:30,50min,4), D(10:50,20min,6)</p>
              <ul>
                <li>10:00 A 到达，开始运行；10:20 B 到，A 继续（SJF 非抢占调度—SJF 仅在作业调度时选择）；A 的优先级 5 &lt; B 的 3，但 A 已开始运行，在进程调度中 B 的优先级更高 ⇒ B 抢占 A.</li>
                <li>10:20 B 抢占 A，运行 B（优先数 3 最高）。10:30 C 到达（优先数 4），但 B 仍继续。</li>
                <li>10:50 B 完成（运行 30min）。此时 A 已运行 20min（剩余 20min）、C 等待、D 到达。</li>
                <li>10:50 SJF 调 C（运行 50min）vs A(20min) vs D(20min) — SJF 选 A 或 D；但优先级 A(5) &lt; C(4) &lt; D(6)，抢占式调度：选 C（优先级 4 最高）。</li>
                <li>10:50~11:40 运行 C.11:40 C 完成。</li>
                <li>11:40 A(5) vs D(6)，A 优先级更高，运行 A(20min)；12:00 A 完成。</li>
                <li>12:00 运行 D(20min)；12:20 D 完成。</li>
              </ul>
              <Table head={['作业', '到达', '运行', '进入内存', '结束', '周转']} body={[
                ['A', '10:00', '40', '10:00', '12:00', '120min'],
                ['B', '10:20', '30', '10:20', '10:50', '30min'],
                ['C', '10:30', '50', '10:30', '11:40', '70min'],
                ['D', '10:50', '20', '10:50', '12:20', '90min'],
              ]} />
              <p>平均周转时间 = (120+30+70+90)/4 = <strong>77.5 min</strong></p>
            </Answer>

            <Q id="ex2-39"><b>（3）</b>垃圾分拣机器人：两只手臂互斥分拣易拉罐和塑料瓶，每次只能拣一个，且交替进行。</Q>
            <Answer>
              <p>信号量 mutex=1（互斥），turn=1（交替：1=P1 先拣）。</p>
              <Code>{`Semaphore mutex = 1;  // 互斥使用手臂
Semaphore turn = 1;    // 确保交替

P1 (左臂-易拉罐):        P2 (右臂-塑料瓶):
while (true) {          while (true) {
  P(turn);                V(turn);  // 通知 P1 可拣
  P(mutex);               P(mutex);
  分拣易拉罐;              分拣塑料瓶;
  V(mutex);               V(mutex);
  V(turn);                P(turn);  // 等待 P1 完成
}                       }`}</Code>
              <p>或更简洁的同步方案（用两个信号量实现交替）：</p>
              <Code>{`Semaphore S1 = 1;  // P1 可拣
Semaphore S2 = 0;  // P2 可拣
P1:                 P2:
P(S1);              P(S2);
P(mutex);           P(mutex);
拣易拉罐;           拣塑料瓶;
V(mutex);           V(mutex);
V(S2);              V(S1);`}</Code>
            </Answer>

            <Q id="ex2-40"><b>（4）</b>爸爸放水果(苹果/桔子)，儿子取桔子，女儿取苹果。盘子容量为 1。</Q>
            <Answer>
              <Code>{`Semaphore empty = 1;  // 盘子空位
Semaphore apple = 0;   // 苹果信号
Semaphore orange = 0;  // 桔子信号

爸爸:                       儿子(取桔子):         女儿(取苹果):
while (true) {             while (true) {         while (true) {
  P(empty);                  P(orange);             P(apple);
  放水果(苹果或桔子);         从盘中取桔子;          从盘中取苹果;
  if (放的是苹果)             V(empty);              V(empty);
    V(apple);                吃桔子;                吃苹果;
  else                     }                      }
    V(orange);
}
`}</Code>
            </Answer>

            <Q id="ex2-41"><b>（5）</b>生产者-消费者问题：缓冲区容量 10，多个生产者和消费者。</Q>
            <Answer>
              <Code>{`Semaphore empty = 10;  // 空缓冲区数
Semaphore full = 0;    // 满缓冲区数
Semaphore mutex = 1;   // 互斥访问

Producer:                  Consumer:
while (true) {             while (true) {
  P(empty);                  P(full);
  P(mutex);                  P(mutex);
  生产数据并放入缓冲区;       从缓冲区取出数据;
  V(mutex);                  V(mutex);
  V(full);                   V(empty);
}                            消费数据;
                           }`}</Code>
            </Answer>

            <Q id="ex2-42"><b>（6）</b>read → B1 → move → B2 → print 三进程并发。</Q>
            <Answer>
              <Code>{`Semaphore empty1 = 1;  // B1 空位
Semaphore full1 = 0;   // B1 有数据
Semaphore empty2 = 1;  // B2 空位
Semaphore full2 = 0;   // B2 有数据
Semaphore mutex1 = 1;  // B1 互斥
Semaphore mutex2 = 1;  // B2 互斥

read:                          move:                          print:
while (true) {                while (true) {                 while (true) {
  P(empty1);                    P(full1);                      P(full2);
  P(mutex1);                    P(mutex1);                     P(mutex2);
  读记录到 B1;                  从 B1 取记录;                  从 B2 取记录;
  V(mutex1);                    V(mutex1);                     V(mutex2);
  V(full1);                     V(empty1);                     V(empty2);
}                               加工记录;                       打印记录;
                                 P(empty2);                   }
                                 P(mutex2);
                                 存入 B2;
                                 V(mutex2);
                                 V(full2);
                              }`}</Code>
            </Answer>

            <Q id="ex2-43"><b>（7）</b>银行家算法：A 6个, B 3个, C 4个, D 2个。</Q>
            <Answer>
              <Table head={['进程', 'Alloc', 'Alloc', 'Alloc', 'Alloc', 'Max', 'Max', 'Max', 'Max', 'Need', 'Need', 'Need', 'Need']} body={[
                ['', 'A','B','C','D', 'A','B','C','D', 'A','B','C','D'],
                ['P1', '3','0','1','1', '4','1','1','1', '1','1','0','0'],
                ['P2', '0','1','0','0', '0','2','1','2', '0','1','1','2'],
                ['P3', '1','1','1','0', '4','2','1','0', '3','1','0','0'],
                ['P4', '1','1','0','1', '1','1','1','1', '0','0','1','0'],
                ['P5', '0','0','0','0', '2','1','1','0', '2','1','1','0'],
              ]} />

              <p><strong>① 系统是否安全？</strong></p>
              <p>Available = (6-5, 3-3, 4-2, 2-2) = (1, 0, 2, 0)</p>
              <p>安全序列：P4 (Need=0,0,1,0) → P1 (1,1,0,0) → P2 (0,1,1,2) → P3 (3,1,0,0) → P5 (2,1,1,0) 或其他顺序。</p>
              <p><strong>安全。</strong> 有可能的安全序列：P4 → P1 → P2 → P3 → P5</p>

              <p><strong>② P2 请求(0,0,1,0)，可否立即分配？</strong></p>
              <p>Request ≤ Need(0,1,1,2) ✓，Request ≤ Available(1,0,2,0) ✓。试分配后 Available=(1,0,1,0)，P4 的 Need(0,0,1,0) ≤ Available=(1,0,1,0) ✓。仍存在安全序列 P4→...，可以立即分配。</p>
            </Answer>

            <Q id="ex2-44"><b>（8）</b>银行家算法：5 进程，A=10, B=5, C=7。</Q>
            <Answer>
              <Table head={['进程', 'Max', 'Max', 'Max', 'Alloc', 'Alloc', 'Alloc', 'Need', 'Need', 'Need', 'Avail', 'Avail', 'Avail']} body={[
                ['', 'A','B','C', 'A','B','C', 'A','B','C', 'A','B','C'],
                ['P0', '7','5','3', '0','1','0', '7','4','3', '', '', ''],
                ['P1', '3','2','2', '2','0','0', '1','2','2', '', '', ''],
                ['P2', '9','0','2', '3','0','2', '6','0','0', '', '', ''],
                ['P3', '2','2','2', '2','1','1', '0','1','1', '', '', ''],
                ['P4', '4','3','3', '0','0','2', '4','3','1', '', '', ''],
              ]} />
              <p><strong>① T0 时刻是否安全？</strong></p>
              <p>Available = (10-7, 5-2, 7-5) = (3, 3, 2)</p>
              <p>安全序列：P1(1,2,2) → P3(0,1,1) → P0(7,4,3) → P2(6,0,0) → P4(4,3,1)</p>
              <p>详细：P1 Need≤Avail → P1 释放 (2,0,0) → Avail(5,3,2) → P3 Need≤Avail → P3 释放(2,1,1) → Avail(7,4,3) → P0/P2/P4 均可达。</p>
              <p><strong>安全。</strong> 安全序列：P1 → P3 → P0 → P2 → P4</p>

              <p><strong>② P4 请求(3,2,1)？</strong></p>
              <p>Request(3,2,1) ≤ Need(4,3,1) ✓，但 Request(3,2,1) ≤ Available(3,3,2) ✓ 试分配：New Alloc=(3,2,3), New Avail=(0,1,1), New Need=(1,1,0)。</p>
              <p>试分配后 Available(0,1,1)，没有进程的 Need ≤ Available（P1 Need(1,2,2) 的 B 不够；P3 Need(0,1,1) 的 B 不够）。不安全，不可分配！</p>
            </Answer>
          </div>
        </section>

        {/* =========================== 习题 3 =========================== */}
        <section id="ex3" className="os-ex-section">
          <h2><span className="os-ex-num">三</span>习题 3 — 存储管理</h2>

          <div className="os-ex-group">
            <h3>1. 选择题</h3>

            <Q id="ex3-1"><b>（1）</b>需要将整个进程放在连续内存空间的存储管理方式是（A）。<br/>A. 分区存储管理  B. 页式  C. 段式  D. 段页式</Q>
            <Answer>A.分区管理要求进程占用连续的内存区域。页式/段式允许非连续存放。</Answer>

            <Q id="ex3-2"><b>（2）</b>解决内存碎片问题较好的存储器管理方式是（B）。<br/>A. 可变分区  B. 分页管理  C. 分段管理  D. 单一连续分配</Q>
            <Answer>B.分页管理通过固定大小的页框消除外部碎片。可变分区会产生外部碎片。</Answer>

            <Q id="ex3-3"><b>（3）</b>采用（B）存储管理方式不会产生内部碎片。<br/>A. 分页式  B. 分段式  C. 固定分区式  D. 段页式</Q>
            <Answer>B.分段式管理中段长可变，分配精确不会产生内部碎片（但会产生外部碎片）。分页/固定分区/段页式都有内部碎片。</Answer>

            <Q id="ex3-4"><b>（4）</b>分页式存储管理要求（A）。<br/>
            A．每个进程拥有一张页表，且进程的页表驻留在内存中 <br/>
            B．每个进程拥有一张页表，但只要执行进程的页表驻留在内存中， 其他进程的页表不必驻留在内存中<br/>
            C．所有进程共享一张页表，以节约有限的内存空间， 但页表必须驻留在内存中<br/>
            D．所有进程共享一张页表， 只有页表中当前使用的页面必须驻留在内存中，以最大限度地节约有限的内存空间</Q>
            <Answer>A.每个进程有独立页表，且页表常驻内存。</Answer>

            <Q id="ex3-5"><b>（5）</b>页表的表项实际上是用于实现（C）。<br/>A. 访问辅存  B. 静态重定位  C. 动态重定位  D. 装载程序</Q>
            <Answer>C.页表将逻辑页号映射到物理页框号，实现动态地址转换。</Answer>

            <Q id="ex3-6"><b>（6）</b>8 页逻辑空间(每页1024B)映射到 32 块物理存储区，逻辑地址有效位( C )，物理地址至少(  C  )位？<br/>A. 10, 11  B. 12, 14  C. 13, 15  D. 14, 16</Q>
            <Answer>C.逻辑空间：8 页 = 2³ 页，每页 1024B = 2¹⁰ ⇒ 3+10=13 位。物理空间：32 块 = 2⁵ 块，每块 1024B = 2¹⁰ ⇒ 5+10=15 位。</Answer>

            <Q id="ex3-7"><b>（7）</b>地址 32 位，页号占 8 位，页表长度为（C）字节。<br/>A. 2⁸  B. 2¹⁶  C. 2²⁴  D. 2³²</Q>
            <Answer> C.页号 8 位 ⇒ 页表项数 256，页内偏移 24 位，所以页表需要 2²⁴ 字节的物理内存来映射（页框号需要 24 位表示）= 16MB.选 C.</Answer>

            <Q id="ex3-8"><b>（8）</b>地址寄存器低 9 位表示页内地址，页面大小为（B）。<br/>A. 1024B  B. 512B  C. 1024KB  D. 512KB</Q>
            <Answer>B.2⁹ = 512 字节。</Answer>

            <Q id="ex3-9"><b>（9）</b>24 位地址，8 位段号，每段最大长度为（B）字节。<br/>A. 2²⁴  B. 2¹⁶  C. 2⁸  D. 2³²</Q>
            <Answer>B.24-8=16 位段内地址，每段最大 2¹⁶ = 64KB.</Answer>

            <Q id="ex3-10"><b>（10）</b>虚拟存储管理机制的理论基础是程序的（A）原理。<br/>A. 局部性  B. 全局性  C. 动态性  D. 虚拟性</Q>
            <Answer>A.虚拟存储器基于局部性原理：时间局部性 + 空间局部性。</Answer>

            <Q id="ex3-11"><b>（11）</b>虚拟存储系统的大小受（C）限制。<br/>A. 内存容量  B. 交换信息大小  C. CPU 地址表示范围  D. CPU 时钟频率</Q>
            <Answer>C.虚拟地址空间大小取决于 CPU 地址位数（如 32 位 CPU 最大虚拟空间 4GB）。</Answer>

            <Q id="ex3-12"><b>（12）</b>虚拟存储器最基本的特征是（A）。<br/>A. 从逻辑上扩充内存容量  B. 提高内存利用率  C. 驻留性  D. 固定性</Q>
            <Answer>A.虚拟存储器的本质：在逻辑上扩充内存容量，使程序可以运行在比实际内存大的地址空间上。</Answer>

            <Q id="ex3-13"><b>（13）</b>以下（D）置换算法存在异常：分配内存越多缺页率反而越高。<br/>A. LRU  B. OPT  C. LFU  D. FIFO</Q>
            <Answer>D.Belady 异常：FIFO 算法分配更多页框时，缺页率可能反而升高。</Answer>
          </div>

          <div className="os-ex-group">
            <h3>2. 填空题</h3>

            <Q id="ex3-14"><b>（1）</b>影响缺页中断率的因素有：<strong>页面大小</strong>、<strong>分配给进程的页框数</strong>、页面置换算法和程序本身特性。</Q>
            <Q id="ex3-15"><b>（2）</b>将访问频繁的少量页表项存放在 <strong>联想寄存器（TLB/快表）</strong> 中，构成 <strong>快表</strong>。</Q>
            <Q id="ex3-16"><b>（3）</b>页面大小 4KB，逻辑地址 1A3FH。第 0~3 页分别在 3,5,4,2 号页框，求页框号和物理地址。</Q>
            <Answer>
              <p>4KB = 2¹²，页内偏移 12 位。1A3FH = 0001 1010 0011 1111B.高 4 位为页号 = 1H = 1，页框号 = 5。</p>
              <p>物理地址 = 5 × 4KB + 0A3FH = 5000H + 0A3FH = <strong>5A3FH</strong>（不足补 0：5×1000H = 5000H）</p>
              <p>答案：页框号 <strong>5</strong>，物理地址 <strong>5A3FH</strong></p>
            </Answer>
            <Q id="ex3-17"><b>（4）</b>地址 24 位，页号 14 位，内存分块大小为 <strong>2¹⁰=1024B</strong>（24-14=10 位偏移）。</Q>
            <Q id="ex3-18"><b>（5）</b>没有快表时，分页存储管理系统中每访问一次数据至少要访问 <strong>2</strong> 次内存（一次查页表，一次访问数据）。</Q>
            <Q id="ex3-19"><b>（6）</b>段表中记录该段在内存中的 <strong>起始地址（基址）</strong> 和段的长度。</Q>
            <Q id="ex3-20"><b>（7）</b>程序局部性原理总结为 <strong>时间局部性</strong>、<strong>空间局部性</strong> 和顺序局部性。</Q>
            <Q id="ex3-21"><b>（8）</b>作业装入时进行地址变换为 <strong>静态</strong> 重定位；作业执行期间访问时才变换为 <strong>动态</strong> 重定位。</Q>
            <Q id="ex3-22"><b>（9）</b>虚拟段式中若段内地址大于段长，则发生 <strong>地址越界</strong> 中断。</Q>
          </div>

          <div className="os-ex-group">
            <h3>3. 简答题</h3>

            <Q id="ex3-23"><b>（1）</b>给定段表（段号 段首址 段长）：[0,200,400],[1,2300,300],[2,800,100],[3,1300,580],[4,—,—]。求 [1,10]、[2,150]、[4,40] 的物理地址。</Q>
            <Answer>
              <ul>
                <li><strong>[1, 10]：</strong>段 1 首址 2300，长度 300，位移 10 &lt; 300 ✓。物理地址 = 2300+10 = <strong>2310</strong></li>
                <li><strong>[2, 150]：</strong>段 2 首址 800，长度 100，位移 150 &gt; 100 ✗ ⇒ <strong>越界中断</strong></li>
                <li><strong>[4, 40]：</strong>段 4 段表为空（不存在）⇒ <strong>段错误/越界中断</strong></li>
              </ul>
            </Answer>

            <Q id="ex3-24"><b>（2）</b>虚地址 0AC5H 和 1AC5H → 物理地址。页长 1KB=2¹⁰，虚页 0,1,2,3 → 页框 8,7,4,10。</Q>
            <Answer>
              <p>1KB = 1024B = 2¹⁰，页内偏移 10 位。</p>
              <p><strong>0AC5H</strong> = 0000 1010 1100 0101B.高 6 位(虚页号) = 00 0010B = 2。页框号 = 4。偏移 = 10 1100 0101B = 2C5H。物理地址 = 4×1024 + 2C5H = 1000H + 2C5H = <strong>12C5H</strong></p>
              <p><strong>1AC5H</strong> = 0001 1010 1100 0101B.虚页号 = 0001 10B = 6。程序只有 10 页(0~9)，6 在范围内。但题目只给了 0~3 页的页框映射，页 6 不在内存 ⇒ <strong>缺页中断</strong>。</p>
            </Answer>

            <Q id="ex3-25"><b>（3）</b>请描述存储保护和地址越界中断机制。</Q>
            <Answer>
              <p><strong>存储保护：</strong>操作系统保护各进程的存储空间不被非法访问。常见方式：</p>
              <ul>
                <li><strong>基址/限长寄存器：</strong>判断访问地址是否在合法范围内。</li>
                <li><strong>页表/段表的保护位：</strong>读/写/执行权限控制。</li>
                <li><strong>环保护：</strong>Intel x86 的保护环(Ring 0~3)。</li>
              </ul>
              <p><strong>地址越界中断：</strong>当 CPU 访问的地址超过了进程的合法范围时，MMU 检测到越界并触发缺页/段错误中断，OS 接管处理（通常杀死进程或报错）。</p>
            </Answer>

            <Q id="ex3-26"><b>（4）</b>什么是覆盖？什么是交换？覆盖和交换的区别是什么？</Q>
            <Answer>
              <ul>
                <li><strong>覆盖：</strong>同一内存区域被不同程序段在不同时间重复使用（程序员手动划分模块）。</li>
                <li><strong>交换：</strong>将整个进程从内存移到外存（换出），再从外存调入另一个进程（换入）。</li>
              </ul>
              <p><strong>区别：</strong>覆盖是模块级别（部分交换），由程序员控制；交换是进程级别，由 OS 控制。覆盖技术已不常用，交换是现代虚拟存储的基础。</p>
            </Answer>

            <Q id="ex3-27"><b>（5）</b>为什么既有页表又有快表？</Q>
            <Answer>页表在内存中，每次地址转换需访问一次内存查页表（降低效率）。快表(TLB)是高速寄存器组，存储最近使用过的页表项。引入快表后，先查快表（命中则一次转换），未命中再查页表，使地址转换的平均时间接近快表访问时间。</Answer>

            <Q id="ex3-28"><b>（6）</b>请简述引入快表后分页式存储管理系统的地址变换过程。</Q>
            <Answer>
              <ol>
                <li>CPU 给出逻辑地址（页号 p + 页内偏移 w）。</li>
                <li>MMU （内存控制单元）先查快表(TLB)，若找到对应页号 ⇒ 直接得到页框号，合成物理地址（快表命中）。</li>
                <li>若快表未命中，查内存中的页表，获得页框号。</li>
                <li>将新的页表项加入快表。</li>
                <li>合成物理地址访问内存。</li>
              </ol>
            </Answer>

            <Q id="ex3-29"><b>（7）</b>分别简述虚拟内存和虚拟设备技术。</Q>
            <Answer>
              <ul>
                <li><strong>虚拟内存：</strong>在逻辑上扩充内存容量。程序的部分页面常驻内存，其余在外存，需要时缺页调入，使程序能运行在比物理内存更大的地址空间上。</li>
                <li><strong>虚拟设备：</strong>通过 SPOOLing 技术将独占设备改造成共享设备。在磁盘上开辟输入/输出井，使多个进程可以"同时"使用一台独占设备（如打印机）。</li>
              </ul>
            </Answer>

            <Q id="ex3-30"><b>（8）</b>动态分区管理中查找空闲区的算法有哪些？</Q>
            <Answer>
              <ul>
                <li><strong>首次适应法(FF)：</strong>从头查找第一个满足大小的空闲分区。</li>
                <li><strong>循环首次适应法(NF)：</strong>从上一次查找结束位置继续查找。</li>
                <li><strong>最佳适应法(BF)：</strong>选择满足要求的最小空闲分区。</li>
                <li><strong>最差适应法(WF)：</strong>选择最大的空闲分区。</li>
              </ul>
            </Answer>
          </div>

          <div className="os-ex-group">
            <h3>4. 解答题</h3>

            <Q id="ex3-31"><b>（1）</b>分页存储管理：页表(0→101H, 1→缺页, 2→254H)，页面 4KB，内存访问 100ns，快表 10ns，缺页处理 10⁸ns，LRU+局部淘汰，物理块数 2。访问序列 2362H, 1565H, 25A5H。</Q>
            <Answer>
              <p>4KB = 2¹²，页内偏移 12 位 = 0~FFF。</p>
              <p><strong>① 2362H：</strong>页号 = 2，偏移 = 362H。页表 2→254H。快表未命中(初始空)，查页表 100ns，更新快表，访问内存 100ns。总时间 = 10+100+100 = <strong>210ns</strong></p>
              <p><strong>② 1565H：</strong>页号 = 1，偏移 = 565H。页表 1 中断位=0（缺页）。快表未命中(10ns) → 查页表发现缺页(100ns) → 缺页中断 10⁸ns → LRU 淘汰页 0(装入时间最早) → 读入页 1(物理块 1) → 更新快表 → 访问内存(100ns)。总 ≈ 10+100+10⁸+100 ≈ <strong>100,000,210ns</strong></p>
              <p><strong>③ 25A5H：</strong>页号 = 2，偏移 = 5A5H。此时快表中已有页 2 → 快表命中(10ns) → 合成物理地址 = 254H×1000H+5A5H = 254000H+5A5H = <strong>2545A5H</strong>。总时间 = <strong>10ns</strong></p>
              <p><strong>④ 1565H 的物理地址：</strong>缺页处理后页 1 分配到某个空闲/淘汰页框。题干未明确给出淘汰后页框号，假设页 1 分配到页框 1，则物理地址 = 1×1000H+565H = <strong>1565H</strong>（巧合与逻辑地址相同）。</p>
            </Answer>

            <Q id="ex3-32"><b>（2）</b>请求分页系统：9 页面，5 页框，访问序列 0,1,2,3,4,5,0,2,1,8,5,2,7,6,0,1,2。用 FIFO 和 LRU 求缺页中断次数和最后驻留页号。</Q>
            <Answer>
              <p><strong>① FIFO 页面置换：</strong>队列顺序（最先装入 → 最近装入）</p>
              <Table head={['访问','0','1','2','3','4','5','0','2','1','8','5','2','7','6','0','1','2']} body={[
                ['页框1','0','0','0','0','0','5','5','5','5','5','5','5','7','7','7','7','7'],
                ['页框2','','1','1','1','1','1','0','0','0','0','0','0','0','6','6','6','6'],
                ['页框3','','','2','2','2','2','2','2','1','1','1','1','1','1','0','0','0'],
                ['页框4','','','','3','3','3','3','3','3','8','8','8','8','8','8','1','1'],
                ['页框5','','','','','4','4','4','4','4','4','4','2','2','2','2','2','2'],
                ['缺页?','✓','✓','✓','✓','✓','✓','✓','','✓','✓','','✓','✓','✓','✓','✓',''],
              ]} />
              <p>缺页次数：<strong>14 次</strong>（共 17 次访问）。最后驻留页号：{7,6,0,1,2}</p>

              <p><strong>② LRU 页面置换：</strong>最近最久未用（上→下：最近→最久）</p>
              <Table head={['访问','0','1','2','3','4','5','0','2','1','8','5','2','7','6','0','1','2']} body={[
                ['最近','0','1','2','3','4','5','0','2','1','8','5','2','7','6','0','1','2'],
                ['','','0','1','2','3','4','5','0','2','1','8','5','2','7','6','0','1'],
                ['','','','0','1','2','3','4','5','0','2','1','8','5','2','7','6','0'],
                ['','','','','0','1','2','3','4','5','0','2','1','8','5','2','7','6'],
                ['最久','','','','','0','1','2','3','4','5','0','2','1','8','5','2','7'],
                ['缺页?','✓','✓','✓','✓','✓','✓','✓','','✓','✓','','','✓','✓','✓','✓',''],
              ]} />
              <p>缺页次数：<strong>13 次</strong>。最后驻留页号：{2,1,0,6,7}（LRU 顺序）</p>
              <p><em>注：LRU 缺页 13 次，比 FIFO 少 1 次（访问 2 在第 12 步为命中，而 FIFO 为缺页）。最终驻留集合相同，均为 {0,1,2,6,7}。</em></p>
            </Answer>

            <Q id="ex3-33"><b>（3）</b>逻辑地址空间 64KB（16 位，按字节编址），页大小 1KB，6 页，4 页框(7,4,2,9)。访问 17CAH，用 FIFO 和 Clock 求物理地址。</Q>
            <Answer>
              <p>页大小 1KB = 2¹⁰，页内偏移 10 位。17CAH = 0001 0111 1100 1010B.页号=高 6 位=000101B=5，偏移=11 1100 1010B=3CAH。</p>
              <p>页 5 不在页表中（页表只给了 0~3 页），发生缺页中断。</p>
              <p><strong>① FIFO 置换：</strong></p>
              <Table head={['页面', '页框', '装入时间']} body={[
                ['0', '7', '130'],
                ['1', '4', '230'],
                ['2', '2', '200'],
                ['3', '9', '160'],
              ]} />
              <p>装入时间最早的是页 0(130) → 被淘汰。页 5 装入页框 7。物理地址 = 7×1024 + 3CAH = 1C00H + 3CAH = <strong>1FCAH</strong></p>
              <p><strong>② Clock 置换（当前指向页框 2）：</strong></p>
              <p>访问位：页0=1, 页1=1, 页2=1, 页3=1。从页框 2（页 2）开始扫描：</p>
              <ul>
                <li>页2(访问位=1) → 置 0，继续。</li>
                <li>页3(访问位=1) → 置 0，继续。</li>
                <li>页0(访问位=1) → 置 0，继续。</li>
                <li>页1(访问位=1) → 置 0，回到页2(访问位=0) → 淘汰页2。</li>
              </ul>
              <p>页 5 装入页框 2。物理地址 = 2×1024 + 3CAH = 800H + 3CAH = <strong>BCAH</strong></p>
            </Answer>
          </div>
        </section>

          {/* =========================== 习题 4 =========================== */}
          <section id="ex4" className="os-ex-section">
            <h2><span className="os-ex-num">四</span>习题 4 — 设备管理</h2>

            <div className="os-ex-group">
              <h3>1. 选择题</h3>

              <Q id="ex4-1"><b>（1）</b>I/O 设备的控制方式中比 DMA 方式效率高的是（C）。<br/>A. 询问方式  B. 中断方式  C. 通道方式  D. 以上都不是</Q>
              <Answer>C.通道方式使用专用 I/O 处理器，CPU 介入最少，效率最高。</Answer>

              <Q id="ex4-2"><b>（2）</b>在下列的 I/O 控制方式中，需要 CPU 干预最少的方式是（D）。<br/>A. 询问方式  B. 中断方式  C. DMA 方式  D. 通道方式</Q>
              <Answer>D.通道方式中 CPU 只需启动通道，其余由通道独立完成。</Answer>

              <Q id="ex4-3"><b>（3）</b>下列关于设备管理的叙述中，不正确的是（A）。<br/>A. 通道是处理输入、输出的软件<br/>B. 所有外围设备的启动工作都由系统统一完成<br/>C. 来自通道的 I/O 中断事件由设备管理模块负责处理<br/>D. 编制好的通道程序可存放在主存储器中</Q>
              <Answer>A.通道是硬件（专用 I/O 处理器），不是软件。</Answer>

              <Q id="ex4-4"><b>（4）</b>引入缓冲机制的主要目的是（A）。<br/>A. 改善 CPU 和 I/O 设备之间速度不匹配的问题<br/>B. 节省内存使用  C. 提高 CPU 的运行频率  D. 提高 I/O 设备的利用率</Q>
              <Answer>A.缓冲的核心作用是匹配 CPU 与 I/O 设备的速度差异，同时提高并行性。</Answer>

              <Q id="ex4-5"><b>（5）</b>在操作系统中，用户在使用 I/O 设备时，通常采用（C）。<br/>A. 物理设备名  B. 虚拟设备名  C. 逻辑设备名  D. 设备牌号</Q>
              <Answer>C.用户通过逻辑设备名访问设备，系统映射到物理设备（设备独立性）。</Answer>

              <Q id="ex4-6"><b>（6）</b>若外存的空闲块管理采用 32 位的位示图法，块号、位号和字号均从 0 开始编号，则块号 145 对应位示图中的位置是（A）。<br/>A. 字号 4，位号 17  B. 字号 4，位号 18  C. 字号 5，位号 17  D. 字号 5，位号 18</Q>
              <Answer>A.字号 = 145 ÷ 32 = 4，位号 = 145 mod 32 = 17。</Answer>

              <Q id="ex4-7"><b>（7）</b>硬盘上的文件以（A）单位进行读写。<br/>A. 物理块  B. 记录  C. 柱面  D. 簇</Q>
              <Answer>A.磁盘按物理块（扇区）进行读写。</Answer>

              <Q id="ex4-8"><b>（8）</b>单核单处理器系统中，可并行工作的是（D）。<br/>I 进程与进程  II 处理器与设备  III 处理器与通道  IV 设备与设备<br/>A. I、II 和 III  B. I、II 和 IV  C. I、III 和 IV  D. II、III 和 IV</Q>
              <Answer>D.单核单处理器上进程不能并行（只能并发），但处理器可与设备/通道并行，设备之间也可并行。</Answer>

              <Q id="ex4-9"><b>（9）</b>I/O 设备发出的 I/O 中断属于（A）。<br/>A. 外中断  B. 内中断  C. 陷入  D. 异常</Q>
              <Answer>A.I/O 中断由外部设备引起，属于外中断。内中断/陷入/异常由 CPU 内部事件引起。</Answer>

              <Q id="ex4-10"><b>（10）</b>下列算法不属于硬盘驱动臂调度算法的是（D）。<br/>A. 先来先服务算法  B. 最短查找时间优先算法  C. 扫描算法  D. 时间片轮转调度算法</Q>
              <Answer>D.时间片轮转是进程/CPU 调度算法，不是磁盘调度算法。</Answer>

              <Q id="ex4-11"><b>（11）</b>硬盘驱动臂调度算法中的（B）可能会随时改变移动臂的运动方向。<br/>A. 电梯调度算法  B. 先来先服务算法  C. 扫描算法  D. 优先级调度算法</Q>
              <Answer>B.FCFS 按请求顺序服务，可能会因请求的随机分布而频繁改变方向。</Answer>
            </div>

            <div className="os-ex-group">
              <h3>2. 填空题</h3>

              <Q id="ex4-12"><b>（1）</b>通道是专门负责输入/输出操作的 <strong>处理机（I/O 处理器）</strong>。</Q>
              <Q id="ex4-13"><b>（2）</b>设备从数据传输交换的单位可以分为 <strong>块设备</strong> 和字符设备。</Q>
              <Q id="ex4-14"><b>（3）</b>按操作特性分类，可把外部设备分为输入设备和 <strong>输出设备</strong>。</Q>
              <Q id="ex4-15"><b>（4）</b>缓冲区的设置可分为单缓冲、<strong>双缓冲</strong>、<strong>循环缓冲</strong> 和缓冲池。</Q>
              <Q id="ex4-16"><b>（5）</b>I/O 进行设备分配时所需的表格主要有 <strong>系统设备表（SDT）</strong>、设备控制表、控制器控制表和通道控制表。</Q>
            </div>

            <div className="os-ex-group">
              <h3>3. 简答题</h3>

              <Q id="ex4-17"><b>（1）</b>操作系统的设备管理模块包含哪些主要机制以提升性能？</Q>
              <Answer>
                <ol>
                  <li><strong>缓冲技术：</strong>匹配 CPU 与 I/O 设备速度差异，提高并行性。</li>
                  <li><strong>SPOOLing 技术：</strong>将独占设备改造为共享设备。</li>
                  <li><strong>中断技术：</strong>避免 CPU 轮询等待。</li>
                  <li><strong>DMA/通道技术：</strong>减少 CPU 对 I/O 的干预。</li>
                  <li><strong>磁盘调度算法：</strong>优化磁头移动，减少寻道时间。</li>
                </ol>
              </Answer>

              <Q id="ex4-18"><b>（2）</b>输入数据时，如果采用中断控制方式，系统工作过程包含哪些步骤？</Q>
              <Answer>
                <ol>
                  <li>进程发出 I/O 请求，CPU 启动设备后继续执行其他进程。</li>
                  <li>设备完成数据输入后，向 CPU 发送中断信号。</li>
                  <li>CPU 响应中断，保存当前进程上下文。</li>
                  <li>CPU 执行中断处理程序，将数据从设备读取到内存。</li>
                  <li>恢复被中断进程的上下文，继续执行。</li>
                </ol>
              </Answer>

              <Q id="ex4-19"><b>（3）</b>当一个进程输出数据时，缓冲机制的工作过程包含哪些步骤？</Q>
              <Answer>
                <ol>
                  <li>进程将数据写入内存缓冲区。</li>
                  <li>写完后进程继续执行，无需等待 I/O 完成。</li>
                  <li>设备空闲时，系统将缓冲区数据写入设备。</li>
                  <li>写完后释放缓冲区，供下一次输出使用。</li>
                </ol>
              </Answer>

              <Q id="ex4-20"><b>（4）</b>操作系统通常把 I/O 软件组织成哪几个层次？</Q>
              <Answer>
                <ol>
                  <li><strong>用户层 I/O：</strong>系统调用库（如 read/write）。</li>
                  <li><strong>设备无关操作系统层：</strong>设备命名、保护、缓冲、分配。</li>
                  <li><strong>设备驱动程序：</strong>与具体设备通信。</li>
                  <li><strong>中断处理程序：</strong>处理 I/O 完成中断。</li>
                </ol>
              </Answer>
            </div>

            <div className="os-ex-group">
              <h3>4. 解答题</h3>

              <Q id="ex4-21"><b>（1）</b>系统将一批数据以串行方式从某输入设备送至硬盘，如何改造为外设与外设间的并行工作方式？</Q>
              <Answer>
                <p><strong>原串行流程：</strong>读入缓冲区 → 等待 → 写盘 → 等待 → 重复</p>
                <p><strong>改造方案（双缓冲并行）：</strong></p>
                <ul>
                  <li>设置两个缓冲区 A 和 B.</li>
                  <li>输入设备读入数据到缓冲区 A（同时硬盘可从 B 写盘）。</li>
                  <li>输入完成后，切换：输入设备读入到 B，硬盘从 A 写盘。</li>
                  <li>交替使用 A 和 B，实现输入与输出并行工作。</li>
                </ul>
                <p>核心思想：使用<strong>双缓冲</strong>实现外设间的并行，使输入设备和硬盘可以同时工作。</p>
              </Answer>

              <Q id="ex4-22"><b>（2）</b>200 个磁道(0~199)，刚结束 125 号，正在处理 149 号，请求序列 88,147,95,177,94,150,102,175,138。</Q>
              <Answer>
                <p><strong>① FCFS 先来先服务：</strong></p>
                <p>当前 149 → 88(61) → 147(59) → 95(52) → 177(82) → 94(83) → 150(56) → 102(48) → 175(73) → 138(37)</p>
                <p>总移动 = 61+59+52+82+83+56+48+73+37 = <strong>551</strong></p>
                <p><strong>② 电梯调度（向磁道号增大方向）：</strong></p>
                <p>当前方向为增大（正在处理 149）：149 → 150(1) → 175(25) → 177(2) → 147(30) → 138(9) → 102(36) → 95(7) → 94(1) → 88(6)</p>
                <p>总移动 = 1+25+2+30+9+36+7+1+6 = <strong>117</strong></p>
              </Answer>

              <Q id="ex4-23"><b>（3）</b>当前磁头位于 100 号磁道，请求序列 55,58,39,18,90,160,150,38,180。采用 SSTF 求总移动磁道数。</Q>
              <Answer>
                <p><strong>SSTF 最短查找时间优先：</strong></p>
                <p>100 → 90(10) → 58(32) → 55(3) → 39(16) → 38(1) → 18(20) → 150(132) → 160(10) → 180(20)</p>
                <p>总移动 = 10+32+3+16+1+20+132+10+20 = <strong>244</strong></p>
                <p>注意：90 距离 10 最近，然后 58 距离 32，55 距离 3，依次类推。</p>
              </Answer>
            </div>
          </section>

          {/* =========================== 习题 5 =========================== */}
          <section id="ex5" className="os-ex-section">
            <h2><span className="os-ex-num">五</span>习题 5 — 文件管理</h2>

            <div className="os-ex-group">
              <h3>1. 选择题</h3>

              <Q id="ex5-1"><b>（1）</b>位示图方法可用于（A）。<br/>A. 外存空间的管理  B. 硬盘的驱动调度  C. 文件目录的查找  D. 虚拟存储页面置换</Q>
              <Answer>A.位示图是外存空闲块管理的方法。</Answer>

              <Q id="ex5-2"><b>（2）</b>为了保证存取文件的可靠性，要求用户读一个文件前，应先请求系统执行（A）文件操作。<br/>A. 打开  B. 建立  C. 关闭  D. 删除</Q>
              <Answer>A.读文件前必须先打开文件，系统将文件目录信息读入内存，建立访问路径。</Answer>

              <Q id="ex5-3"><b>（3）</b>文件控制块中不包括（D）信息。<br/>A. 文件名  B. 文件访问权限说明  C. 文件物理位置信息  D. 磁盘坏扇区</Q>
              <Answer>D.FCB 包含文件名、权限、物理位置等信息，磁盘坏扇区属于磁盘管理范畴。</Answer>

              <Q id="ex5-4"><b>（4）</b>磁带机是常用的（C）存储设备。<br/>A. 直接  B. 随机  C. 顺序  D. 磁盘</Q>
              <Answer>C.磁带必须顺序存取，不能随机访问。</Answer>

              <Q id="ex5-5"><b>（5）</b>文件系统中用（D）来统一管理文件。<br/>A. 堆栈结构  B. 指针  C. 页表  D. 目录</Q>
              <Answer>D.文件目录是文件系统管理文件的基本结构，实现按名存取。</Answer>

              <Q id="ex5-6"><b>（6）</b>下列有关文件管理的叙述中，正确的是（C）。<br/>A. 二级文件目录结构中不同用户不能用相同的文件名<br/>B. 逻辑记录的大小与存储介质分块的大小必须一致<br/>C. 文件系统主要功能之一是实现按名存取<br/>D. 一级目录结构中不同用户的文件可以用相同的文件名</Q>
              <Answer>C.按名存取是文件系统的核心功能。A：二级目录允许不同用户有相同文件名（通过 UFD 隔离）。D：一级目录不允许重名。</Answer>

              <Q id="ex5-7"><b>（7）</b>文件系统采用树状多级目录结构后，不同用户的文件名（C）。<br/>A. 应该相同  B. 应该不同  C. 可以相同，也可以不同  D. 受系统约束</Q>
              <Answer>C.树状多级目录下，只要路径不同即可，不同用户可以有相同文件名。</Answer>

              <Q id="ex5-8"><b>（8）</b>在 Linux 操作系统中，文件系统的目录结构采用的是（C）。<br/>A. 线性结构  B. 二维结构  C. 树状结构  D. 网状结构</Q>
              <Answer>C.Linux 采用树状多级目录结构。</Answer>

              <Q id="ex5-9"><b>（9）</b>绝对路径是从（B）开始逐步向下到达指定文件的路径。<br/>A. 当前目录  B. 根目录  C. 多级目录  D. 二级目录</Q>
              <Answer>B.绝对路径从根目录"/"开始；相对路径从当前目录开始。</Answer>

              <Q id="ex5-10"><b>（10）</b>文件物理结构是一种文件（A）的文件组织形式。<br/>A. 在外围设备上  B. 从用户观点看  C. 虚拟存储  D. 目录</Q>
              <Answer>A.物理结构研究文件在外存上的组织方式（逻辑结构是从用户观点看的）。</Answer>

              <Q id="ex5-11"><b>（11）</b>适合存放在磁带上的是（A）。<br/>A. 顺序文件  B. Hash 文件  C. 索引文件  D. 串联文件</Q>
              <Answer>A.磁带只能顺序存取，因此顺序文件最适合存放到磁带上。</Answer>

              <Q id="ex5-12"><b>（12）</b>适合随机访问且易于文件扩展的是（B）。<br/>A. 顺序文件结构  B. 索引文件结构  C. 链接文件结构  D. 串联文件结构</Q>
              <Answer>B.索引结构通过索引表实现随机访问，且扩展方便（只需分配新块并添加索引项）。</Answer>

              <Q id="ex5-13"><b>（13）</b>链接文件结构的缺点是（C）。<br/>A. 不便于动态增删  B. 必须连续分配物理块  C. 不便于直接存取  D. 必须事先提出文件的最大长度</Q>
              <Answer>C.链接结构只能顺序存取，不能直接随机访问。</Answer>
            </div>

            <div className="os-ex-group">
              <h3>2. 填空题</h3>

              <Q id="ex5-14"><b>（1）</b>UNIX 系统将文件分为 3 类：普通文件、<strong>目录文件</strong> 和特殊文件。</Q>
              <Q id="ex5-15"><b>（2）</b>按文件的逻辑存储结构划分，文件分为有结构文件和无结构文件。有结构文件又称为 <strong>记录式</strong> 文件；无结构文件又称 <strong>流式</strong> 文件。</Q>
              <Q id="ex5-16"><b>（3）</b>无结构流式文件的基本信息单位是 <strong>字节</strong>。</Q>
              <Q id="ex5-17"><b>（4）</b>二级目录结构是指把系统中的目录分为二级，这两级目录分别是 <strong>主文件目录（MFD）</strong> 和用户文件目录。</Q>
              <Q id="ex5-18"><b>（5）</b>目录文件是由若干 <strong>文件控制块（FCB）</strong> 构成的有序集合。</Q>
              <Q id="ex5-19"><b>（6）</b>顺序存取速度最快的物理结构文件是 <strong>顺序</strong> 文件，不适宜直接存取的物理结构文件是 <strong>链接（串联）</strong> 文件。</Q>
              <Q id="ex5-20"><b>（7）</b>Linux 中文件 F 的存取权限为 "– r w x r – x – – –"，表示这是一个普通文件，同组用户对该文件的读写权限为 <strong>r-x（可读可执行）</strong>。</Q>
            </div>

            <div className="os-ex-group">
              <h3>3. 简答题</h3>

              <Q id="ex5-21"><b>（1）</b>请简述操作系统中文件管理部分应该具有的基本功能。</Q>
              <Answer>
                <ol>
                  <li><strong>按名存取：</strong>用户通过文件名访问文件。</li>
                  <li><strong>文件目录管理：</strong>建立和维护文件目录。</li>
                  <li><strong>文件存储空间管理：</strong>分配和回收外存空间。</li>
                  <li><strong>文件共享和保护：</strong>控制不同用户的访问权限。</li>
                  <li><strong>文件操作：</strong>提供创建、打开、读、写、关闭、删除等操作。</li>
                </ol>
              </Answer>

              <Q id="ex5-22"><b>（2）</b>影响文件安全性的主要因素及针对这些因素采取的主要措施有哪些？</Q>
              <Answer>
                <p><strong>主要因素：</strong></p>
                <ul>
                  <li>人为因素（非法访问、误操作）</li>
                  <li>系统因素（软硬件故障）</li>
                  <li>自然灾害（火灾、水灾等）</li>
                </ul>
                <p><strong>主要措施：</strong></p>
                <ul>
                  <li><strong>访问控制：</strong>设置用户权限（读/写/执行）。</li>
                  <li><strong>加密：</strong>文件内容加密存储。</li>
                  <li><strong>备份：</strong>定期备份文件数据。</li>
                  <li><strong>容错：</strong>RAID 等技术提高可靠性。</li>
                </ul>
              </Answer>

              <Q id="ex5-23"><b>（3）</b>单级目录的优缺点有哪些？</Q>
              <Answer>
                <p><strong>优点：</strong>结构简单，实现容易。</p>
                <p><strong>缺点：</strong></p>
                <ul>
                  <li>所有文件在同一目录下，<strong>文件名不能重名</strong>。</li>
                  <li>不支持文件分组管理。</li>
                  <li>当文件数量多时，目录检索速度慢。</li>
                  <li>不利于文件共享和保护。</li>
                </ul>
              </Answer>

              <Q id="ex5-24"><b>（4）</b>简单描述顺序文件结构文件的优缺点。</Q>
              <Answer>
                <p><strong>优点：</strong></p>
                <ul>
                  <li>存取速度最快（顺序存取和随机存取都只需一次寻址）。</li>
                  <li>实现简单，管理开销小。</li>
                </ul>
                <p><strong>缺点：</strong></p>
                <ul>
                  <li>要求连续的存储空间，产生外部碎片。</li>
                  <li>文件创建时必须确定大小，不利于动态增长。</li>
                  <li>删除/插入记录需要移动大量数据。</li>
                </ul>
              </Answer>
            </div>

            <div className="os-ex-group">
              <h3>4. 解答题</h3>

              <Q id="ex5-25"><b>（1）</b>磁盘物理块大小为 4KB，每个物理块号占 4 字节，试求在两级索引结构中允许的最大文件长度。</Q>
              <Answer>
                <p>一个索引块可存放的索引项数 = 4KB / 4B = <strong>1024 项</strong></p>
                <ul>
                  <li><strong>一级索引：</strong>1024 × 4KB = <strong>4MB</strong></li>
                  <li><strong>二级索引：</strong>1024 × 1024 × 4KB = <strong>4GB</strong></li>
                </ul>
                <p>两级索引最大文件长度 = 4MB + 4GB ≈ <strong>4.004GB</strong></p>
              </Answer>

              <Q id="ex5-26"><b>（2）</b>Linux 混合索引方式：13 个索引项，每项 4B，磁盘块 4KB.直接寻址、一次/二次/三次间接寻址分别可表示多大的文件？</Q>
              <Answer>
                <p>一个索引块可存放的索引项数 = 4KB / 4B = <strong>1024 项</strong></p>
                <ul>
                  <li><strong>直接寻址（10 项）：</strong>10 × 4KB = <strong>40KB</strong></li>
                  <li><strong>一次间接（第 11 项→1024 块）：</strong>1024 × 4KB = <strong>4MB</strong></li>
                  <li><strong>二次间接（第 12 项→1024² 块）：</strong>1024 × 1024 × 4KB = <strong>4GB</strong></li>
                  <li><strong>三次间接（第 13 项→1024³ 块）：</strong>1024³ × 4KB = <strong>4TB</strong></li>
                </ul>
              </Answer>
            </div>
          </section>
        </main>
        </div>{/* end os-ex-layout */}

        <footer className="os-ex-footer">
          <Link to="/courses/os/" className="os-ex-footer-link">← 返回「操作系统」笔记</Link>
          <Link to="/" className="os-ex-footer-link">← 返回首页</Link>
        </footer>
      </div>
    </div>
  )
}
