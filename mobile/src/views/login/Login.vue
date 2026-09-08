<!--
  页面名称：Login - 登录页面

  功能描述：
    用户登录页面，支持石化员工和外部考生两种登录方式
    石化员工：统一身份账号 + 密码
    外部考生：手机号 + 密码

  路由信息：
    路径：/login
    名称：Login
    是否缓存：否
-->

<template>
  <div class="login-page">
    <!-- 顶部蓝色区域：Logo + 系统名 -->
    <div class="login-hero">
      <!-- 蓝色背景层：下边缘弧形，比 hero 布局盒更高，只做视觉不影响布局 -->
      <div class="hero-bg"></div>
      <div class="logo">
        <div class="logo-badge">
          <img src="@/assets/images/logo.svg" alt="" class="logo-image" />
        </div>
        <div class="logo-text">
          <h1 class="system-name">智能AI考试平台</h1>
          <p class="system-desc">出题·组卷·考试·认证一体化</p>
        </div>
      </div>
    </div>

    <!-- 登录表单卡片 -->
    <div class="login-form">
      <!-- Tab 切换 -->
      <van-tabs v-model:active="activeTab" class="login-type" @change="onTabChange">
        <van-tab title="石化员工" :name="USER_TYPE.INTERNAL"></van-tab>
        <van-tab title="外部考生" :name="USER_TYPE.EXTERNAL"></van-tab>
      </van-tabs>

      <van-form class="login-card" @submit="onSubmit">
        <!-- 石化员工：统一身份账号 -->
        <van-field
          v-if="activeTab === 'internal'"
          v-model="formData.accountId"
          name="accountId"
          label="统一身份账号"
          label-align="top"
          input-align="left"
          class="custom-field"
          placeholder="请输入统一身份账号"
          :rules="[{ required: true, message: '请输入统一身份账号' }]"
        />

        <!-- 外部考生：手机号 -->
        <van-field
          v-if="activeTab === 'external'"
          v-model="formData.phone"
          name="phone"
          type="tel"
          label="手机号"
          label-align="top"
          input-align="left"
          class="custom-field"
          placeholder="请输入手机号"
          :rules="[
            { required: true, message: '请输入手机号' },
            { pattern: /^1[3-9]\d{9}$/, message: '请输入正确的手机号' }
          ]"
        />

        <!-- 密码输入框（共用） -->
        <van-field
          v-model="formData.password"
          type="password"
          name="password"
          label="密码"
          label-align="top"
          input-align="left"
          class="custom-field"
          placeholder="请输入"
          :rules="[{ required: true, message: '请输入密码' }]"
        />

        <!-- 记住用户 + 忘记密码 -->
        <div class="remember-forgot-box">
          <van-checkbox v-model="formData.rememberMe" shape="square"> 记住用户 </van-checkbox>
          <span class="link-text" @click="goToForgotPassword">忘记密码</span>
        </div>

        <!-- 登录按钮 -->
        <div class="login-button">
          <van-button round block type="primary" native-type="submit" :loading="loading">
            登录
          </van-button>
        </div>
      </van-form>
    </div>

    <!-- 底部协议文字：卡片外，页面底部 -->
    <div class="bottom-agreement">
      登录即同意
      <span class="link-text" @click="showAgreement">《用户服务协议》</span>和
      <span class="link-text" @click="showPrivacy">《隐私政策》</span>
    </div>
  </div>
</template>

<script setup>
import { ref, reactive, onMounted } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import { showToast } from 'vant'
import { useUserStore } from '@/stores/userStore'
import { USER_TYPE } from '@/api/modules/authApi'
import {
  getRememberedLogin,
  setRememberedLogin,
  removeRememberedLogin
} from '@/utils/storage'

// 路由实例
const router = useRouter()
// 当前路由（用于读取 redirect 回跳参数）
const route = useRoute()

// 用户状态管理
const userStore = useUserStore()

// 当前选中的 Tab（默认石化员工）
const activeTab = ref(USER_TYPE.INTERNAL)

// 表单数据
const formData = reactive({
  accountId: '', // 石化员工：统一身份账号
  phone: '', // 外部考生：手机号
  password: '', // 密码（共用）
  rememberMe: false // 记住用户
})

// 加载状态
const loading = ref(false)

/**
 * Tab 切换事件
 * @param {string} name - Tab 名称
 */
const onTabChange = (name) => {
  // 切换 Tab 时清空表单
  formData.accountId = ''
  formData.phone = ''
  formData.password = ''
  // 刻意不复位 rememberMe：它表达的是「本次登录成功后记住账号」这一未来意图，
  // 与当前输入框是否有值无关。若在此复位，用户切一下 tab 再切回来登录，
  // 就会因 rememberMe 变 false 而触发 removeRememberedLogin，把之前记住的账号弄丢。
}

