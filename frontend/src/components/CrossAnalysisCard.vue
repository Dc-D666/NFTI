<script setup lang="ts">
import { computed } from 'vue'
import { getCrossByNfti, recommendNftiByHolland } from '@/assessments/holland/crossNfti'

const props = defineProps<{
  /** 当前在哪个结果页 */
  side: 'nfti' | 'holland'
  /** 当前类型码 */
  code: string
  /** 另一方类型码（从 DB 交叉查询获得） */
  crossCode?: string
  /** 另一方类型名 */
  crossName?: string
}>()

const cross = computed(() => {
  if (props.side === 'nfti') {
    return getCrossByNfti(props.code)
  } else {
    return recommendNftiByHolland(props.code)
  }
})

const primaryMatch = computed(() => {
  if (!cross.value) return null
  if (props.side === 'nfti') {
    const c = cross.value as ReturnType<typeof getCrossByNfti>
    return c ? { insight: c.insight, roles: c.suitableRoles } : null
  } else {
    const list = cross.value as ReturnType<typeof recommendNftiByHolland>
    const first = list[0]
    return first ? { insight: first.insight, roles: first.suitableRoles, nftiName: first.nftiName } : null
  }
})
</script>

<template>
  <div class="cross-card">
    <div class="cross-header">
      <span class="cross-icon" aria-hidden="true">🔗</span>
      <span class="cross-title">人格 × 职业 交叉画像</span>
    </div>

    <template v-if="crossCode && crossName">
      <p class="cross-bridge">
        <span v-if="side === 'nfti'">你的 NFTI 人格 <strong>{{ code }}</strong> × 霍兰德底色</span>
        <span v-else>你的霍兰德底色 <strong>{{ code }}</strong> × NFTI 人格 <strong>{{ crossCode }}</strong>（{{ crossName }}）</span>
      </p>

      <template v-if="primaryMatch">
        <p class="cross-insight">{{ primaryMatch.insight }}</p>
        <div v-if="primaryMatch.roles.length" class="cross-roles">
          <span class="cross-roles-label">适合你的方向：</span>
          <span v-for="r in primaryMatch.roles" :key="r" class="cross-role-tag">{{ r }}</span>
        </div>
      </template>

      <div v-if="side === 'nfti'" class="cross-all-matches">
        <p class="cross-all-title">常见霍兰德代码匹配：</p>
        <span v-for="h in (cross as ReturnType<typeof getCrossByNfti>)?.commonHolland" :key="h" class="cross-code-tag">{{ h }}</span>
      </div>
    </template>

    <p v-else class="cross-empty">
      <template v-if="side === 'nfti'">完成<strong>职业测评</strong>后解锁交叉画像 →</template>
      <template v-else>完成<strong>NFTI 人格测试</strong>后解锁交叉画像 →</template>
    </p>
  </div>
</template>

<style scoped>
.cross-card {
  background: linear-gradient(135deg, var(--indigo-50), var(--amber-50));
  border: 1.5px solid var(--indigo-200);
  border-radius: 20px;
  padding: var(--space-5);
  margin-bottom: var(--space-4);
}
.cross-header {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  margin-bottom: var(--space-3);
}
.cross-icon {
  font-size: 18px;
}
.cross-title {
  font-family: var(--font-display);
  font-size: 16px;
  font-weight: 700;
  color: var(--color-primary);
}
.cross-bridge {
  font-size: 14px;
  color: var(--gray-600);
  margin-bottom: var(--space-3);
  line-height: 1.6;
}
.cross-bridge strong {
  color: var(--gray-900);
}
.cross-insight {
  font-size: 14px;
  line-height: 1.7;
  color: var(--gray-700);
  margin-bottom: var(--space-3);
}
.cross-roles {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  flex-wrap: wrap;
  margin-bottom: var(--space-3);
}
.cross-roles-label {
  font-size: 12px;
  color: var(--gray-500);
}
.cross-role-tag {
  font-size: 12px;
  padding: 3px 10px;
  background: var(--indigo-100);
  color: var(--color-primary);
  border-radius: 20px;
  font-weight: 600;
}
.cross-all-matches {
  margin-top: var(--space-2);
}
.cross-all-title {
  font-size: 12px;
  color: var(--gray-400);
  margin-bottom: var(--space-2);
}
.cross-code-tag {
  display: inline-block;
  font-size: 12px;
  margin-right: 6px;
  padding: 2px 8px;
  background: var(--amber-100);
  color: var(--amber-700);
  border-radius: 6px;
  font-weight: 700;
  letter-spacing: 0.5px;
}
.cross-empty {
  font-size: 14px;
  color: var(--gray-400);
  text-align: center;
  padding: var(--space-2) 0;
}
.cross-empty strong {
  color: var(--color-primary);
}
</style>
