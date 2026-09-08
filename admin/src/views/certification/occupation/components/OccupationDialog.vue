<!--
  工种新增/编辑弹窗。

  级别在这里整组维护：没有独立于工种的增删改接口，
  提交时随工种一起发，服务端按「提交的即全部」全量替换。
  故这里的删除只是从本地数组里移除，点确定才真正生效。
-->
<template>
  <ElDialog
    v-model="visible"
    :title="isEditing ? '编辑鉴定工种' : '新增鉴定工种'"
    width="720px"
    :close-on-click-modal="false"
    @closed="handleClosed"
  >
    <ElForm ref="formRef" :model="form" :rules="rules" label-width="90px">
      <ElFormItem label="工种名称" prop="name">
        <ElInput v-model="form.name" placeholder="如：加油工" maxlength="50" show-word-limit />
      </ElFormItem>
      <ElFormItem label="工种编号" prop="code">
        <ElInput v-model="form.code" placeholder="留空由系统生成（GZ001）" maxlength="30" />
      </ElFormItem>
      <ElFormItem label="排序" prop="orderNum">
        <ElInputNumber v-model="form.orderNum" :min="0" :precision="0" controls-position="right" />
        <span class="field-hint">数字小的排在前</span>
      </ElFormItem>
      <ElFormItem label="状态" prop="status">
        <ElSwitch v-model="form.status" :active-value="1" :inactive-value="0" />
        <span class="field-hint">{{ form.status === 1 ? '启用' : '停用' }}</span>
      </ElFormItem>
      <ElFormItem label="工种说明" prop="description">
        <ElInput
          v-model="form.description"
          type="textarea"
          :rows="2"
          maxlength="500"
          show-word-limit
          placeholder="可填写该工种的适用范围等说明"
        />
      </ElFormItem>

      <ElDivider content-position="left">
        <span class="levels-divider">鉴定级别</span>
      </ElDivider>

      <!--
        级别列表用手写的行而非 ElTable：需要在行内放输入框并跟着上下移动，
        表格组件在这种「可编辑 + 可排序」的小列表上反而更绕。
      -->
      <div class="levels">
        <div v-if="!form.levels.length" class="levels-empty">
          尚未添加级别。点下方按钮添加，如初级 / 中级 / 高级。
        </div>
        <div v-for="(level, idx) in form.levels" :key="level._key" class="level-row">
          <span class="level-index">{{ idx + 1 }}</span>
          <ElInput
            v-model="level.name"
            placeholder="级别名称，如：初级"
            maxlength="50"
            class="level-name-input"
          />
          <ElInput
            v-model="level.description"
            placeholder="级别说明（可空）"
            maxlength="500"
            class="level-desc-input"
          />
          <ElButton
            link
            :disabled="idx === 0"
            :icon="ArrowUp"
            title="上移"
            @click="moveLevel(idx, -1)"
          />
          <ElButton
            link
            :disabled="idx === form.levels.length - 1"
            :icon="ArrowDown"
            title="下移"
            @click="moveLevel(idx, 1)"
          />
          <ElButton link type="danger" :icon="Delete" title="移除" @click="removeLevel(idx)" />
        </div>
        <ElButton link type="primary" :icon="Plus" class="add-level" @click="addLevel">
          添加级别
        </ElButton>
      </div>
    </ElForm>

    <template #footer>
      <ElButton @click="visible = false">取消</ElButton>
      <ElButton type="primary" :loading="submitting" @click="handleSubmit">确定</ElButton>
    </template>
  </ElDialog>
</template>

