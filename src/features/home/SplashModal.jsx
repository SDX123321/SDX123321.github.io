import { useState, useEffect } from 'react'

const LS_COUNT = 'visit_count'
const LS_DISMISSED = 'reward_dismissed'
const LS_SPLASH_SEEN = 'splash_seen_v2'
const QR_URL = 'https://pub-0e031b3dd57041d0928acde612f1d662.r2.dev/images/赞赏码.png'

function getVisitCount() {
  try { return parseInt(localStorage.getItem(LS_COUNT) || '0') } catch (e) { return 0 }
}
function setVisitCount(n) {
  try { localStorage.setItem(LS_COUNT, String(n)) } catch (e) {}
}

export default function SplashModal() {
  const [show, setShow] = useState(false)
  const [showReward, setShowReward] = useState(false)

  useEffect(() => {
    try {
      if (localStorage.getItem(LS_DISMISSED) === '1') return
      const count = getVisitCount() + 1
      setVisitCount(count)
      // Show on 1st visit and every 3rd visit
      if (count === 1 || count % 3 === 0) {
        setTimeout(() => setShow(true), 1500)
      }
    } catch (e) {}
  }, [])

  const dismissPermanently = () => {
    setShow(false)
    try { localStorage.setItem(LS_DISMISSED, '1') } catch (e) {}
  }

  return (
    <>
      {/* Splash modal - appears on 1st and every 3rd visit */}
      {show && (
        <div onClick={(e) => { if (e.target === e.currentTarget) setShow(false) }} style={{
          display: 'flex', position: 'fixed', inset: 0, background: 'rgba(0,0,0,.8)',
          zIndex: 1001, alignItems: 'center', justifyContent: 'center',
        }}>
          <div className="splash-box">
            <p style={{ fontSize: '1.1rem', fontWeight: 700, color: 'var(--text)', marginBottom: 6 }}>✨ 欢迎来到期末复习笔记</p>
            <p style={{ fontSize: '.85rem', color: 'var(--text2)', marginBottom: 20 }}>如果这份笔记对你有帮助，可以请作者喝杯咖啡 ☕</p>
            <img src={QR_URL} alt="赞赏码" style={{
              width: 280, borderRadius: 14, display: 'block', margin: '0 auto',
              boxShadow: '0 8px 30px rgba(0,0,0,.4)',
            }} />
            <p style={{ color: 'var(--text)', fontSize: '.88rem', marginTop: 16 }}>微信扫码赞赏</p>
            <div style={{ display: 'flex', gap: 12, justifyContent: 'center', marginTop: 20 }}>
              <button onClick={() => setShow(false)} style={{
                padding: '10px 28px', borderRadius: 10, border: '1px solid var(--border)',
                background: 'var(--card)', color: 'var(--text2)', fontSize: '.9rem', cursor: 'pointer',
              }}>关闭</button>
              <button onClick={dismissPermanently} style={{
                padding: '10px 28px', borderRadius: 10, border: '1px solid #ef4444',
                background: 'rgba(239,68,68,.1)', color: '#fca5a5', fontSize: '.9rem', cursor: 'pointer',
              }}>残忍拒绝</button>
            </div>
            <p style={{ color: 'var(--text3)', fontSize: '.72rem', marginTop: 10 }}>「残忍拒绝」后不再显示</p>
          </div>
        </div>
      )}

      {/* Reward modal - accessed from footer link */}
      {showReward && (
        <div onClick={(e) => { if (e.target === e.currentTarget) setShowReward(false) }} style={{
          display: 'flex', position: 'fixed', inset: 0, background: 'rgba(0,0,0,.7)',
          zIndex: 999, alignItems: 'center', justifyContent: 'center',
        }}>
          <div style={{
            position: 'relative', background: 'var(--card)', borderRadius: 16,
            padding: '28px 28px 20px', textAlign: 'center',
            border: '1px solid var(--border)', maxWidth: '90vw',
            boxShadow: '0 20px 60px rgba(0,0,0,.5)',
          }}>
            <span onClick={() => setShowReward(false)} style={{
              position: 'absolute', top: 10, right: 14, cursor: 'pointer',
              color: 'var(--text3)', fontSize: '1.4rem', lineHeight: 1,
            }}>&times;</span>
            <img src={QR_URL} alt="赞赏码" style={{ width: 260, borderRadius: 12, display: 'block', margin: '0 auto' }} />
            <p style={{ color: 'var(--text)', fontSize: '.9rem', marginTop: 14 }}>微信扫码赞赏</p>
            <p style={{ color: 'var(--text3)', fontSize: '.78rem', marginTop: 4 }}>感谢支持 ❤</p>
          </div>
        </div>
      )}

      {/* Footer link to open reward modal */}
      <span
        onClick={() => setShowReward(true)}
        style={{ cursor: 'pointer', color: 'var(--text3)', fontSize: '.85rem', transition: 'color .2s' }}
        onMouseOver={(e) => e.currentTarget.style.color = '#f59e0b'}
        onMouseOut={(e) => e.currentTarget.style.color = 'var(--text3)'}
      >
        通过赞赏码请作者喝杯咖啡 ☕
      </span>
    </>
  )
}
