<!--
  页面名称：ProfileEdit - 个人信息

  功能描述：
    考生查看与编辑个人基本信息
    姓名 2-20 字必填，联系电话须为 11 位手机号必填，电子邮箱选填且校验格式

  路由信息：
    路径：/profile/edit
    名称：ProfileEdit
    是否缓存：否
-->

<template>
  <div class="profile-edit-page">
    <van-nav-bar title="个人信息" left-arrow fixed placeholder @click-left="router.back()" />

    <AppSkeleton v-if="loading" variant="form" />

    <van-form v-else ref="formRef" class="form" @submit="handleSubmit">
      <!-- 基本信息（可编辑） -->
      <section class="info-card">
        <h2 class="card-title">基本信息</h2>
        <van-field
          v-model="form.name"
          name="name"
          label="姓名"
          placeholder="请输入姓名"
          required
          maxlength="20"
          input-align="right"
          :rules="nameRules"
        />
        <van-field
          v-model="form.phone"
          name="phone"
          type="tel"
          label="联系电话"
          placeholder="请输入手机号"
          required
          maxlength="11"
          input-align="right"
          :rules="phoneRules"
        />
        <van-field
          v-model="form.email"
          name="email"
          type="email"
          label="电子邮箱"
          placeholder="请输入电子邮箱"
          maxlength="50"
          input-align="right"
          :rules="emailRules"
        />
      </section>

      <!-- 认证信息（只读，由管理端维护） -->
      <section class="info-card">
        <h2 class="card-title">认证信息</h2>
        <van-cell title="所属单位" :value="form.orgName || '-'" />
        <van-cell title="所属部门" :value="form.departmentName || '-'" />
      </section>
    </van-form>

    <!-- 吸底保存栏：表单在上方滚动，按钮常驻可点 -->
    <div v-if="!loading" class="footer-bar">
      <van-button
        type="primary"
        block
        round
        :loading="saving"
        :disabled="saving"
        @click="handleSubmit"
      >
        保存
      </van-button>
    </div>
  </div>
</template>

