<!--
  自主练习页。

  与岗位练兵拆为两个二级菜单，实现仍在 ../components/SelfPracticePanel.vue。
  页首横幅同 assigned 页：Tab 拆开后需各自交代形态差异。
-->
<template>
  <div class="practice-self">
    <ElAlert
      type="info"
      show-icon
      :closable="false"
      class="page-alert"
      title="自主练习：由学员自行发起的练习"
      description="学员自行选择题库随时练习，管理员只需开放题库并授权可见范围，不指定练习内容与完成时限。"
    />
    <SelfPracticePanel />
  </div>
</template>

<script setup lang="ts">
  import SelfPracticePanel from '../components/SelfPracticePanel.vue'

  defineOptions({ name: 'PracticeSelf' })
</script>

<style lang="scss" scoped>
  .practice-self {
    display: flex;
    flex-direction: column;
    height: 100%;

    // 同 assigned 页：横幅不参与高度压缩
    .page-alert {
      flex-shrink: 0;
      margin-bottom: 12px;
    }
  }
</style>
