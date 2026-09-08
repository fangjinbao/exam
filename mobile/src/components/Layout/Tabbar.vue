<!--
  组件名称：Tabbar - 底部导航栏组件

  功能描述：
    应用底部的固定导航栏，包含三个导航项，首页居中且为默认选中项
    自动根据当前路由高亮对应的导航项

  使用方式：
    <Tabbar />

  导航项（从左到右）：
    - 任务 (task): /task
    - 首页 (home): /home —— 居中，默认选中
    - 我的 (profile): /profile

  说明：
    消息页不再占用导航项，改由首页顶部铃铛入口进入
-->

<template>
  <van-tabbar v-model="active" :fixed="true" :placeholder="true" :safe-area-inset-bottom="true">
    <!-- 任务导航项 -->
    <van-tabbar-item name="task" to="/task">
      <span>任务</span>
      <template #icon="props">
        <TabbarIcon name="task" :active="props.active" />
      </template>
    </van-tabbar-item>

    <!-- 首页导航项：居中，默认选中 -->
    <van-tabbar-item name="home" to="/home">
      <span>首页</span>
      <template #icon="props">
        <TabbarIcon name="home" :active="props.active" />
      </template>
    </van-tabbar-item>

    <!-- 我的导航项 -->
    <van-tabbar-item name="profile" to="/profile">
      <span>我的</span>
      <template #icon="props">
        <TabbarIcon name="profile" :active="props.active" />
      </template>
    </van-tabbar-item>
  </van-tabbar>
</template>

<script setup>
import { ref, watch } from 'vue'
import { useRoute } from 'vue-router'
import TabbarIcon from '@/components/Common/TabbarIcon.vue'

// 获取当前路由信息
const route = useRoute()

/**
 * 当前激活的标签
 * @type {import('vue').Ref<string>}
 */
const active = ref('home')

/**
 * 监听路由变化，更新激活的标签
 * 根据当前路由路径自动切换底部导航栏的激活状态
 */
watch(
  () => route.path,
  (newPath) => {
    // 判断当前路由并设置对应的激活标签
    // 不匹配任何导航项时保持原值，避免二级页面把高亮清空
    if (newPath.startsWith('/task')) {
      active.value = 'task'
    } else if (newPath.startsWith('/home')) {
      active.value = 'home'
    } else if (newPath.startsWith('/profile')) {
      active.value = 'profile'
    }
  },
  { immediate: true } // 立即执行一次，确保初始状态正确
)
</script>

<style scoped>
/* 自定义样式可以在这里添加 */
</style>