<script setup>
import { ref, reactive, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { showToast } from 'vant'
import { getProfileApi, updateProfileApi } from '@/api/modules/profileApi'
import { useUserStore } from '@/stores/userStore'
import AppSkeleton from '@/components/Common/AppSkeleton.vue'

const router = useRouter()
const userStore = useUserStore()

// 表单数据
const formRef = ref(null)

/**
 * 表单数据
 *
 * 字段与 /app/auth/profile 的返回一致。只读的 orgName/departmentName 由管理端维护，
 * 考生端不提供修改入口；提交时也只回传三个可编辑字段。
 * 不含 idCard：后端刻意不下发身份证号（PII），页面无此数据源。
 */
const form = reactive({
  name: '',
  phone: '',
  email: '',
  orgName: '',
  departmentName: ''
})

// 加载与保存状态
const loading = ref(false)
const saving = ref(false)

/** 姓名校验：必填，2-20 字 */
const nameRules = [
  { required: true, message: '请输入姓名' },
  {
    validator: (value) => String(value || '').trim().length >= 2 && String(value).trim().length <= 20,
    message: '姓名长度须为 2-20 字'
  }
]

/** 联系电话校验：必填，11 位手机号 */
const phoneRules = [
  { required: true, message: '请输入联系电话' },
  { pattern: /^1[3-9]\d{9}$/, message: '请输入正确的手机号' }
]

/** 电子邮箱校验：选填，填写时校验格式 */
const emailRules = [
  {
    validator: (value) => !value || /^[\w.-]+@[\w-]+(\.[\w-]+)+$/.test(String(value)),
    message: '请输入正确的电子邮箱'
  }
]

/**
 * 加载个人信息
 */
const loadProfile = async () => {
  loading.value = true
  try {
    // 走 /app/auth/profile：后端已实现且返回本页所需的全部字段
    const res = await getProfileApi()
    const data = res.data || {}
    // 逐字段取值而非整体 Object.assign：避免把接口多余字段（id、status、
    // userType、headImg 等）灌进表单，提交时误带上去。
    form.name = data.name || ''
    form.phone = data.phone || ''
    form.email = data.email || ''
    form.orgName = data.orgName || ''
    form.departmentName = data.departmentName || ''
  } catch {
    // 错误提示由响应拦截器统一给出，表单保持空值待考生重试
  } finally {
    loading.value = false
  }
}

/**
 * 提交保存
 */
const handleSubmit = async () => {
  // 保存按钮在 van-form 之外（吸底），不再是 native submit，
  // 必须手动触发校验：否则 :rules 形同虚设，空姓名/错手机号也会直接提交。
  try {
    await formRef.value?.validate()
  } catch {
    // 校验失败时 van-form 已在对应字段下方给出提示，此处无需再弹 toast
    return
  }

  saving.value = true
  try {
    await updateProfileApi({ name: form.name, phone: form.phone, email: form.email })
    // 同步 store：「我的」页顶部与首页问候语都读 userStore.userInfo，
    // 不刷新会继续显示旧姓名，直到下次重新登录。
    await userStore.fetchUserInfo()
    showToast('保存成功')
    router.back()
  } catch {
    // 校验失败的具体原因由响应拦截器提示，停留在表单页供修正
  } finally {
    saving.value = false
  }
}

onMounted(loadProfile)
</script>

<style scoped>
/* 底色与卡片圆角取自 Home.vue / Profile.vue 的实际取值，保持三页观感一致 */
.profile-edit-page {
  min-height: 100vh;
  /* 为吸底栏留出空间，避免最后一张卡片被遮住 */
  padding-bottom: calc(76px + env(safe-area-inset-bottom));
  background-color: #f6f8fb;
}

.form {
  /* 与 Home.vue、Profile.vue 的内容区留白一致 */
  padding: 12px 15px 0;
}

/* 卡片：无阴影、无描边，直接贴在页面底色上 */
.info-card {
  overflow: hidden;
  background-color: var(--bg-card);
  border-radius: 14px;
}

.info-card + .info-card {
  margin-top: 12px;
}

.card-title {
  margin: 0;
  padding: 16px 16px 4px;
  color: var(--text-primary);
  font-weight: 600;
  font-size: 16px;
  line-height: 1.4;
}

/* 卡片内的行：统一 16px 字号，去掉 Vant 默认的右侧箭头留白 */
.info-card :deep(.van-cell) {
  padding: 14px 16px;
  font-size: 16px;
}

/* Vant 默认在 cell-group 之外不画分隔线，这里手动补行间分隔 */
.info-card :deep(.van-cell + .van-cell)::after {
  display: block;
  right: 0;
  left: 16px;
  border-bottom: 1px solid #f0f1f5;
  transform: none;
}

/* 只读行的值用弱化色，与可编辑项区分 */
.info-card :deep(.van-cell__value) {
  color: var(--text-disabled);
}

/* 可编辑字段的输入值仍用主文字色 */
.info-card :deep(.van-field__control) {
  color: var(--text-primary);
  font-size: 16px;
}

/* 错误提示：input-align="right" 会让提示也跟着右对齐跑到中间，
   这里强制左对齐到标签下方，符合表单校验提示的常规位置 */
.info-card :deep(.van-field__error-message) {
  text-align: left;
  font-size: 13px;
}

/* 必填星号与标签之间留出间距：Vant 默认只有 2px，「*姓名」显得挤 */
.info-card :deep(.van-field__label--required::before) {
  margin-right: 4px;
}

/* 标签占宽收窄一点，把更多横向空间留给右侧的值（如长单位名） */
.info-card :deep(.van-field__label) {
  width: 5.6em;
}

.footer-bar {
  position: fixed;
  right: 0;
  bottom: 0;
  left: 0;
  padding: 12px 15px calc(12px + env(safe-area-inset-bottom));
  background-color: #f6f8fb;
}

.footer-bar :deep(.van-button) {
  height: 50px;
  font-size: 16px;
}
</style>
