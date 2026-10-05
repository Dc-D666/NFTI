import { createRouter, createWebHistory } from 'vue-router'
import HomeView from '@/views/HomeView.vue'
import TestView from '@/views/TestView.vue'
import ResultView from '@/views/ResultView.vue'
import ProfilePage from '@/views/ProfilePage.vue'
import StatsView from '@/views/StatsView.vue'
import FeedbackView from '@/views/FeedbackView.vue'
import HollandTestView from '@/views/HollandTestView.vue'
import HollandResultView from '@/views/HollandResultView.vue'
import NftiGalleryView from '@/views/NftiGalleryView.vue'
import HollandGalleryView from '@/views/HollandGalleryView.vue'
import GalleryView from '@/views/GalleryView.vue'
import AdminView from '@/views/AdminView.vue'
import MatchView from '@/views/MatchView.vue'
import MatchResultView from '@/views/MatchResultView.vue'
import { getStoredSession } from '@/services/channelAuth'
import { adminCheck } from '@/services/channelDb'
import { useTestStore } from '@/stores/testStore'

const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes: [
    {
      path: '/',
      name: 'home',
      component: HomeView,
    },
    {
      path: '/test/:mode/:page',
      name: 'test',
      component: TestView,
      beforeEnter: (to) => {
        const mode = to.params.mode as string
        const page = parseInt(to.params.page as string)
        if (!['quick', 'full', 'debug'].includes(mode)) return '/'
        // full/debug 含 48 题 + 附加题 149，共 49 题，每页 4 题 → 13 页
        const maxPage = mode === 'quick' ? 3 : 13
        if (isNaN(page) || page < 1 || page > maxPage) {
          return `/test/${mode}/1`
        }
      },
    },
    {
      path: '/result/:mode',
      name: 'result',
      component: ResultView,
      beforeEnter: (to) => {
        const mode = to.params.mode as string
        if (!['quick', 'full', 'debug'].includes(mode)) return '/'
        const store = useTestStore()
        if (!store.isComplete || store.mode !== mode) {
          return '/'
        }
      },
    },
    {
      path: '/holland-test',
      redirect: '/holland-test/1',
    },
    {
      path: '/holland-test/:page',
      name: 'holland-test',
      component: HollandTestView,
      beforeEnter: (to) => {
        const page = parseInt(to.params.page as string)
        if (isNaN(page) || page < 1 || page > 12) return '/holland-test/1'
      },
    },
    {
      path: '/holland-result',
      name: 'holland-result',
      component: HollandResultView,
      beforeEnter: () => {
        if (!sessionStorage.getItem('holland_result')) return '/'
      },
    },
    {
      path: '/feedback',
      name: 'feedback',
      component: FeedbackView,
    },
    {
      path: '/match',
      name: 'match',
      component: MatchView,
    },
    {
      path: '/match/result/:id',
      name: 'match-result',
      component: MatchResultView,
    },
    {
      path: '/stats',
      name: 'stats',
      component: StatsView,
    },
    {
      path: '/gallery',
      name: 'gallery',
      component: GalleryView,
    },
    {
      path: '/gallery/nfti',
      name: 'nfti-gallery',
      component: NftiGalleryView,
      beforeEnter: (to) => {
        // 与 GalleryView 的门禁一致：未登录（无 QQ session）不允许直入子图鉴页
        if (!getStoredSession()?.sessionId) return '/gallery'
      },
    },
    {
      path: '/gallery/holland',
      name: 'holland-gallery',
      component: HollandGalleryView,
      beforeEnter: (to) => {
        if (!getStoredSession()?.sessionId) return '/gallery'
      },
    },
    {
      path: '/profile',
      name: 'profile',
      component: ProfilePage,
    },
    {
      path: '/admin',
      name: 'admin',
      component: AdminView,
      // 纯 URL 直达：无 session 或非管理员一律回首页（fail-closed）
      beforeEnter: async () => {
        const stored = getStoredSession()
        if (!stored?.sessionId) return '/'
        try {
          const check = await adminCheck(false)
          if (!check.isAdmin) return '/'
        } catch {
          return '/'
        }
        return true
      },
    },
  ],
})

export default router
