<!--
  练习设置面板（编辑页右栏）：反复练习 / 题目反馈 / 单题即时反馈。
  答案与解析依附于「单题展示对错」，关掉后自动置 false —— 由父组件的 v-model 对象直接承载，
  此处只负责联动禁用与视觉呈现。
-->
<template>
  <section class="panel">
    <div class="panel-head">
      <span class="panel-title">练习设置</span>
      <span class="panel-sub">练习过程中的行为规则</span>
    </div>
    <div class="panel-body">
      <ElFormItem label="允许反复练习">
        <ElSwitch v-model="setting.allowRepeat" />
        <span class="field-tip">开启后学员可不限次数重复练习</span>
      </ElFormItem>

      <div class="group-title">作答反馈</div>
      <ElFormItem label="单题展示对错">
        <ElSwitch v-model="setting.showResultPerQuestion" />
        <span class="field-tip">每答一题即时告知正误</span>
      </ElFormItem>
      <!-- 关掉对错却给答案是矛盾组合，故一并禁用 -->
      <ElFormItem label="展示答案">
        <ElSwitch v-model="setting.showAnswer" :disabled="!setting.showResultPerQuestion" />
      </ElFormItem>
      <ElFormItem label="展示解析">
        <ElSwitch v-model="setting.showAnalysis" :disabled="!setting.showResultPerQuestion" />
      </ElFormItem>
    </div>
  </section>
</template>

<script setup lang="ts">
  import { watch } from 'vue'
  import type { PracticeSetting } from '@/api/practice'

  defineOptions({ name: 'PracticeSettingPanel' })

  /**
   * 用 defineModel 而非 props 承载：本面板要双向改这个对象的字段，
   * 直接写 props 会触发 vue/no-mutating-props（项目 lint 为 error 级，会挡住提交）。
   */
  const setting = defineModel<PracticeSetting>('setting', { required: true })

  // 关掉「单题展示对错」时同步关掉答案与解析，避免提交出矛盾组合
  watch(
    () => setting.value.showResultPerQuestion,
    (v) => {
      if (!v) {
        setting.value.showAnswer = false
        setting.value.showAnalysis = false
      }
    }
  )
</script>

<style lang="scss" scoped>
  .panel {
    overflow: hidden;
    background: var(--el-bg-color-overlay);
    border-radius: 12px;

    .panel-head {
      display: flex;
      align-items: baseline;
      gap: 8px;
      padding: 14px 20px;
      border-bottom: 1px solid var(--el-border-color-lighter);

      .panel-title {
        font-size: 15px;
        font-weight: 600;
      }

      .panel-sub {
        font-size: 12px;
        color: var(--el-text-color-secondary);
      }
    }

    .panel-body {
      padding: 18px 20px 4px;
    }
  }

  // 分组小标题
  .group-title {
    padding-left: 10px;
    margin: 6px 0 14px;
    font-size: 13px;
    font-weight: 600;
    color: var(--el-text-color-regular);
    border-left: 3px solid var(--el-color-primary);
  }

  .field-tip {
    margin-left: 10px;
    font-size: 12px;
    color: var(--el-text-color-secondary);
  }
</style>
