import { useState } from 'react'
import { useAuth } from './AuthContext'
import { formatStudyTime } from './progressSnapshot'
import './account.css'

function StatCard({ label, value }) {
  return (
    <div className="account-stat">
      <strong>{value}</strong>
      <span>{label}</span>
    </div>
  )
}

export default function AccountWidget() {
  const { user, stats, apiAvailable, login, register, logout } = useAuth()
  const [open, setOpen] = useState(false)
  const [mode, setMode] = useState('login')
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [message, setMessage] = useState('')
  const [busy, setBusy] = useState(false)

  const submit = async event => {
    event.preventDefault()
    setBusy(true)
    setMessage('')
    try {
      if (mode === 'register') await register(username, password)
      else await login(username, password)
      setPassword('')
      setMessage('已登录，并自动导入本机学习记录。')
    } catch (error) {
      const copy = {
        username_exists: '这个用户名已经存在。',
        invalid_credentials: '用户名或密码不正确。',
        invalid_input: '用户名至少 3 位，密码至少 6 位。',
      }
      setMessage(copy[error.message] || '账号服务暂时不可用。')
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      <button type="button" className="account-entry" onClick={() => setOpen(true)}>
        {user ? user.username : '登录 / 注册'}
        {!apiAvailable && <span>未同步</span>}
      </button>
      {open && (
        <div className="account-overlay" onMouseDown={() => setOpen(false)}>
          <section className="account-panel" onMouseDown={event => event.stopPropagation()}>
            <button type="button" className="account-close" onClick={() => setOpen(false)} aria-label="关闭">×</button>
            <div className="account-head">
              <span>账号中心</span>
              <h2>{user ? `你好，${user.username}` : '登录后同步学习记录'}</h2>
              <p>{apiAvailable ? '学习进度会保存到本机 Postgres 账号。' : '账号 API 未连接，页面会继续使用本地记录。'}</p>
            </div>

            {user ? (
              <>
                <div className="account-grid">
                  <StatCard label="累计学习" value={formatStudyTime(stats?.totalStudySeconds || 0)} />
                  <StatCard label="章节完成" value={stats?.chapterDoneCount || 0} />
                  <StatCard label="错题记录" value={stats?.wrongCount || 0} />
                  <StatCard label="练习完成" value={stats?.practiceDoneCount || 0} />
                  <StatCard label="掌握记录" value={stats?.masteryItemCount || 0} />
                  <StatCard label="连续学习" value={`${stats?.currentStreakDays || 0} 天`} />
                </div>
                <div className="account-recent">
                  <strong>最近阅读</strong>
                  {(stats?.recentPaths || []).length > 0 ? (
                    <ul>{stats.recentPaths.map(path => <li key={path}>{path}</li>)}</ul>
                  ) : (
                    <p>暂无账号侧记录，继续学习后会自动出现。</p>
                  )}
                </div>
                <button type="button" className="account-submit account-logout" onClick={logout}>退出登录</button>
              </>
            ) : (
              <form className="account-form" onSubmit={submit}>
                <div className="account-tabs">
                  <button type="button" className={mode === 'login' ? 'active' : ''} onClick={() => setMode('login')}>登录</button>
                  <button type="button" className={mode === 'register' ? 'active' : ''} onClick={() => setMode('register')}>注册</button>
                </div>
                <label>
                  用户名
                  <input value={username} onChange={event => setUsername(event.target.value)} autoComplete="username" />
                </label>
                <label>
                  密码
                  <input type="password" value={password} onChange={event => setPassword(event.target.value)} autoComplete={mode === 'login' ? 'current-password' : 'new-password'} />
                </label>
                <button type="submit" className="account-submit" disabled={busy}>{busy ? '处理中...' : mode === 'login' ? '登录' : '注册并登录'}</button>
                {message && <p className="account-message">{message}</p>}
              </form>
            )}
          </section>
        </div>
      )}
    </>
  )
}