/**
 * 回填上次记住的账号
 *
 * 登录页未被 KeepAlive 缓存（路由 meta 未开启），每次进入都会重新挂载，
 * 所以在 onMounted 里回填即可覆盖「刷新页面」与「退出登录后返回」两种路径。
 */
onMounted(() => {
  const remembered = getRememberedLogin()
  if (!remembered) return

  // 先恢复 tab，否则回填到当前 tab 会串（工号填进手机号框）
  activeTab.value =
    remembered.userType === USER_TYPE.EXTERNAL
      ? USER_TYPE.EXTERNAL
      : USER_TYPE.INTERNAL

  if (activeTab.value === USER_TYPE.EXTERNAL) {
    formData.phone = remembered.account
  } else {
    formData.accountId = remembered.account
  }
  // 勾选状态一并恢复，否则用户不改动就登录会把记录清掉
  formData.rememberMe = true
})

/** 登录成功后的默认落地页 */
const DEFAULT_REDIRECT = '/home'

/**
 * 解析并校验回跳地址
 *
 * redirect 来自 URL query（401 拦截或路由守卫带过来），属外部输入，必须校验：
 * - 只接受站内绝对路径，且第二个字符不能是 / 或 \（`//evil.com`、`/\evil.com`
 *   是协议相对 URL，浏览器按外域处理）
 * - decodeURIComponent 遇到非法百分号编码（如裸 `%`）会抛 URIError，必须兜住，
 *   否则会在「登录已成功」之后抛出去，表现为停在登录页且无任何提示
 * - 拒绝含控制字符的值，避免 `/\tjavascript:` 之类绕过形状校验
 *
 * @param {string|string[]|undefined} raw - route.query.redirect 原始值
 * @returns {string} 安全的站内路径，非法时回退到默认页
 */
const resolveRedirect = (raw) => {
  const value = Array.isArray(raw) ? raw[0] : raw
  if (!value || typeof value !== 'string') return DEFAULT_REDIRECT

  let decoded
  try {
    decoded = decodeURIComponent(value)
  } catch {
    // 非法编码，不信任
    return DEFAULT_REDIRECT
  }

  // 控制字符（\x00-\x1F、\x7F）可用来绕过下面的形状校验，先剔除
  // eslint-disable-next-line no-control-regex
  if (/[\u0000-\u001F\u007F]/.test(decoded)) return DEFAULT_REDIRECT
  // 必须是站内绝对路径：单个 / 开头，且第二个字符不是 / 或 \（协议相对 URL）
  if (!/^\/(?![/\\])/.test(decoded)) return DEFAULT_REDIRECT

  return decoded
}

/**
 * 处理表单提交
 * @param {Object} values - 表单数据（van-form 传入，此处用 formData，未使用该形参）
 */
const onSubmit = async (values) => {
  loading.value = true

  try {
    // activeTab 与后端 userType 取值一致（internal / external），直接透传
    const account =
      activeTab.value === USER_TYPE.INTERNAL ? formData.accountId : formData.phone
    const res = await userStore.login(account, formData.password, activeTab.value)

    if (res.code === 200) {
      // 记住/忘记账号：只在登录成功后处理，避免把输错的账号也记下来
      if (formData.rememberMe) {
        setRememberedLogin(account, activeTab.value)
      } else {
        removeRememberedLogin()
      }

      showToast('登录成功')
      // 存在 redirect 则回跳原目标页（401 拦截或路由守卫带过来的），校验后再用
      router.replace(resolveRedirect(route.query.redirect))
    }
  } catch (error) {
    // 具体错误文案（账号或密码错误、账号已停用等）已由 request 拦截器统一 toast，
    // 这里不再重复提示，避免叠两个 toast
    console.error('登录失败：', error)
  } finally {
    loading.value = false
  }
}

/**
 * 显示用户服务协议
 */
const showAgreement = () => {
  showToast('功能开发中')
}

/**
 * 显示隐私政策
 */
const showPrivacy = () => {
  showToast('功能开发中')
}

/**
 * 跳转到忘记密码页面
 */
const goToForgotPassword = () => {
  showToast('功能开发中')
}
</script>

<style scoped>
/* 页面容器 - 灰色底，顶部蓝色区块由 .login-hero 铺 */
.login-page {
  min-height: 100vh;
  background-color: #f6f6f8;
  display: flex;
  flex-direction: column;
}

/* 顶部蓝色区域 - 只负责布局（Logo 定位 + 卡片的流式起点），背景由 .hero-bg 画
   高度取弧形在屏幕两侧边缘的位置 214px，卡片再用 -56px 上提到 158px */
.login-hero {
  position: relative;
  padding: calc(59px + env(safe-area-inset-top)) 18px 0;
  height: calc(214px + env(safe-area-inset-top));
  box-sizing: border-box;
  text-align: center;
}

