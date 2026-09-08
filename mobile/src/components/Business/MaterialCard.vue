<!--
  组件名称：MaterialCard - 材料卡

  功能描述：
    展示材料题的共享材料正文，浅底 + 左侧色条与小题本身区分，
    避免考生误认为材料是某道小题题干的一部分

  使用方式：
    <MaterialCard :content="page.parent.content" />

  属性说明：
    - content：材料正文富文本。内容已在服务端写入题目时经 sanitizeRichText
      净化（白名单标签、img 仅放行站内 /uploads 与 data:image），故此处按 HTML 渲染
-->

<template>
  <section class="material-card">
    <p class="material-label">材料</p>
    <div class="material-body rich-text" v-html="content"></div>
  </section>
</template>

<script setup>
defineProps({
  /** 材料正文（服务端已净化的富文本） */
  content: {
    type: String,
    default: ''
  }
})
</script>

<style scoped>
.material-card {
  padding: 12px 14px;
  margin-bottom: 14px;
  background-color: var(--bg-fill);
  border-left: 3px solid var(--primary-color);
  border-radius: 8px;
}

.material-label {
  margin: 0 0 6px;
  font-size: 12px;
  font-weight: 600;
  color: var(--primary-color);
}

.material-body {
  font-size: 14px;
  line-height: 1.7;
  color: var(--text-primary);
}

/*
 * v-html 插入的节点不带 scoped 属性，故用 :deep 穿透。
 * 这几条不是装饰：材料正文的标签白名单放行 img/table/p，
 * 缺 img 的 max-width 会让宽图按原始像素撑破屏幕，
 * 缺 table 的 overflow-x 会让宽表格顶穿页面宽度。
 */
.material-body :deep(img) {
  max-width: 100%;
  height: auto;
  display: block;
  margin: 8px 0;
  border-radius: 6px;
}

.material-body :deep(p) {
  margin: 0 0 6px;
}

.material-body :deep(p:last-child) {
  margin-bottom: 0;
}

.material-body :deep(table) {
  display: block;
  max-width: 100%;
  overflow-x: auto;
  border-collapse: collapse;
}

.material-body :deep(td),
.material-body :deep(th) {
  padding: 6px 10px;
  border: 1px solid var(--border-color, #e5e5e5);
}
</style>
