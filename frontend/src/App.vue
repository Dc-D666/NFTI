<script setup lang="ts">
import { RouterView } from 'vue-router'
</script>

<template>
  <div class="app-shell">
    <RouterView v-slot="{ Component }">
      <Transition name="page" mode="out-in">
        <component :is="Component" :key="$route.fullPath" />
      </Transition>
    </RouterView>

    <footer class="global-footer">
      <div class="beian-row">
        <a
          href="https://beian.miit.gov.cn/"
          target="_blank"
          rel="noopener noreferrer"
          class="beian-link"
        >
          湘ICP备2026024339-1号
        </a>
      </div>
    </footer>
  </div>
</template>

<style>
/* ============================================================
   NFTI Design System — Golden Time (warm earthy palette)
   Legacy tokens mapped to GT palette for backward compatibility.
   New GT tokens (HSL) live in golden-time.css and drive the
   refactored views via Tailwind utilities.
   ============================================================ */

:root {
  /* Primary: Deep Brown — 沉稳、温暖、校园气质 (replaces indigo) */
  --brown-50:  #FBF8F3;
  --brown-100: #F0EBE0;
  --brown-200: #E4DDCD;
  --brown-300: #D8CFBE;
  --brown-400: #BBA888;
  --brown-500: #9C8B6A;
  --brown-600: #6E5F48;
  --brown-700: #4D4031;
  --brown-800: #2E2219;
  --brown-900: #1F1813;

  /* Accent: Amber Gold — 温暖、青春、隐藏款的荣耀 */
  --amber-50:  #fffbeb;
  --amber-100: #fef3c7;
  --amber-200: #fde68a;
  --amber-300: #fcd34d;
  --amber-400: #fbbf24;
  --amber-500: #f59e0b;
  --amber-600: #d97706;
  --amber-700: #b45309;

  /* Rose: 活力、情感、人格色彩 */
  --rose-50:  #fff1f2;
  --rose-100: #ffe4e6;
  --rose-300: #fda4af;
  --rose-400: #fb7185;
  --rose-500: #f43f5e;
  --rose-600: #e11d48;

  /* Neutral: warm grays (带暖色调的灰，不死板) */
  --gray-0:   #ffffff;
  --gray-50:  #FBF8F3;
  --gray-100: #F0EBE0;
  --gray-200: #E4DDCD;
  --gray-300: #D8CFBE;
  --gray-400: #9C8B6A;
  --gray-500: #6E6253;
  --gray-600: #524739;
  --gray-700: #3A3128;
  --gray-800: #2E2219;
  --gray-900: #1F1813;

  /* Indigo alias → warm brown (backward compat) */
  --indigo-50:  var(--brown-50);
  --indigo-100: var(--brown-100);
  --indigo-200: var(--brown-200);
  --indigo-300: var(--brown-300);
  --indigo-400: var(--brown-400);
  --indigo-500: var(--brown-500);
  --indigo-600: var(--brown-800);
  --indigo-700: var(--brown-700);
  --indigo-800: var(--brown-800);
  --indigo-900: var(--brown-900);
  --indigo-950: var(--brown-900);

  /* Semantic */
  --color-bg:           var(--brown-50);
  --color-bg-soft:      var(--gray-100);
  --color-bg-elevated:  var(--gray-0);
  --color-text:         var(--gray-800);
  --color-text-muted:   var(--gray-500);
  --color-text-inverse: var(--gray-0);
  --color-primary:      var(--brown-800);
  --color-primary-soft: var(--brown-100);
  --color-accent:       var(--amber-500);
  --color-accent-soft:  var(--amber-100);
  --color-rose:         var(--rose-500);
  --color-rose-soft:    var(--rose-100);
  --color-border:       var(--gray-200);

  /* Spacing: 4pt base scale */
  --space-1: 4px;
  --space-2: 8px;
  --space-3: 12px;
  --space-4: 16px;
  --space-5: 20px;
  --space-6: 24px;
  --space-8: 32px;
  --space-10: 40px;
  --space-12: 48px;
  --space-16: 64px;
  --space-20: 80px;
  --space-24: 96px;

  /* Typography */
  --font-display: 'Fraunces', 'LXGW WenKai', 'PingFang SC', 'Microsoft YaHei', serif;
  --font-body:    'Fraunces', 'Noto Sans SC', 'PingFang SC', 'Microsoft YaHei', sans-serif;

  /* Motion */
  --ease-out-quint: cubic-bezier(0.22, 1, 0.36, 1);
  --ease-out-expo:  cubic-bezier(0.16, 1, 0.3, 1);
}

.app-shell {
  display: flex;
  flex-direction: column;
  min-height: 100vh;
}

.global-footer {
  margin-top: auto;
  padding: var(--space-4) var(--space-5);
  text-align: center;
  font-size: 12px;
  color: hsl(var(--muted-foreground));
  background: hsl(var(--background));
  border-top: 1px solid hsl(var(--border));
}

.beian-row {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: center;
  gap: var(--space-2) var(--space-3);
}

.beian-link {
  color: hsl(var(--muted-foreground));
  text-decoration: none;
  transition: color 200ms ease;
}

.beian-link:hover {
  color: hsl(var(--foreground));
  text-decoration: underline;
}

/* ---- Page Transitions ---- */
.page-enter-active {
  transition: opacity 400ms var(--ease-out-expo),
              transform 400ms var(--ease-out-expo);
}
.page-leave-active {
  transition: opacity 250ms ease-in,
              transform 250ms ease-in;
}
.page-enter-from {
  opacity: 0;
  transform: translateY(16px);
}
.page-leave-to {
  opacity: 0;
  transform: translateY(-12px);
}

/* ---- Selection ---- */
::selection {
  background: hsl(var(--accent));
  color: hsl(var(--accent-foreground));
}
</style>
