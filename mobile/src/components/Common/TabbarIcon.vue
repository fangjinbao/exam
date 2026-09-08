<!--
  组件名称：TabbarIcon - 底部导航栏图标组件

  功能描述：
    用于底部导航栏的自定义 SVG 图标组件，支持五种图标类型（首页、任务、工作台、消息、我的）
    根据激活状态自动切换图标颜色
    workspace/message 图标保留供非 Tab 场景复用

  使用方式：
    <TabbarIcon name="home" :active="true" />
    <TabbarIcon name="task" :active="false" />
    <TabbarIcon name="profile" :active="true" activeColor="#1171F8" />

  Props:
    - name: 图标名称，可选值 'home' | 'task' | 'workspace' | 'message' | 'profile'
    - active: 是否激活状态，默认 false
    - activeColor: 激活时的颜色，默认 '#1171F8'
    - inactiveColor: 未激活时的颜色，默认 '#969799'
-->

<template>
  <div class="tabbar-icon">
    <!-- 首页图标：实心房子，门洞用 evenodd 镂空 -->
    <svg
      v-if="name === 'home'"
      viewBox="0 0 1024 1024"
      xmlns="http://www.w3.org/2000/svg"
      :fill="active ? activeColor : inactiveColor"
    >
      <path
        fill-rule="evenodd"
        d="M481.5 106.6a48 48 0 0 1 61 0l400 336A48 48 0 0 1 960 479v389a48 48 0 0 1-48 48H112a48 48 0 0 1-48-48V479a48 48 0 0 1 17.5-36.4l400-336ZM440 640h144v244H440V640Z"
      />
    </svg>

    <!-- 工作台图标 -->
    <svg
      v-else-if="name === 'workspace'"
      viewBox="0 0 1024 1024"
      xmlns="http://www.w3.org/2000/svg"
      :fill="active ? activeColor : inactiveColor"
    >
      <path
        d="M880 112H144c-17.7 0-32 14.3-32 32v736c0 17.7 14.3 32 32 32h736c17.7 0 32-14.3 32-32V144c0-17.7-14.3-32-32-32zm-40 728H184V184h656v656zM304 288h416v48H304zm0 144h416v48H304zm0 144h416v48H304z"
      />
    </svg>

    <!-- 任务图标：实心圆角方块，对勾用 evenodd 镂空，不依赖背景色 -->
    <svg
      v-else-if="name === 'task'"
      viewBox="0 0 1024 1024"
      xmlns="http://www.w3.org/2000/svg"
      :fill="active ? activeColor : inactiveColor"
    >
      <path
        fill-rule="evenodd"
        d="M224 128h576a96 96 0 0 1 96 96v576a96 96 0 0 1-96 96H224a96 96 0 0 1-96-96V224a96 96 0 0 1 96-96Zm228 524L296 496l56-56 100 100 220-220 56 56L452 652Z"
      />
    </svg>

    <!-- 消息图标 -->
    <svg
      v-else-if="name === 'message'"
      viewBox="0 0 1024 1024"
      xmlns="http://www.w3.org/2000/svg"
      :fill="active ? activeColor : inactiveColor"
    >
      <path
        d="M664 512c0 88.4-93.1 160-208 160S248 600.4 248 512s93.1-160 208-160 208 71.6 208 160zm-416 0c0 61.9 71.5 112 160 112s160-50.1 160-112-71.5-112-160-112-160 50.1-160 112z"
      />
      <path
        d="M925.2 338.4c-22.6-53.7-55-101.9-96.3-143.3a444.35 444.35 0 0 0-143.3-96.3C630.6 75.7 572.2 64 512 64h-2c-60.6.3-119.3 12.3-174.5 35.9a445.35 445.35 0 0 0-142 96.5c-40.9 41.3-73 89.3-95.2 142.8-23 55.4-34.6 114.3-34.3 174.9A449.4 449.4 0 0 0 112 714v152a46 46 0 0 0 46 46h152.1A449.4 449.4 0 0 0 510 960h2.1c59.9 0 118-11.6 172.7-34.3a444.48 444.48 0 0 0 142.8-95.2c41.3-40.9 73.8-88.7 96.5-142 23.6-55.2 35.6-113.9 35.9-174.5.3-60.9-11.5-120-34.8-175.6zm-151.1 438C704 845.8 611 884 512 884h-1.7c-60.3-.3-120.2-15.3-173.1-43.5l-8.4-4.5H188V695.2l-4.5-8.4C155.3 633.9 140.3 574 140 513.7c-.4-99.7 37.7-193.3 107.6-263.8 69.8-70.5 163.1-109.5 262.8-109.9h1.7c50 0 98.5 9.7 144.2 28.9 44.6 18.7 84.6 45.6 119 80 34.3 34.3 61.3 74.4 80 119 19.4 46.2 29.1 95.2 28.9 145.8-.6 99.6-39.7 192.9-110.1 262.7z"
      />
    </svg>

    <!-- 我的图标：实心头肩像 -->
    <svg
      v-else-if="name === 'profile'"
      viewBox="0 0 1024 1024"
      xmlns="http://www.w3.org/2000/svg"
      :fill="active ? activeColor : inactiveColor"
    >
      <path d="M512 128a184 184 0 1 1 0 368 184 184 0 0 1 0-368Z" />
      <path
        d="M512 560c156.3 0 283 99.6 283 222.5V852a48 48 0 0 1-48 48H277a48 48 0 0 1-48-48v-69.5C229 659.6 355.7 560 512 560Z"
      />
    </svg>
  </div>
</template>

<script setup>
/**
 * Tabbar 图标组件 Props 类型定义
 * @typedef {Object} Props
 * @property {'home'|'task'|'workspace'|'message'|'profile'} name - 图标名称
 * @property {boolean} [active=false] - 是否激活
 * @property {string} [activeColor='#1171F8'] - 激活颜色
 * @property {string} [inactiveColor='#969799'] - 未激活颜色
 */

// 定义组件 Props（模板直接引用各字段，无需接收返回值）
defineProps({
  // 图标名称（必填）
  name: {
    type: String,
    required: true,
    // 验证图标名称是否合法
    validator: (value) => ['home', 'task', 'workspace', 'message', 'profile'].includes(value)
  },
  // 是否激活状态
  active: {
    type: Boolean,
    default: false
  },
  // 激活时的颜色
  activeColor: {
    type: String,
    default: '#1171F8' // 主题蓝色
  },
  // 未激活时的颜色
  inactiveColor: {
    type: String,
    default: '#969799' // 灰色
  }
})
</script>

<style scoped>
/* 图标容器样式 */
.tabbar-icon {
  width: 22px;
  height: 22px;
  display: flex;
  align-items: center;
  justify-content: center;
}

/* SVG 图标样式 */
.tabbar-icon svg {
  width: 100%;
  height: 100%;
  transition: fill 0.3s; /* 颜色过渡动画 */
}
</style>
