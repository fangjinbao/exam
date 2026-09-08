<!--
  岗位练兵页。

  原先与自主练习共处一页、用 Tab 切换，现各自独立成二级菜单。
  列表实现仍在 ../components/AssignedList.vue：它与自主练习面板形态迥异
  （这边是练习任务实体，有发布/撤回/结束状态机；那边是按题库开放配置），
  组件保持原位，本文件只作页面外壳。

  Tab 时期两种练习的区别说明挂在标签上（并列可对照）。拆开后没有那个位置，
  改为页首横幅——进入本页的人需要知道这里管的是「指派型」练习。
-->
<template>
  <div class="practice-assigned">
    <!--
      用 ElAlert 而非裸文字：与 exam-edit、question-bank 的页内说明同款，
      有图标、底色与边界，不会像一段浮在卡片上方的灰字。
      closable=false：这是本页的形态说明，不是一次性通知，关掉之后新来的人就看不到了。
    -->
    <ElAlert
      type="info"
      show-icon
      :closable="false"
      class="page-alert"
      title="岗位练兵：由管理员指派的练习任务"
      description="管理员指定练习内容与参与人员，学员在移动端收到任务后按要求完成；可设置起止时间与抽题规则。"
    />
    <AssignedList />
  </div>
</template>

<script setup lang="ts">
  import AssignedList from '../components/AssignedList.vue'

  defineOptions({ name: 'PracticeAssigned' })
</script>

<style lang="scss" scoped>
  .practice-assigned {
    // 列表组件内部是「筛选卡片 + 表格卡片」的满高布局，此处需把高度传下去
    display: flex;
    flex-direction: column;
    height: 100%;

    // flex-shrink 0：横幅不参与高度压缩，否则列表撑满时它会被挤扁
    .page-alert {
      flex-shrink: 0;
      margin-bottom: 12px;
    }
  }
</style>
