<!--
  阅卷工作台中栏卷面页头：考试名 + 单份发布/撤回 + 上下份切换 + 考生成绩元信息
-->

<template>
  <div>
    <div class="sheet-head">
      <h2 class="sheet-title">{{ detail?.examName || examName }}</h2>
      <!--
        不用 v-auth：该指令只读当前路由的 meta.authList，而本页的 authList 结构性恒为空，
        挂了会被无条件隐藏。

        原因不是「后端缺菜单记录」——记录是有的（server/src/common/seed.service.ts:253
        建了 /grading-workspace，isShow=0），而是该节点不带 perms（复用阅卷中心的权限点）：
        perms-sync.service.ts:121-124 只把 `type=1 且 perms 非空` 的菜单纳入 menuByGroup
        索引（key 为 perms 去掉末段），故按钮分组 exam:grading 只会挂到「阅卷中心」节点
        （perms=exam:grading:list），永远挂不到本页节点上。同文件的模块前缀兜底
        findMenuByModule 候选集同样来自该过滤结果，也排除了本页节点。

        两条弯路别走：
        1) 改 router/modules/grading.ts 里硬编码的 meta 补 authList 无效——backend 模式下
           运行时路由由后端 /admin/open/permmenu 菜单树动态生成（beforeEach.ts 的
           processBackendMenu），那份硬编码对象只在 USE_MOCK 或前端权限模式下才被消费。
        2) 给本页注册独立 perms 会与阅卷中心撞同一分组 key（组 key 只取末段之前，
           只要形如 exam:grading:* 就必然相同），而 menuByGroup 是 Map.set 覆盖写且
           findMany 未指定顺序，会让其中一个节点静默丢失按钮挂载（很可能是阅卷中心）。

        同类隐藏页（exam-detail / paper-edit 等）同样不使用 v-auth。
        权限由后端 @Perms('publish'/'withdraw') + 全局 PermsGuard 兜底，无权调用返回 403。
      -->
      <div class="sheet-actions">
        <!-- 上一份/下一份：连续阅卷时不必每次回左侧点名单。翻页是导航、发布是主操作，
             两者语义不同，用分隔线隔开并让发布保持默认尺寸，避免挤成一排分不出主次 -->
        <ElButtonGroup>
          <ElButton :icon="ArrowLeft" :disabled="!hasPrev" @click="emit('step', -1)">
            上一份
          </ElButton>
          <ElButton :disabled="!hasNext" @click="emit('step', 1)">
            下一份<ElIcon class="icon-right"><ArrowRight /></ElIcon>
          </ElButton>
        </ElButtonGroup>
        <span class="action-divider" />
        <!--
          改分入口：已批阅的主观题默认只读展示，点这里才切回可编辑。
          成绩已发布时不出现（canUnlock 由父组件判定），须先撤回成绩。
        -->
        <ElButton v-if="canUnlock" :icon="unlocked ? Lock : Edit" @click="emit('toggle-unlock')">
          {{ unlocked ? '完成改分' : '修改评分' }}
        </ElButton>
        <ElButton v-if="!detail?.scorePublished" type="success" @click="emit('publish')">
          发布成绩
        </ElButton>
        <ElButton v-else type="warning" plain @click="emit('withdraw')">撤回成绩</ElButton>
      </div>
    </div>

    <!-- 元信息行：考生 / 成绩 / 总分 / 通过分 / 交卷时间 -->
    <div class="meta-row">
      <span class="meta-item">
        考生：<b>{{ detail?.candidateName || fallbackName }}</b>
      </span>
      <span class="meta-item">
        考试成绩：<b class="score-strong">{{ formatScore(detail?.totalScore) }}</b>
      </span>
      <span class="meta-item">
        试卷总分：<b>{{ formatScore(detail?.paperTotalScore) }}</b>
      </span>
      <span class="meta-item">
        通过分数：<b>{{ formatScore(detail?.passScore) }}</b>
      </span>
      <span class="meta-item">
        交卷时间：<b>{{ detail?.submitTime || '—' }}</b>
      </span>
      <ElTag v-if="detail?.scorePublished" type="success" size="small" disable-transitions>
        已发布
      </ElTag>
    </div>
  </div>
</template>

<script setup lang="ts">
  import { ArrowLeft, ArrowRight, Edit, Lock } from '@element-plus/icons-vue'
  import { formatScore, type SheetDetail } from '@/api/grading'

  defineOptions({ name: 'SheetHeader' })

  defineProps<{
    detail: SheetDetail | null
    /** 详情未到位时的考试名兜底（列表页 query 带入） */
    examName: string
    /** 详情未到位时的考生名兜底（名单里已有） */
    fallbackName: string
    hasPrev: boolean
    hasNext: boolean
    /** 当前是否处于改分状态（已批阅的主观题恢复可编辑） */
    unlocked: boolean
    /** 是否给出改分入口：成绩未发布且本卷有已批阅的主观题 */
    canUnlock: boolean
  }>()

  const emit = defineEmits<{
    (e: 'publish'): void
    (e: 'withdraw'): void
    (e: 'step', step: number): void
    (e: 'toggle-unlock'): void
  }>()
</script>

<style lang="scss" scoped>
  .sheet-head {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
    align-items: center;
  }

  .sheet-title {
    margin: 0;
    font-size: 16px;
    font-weight: 600;
  }

  .sheet-actions {
    display: flex;
    flex-wrap: wrap;
    gap: 10px;
    align-items: center;
    margin-left: auto;
  }

  // 分隔翻页导航与发布操作，提示两者语义不同
  .action-divider {
    width: 1px;
    height: 20px;
    background: var(--el-border-color);
  }

  .icon-right {
    margin-left: 4px;
  }

  // 元信息用浅底条收成一块，与下方页签、卷面分层
  .meta-row {
    display: flex;
    flex-wrap: wrap;
    gap: 8px 24px;
    align-items: center;
    padding: 10px 14px;
    margin-top: 12px;
    font-size: 13px;
    color: var(--el-text-color-secondary);
    background: var(--el-fill-color-lighter);
    border-radius: 8px;
  }

  .meta-item b {
    margin-left: 2px;
    font-weight: 500;
    color: var(--el-text-color-primary);
  }

  // 成绩是阅卷员最关注的数字，单独强调
  .score-strong {
    font-size: 15px;
    color: var(--el-color-danger);
  }
</style>
