<script setup lang="ts">
/**
 * SplashModal — 替代 React 的 features/home/SplashModal.jsx
 * 首次访问及每 3 次访问弹出赞赏码弹窗。
 */
import { ref, onMounted } from 'vue'

const LS_COUNT = 'visit_count'
const LS_DISMISSED = 'reward_dismissed'
const QR_URL = 'https://r2.zzzzcx.cn/images/赞赏码.png'

const show = ref(false)
const showReward = ref(false)

onMounted(() => {
  try {
    if (localStorage.getItem(LS_DISMISSED) === '1') return
    const count = parseInt(localStorage.getItem(LS_COUNT) || '0') + 1
    localStorage.setItem(LS_COUNT, String(count))
    if (count === 1 || count % 3 === 0) {
      setTimeout(() => {
        show.value = true
      }, 1500)
    }
  } catch {
    /* private mode */
  }
})

function dismissPermanently() {
  show.value = false
  try {
    localStorage.setItem(LS_DISMISSED, '1')
  } catch {
    /* noop */
  }
}

// 供父组件或页脚链接调用
defineExpose({
  openReward: () => {
    showReward.value = true
  },
})
</script>

<template>
  <Teleport to="body">
    <!-- 欢迎弹窗 -->
    <div v-if="show" class="sm-overlay" @click.self="show = false">
      <div class="splash-box">
        <p class="sm-head">✨ 欢迎来到期末复习笔记</p>
        <p class="sm-sub">如果这份笔记对你有帮助，可以请作者喝杯咖啡 ☕</p>
        <img :src="QR_URL" alt="赞赏码" class="sm-qr" />
        <p class="sm-hint">微信扫码赞赏</p>
        <div class="sm-btns">
          <button class="sm-btn sm-btn-close" @click="show = false">关闭</button>
          <button class="sm-btn sm-btn-dismiss" @click="dismissPermanently">残忍拒绝</button>
        </div>
        <p class="sm-footnote">「残忍拒绝」后不再显示</p>
      </div>
    </div>

    <!-- 赞赏弹窗（页脚链接触发） -->
    <div v-if="showReward" class="sm-overlay" @click.self="showReward = false">
      <div class="sm-reward-panel">
        <span class="sm-reward-close" @click="showReward = false">&times;</span>
        <img :src="QR_URL" alt="赞赏码" class="sm-qr" />
        <p class="sm-hint">微信扫码赞赏</p>
        <p class="sm-footnote">感谢支持 ❤</p>
      </div>
    </div>
  </Teleport>

  <!-- 页脚链接 -->
  <span class="sm-footer-link" @click="showReward = true"> 通过赞赏码请作者喝杯咖啡 ☕ </span>
</template>

<style scoped>
.sm-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.8);
  z-index: 1001;
  display: flex;
  align-items: center;
  justify-content: center;
}
.sm-head {
  font-size: 1.1rem;
  font-weight: 700;
  color: var(--text);
  margin-bottom: 6px;
}
.sm-sub {
  font-size: 0.85rem;
  color: var(--text2);
  margin-bottom: 20px;
}
.sm-qr {
  width: 280px;
  border-radius: 14px;
  display: block;
  margin: 0 auto;
  box-shadow: 0 8px 30px rgba(0, 0, 0, 0.4);
}
.sm-hint {
  color: var(--text);
  font-size: 0.88rem;
  margin-top: 16px;
  text-align: center;
}
.sm-btns {
  display: flex;
  gap: 12px;
  justify-content: center;
  margin-top: 20px;
}
.sm-btn {
  padding: 10px 28px;
  border-radius: 10px;
  font-size: 0.9rem;
  cursor: pointer;
}
.sm-btn-close {
  border: 1px solid var(--border);
  background: var(--card);
  color: var(--text2);
}
.sm-btn-dismiss {
  border: 1px solid #ef4444;
  background: rgba(239, 68, 68, 0.1);
  color: #fca5a5;
}
.sm-footnote {
  color: var(--text3);
  font-size: 0.72rem;
  margin-top: 10px;
  text-align: center;
}
.sm-reward-panel {
  position: relative;
  background: var(--card);
  border-radius: 16px;
  padding: 28px 28px 20px;
  text-align: center;
  border: 1px solid var(--border);
  max-width: 90vw;
  box-shadow: 0 20px 60px rgba(0, 0, 0, 0.5);
}
.sm-reward-close {
  position: absolute;
  top: 10px;
  right: 14px;
  cursor: pointer;
  color: var(--text3);
  font-size: 1.4rem;
  line-height: 1;
}
.sm-footer-link {
  cursor: pointer;
  color: var(--text3);
  font-size: 0.85rem;
  transition: color 0.2s;
}
.sm-footer-link:hover {
  color: #f59e0b;
}
</style>
