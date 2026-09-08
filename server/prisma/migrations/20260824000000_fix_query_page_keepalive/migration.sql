-- 关掉五个「id 走 query」页面的路由缓存（keepAlive 1 → 0）
--
-- 背景：这些页面的目标记录 id 由 query 带入（?id= / ?bankId=），进页面后只在
-- onMounted 取一次数。被 KeepAlive 缓存时，换一个 id 进来既不换组件 key
-- （布局层 <component :key="route.path"> 不含 query）也不销毁实例，onMounted
-- 不再触发，页面显示的仍是上一条记录的数据。
--
-- 实际事故：复制考试后编辑副本，保存却报「考试已发布，无法编辑，请先撤回」——
-- 表单连同隐藏的 form.id 都还是源考试的，提交时按源考试 id 走，而源考试正在进行中。
--
-- 为什么要写成迁移：菜单声明在 seed.service.ts，但整体种子只在「库里没有用户」时才执行
-- （BootstrapService 非生产环境直接跳过，生产环境走 seedIfEmpty），已有数据的环境
-- 重启后端不会重新跑 seedNavMenus。而后端菜单模式下（VITE_ACCESS_MODE=backend）
-- 前端静态路由不参与注册，meta.keepAlive 来自本表 keepAlive === 1 的映射，
-- 所以库里不改就等于没改。与 add_exam_detail_menu、add_grading_workspace_menu 同款走迁移。
--
-- 注：/paper-edit 与 /grading-workspace 已是 0，不在本次范围内。
-- 幂等：按 router 精确匹配并限定 keepAlive = 1，重复执行不产生额外影响。
UPDATE `base_sys_menu`
SET `keepAlive` = 0, `updateTime` = NOW(3)
WHERE `router` IN (
  '/exam-edit',
  '/exam-detail',
  '/practice-edit',
  '/practice-detail',
  '/question-bank/questions'
)
AND `keepAlive` = 1;
