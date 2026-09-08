<!--
  组件名称：App - 根组件

  功能描述：
    应用的根组件，负责路由渲染和全局布局管理
    集成了页面过渡动画和 KeepAlive 缓存优化
    根据路由配置自动决定是否显示底部导航栏

  核心功能：
    - 路由视图渲染
    - 页面过渡动画（淡入淡出效果）
    - KeepAlive 页面缓存
    - 条件布局（MainLayout）
-->

<template>
  <div id="app">
    <!-- 路由视图容器 -->
    <router-view v-slot="{ Component, route }">
      <!-- 根据路由配置决定是否使用 MainLayout（带底部导航栏） -->
      <MainLayout v-if="route.meta.showTabbar">
        <!-- 需要缓存的页面 -->
        <transition name="fade" mode="out-in">
          <keep-alive :max="CACHE_MAX">
            <component :is="Component" v-if="route.meta.keepAlive" :key="cacheKey(route)" />
          </keep-alive>
        </transition>
        <!-- 不需要缓存的页面 -->
        <transition name="fade" mode="out-in">
          <component :is="Component" v-if="!route.meta.keepAlive" :key="route.path" />
        </transition>
      </MainLayout>

      <!-- 不需要底部导航栏的页面 -->
      <template v-else>
        <!-- 需要缓存的页面 -->
        <transition name="fade" mode="out-in">
          <keep-alive :max="CACHE_MAX">
            <component :is="Component" v-if="route.meta.keepAlive" :key="cacheKey(route)" />
          </keep-alive>
        </transition>
        <!-- 不需要缓存的页面 -->
        <transition name="fade" mode="out-in">
          <component :is="Component" v-if="!route.meta.keepAlive" :key="route.path" />
        </transition>
      </template>
    </router-view>
  </div>
</template>

<script setup>
import MainLayout from '@/components/Layout/MainLayout.vue'
import { useUserStore } from '@/stores/userStore'

const userStore = useUserStore()

/**
 * 缓存页的 key：路径 + 会话标识
 * 退出登录时 sessionKey 递增，使所有缓存页实例被销毁重建，
 * 避免同设备换号后新账号看到上一账号的残留数据
 * @param {import('vue-router').RouteLocationNormalized} route - 当前路由
 * @returns {string} 缓存 key
 */
const cacheKey = (route) => `${route.path}#${userStore.sessionKey}`

/**
 * 缓存上限：与启用 keepAlive 的路由数（首页/任务/工作台/消息/我的）一致
 * 保证 5 个 Tab 可同时驻留，同时让换号后作废的旧实例被 LRU 淘汰，不无限累积
 */
const CACHE_MAX = 5

</script>

<style>
/* 应用根容器样式 */
#app {
  width: 100%;
  min-height: 100vh; /* 最小高度占满视口 */
  background-color: var(--bg-page); /* 页面背景色 */
}
</style>
