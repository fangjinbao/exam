<template>
  <ElConfigProvider size="default" :locale="locales[language]" :z-index="3000">
    <RouterView></RouterView>
    <!-- 原型标注层：仅用于需求标注展示与编辑 -->
    <AnnotationOverlay />
  </ElConfigProvider>
</template>

<script setup lang="ts">
  import { useUserStore } from './store/modules/user'
  import { useSettingStore } from './store/modules/setting'
  import { fetchSiteInfo } from './api/auth'
  import zh from 'element-plus/es/locale/lang/zh-cn'
  import en from 'element-plus/es/locale/lang/en'
  import { systemUpgrade } from './utils/sys'

  import { setThemeTransitionClass } from './utils/theme/animation'
  import { checkStorageCompatibility } from './utils/storage'
  import AnnotationOverlay from './components/Annotation/AnnotationOverlay.vue'

  const userStore = useUserStore()
  const settingStore = useSettingStore()
  const { language } = storeToRefs(userStore)

  const locales = {
    zh: zh,
    en: en
  }

  // 拉取后端基础配置中的系统名称，写入全局设置供标题/登录页展示
  const loadSystemName = async () => {
    try {
      const { data } = await fetchSiteInfo()
      if (data?.sysName) {
        settingStore.setSystemName(data.sysName)
      }
    } catch {
      // 站点信息获取失败时静默回退到本地默认名称，不阻断应用启动
    }
  }

  onBeforeMount(() => {
    setThemeTransitionClass(true)
  })

  onMounted(() => {
    // 检查存储兼容性
    checkStorageCompatibility()
    // 提升暗黑主题下页面刷新视觉体验
    setThemeTransitionClass(false)
    // 系统升级
    systemUpgrade()
    // 加载后端系统名称
    loadSystemName()
  })
</script>