<script setup lang="ts">
  import { ref, reactive } from 'vue'
  import { ElMessage, type FormInstance, type FormRules } from 'element-plus'
  import { ArrowUp, ArrowDown, Delete, Plus } from '@element-plus/icons-vue'
  import { certOccupationApi, type CertOccupationLevel } from '@/api/certOccupation'

  defineOptions({ name: 'OccupationDialog' })

  const emit = defineEmits<{ saved: [] }>()

  /**
   * 表单里的级别行。
   *
   * _key 是本地渲染用的稳定 key：新增的级别还没有 id，
   * 用数组下标作 key 会在上移/下移与删除时让 Vue 复用错行（输入框的值跟着串位）。
   * id 保留原值提交，服务端据此判断是改已有级别还是建新的。
   */
  interface LevelRow {
    _key: string
    id?: number
    name: string
    description: string
  }

  let keySeq = 0
  const nextKey = () => `lv-${++keySeq}`

  const visible = ref(false)
  const isEditing = ref(false)
  const submitting = ref(false)
  const formRef = ref<FormInstance>()

  const form = reactive<{
    id?: number
    name: string
    code: string
    orderNum: number
    status: number
    description: string
    levels: LevelRow[]
  }>({
    id: undefined,
    name: '',
    code: '',
    orderNum: 0,
    status: 1,
    description: '',
    levels: []
  })

  const rules: FormRules = {
    name: [
      { required: true, message: '请输入工种名称', trigger: 'blur' },
      { max: 50, message: '工种名称不超过 50 字', trigger: 'blur' }
    ]
  }

  /**
   * 打开弹窗
   * @param id 传 id 为编辑，不传为新增
   */
  async function open(id?: number) {
    isEditing.value = !!id
    visible.value = true
    if (!id) {
      // 新增时预置三档常见级别，省掉最常见的一遍手敲；不需要的可直接移除
      form.levels = [
        { _key: nextKey(), name: '初级', description: '' },
        { _key: nextKey(), name: '中级', description: '' },
        { _key: nextKey(), name: '高级', description: '' }
      ]
      return
    }
    try {
      const { data } = await certOccupationApi.getDetail(id)
      if (!data) return
      Object.assign(form, {
        id: data.id,
        name: data.name,
        code: data.code,
        orderNum: data.orderNum ?? 0,
        status: data.status ?? 1,
        description: data.description ?? ''
      })
      // 详情接口回的是 levels（Prisma 关系名），列表接口回的是 children，两处都兜一下
      const levels: CertOccupationLevel[] = data.levels ?? data.children ?? []
      form.levels = levels.map((l) => ({
        _key: nextKey(),
        id: l.id,
        name: l.name,
        description: l.description ?? ''
      }))
    } catch (e: any) {
      ElMessage.error(e?.message || '获取工种详情失败')
      visible.value = false
    }
  }

  function addLevel() {
    form.levels.push({ _key: nextKey(), name: '', description: '' })
  }

  function removeLevel(idx: number) {
    form.levels.splice(idx, 1)
  }

  /**
   * 上移/下移级别（顺序即级别高低，提交时按数组次序写 orderNum）
   * @param idx 当前下标
   * @param delta -1 上移，1 下移
   */
  function moveLevel(idx: number, delta: number) {
    const target = idx + delta
    if (target < 0 || target >= form.levels.length) return
    const list = form.levels
    ;[list[idx], list[target]] = [list[target], list[idx]]
  }

  async function handleSubmit() {
    try {
      await formRef.value?.validate()
    } catch {
      return
    }

    // 级别名称在提交前本地先拦一遍：空名与同名服务端也会拒，
    // 但那要等一次往返，且错误只能整条弹出、指不到具体哪行
    const named = form.levels.map((l) => ({ ...l, name: l.name.trim() }))
    if (named.some((l) => !l.name)) {
      ElMessage.warning('级别名称不能为空，请填写或移除空行')
      return
    }
    const dup = named.find((l, i) => named.findIndex((x) => x.name === l.name) !== i)
    if (dup) {
      ElMessage.warning(`级别「${dup.name}」重复，同一工种内级别不能同名`)
      return
    }

    submitting.value = true
    try {
      const payload = {
        name: form.name.trim(),
        code: form.code.trim() || undefined,
        description: form.description.trim() || undefined,
        orderNum: form.orderNum,
        status: form.status,
        // orderNum 按当前数组次序下发（1 起），表达级别由低到高
        levels: named.map((l, idx) => ({
          id: l.id,
          name: l.name,
          orderNum: idx + 1,
          description: l.description.trim() || undefined
        }))
      }
      if (isEditing.value && form.id) {
        await certOccupationApi.update({ id: form.id, ...payload })
        ElMessage.success('编辑鉴定工种成功')
      } else {
        await certOccupationApi.add(payload)
        ElMessage.success('新增鉴定工种成功')
      }
      visible.value = false
      emit('saved')
    } catch (e: any) {
      ElMessage.error(e?.message || '保存失败')
    } finally {
      submitting.value = false
    }
  }

  /** 关闭后重置，避免下次打开残留上一个工种的数据 */
  function handleClosed() {
    formRef.value?.resetFields()
    Object.assign(form, {
      id: undefined,
      name: '',
      code: '',
      orderNum: 0,
      status: 1,
      description: '',
      levels: []
    })
    isEditing.value = false
  }

  defineExpose({ open })
</script>

<style lang="scss" scoped>
  .field-hint {
    margin-left: 12px;
    font-size: 12px;
    color: var(--el-text-color-secondary);
  }

  .levels-divider {
    font-size: 14px;
    font-weight: 600;
  }

  .levels {
    .levels-empty {
      padding: 12px;
      margin-bottom: 8px;
      font-size: 13px;
      color: var(--el-text-color-secondary);
      text-align: center;
      background: var(--el-fill-color-lighter);
      border-radius: 8px;
    }

    .level-row {
      display: flex;
      gap: 8px;
      align-items: center;
      margin-bottom: 8px;

      .level-index {
        flex-shrink: 0;
        width: 20px;
        font-size: 13px;
        color: var(--el-text-color-secondary);
        text-align: center;
      }

      .level-name-input {
        width: 160px;
      }

      .level-desc-input {
        flex: 1;
      }
    }

    .add-level {
      margin-top: 4px;
    }
  }
</style>
