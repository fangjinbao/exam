<!-- 证书可视化模板设计器：全屏对话框，左工具栏加元素/传图、中画布拖拽排版、右属性面板、顶部预览与保存 -->
<template>
  <ElDialog
    v-model="visible"
    fullscreen
    :show-close="false"
    class="designer-dialog"
    @opened="onOpened"
  >
    <template #header>
      <div class="designer-header">
        <div class="header-left">
          <span class="title-badge">证书设计</span>
          <span class="title-name">{{ template?.name || '未命名模板' }}</span>
        </div>
        <div class="header-ops">
          <div class="size-switch">
            <span class="size-label">尺寸</span>
            <ElRadioGroup v-model="local.size">
              <ElRadioButton :value="2">A4竖版</ElRadioButton>
              <ElRadioButton :value="1">A4横版</ElRadioButton>
            </ElRadioGroup>
          </div>
          <span class="op-divider" />
          <ElButton
            :type="preview ? 'primary' : 'default'"
            :icon="View"
            @click="preview = !preview"
          >
            {{ preview ? '退出预览' : '预览' }}
          </ElButton>
          <ElButton @click="visible = false">取消</ElButton>
          <ElButton type="primary" :icon="Check" :loading="props.saving" @click="handleSave">
            保存
          </ElButton>
        </div>
      </div>
    </template>

    <div class="designer-body">
      <div class="designer-left">
        <div class="tool-group-title">添加元素</div>
        <div class="tool-list">
          <button type="button" class="tool-item" @click="addElement('text')">
            <span class="ti-icon"><ElIcon><Document /></ElIcon></span>
            <span class="ti-body">
              <span class="ti-label">静态文本</span>
              <span class="ti-desc">固定展示的文字</span>
            </span>
          </button>
          <button type="button" class="tool-item" @click="addElement('field')">
            <span class="ti-icon"><ElIcon><Collection /></ElIcon></span>
            <span class="ti-body">
              <span class="ti-label">动态字段</span>
              <span class="ti-desc">姓名 / 证书编号等</span>
            </span>
          </button>
          <button
            type="button"
            class="tool-item"
            :disabled="!template?.sealImage"
            @click="addElement('seal')"
          >
            <span class="ti-icon"><ElIcon><Stamp /></ElIcon></span>
            <span class="ti-body">
              <span class="ti-label">印章</span>
              <span class="ti-desc">{{ template?.sealImage ? '添加机构印章' : '需先上传印章' }}</span>
            </span>
          </button>
        </div>

        <div class="tool-group-title">证书底图</div>
        <ElUpload
          class="bg-upload"
          :show-file-list="false"
          :http-request="handleBgUpload"
          accept="image/png,image/jpeg,image/webp"
        >
          <ElButton class="tool-btn" size="large" :icon="Picture">
            {{ local.backgroundImage ? '更换底图' : '上传底图' }}
          </ElButton>
        </ElUpload>
        <ElButton
          v-if="local.backgroundImage"
          class="tool-btn remove-bg"
          text
          type="danger"
          :icon="Delete"
          @click="local.backgroundImage = ''"
        >
          移除底图
        </ElButton>
      </div>
      <div class="designer-center">
        <DesignerCanvas
          ref="canvasRef"
          v-model:selected-id="selectedId"
          :elements="local.elements"
          :size="local.size"
          :background="local.backgroundImage"
          :seal="template?.sealImage"
          :preview="preview"
          @drag="onDrag"
        />
      </div>
      <div class="designer-right">
        <ElementPropsPanel
          :element="selectedEl"
          @patch="onPatch"
          @remove="onRemove"
          @fit-width="onFitWidth"
        />
      </div>
    </div>
  </ElDialog>
