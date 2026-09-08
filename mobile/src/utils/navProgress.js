/**
 * 路由跳转进度条
 *
 * 为什么需要：
 *   路由是懒加载的（component: () => import(...)），首次进某个页面要先下载 chunk。
 *   这段时间旧页已卸载、新页尚未挂载，页内的骨架屏还轮不到出现，屏幕是空的。
 *   顶部给一条细进度条，把「正在去下一页」这件事显式说出来。
 *
 * 为什么延迟 120ms 才显示：
 *   chunk 已缓存时跳转是毫秒级的，立刻显示会变成一闪而过的干扰。
 *   只有真的慢到用户能察觉时才出现。
 */

/** 延迟显示阈值：低于此值的跳转不显示，避免闪烁 */
const SHOW_DELAY = 120

/** 收尾动画时长，需与下方 transition 的 opacity 时长一致 */
const FADE_DURATION = 200

let bar = null
let showTimer = null
let hideTimer = null

/** 懒创建进度条节点，未发生慢跳转的会话不会向 DOM 插入任何东西 */
function ensureBar() {
  if (bar) return bar
  bar = document.createElement('div')
  bar.className = 'nav-progress'
  // 纯装饰性进度指示，不需要读屏播报（页内骨架屏已带 role="status"）
  bar.setAttribute('aria-hidden', 'true')
  document.body.appendChild(bar)
  return bar
}

/** 开始一次跳转 */
export function startNavProgress() {
  clearTimeout(showTimer)
  clearTimeout(hideTimer)

  showTimer = setTimeout(() => {
    const el = ensureBar()
    el.classList.remove('is-done')
    // 先复位到 0 再进入 70%：两次样式写入之间强制读一次布局，
    // 否则浏览器会把两个值合并成一帧，动画不会发生
    el.style.transform = 'scaleX(0)'
    void el.offsetWidth
    el.classList.add('is-active')
    el.style.transform = 'scaleX(0.7)'
  }, SHOW_DELAY)
}

/**
 * 结束一次跳转
 *
 * 不管进度条有没有真的显示出来都要调用，用于清掉待显示的定时器——
 * 否则快速跳转结束后，那个定时器仍会在 120ms 后把条子亮出来。
 */
export function doneNavProgress() {
  clearTimeout(showTimer)

  if (!bar || !bar.classList.contains('is-active')) return

  bar.style.transform = 'scaleX(1)'
  bar.classList.add('is-done')
  hideTimer = setTimeout(() => {
    bar.classList.remove('is-active', 'is-done')
    bar.style.transform = 'scaleX(0)'
  }, FADE_DURATION)
}
