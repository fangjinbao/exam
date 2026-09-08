<!--
  单个鉴定级别的新增/编辑弹窗。

  与 OccupationDialog 里的整组维护并存，分工是：
  - 工种弹窗：一次配齐某工种的整套分级（提交时全量替换）
  - 本弹窗：只动一级——给已有工种补一级，或改某一级的名称/排序/说明

  为什么不复用工种弹窗：整组替换会把未提交的级别当作已删除，
  只改一级却要求把全部级别一并回传，中途有并发改动就会抹掉别人刚加的级别。
  所以这里走 level/add、level/update 单条接口。
-->
<template>
  <ElDialog
    v-model="visible"
    :title="isEditing ? '编辑鉴定级别' : '新增鉴定级别'"
    width="520px"
    :close-on-click-modal="false"
    @closed="handleClosed"
  >
    <ElForm ref="formRef" :model="form" :rules="rules" label-width="90px">
      <!-- 所属工种只读：级别不支持改挂到别的工种下，那该由「删一级 + 在别处建一级」表达 -->
      <ElFormItem label="所属工种">
        <span class="owner-name">{{ occupationName }}</span>
      </ElFormItem>
      <ElFormItem label="级别名称" prop="name">
        <ElInput v-model="form.name" placeholder="如：三级/高级工" maxlength="50" show-word-limit />
      </ElFormItem>
      <ElFormItem label="排序" prop="orderNum">
        <ElInputNumber v-model="form.orderNum" :min="0" :precision="0" controls-position="right" />
        <span class="field-hint">数字小的排在前，次序表达级别高低</span>
      </ElFormItem>
      <ElFormItem label="级别说明" prop="description">
        <ElInput
          v-model="form.description"
          type="textarea"
          :rows="3"
          maxlength="500"
          show-word-limit
          placeholder="可填写该级别的报考条件等说明"
        />
      </ElFormItem>
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
  import { certOccupationApi } from '@/api/certOccupation'

  defineOptions({ name: 'LevelDialog' })

  const emit = defineEmits<{ saved: [] }>()

  const visible = ref(false)
  const isEditing = ref(false)
  const submitting = ref(false)
  const formRef = ref<FormInstance>()
  const occupationName = ref('')

  const form = reactive<{
    id?: number
    occupationId?: number
    name: string
    orderNum: number
    description: string
  }>({
    id: undefined,
    occupationId: undefined,
    name: '',
    orderNum: 0,
    description: ''
  })

  const rules: FormRules = {
    name: [
      { required: true, message: '请输入级别名称', trigger: 'blur' },
      { max: 50, message: '级别名称不超过 50 字', trigger: 'blur' }
    ]
  }

  /**
   * 打开弹窗
   *
   * @param opts.occupationId 所属工种 ID（新增必传）
   * @param opts.occupationName 所属工种名称（只用于展示，不提交）
   * @param opts.level 传则为编辑，不传为新增
   */
  function open(opts: {
    occupationId: number
    occupationName: string
    level?: { id: number; name: string; orderNum?: number; description?: string | null }
  }) {
    isEditing.value = !!opts.level
    occupationName.value = opts.occupationName
    form.occupationId = opts.occupationId

    if (opts.level) {
      form.id = opts.level.id
      form.name = opts.level.name
      form.orderNum = opts.level.orderNum ?? 0
      form.description = opts.level.description ?? ''
    } else {
      form.id = undefined
      form.name = ''
      // 新增留 0：服务端遇 0 之外的空值才自动排到末尾，这里显式给 0 由用户自己定
      form.orderNum = 0
      form.description = ''
    }
    visible.value = true
  }

  async function handleSubmit() {
    if (!formRef.value) return
    const valid = await formRef.value.validate().catch(() => false)
    if (!valid) return

    submitting.value = true
    try {
      const payload = {
        name: form.name.trim(),
        orderNum: form.orderNum,
        description: form.description || undefined
      }
      // 同名冲突等业务错误由 http 层 reject，走下面的 catch，这里不必判 code
      if (isEditing.value) {
        await certOccupationApi.updateLevel({ id: form.id!, ...payload })
      } else {
        await certOccupationApi.addLevel({ occupationId: form.occupationId!, ...payload })
      }
      ElMessage.success(isEditing.value ? '编辑级别成功' : '新增级别成功')
      visible.value = false
      emit('saved')
    } catch (e: any) {
      ElMessage.error(e?.message || '保存失败')
    } finally {
      submitting.value = false
    }
  }

  /** 关闭后重置校验态，避免下次打开时残留上次的红字 */
  function handleClosed() {
    formRef.value?.clearValidate()
  }

  defineExpose({ open })
</script>

<style lang="scss" scoped>
  .owner-name {
    color: var(--art-text-gray-800);
  }

  .field-hint {
    margin-left: 10px;
    font-size: 12px;
    color: var(--art-text-gray-500);
  }
</style>