/* 蓝色背景层
   兜底（不支持下面 clip-path 语法的老旧 WebView）：平底，高度取弧形在屏幕两侧
   边缘的位置 214px，与 .login-hero 等高，卡片压盖关系不变，只是少了弧度。
   z-index 显式写 0：叠放顺序不再依赖「三层都没设 z-index」的隐式绘制顺序。 */
.hero-bg {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  z-index: 0;
  height: calc(214px + env(safe-area-inset-top));
  overflow: hidden;
  background: linear-gradient(180deg, #0b7cfd 0%, #1487fc 100%);
}

/* 下边缘圆弧：对设计稿最小二乘拟合得 R=415px、圆心在视口上方 155.9px
   （残差 rms 0.1px）。两侧边缘落在 y=214.3，中央最低 y=259.1，弧深 44.8px。
   rx 用百分比、ry 用 px：弧深恒为 45px，横向随屏宽等比展开。
   高度加到 262px 给弧顶 259.1px 留 2.9px 余量（inset 项在两式中抵消，与真机
   safe-area 取值无关）。
   @supports 探测的是 ellipse() 里嵌 calc()+env() 这个语法组合能否解析；注意
   postcss-pxtorem 不处理 @supports 条件，所以条件里留在 px、声明里转成了 rem，
   两者单位不同但探测的语法形状一致，不影响结论。 */
@supports (clip-path: ellipse(110.7% 415px at 50% calc(env(safe-area-inset-top) - 155.9px))) {
  .hero-bg {
    height: calc(262px + env(safe-area-inset-top));
    clip-path: ellipse(110.7% 415px at 50% calc(env(safe-area-inset-top) - 155.9px));
  }
}

/* 右上角装饰圆 */
.hero-bg::before,
.hero-bg::after {
  content: '';
  position: absolute;
  border-radius: 50%;
  background: rgba(255, 255, 255, 0.08);
  pointer-events: none;
}

.hero-bg::before {
  width: 190px;
  height: 190px;
  top: -74px;
  right: -46px;
}

.hero-bg::after {
  width: 118px;
  height: 118px;
  top: 22px;
  right: -52px;
  background: rgba(255, 255, 255, 0.06);
}

/* Logo 容器 - 左右布局，整组在 hero 内水平居中 */
.logo {
  position: relative;
  display: inline-flex;
  flex-direction: row;
  align-items: center;
  gap: 17px;
}

/* Logo 白色圆角容器 */
.logo-badge {
  width: 66px;
  height: 66px;
  flex-shrink: 0;
  border-radius: 15px;
  background-color: #ffffff;
  display: flex;
  align-items: center;
  justify-content: center;
  box-shadow: 0 4px 12px rgba(4, 60, 130, 0.18);
}

/* Logo 图片 */
.logo-image {
  width: 100%;
  height: 100%;
  display: block;
}

/* Logo 文字区域 */
.logo-text {
  display: flex;
  flex-direction: column;
  text-align: left;
}

/* 系统名称 */
.system-name {
  font-size: 22px;
  font-weight: bold;
  color: #ffffff;
  margin: 0;
  line-height: 1.2;
}

/* 系统描述 */
.system-desc {
  font-size: 13px;
  color: rgba(255, 255, 255, 0.92);
  margin: 7px 0 0 0;
  line-height: 1.4;
  letter-spacing: 1.65px;
}

/* 表单卡片 - 负 margin 上提，盖住蓝色区块下沿 */
.login-form {
  position: relative;
  margin: -56px 18px 0;
  /* 设计稿上下不对称：顶部 28px，按钮下方留 36px */
  padding: 28px 0 36px;
  background-color: #ffffff;
  border-radius: 20px;
  box-shadow: 0 6px 24px rgba(9, 62, 132, 0.08);
  /* 覆盖 Vant 组件的 CSS 变量 */
  /* 默认 44px 会让 tab 文字上下各留 13px 空隙；33px = 文字 + 设计稿要求的下划线间隙 */
  --van-tabs-line-height: 33px;
  --van-cell-background-color: transparent;
  --van-cell-background: transparent;
  --van-cell-border-color: transparent;

  /* 下面这组尺寸供 :deep(.van-*) 规则用 var() 引用。
     必须声明在这里（选择器不含 .van-）才会被 postcss-pxtorem 转成 rem；
     若直接写在 :deep(.van-*) 规则里，会命中 selectorBlackList: ['.van-']
     而保持 px 不变，导致卡片随屏宽放大、控件尺寸却锁死在 375 基准。 */
  --login-field-height: 44px;
  --login-field-padding-x: 14px;
  --login-field-radius: 8px;
  --login-field-font-size: 15px;
  --login-label-font-size: 15px;
  --login-label-gap: 10px;
  --login-tab-font-size: 17px;
  /* 下划线（.van-tabs__line）三件套，注意与上面 Vant 自带的
     --van-tabs-line-height（指 tab 容器高度）不是一回事 */
  --login-tab-underline-width: 40px;
  --login-tab-underline-thickness: 3px;
  --login-tab-underline-radius: 2px;
  --login-checkbox-label-font-size: 13px;
  /* Vant 的复选框图标靠 font-size 定尺寸（图标内部用 em），不是 width/height，别改 */
  --login-checkbox-icon-size: 16px;
  --login-button-height: 44px;
  --login-button-font-size: 17px;
  --login-button-radius: 8px;
}

/* Tab 横跨卡片全宽，不吃 padding */
.login-type {
  margin-bottom: 17px;
}

/* 表单内容区 - 左右 38px 内缩 */
.login-card {
  padding: 0 38px;
}

/* Tab 样式调整 */
.login-form :deep(.van-tabs__nav) {
  background: transparent;
}

.login-form :deep(.van-tabs__wrap) {
  border-bottom: none;
}

.login-form :deep(.van-tab) {
  /* 默认垂直居中会把文字压到 wrap 中间，这里靠上，下方空间留给下划线 */
  align-items: flex-start;
  font-size: var(--login-tab-font-size);
  color: var(--text-secondary);
}

.login-form :deep(.van-tab--active) {
  color: #0082ff;
  font-weight: 600;
}

.login-form :deep(.van-tabs__line) {
  width: var(--login-tab-underline-width);
  height: var(--login-tab-underline-thickness);
  border-radius: var(--login-tab-underline-radius);
  background: linear-gradient(90deg, #0085ff 0%, #00c7ff 100%);
}

/* 记住用户 + 忘记密码区域 */
.remember-forgot-box {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-top: 18px;
  font-size: 13px;
}

.remember-forgot-box :deep(.van-checkbox__label) {
  font-size: var(--login-checkbox-label-font-size);
  color: #646566;
}

.remember-forgot-box :deep(.van-checkbox__icon) {
  font-size: var(--login-checkbox-icon-size);
}

/* 这里不要写 border-radius：assets/styles/vant-custom.css 有一条
   `:root:root .van-checkbox__icon--square .van-icon { border-radius: .125rem !important }`
   （模板用了 shape="square"，必然命中），!important 会赢过这里的任何非 !important 声明。
   要调复选框圆角得改那个全局文件，改这里无效。 */
.remember-forgot-box :deep(.van-checkbox__icon .van-icon) {
  border-color: #dcdee0;
}

.link-text {
  color: var(--primary-color);
  cursor: pointer;
}

.link-text:active {
  opacity: 0.7;
}

/* 登录按钮 */
.login-button {
  margin-top: 24px;
}

.login-button :deep(.van-button) {
  border-radius: var(--login-button-radius);
}

.login-button :deep(.van-button--primary) {
  background: linear-gradient(90deg, #0085ff 0%, #00c7ff 100%);
  border: none;
  height: var(--login-button-height);
  font-size: var(--login-button-font-size);
  font-weight: 500;
}

/* 底部协议文字区域 - 卡片外，推到页面底部 */
.bottom-agreement {
  text-align: center;
  font-size: 12px;
  color: var(--text-secondary);
  margin-top: auto;
  padding: 24px 18px calc(24px + env(safe-area-inset-bottom));
}

/* 自定义输入框样式 - label 在上方，输入框有填充色 */
.login-form .custom-field :deep(.van-field) {
  background: transparent !important;
}

/* .custom-field 本身就是 .van-cell，必须直接写在它上面才能归零默认横向 padding */
.custom-field {
  padding: 0;
  background: transparent !important;
  background-color: transparent !important;
  align-items: flex-start;
}

.login-form .custom-field :deep(.van-cell::after) {
  display: none !important;
  border: none !important;
  content: none !important;
}

.custom-field :deep(.van-field__label) {
  font-weight: 500;
  font-size: var(--login-label-font-size);
  color: #1d2129;
  width: 100%;
  margin-bottom: var(--login-label-gap);
}

.custom-field :deep(.van-field__body) {
  width: 100%;
}

.custom-field :deep(.van-field__control) {
  background-color: #f5f6f8;
  box-sizing: border-box;
  height: var(--login-field-height);
  padding: 0 var(--login-field-padding-x);
  border-radius: var(--login-field-radius);
  font-size: var(--login-field-font-size);
  color: #1d2129;
}

.custom-field :deep(.van-field__control::placeholder) {
  color: #c0c4cc;
}

/* 字段之间的间距 */
.login-card :deep(.custom-field + .custom-field) {
  margin-top: 18px;
}
</style>