</template>
<script setup lang="ts">
  import { ref, reactive, computed, nextTick } from 'vue'
  import { ElMessage, type UploadRequestOptions } from 'element-plus'
  import {
    Document,
    Collection,
    Stamp,
    Picture,
    View,
    Check,
    Delete
  } from '@element-plus/icons-vue'
  import request from '@/utils/http'
  import type { CertificateTemplate } from '@/api/certificateTemplate'
  import DesignerCanvas from './DesignerCanvas.vue'
  import ElementPropsPanel from './ElementPropsPanel.vue'
  import {
    CANVAS_SIZE,
    FIELD_OPTIONS,
    fitElementBox,
    genElementId,
    parseContent,
    stringifyContent,
    type DesignerElement,
    type ElementType
  } from './designer-types'

  const props = defineProps<{
    modelValue: boolean
    template: CertificateTemplate | null
    saving?: boolean
  }>()
  const emit = defineEmits<{
    (e: 'update:modelValue', v: boolean): void
    (e: 'saved', payload: { size: number; backgroundImage: string; content: string }): void
  }>()

  const visible = computed({
    get: () => props.modelValue,
    set: (v) => emit('update:modelValue', v)
  })

  // 本地编辑副本：尺寸/底图/元素，保存时才回写父级（取消不影响原数据）
  const local = reactive<{ size: number; backgroundImage: string; elements: DesignerElement[] }>({
    size: 2,
    backgroundImage: '',
    elements: []
  })
  const selectedId = ref('')
  const preview = ref(false)

  const selectedEl = computed(() => local.elements.find((e) => e.id === selectedId.value) || null)

  /** 对话框打开时从模板载入副本 */
  function onOpened() {
    local.size = props.template?.size === 1 ? 1 : 2
    local.backgroundImage = props.template?.backgroundImage || ''
    local.elements = parseContent(props.template?.content)
    selectedId.value = ''
    preview.value = false
  }

  /** 新增元素，落在画布左上偏移处并选中 */
  /**
   * 为新元素找一个不与现有元素完全重合的落点
   *
   * 固定落在 (40,40) 时连续添加的元素会严丝合缝地叠在一起，看不出有几个，
   * 也只能一个个拖开才能分辨。这里在落点被占时阶梯偏移，超出画布则回到起点。
   *
   * @param width 新元素宽度，用于判断阶梯偏移是否已顶到画布右边界
   */
  function nextFreeSpot(width: number): { x: number; y: number } {
    const STEP = 24
    const canvas = CANVAS_SIZE[local.size === 1 ? 1 : 2]
    let x = 40
    let y = 40
    while (local.elements.some((el) => el.x === x && el.y === y)) {
      x += STEP
      y += STEP
      // 顶到边界就回到起点收手：继续外推会把元素推到画布外反而更难找
      if (x + width > canvas.width || y + STEP > canvas.height) {
        x = 40
        y = 40
        break
      }
    }
    return { x, y }
  }

  function addElement(type: ElementType) {
    const width = type === 'seal' ? 100 : 200
    const spot = nextFreeSpot(width)
    const el: DesignerElement = {
      id: genElementId(),
      type,
      x: spot.x,
      y: spot.y,
      width,
      fontSize: type === 'text' ? 20 : 24,
      color: '#000000',
      bold: false,
      underline: false,
      align: 'center',
      /*
        仅静态文本默认贴合：默认 200px 框配两三个字会让选中框大得离谱，
        且右对齐时文字顶在框右缘、框左缘已到 x=0 仍离左侧很远，拖不过去。
        动态字段不默认贴合 —— 占位符【姓名】只是替身，发证时填的真实值长度不同，
        按替身宽度贴紧会让长值在考生端折行。需要时可手点「适应文字」。
      */
      ...(type === 'text' ? { autoWidth: true } : {}),
      ...(type === 'text' ? { text: '文本' } : {}),
      ...(type === 'field' ? { fieldKey: FIELD_OPTIONS[0].key } : {})
    }
    local.elements.push(el)
    selectedId.value = el.id
    // 等 DOM 渲染出来才能量到文字实宽
    void nextTick(() => refitWidth(el.id))
  }

  /**
   * 按文字实宽重设框宽与 x（仅 autoWidth 开启的元素）
   *
   * 几何规则见 designer-types.ts 的 fitElementBox。
   *
   * @param id 元素 id
   */
  function refitWidth(id: string) {
    const el = local.elements.find((e) => e.id === id)
    if (!el || el.type === 'seal' || !el.autoWidth) return
    const measured = canvasRef.value?.measureTextWidth(id) ?? 0
    if (measured <= 0 || measured === el.width) return

    const canvas = CANVAS_SIZE[local.size === 1 ? 1 : 2]
    const { x, width } = fitElementBox(el, measured, canvas.width)

    el.width = width
    el.x = x
  }

  const canvasRef = ref<InstanceType<typeof DesignerCanvas> | null>(null)

  /** 「适应文字」按钮：立即贴合，并重新开启自动收放（手动改过宽度后用它恢复） */
  function onFitWidth() {
    const el = selectedEl.value
    if (!el) return
    el.autoWidth = true
    refitWidth(el.id)
  }

  /** 拖拽更新坐标 */
  function onDrag({ id, x, y }: { id: string; x: number; y: number }) {
    const el = local.elements.find((e) => e.id === id)
    if (el) {
      el.x = x
      el.y = y
    }
  }

  /** 属性面板变更合并到对应元素 */
  function onPatch({ id, changes }: { id: string; changes: Partial<DesignerElement> }) {
    const el = local.elements.find((e) => e.id === id)
    if (!el) return
    // 手动改宽度即视为接管，关掉自动收放（否则下次改文字会把手调的宽度冲掉）
    if (changes.width !== undefined) el.autoWidth = false
    Object.assign(el, changes)
    // 文字内容与字形影响实宽，改完重新贴合
    const affectsWidth =
      changes.text !== undefined ||
      changes.fieldKey !== undefined ||
      changes.fontSize !== undefined ||
      changes.bold !== undefined
    if (affectsWidth) void nextTick(() => refitWidth(id))
  }

  /** 删除元素 */
  function onRemove(id: string) {
    local.elements = local.elements.filter((e) => e.id !== id)
    if (selectedId.value === id) selectedId.value = ''
  }

  /** 底图上传：复用文件上传接口，成功后回填相对路径 */
  async function handleBgUpload(options: UploadRequestOptions) {
    const formData = new FormData()
    formData.append('file', options.file)
    try {
      const { data } = await request.post<{ url: string }>({
        url: '/admin/space/info/upload',
        data: formData,
        showErrorMessage: false
      })
      local.backgroundImage = data.url
      ElMessage.success('底图上传成功')
    } catch (error: any) {
      ElMessage.error(error.message || '底图上传失败')
    }
  }

  /** 保存：序列化元素为 content JSON，回写父级（真实保存状态由父级通过 saving prop 控制） */
  function handleSave() {
    emit('saved', {
      size: local.size,
      backgroundImage: local.backgroundImage,
      content: stringifyContent(local.elements)
    })
  }
