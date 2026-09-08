<!--
  页面名称：CertificateList - 我的证书

  功能描述：
    展示考生已获得的证书，含名称、编号、有效期与状态
    点击可查看证书详情并下载

  路由信息：
    路径：/profile/certificates
    名称：CertificateList
    是否缓存：否
-->

<template>
  <div class="certificate-list-page">
    <van-nav-bar title="我的证书" left-arrow fixed placeholder @click-left="router.back()" />

    <AppSkeleton v-if="loading" variant="text-card" />

    <van-empty v-else-if="!list.length" description="暂无证书" />

    <div v-else class="content">
      <!--
        概览三格：结构与 ScoreList / 考试详情页的 .stat-card 完全一致
        （34px 圆形浅蓝底 + 主色数字 + 灰标签，格间竖分隔线），
        三页放在一起才是同一个 App。三项均由 list 现算，不额外请求接口。
      -->
      <section class="card stat-card">
        <div class="stat-row">
          <div v-for="item in stats" :key="item.label" class="stat">
            <span class="stat-icon" aria-hidden="true">
              <van-icon :name="item.icon" />
            </span>
            <span class="stat-value">{{ item.value }}</span>
            <span class="stat-label">{{ item.label }}</span>
          </div>
        </div>
      </section>

      <div class="list-head">
        <h2 class="list-title">证书记录</h2>
        <span class="list-count">{{ list.length }} 条</span>
      </div>

      <ul class="cert-list">
        <li
          v-for="item in list"
          :key="item.id"
          class="cert-card"
          @click="router.push(`/profile/certificates/${item.id}`)"
        >
          <div class="card-main">
            <!-- 上行：证书名 + 状态标签。标签不参与压缩，名字过长时先挤名字 -->
            <header class="card-header">
              <h3 class="cert-name">{{ item.name }}</h3>
              <!--
                不用 van-tag 的 type：它给的是实心底 + 白字，在白卡上是一块高饱和色块，
                比证书名还抢眼。改用本项目「浅底 + 同色字」的状态标签写法
                （--success-light / --success-color），与成绩页的结论标签同一套观感。
              -->
              <span class="cert-status" :class="`is-${item.status}`">{{ item.statusText }}</span>
            </header>

            <p class="cert-code">证书编号：{{ item.code }}</p>
            <p class="cert-period">有效期：{{ item.validPeriod }}</p>
          </div>

          <!-- 箭头在卡片右侧垂直居中，明示整卡可点进详情 -->
          <van-icon name="arrow" class="cert-arrow" aria-hidden="true" />
        </li>
      </ul>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { CERT_STATUS } from '@/constants/exam'
import { getCertificateListApi } from '@/api/modules/profileApi'
import AppSkeleton from '@/components/Common/AppSkeleton.vue'

const router = useRouter()

// 证书列表
const list = ref([])

// 加载状态
const loading = ref(false)

/*
  概览三格：总数 / 有效 / 已过期。

  三个图标取 Vant 的描线版，与 ScoreList 同一条规矩——那页的注释写明
  实心与描线并排时粗细和填充都不一致。certificate 本身就是描线的证书图样，
  配 shield-o、clock-o 三者形态统一。

  「有效」「已过期」按 status 分别计数而不是「总数减有效」：
  状态日后若增加第三档（如即将到期），减法会把新状态错并进已过期。
*/
const stats = computed(() => {
  const valid = list.value.filter((item) => item.status === CERT_STATUS.VALID).length
  const expired = list.value.filter((item) => item.status === CERT_STATUS.EXPIRED).length
  return [
    { icon: 'certificate', value: list.value.length, label: '证书总数' },
    { icon: 'shield-o', value: valid, label: '有效' },
    { icon: 'clock-o', value: expired, label: '已过期' }
  ]
})

/**
 * 加载证书列表
 */
const loadList = async () => {
  loading.value = true
  try {
    const res = await getCertificateListApi()
    list.value = res.data || []
  } catch {
    // 错误提示由响应拦截器统一给出，此处仅保持空列表
    list.value = []
  } finally {
    loading.value = false
  }
}

onMounted(loadList)
</script>

<style scoped>
.certificate-list-page {
  min-height: 100vh;
  background-color: var(--bg-page);
}

.content {
  padding: var(--spacing-md);
}

