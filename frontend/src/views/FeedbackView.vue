<script setup lang="ts">
import { ref } from 'vue'
import { useRouter, useRoute } from 'vue-router'

const router = useRouter()
const route = useRoute()

// 判断来源页面：结果页带 from=result 参数
const fromResult = route.query.from === 'result'

function goBack() {
  if (fromResult) {
    router.back()
  } else {
    router.push('/')
  }
}

const category = ref('')
const content = ref('')
const contact = ref('')
const isSubmitting = ref(false)
const submitted = ref(false)
const error = ref('')

const categories = [
  { value: 'bug', label: 'Bug 反馈' },
  { value: 'question', label: '题目建议' },
  { value: 'feature', label: '功能建议' },
  { value: 'personality', label: '人格建议' },
  { value: 'illustration', label: '插图建议' },
  { value: 'other', label: '其他' },
]

async function submit() {
  if (!category.value || !content.value.trim()) {
    error.value = '请填写反馈类型和内容'
    return
  }
  error.value = ''
  isSubmitting.value = true

  try {
    // 走后端代理提交（EmailJS 凭据仅存服务端，避免前端暴露）
    const res = await fetch('/api', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'feedback-send',
        params: {
          category: categories.find(c => c.value === category.value)?.label || category.value,
          content: content.value.trim(),
          contact: contact.value.trim(),
        },
      }),
    })
    const data = await res.json()

    if (data.success) {
      submitted.value = true
    } else {
      throw new Error(data.error || `HTTP ${res.status}`)
    }
  } catch (e) {
    error.value = '提交失败，请稍后重试：' + (e instanceof Error ? e.message : '未知错误')
  } finally {
    isSubmitting.value = false
  }
}
</script>

<template>
  <div class="feedback-page">
    <div class="content">
      <!-- 顶部 -->
      <div class="top-bar">
        <button class="back-btn" @click="goBack">
          <span aria-hidden="true">←</span> {{ fromResult ? '返回' : '返回首页' }}
        </button>
      </div>

      <h1 class="title">意见反馈</h1>
      <p class="subtitle">帮助我们让 NFTI 变得更好</p>

      <!-- 提交成功 -->
      <div v-if="submitted" class="success-card">
        <div class="success-icon" aria-hidden="true">✓</div>
        <h2>反馈已提交</h2>
        <p>感谢你的宝贵意见！我们会认真阅读每一条反馈。</p>
        <button class="primary-btn" @click="router.push('/')">返回首页</button>
      </div>

      <!-- 表单 -->
      <form v-else class="form" @submit.prevent="submit">
        <div class="field">
          <label>反馈类型</label>
          <div class="category-grid">
            <button
              v-for="c in categories"
              :key="c.value"
              type="button"
              class="category-btn"
              :class="{ active: category === c.value }"
              @click="category = c.value"
            >
              {{ c.label }}
            </button>
          </div>
        </div>

        <div class="field">
          <label>反馈内容 <span class="required">*</span></label>
          <textarea
            v-model="content"
            rows="6"
            placeholder="请详细描述你遇到的问题或建议..."
          ></textarea>
        </div>

        <div class="field">
          <label>联系方式（选填）</label>
          <input
            v-model="contact"
            type="text"
            placeholder="QQ / 邮箱 / 手机号，方便我们跟进"
          />
        </div>

        <div v-if="error" class="error-msg">{{ error }}</div>

        <button type="submit" class="submit-btn" :disabled="isSubmitting">
          {{ isSubmitting ? '提交中...' : '提交反馈' }}
        </button>
      </form>
    </div>
  </div>
</template>

<style scoped>
.feedback-page {
  min-height: 100vh;
  background: var(--color-bg);
  padding: var(--space-4);
}
.content {
  max-width: 520px;
  margin: 0 auto;
  padding: var(--space-6) var(--space-5) var(--space-12);
}

.top-bar {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: var(--space-6);
}
.back-btn {
  display: inline-flex;
  align-items: center;
  gap: var(--space-2);
  background: none;
  border: none;
  font-size: 14px;
  color: var(--color-text-muted);
  cursor: pointer;
  padding: var(--space-2) 0;
  transition: color 150ms ease;
}
.back-btn:hover {
  color: var(--color-primary);
}

.title {
  font-family: var(--font-display);
  font-size: 28px;
  font-weight: 700;
  color: var(--gray-900);
  margin-bottom: var(--space-2);
}
.subtitle {
  font-size: 14px;
  color: var(--gray-500);
  margin-bottom: var(--space-8);
}

.form {
  display: flex;
  flex-direction: column;
  gap: var(--space-6);
}
.field {
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
}
.field label {
  font-size: 14px;
  font-weight: 600;
  color: var(--gray-700);
}
.required {
  color: var(--rose-500);
}

.category-grid {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: var(--space-2);
}
.category-btn {
  padding: var(--space-3) var(--space-4);
  border-radius: 12px;
  border: 1.5px solid var(--color-border);
  background: var(--gray-0);
  font-size: 14px;
  color: var(--gray-600);
  cursor: pointer;
  transition: all 150ms ease;
}
.category-btn:hover {
  border-color: var(--color-primary);
  color: var(--color-primary);
}
.category-btn.active {
  border-color: var(--color-primary);
  background: var(--color-primary-soft);
  color: var(--color-primary);
  font-weight: 600;
}

textarea,
input[type="text"] {
  padding: var(--space-3) var(--space-4);
  border-radius: 12px;
  border: 1.5px solid var(--color-border);
  background: var(--gray-0);
  font-size: 15px;
  color: var(--gray-900);
  line-height: 1.6;
  resize: vertical;
  transition: border-color 150ms ease;
}
textarea:focus,
input[type="text"]:focus {
  outline: none;
  border-color: var(--color-primary);
}
textarea::placeholder,
input[type="text"]::placeholder {
  color: var(--gray-400);
}

.error-msg {
  font-size: 13px;
  color: var(--rose-500);
  padding: var(--space-2) var(--space-3);
  background: var(--rose-50);
  border-radius: 8px;
}

.submit-btn {
  padding: var(--space-4);
  border-radius: 16px;
  border: none;
  background: var(--color-primary);
  color: var(--gray-0);
  font-size: 16px;
  font-weight: 600;
  cursor: pointer;
  transition: all 150ms ease;
}
.submit-btn:hover:not(:disabled) {
  opacity: 0.9;
  transform: translateY(-1px);
}
.submit-btn:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.success-card {
  text-align: center;
  padding: var(--space-10) var(--space-6);
  background: var(--gray-0);
  border-radius: 24px;
  border: 1px solid var(--color-border);
}
.success-icon {
  width: 56px;
  height: 56px;
  margin: 0 auto var(--space-4);
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--emerald-500);
  color: var(--gray-0);
  font-size: 24px;
  border-radius: 50%;
}
.success-card h2 {
  font-family: var(--font-display);
  font-size: 22px;
  font-weight: 700;
  color: var(--gray-900);
  margin-bottom: var(--space-2);
}
.success-card p {
  font-size: 14px;
  color: var(--gray-500);
  margin-bottom: var(--space-6);
}
.primary-btn {
  padding: var(--space-3) var(--space-6);
  border-radius: 12px;
  border: none;
  background: var(--color-primary);
  color: var(--gray-0);
  font-size: 15px;
  font-weight: 600;
  cursor: pointer;
}
</style>