</script>

<style lang="scss" scoped>
  .designer-header {
    display: flex;
    align-items: center;
    justify-content: space-between;

    .header-left {
      display: flex;
      align-items: center;
      gap: 10px;
    }

    .title-badge {
      font-size: 13px;
      font-weight: 600;
      color: var(--el-color-primary);
      background: var(--el-color-primary-light-9);
      padding: 3px 10px;
      border-radius: 6px;
    }

    .title-name {
      font-size: 15px;
      font-weight: 600;
      color: var(--el-text-color-primary);
    }

    .header-ops {
      display: flex;
      align-items: center;
      gap: 10px;

      .size-switch {
        display: flex;
        align-items: center;
        gap: 8px;
      }

      .size-label {
        font-size: 13px;
        color: var(--el-text-color-secondary);
      }

      .op-divider {
        width: 1px;
        height: 20px;
        background: var(--el-border-color);
        margin: 0 2px;
      }
    }
  }

  .designer-body {
    display: flex;
    height: 100%;
    gap: 0;
    background: var(--el-fill-color-lighter);
  }

  .designer-left {
    width: 220px;
    flex-shrink: 0;
    background: var(--el-bg-color);
    border-right: 1px solid var(--el-border-color-lighter);
    padding: 20px 16px;
    display: flex;
    flex-direction: column;
    gap: 12px;
    overflow-y: auto;

    .tool-group-title {
      font-size: 13px;
      font-weight: 600;
      letter-spacing: 0.5px;
      color: var(--el-text-color-secondary);
      margin: 8px 0 4px;
      display: flex;
      align-items: center;

      &::before {
        content: '';
        width: 3px;
        height: 12px;
        border-radius: 2px;
        background: var(--el-color-primary);
        margin-right: 6px;
      }
    }

    .tool-list {
      display: flex;
      flex-direction: column;
      gap: 8px;
    }

    .tool-item {
      display: flex;
      align-items: center;
      gap: 12px;
      width: 100%;
      padding: 12px;
      border: 1px solid var(--el-border-color-lighter);
      border-radius: 10px;
      background: var(--el-fill-color-blank);
      cursor: pointer;
      text-align: left;
      transition: all 0.18s ease;

      .ti-icon {
        display: flex;
        align-items: center;
        justify-content: center;
        width: 36px;
        height: 36px;
        flex-shrink: 0;
        border-radius: 8px;
        background: var(--el-fill-color);
        color: var(--el-text-color-secondary);
        font-size: 18px;
        transition: all 0.18s ease;
      }

      .ti-body {
        display: flex;
        flex-direction: column;
        gap: 2px;
        min-width: 0;
      }

      .ti-label {
        font-size: 14px;
        font-weight: 500;
        color: var(--el-text-color-primary);
        line-height: 1.2;
      }

      .ti-desc {
        font-size: 12px;
        color: var(--el-text-color-placeholder);
        line-height: 1.2;
      }

      &:hover:not(:disabled) {
        border-color: var(--el-color-primary);
        background: var(--el-color-primary-light-9);

        .ti-icon {
          background: var(--el-color-primary);
          color: #fff;
        }

        .ti-label {
          color: var(--el-color-primary);
        }
      }

      &:disabled {
        cursor: not-allowed;
        opacity: 0.55;
      }
    }

    .bg-upload {
      width: 100%;

      :deep(.el-upload) {
        width: 100%;
      }
    }

    .tool-btn {
      width: 100%;
      margin-left: 0 !important;
      justify-content: center;
    }

    .remove-bg {
      justify-content: center;
    }
  }

  .designer-center {
    flex: 1;
    overflow: hidden;
  }

  .designer-right {
    width: 260px;
    flex-shrink: 0;
    background: var(--el-bg-color);
    border-left: 1px solid var(--el-border-color-lighter);
  }

  :deep(.designer-dialog) {
    .el-dialog__body {
      padding: 0;
      height: calc(100vh - 60px);
    }
    .el-dialog__header {
      padding: 12px 20px;
      margin-right: 0;
      border-bottom: 1px solid var(--el-border-color-lighter);
    }
  }
</style>