.card {
  padding: var(--spacing-md);
  background-color: var(--bg-card);
  border-radius: var(--radius-lg);
}

/* ── 概览三格 ─────────────────────────────── */
/*
  纯白底、纵向比通用卡片宽松，与 ScoreList、考试详情页的同款三格一致：
  三格是本卡唯一内容，挤在 16px 内会显局促。
*/
.stat-card {
  padding-top: 18px;
  padding-bottom: 18px;
}

.stat-row {
  display: flex;
  align-items: stretch;
}

.stat {
  display: flex;
  flex: 1;
  /* 三格等分且允许收缩，防止某格内容偏长时挤窄另两格 */
  min-width: 0;
  flex-direction: column;
  align-items: center;
  gap: 7px;
  overflow: hidden;
}

/* 竖分隔线用 border 而非独立元素，避免多出空节点 */
.stat + .stat {
  border-left: 1px solid var(--divider-color);
}

.stat-icon {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 34px;
  height: 34px;
  font-size: 18px;
  color: var(--primary-color);
  background-color: var(--primary-light);
  border-radius: 50%;
}

.stat-value {
  font-size: 23px;
  font-weight: 600;
  line-height: 1.15;
  color: var(--primary-color);
  font-variant-numeric: tabular-nums;
}

.stat-label {
  font-size: 12px;
  line-height: 1.4;
  color: var(--text-disabled);
}

/* ── 列表标题行 ───────────────────────────── */
.list-head {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  margin: 20px 0 10px;
}

.list-title {
  font-size: 15px;
  font-weight: 600;
  color: var(--text-primary);
}

.list-count {
  font-size: 12px;
  color: var(--text-disabled);
}

/* 证书卡片 */
.cert-card {
  display: flex;
  align-items: center;
  gap: var(--spacing-sm);
  padding: var(--spacing-md);
  background-color: var(--bg-card);
  border-radius: var(--radius-lg);
  cursor: pointer;
}

/* 主体占满剩余宽度，箭头才能被推到右边缘 */
.card-main {
  flex: 1;
  min-width: 0;
}

.cert-arrow {
  flex-shrink: 0;
  font-size: 14px;
  color: var(--text-disabled);
}

/*
  过期卡片不压透明度。

  曾用 opacity: 0.72 做「过期」的弱化，实测撤销了：压完之后 13px 的编号与
  有效期对白底只剩 3.62:1，低于正文所需的 4.5:1；标签也掉到 3.43:1。
  过期状态由标签明确写出来即可，不必靠整块变浅——那既没多说什么，
  又把这张卡的正文推到读不清的边缘。撤掉后编号回到 7.1:1。
*/

.cert-card + .cert-card {
  margin-top: var(--spacing-sm);
}

.cert-card:active {
  opacity: 0.9;
}

.card-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: var(--spacing-sm);
}

.cert-name {
  flex: 1;
  font-size: 15px;
  font-weight: 600;
  color: var(--text-primary);
  line-height: 1.4;
}

/*
  状态标签：与 ScoreList 的 .verdict 同一套尺寸与配色规则
  （浅底 + 同色字，不辨色也能读出文字）。
  flex-shrink:0 防止证书名过长时把「已过期」压成两行；
  margin-top 让标签与证书名首行视觉居中——15px 字号下标签比字矮一截。
*/
.cert-status {
  flex-shrink: 0;
  padding: 3px 8px;
  margin-top: 2px;
  font-size: 12px;
  font-weight: 500;
  line-height: 1.4;
  border-radius: var(--radius-md);
}

/*
  绿字不用 --success-color：#00b42a 配 --success-light 浅底只有 2.55:1，
  12px 文字要 4.5:1，实测不达标。压深到 #0a7a1f 得 5.06:1，同色系看不出差别。
  （ScoreList 的 .verdict--pass 用的是同一对 token，有同样的问题，见交付说明。）
*/
.cert-status.is-valid {
  color: #0a7a1f;
  background-color: var(--success-light);
}

/* 已过期用中性灰而非红：证书到期是正常生命周期，不是错误 */
.cert-status.is-expired {
  color: var(--text-secondary);
  background-color: var(--bg-fill);
}

.cert-code,
.cert-period {
  margin-top: 6px;
  font-size: 13px;
  color: var(--text-secondary);
}
</style>
