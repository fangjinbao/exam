<!--
  组件名称：ArtRichEditor - 题目富文本编辑器

  功能描述：
    基于 Tiptap 的轻量富文本编辑器，供题干/选项/解析/评分标准录入使用。
    支持加粗、斜体、下划线、上下标、有序无序列表、表格、图片。

    图片走服务端上传（/admin/space/info/upload）拿站内 URL 后插入，
    不用 base64 内联——题干等字段是 MySQL TEXT（上限 64KB），
    一张图的 base64 就会超限导致保存失败。

  使用方式：
    <ArtRichEditor v-model="form.stem" placeholder="请输入题干" :min-height="140" />

  属性说明：
    - modelValue：HTML 字符串
    - placeholder：空内容占位文案
    - minHeight：编辑区最小高度（px）
    - disabled：是否只读
    - compact：精简模式。工具栏只保留图片与清格式，且仅在聚焦时出现。
      用于选项这类「内容通常只有几个字、但偶尔要插图」的短字段——
      给每个选项都常驻一整排格式按钮，一屏会叠出六七个工具栏，
      视觉噪音远超实际需要。
-->

<template>
  <!--
    focusin/focusout 挂在根容器而非编辑区：精简模式下点工具栏按钮时，
    焦点仍在容器内，不该判为失焦把工具栏收起来（否则按钮根本点不到）。
    focusout 的 relatedTarget 为容器内元素时直接忽略。
  -->
  <div
    class="art-rich-editor"
    :class="{ 'is-disabled': disabled, 'is-compact': compact }"
    @focusin="focused = true"
    @focusout="handleFocusOut"
  >
    <!-- editor 写进 v-if 是为了让模板内的类型收窄成立（showToolbar 已含同样判断） -->
    <div v-if="editor && showToolbar" class="editor-toolbar">
      <button
        v-if="!compact"
        type="button"
        :class="{ active: editor.isActive('bold') }"
        title="加粗"
        @click="editor.chain().focus().toggleBold().run()"
      >
        <strong>B</strong>
      </button>
      <button
        v-if="!compact"
        type="button"
        :class="{ active: editor.isActive('italic') }"
        title="斜体"
        @click="editor.chain().focus().toggleItalic().run()"
      >
        <em>I</em>
      </button>
      <button
        v-if="!compact"
        type="button"
        :class="{ active: editor.isActive('strike') }"
        title="删除线"
        @click="editor.chain().focus().toggleStrike().run()"
      >
        <s>S</s>
      </button>

      <span v-if="!compact" class="toolbar-sep"></span>

      <button
        v-if="!compact"
        type="button"
        :class="{ active: editor.isActive('bulletList') }"
        title="无序列表"
        @click="editor.chain().focus().toggleBulletList().run()"
      >
        ≡
      </button>
      <button
        v-if="!compact"
        type="button"
        :class="{ active: editor.isActive('orderedList') }"
        title="有序列表"
        @click="editor.chain().focus().toggleOrderedList().run()"
      >
        1.
      </button>

      <span v-if="!compact" class="toolbar-sep"></span>

      <button v-if="!compact" type="button" title="插入表格" @click="insertTable">表格</button>
      <button
        v-if="!compact"
        type="button"
        title="删除表格"
        :disabled="!editor.isActive('table')"
        @click="editor.chain().focus().deleteTable().run()"
      >
        删表
      </button>

      <span v-if="!compact" class="toolbar-sep"></span>

      <button type="button" :disabled="uploading" title="插入图片" @click="pickImage">
        {{ uploading ? '上传中…' : '图片' }}
      </button>

      <span class="toolbar-sep"></span>

      <button type="button" title="清除格式" @click="editor.chain().focus().unsetAllMarks().run()">
        清格式
      </button>
    </div>
    <!--
      占位文案用覆盖层实现：项目未装 @tiptap/extension-placeholder，
      没有 .is-editor-empty 类可供 CSS 伪元素挂靠，故改判编辑器的 isEmpty 状态。
      覆盖层 pointer-events: none，不挡输入焦点。
    -->
    <div class="editor-wrap">
      <span v-if="showPlaceholder" class="editor-placeholder">{{ placeholder }}</span>
      <EditorContent :editor="editor" class="editor-body" :style="{ minHeight: `${minHeight}px` }" />
    </div>
    <input
      ref="fileInputRef"
      type="file"
      accept="image/jpeg,image/png,image/gif,image/webp"
      class="hidden-file"
      @change="handleFilePicked"
    />
  </div>
</template>

<script setup lang="ts">
  import { useEditor, EditorContent } from '@tiptap/vue-3'
  import StarterKit from '@tiptap/starter-kit'
  import { Table, TableRow, TableHeader, TableCell } from '@tiptap/extension-table'
  import { Image } from '@tiptap/extension-image'
  import { ElMessage } from 'element-plus'
  import { uploadFile, ALLOWED_IMAGE_EXT, MAX_UPLOAD_SIZE } from '@/api/upload'

  defineOptions({ name: 'ArtRichEditor' })

  const props = withDefaults(
    defineProps<{
      modelValue?: string
      placeholder?: string
      minHeight?: number
      disabled?: boolean
      /** 精简模式：工具栏只留图片与清格式，且仅聚焦时显示 */
      compact?: boolean
    }>(),
    {
      modelValue: '',
      placeholder: '请输入内容',
      minHeight: 140,
      disabled: false,
      compact: false
    }
  )

  const emit = defineEmits<{ 'update:modelValue': [string] }>()

  const fileInputRef = ref<HTMLInputElement | null>(null)
  const uploading = ref(false)
  /** 是否聚焦（精简模式据此决定工具栏显隐） */
  const focused = ref(false)

  /**
   * 容器失焦处理
   *
   * 焦点仍落在容器内部（例如从编辑区移到工具栏按钮）时不算失焦。
   * relatedTarget 为 null 的情况（点到页面空白处）按失焦处理。
   *
   * @param e 失焦事件
   */
  function handleFocusOut(e: FocusEvent) {
    const next = e.relatedTarget as Node | null
    const root = e.currentTarget as HTMLElement
    if (next && root.contains(next)) return
    focused.value = false
  }

  /**
   * 工具栏是否显示
   *
   * 精简模式下只在聚焦时出现：选项这类短字段常驻工具栏会让一屏叠出六七排按钮。
   * uploading 时保持显示，否则点了图片、面板消失、用户不知道正在上传。
   */
  const showToolbar = computed(() => {
    if (!editor.value || props.disabled) return false
    if (!props.compact) return true
    return focused.value || uploading.value
  })

  const editor = useEditor({
    extensions: [
      StarterKit,
      Table.configure({ resizable: true }),
      TableRow,
      TableHeader,
      TableCell,
      // allowBase64: false —— 强制走上传。base64 会撑爆 TEXT 列（64KB）
      Image.configure({ inline: false, allowBase64: false })
    ],
    content: props.modelValue || '',
    editable: !props.disabled,
    editorProps: {
      attributes: { class: 'rich-content' },
      // 粘贴图片：同样走上传而非转 base64
      handlePaste(_view, event) {
        const items = event.clipboardData?.items
        if (!items) return false
        for (const item of Array.from(items)) {
          if (item.type.startsWith('image/')) {
            const file = item.getAsFile()
            if (!file) continue
            event.preventDefault()
            void doUpload(file)
            return true
          }
        }
        return false
      }
    },
    onUpdate: ({ editor: instance }) => {
      const html = instance.getHTML()
      // Tiptap 空内容会产出 <p></p>，统一归一成空串，便于后端必填校验
      emit('update:modelValue', html === '<p></p>' ? '' : html)
    },
  })

  /**
   * 外部值变化时同步进编辑器
   *
   * 比对当前 HTML 再决定是否 setContent：不比对会在每次 onUpdate 回流时
   * 重置内容并把光标弹到开头。
   */
  watch(
    () => props.modelValue,
    (val) => {
      const instance = editor.value
      if (!instance) return
      const current = instance.getHTML()
      const next = val || ''
      if (current === next || (next === '' && current === '<p></p>')) return
      instance.commands.setContent(next, { emitUpdate: false })
    }
  )

  watch(
    () => props.disabled,
    (val) => editor.value?.setEditable(!val)
  )

  /**
   * 上传图片并插入编辑器
   * @param file 待上传的图片文件
   */
  async function doUpload(file: File): Promise<void> {
    const ext = file.name.slice(file.name.lastIndexOf('.')).toLowerCase()
    if (!ALLOWED_IMAGE_EXT.includes(ext)) {
      // svg 被服务端白名单排除（可内嵌脚本），此处提前拦住给出明确提示
      ElMessage.warning(`仅支持 ${ALLOWED_IMAGE_EXT.join('、')} 格式的图片`)
      return
    }
    if (file.size > MAX_UPLOAD_SIZE) {
      ElMessage.warning('图片大小不能超过 10MB')
      return
    }

    uploading.value = true
    try {
      const res = await uploadFile(file)
      // http 封装返回 { code, message, data }，文件记录在 data 上
      const url = res?.data?.url
      if (!url) {
        ElMessage.error('图片上传失败：未返回文件地址')
        return
      }
      editor.value?.chain().focus().setImage({ src: url, alt: file.name }).run()
    } catch (err: any) {
      // 403 多为角色缺少 space:info:upload 权限点，单独提示避免误判为网络问题
      const status = err?.response?.status
      ElMessage.error(
        status === 403 ? '当前账号没有图片上传权限，请联系管理员分配' : '图片上传失败，请重试'
      )
    } finally {
      uploading.value = false
    }
  }

  /** 是否显示占位文案（编辑器为空且非只读时） */
  const showPlaceholder = computed(() => !props.disabled && !!editor.value?.isEmpty)

  /** 工具栏图片按钮：唤起文件选择 */
  const pickImage = () => fileInputRef.value?.click()

  /** 文件选择回调 */
  const handleFilePicked = async (e: Event) => {
    const input = e.target as HTMLInputElement
    const file = input.files?.[0]
    if (file) await doUpload(file)
    // 清空 value，否则连续选同一文件不触发 change
    input.value = ''
  }

  /** 插入 3×3 表格（含表头行） */
  const insertTable = () =>
    editor.value?.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run()

  onBeforeUnmount(() => editor.value?.destroy())
</script>

<style lang="scss" scoped>
  .art-rich-editor {
    /*
     * 必须显式声明宽度：Element Plus 的 .el-form-item__content 是 flex 容器，
     * 本组件作为 flex item 时宽度会收缩到内容（工具栏按钮那一排）为止，
     * 表现为编辑器比同表单的其他字段窄一截。
     * min-width: 0 配合 width: 100%，保证在窄容器里也能压缩而不溢出。
     */
    width: 100%;
    min-width: 0;
    border: 1px solid var(--art-border-color);
    border-radius: 6px;
    overflow: hidden;

    /*
     * 精简模式：工具栏浮在编辑区上方而不占据文档流。
     * 否则聚焦时工具栏出现会把下方内容整体顶下去，页面跳一下很难受。
     */
    &.is-compact {
      position: relative;
      overflow: visible;

      .editor-toolbar {
        position: absolute;
        bottom: calc(100% + 4px);
        left: 0;
        z-index: 10;
        background: var(--art-main-bg-color);
        border: 1px solid var(--art-border-color);
        border-radius: 6px;
        box-shadow: 0 4px 12px rgb(0 0 0 / 10%);
      }
    }

    &.is-disabled {
      background: var(--art-gray-100);
    }
  }

  .editor-toolbar {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 2px;
    padding: 4px 6px;
    background: var(--art-gray-100);
    border-bottom: 1px solid var(--art-border-color);

    button {
      min-width: 26px;
      height: 24px;
      padding: 0 5px;
      font-size: 12px;
      color: var(--art-text-gray-700);
      background: transparent;
      border: 1px solid transparent;
      border-radius: 4px;
      cursor: pointer;

      &:hover:not(:disabled) {
        background: var(--art-gray-200);
      }

      &.active {
        color: var(--el-color-primary);
        background: var(--art-gray-200);
      }

      &:disabled {
        color: var(--art-text-gray-400);
        cursor: not-allowed;
      }
    }
  }

  .toolbar-sep {
    width: 1px;
    height: 16px;
    margin: 0 2px;
    background: var(--art-border-color);
  }

  /* 占位文案的定位基准 */
  .editor-wrap {
    position: relative;
  }

  .editor-placeholder {
    position: absolute;
    top: 10px;
    left: 12px;
    font-size: 14px;
    line-height: 1.7;
    color: var(--art-text-gray-400);
    pointer-events: none;
    user-select: none;
  }

  .editor-body {
    padding: 10px 12px;
    overflow-y: auto;
    /* 与 minHeight 配合：内容超高时内部滚动，不把表单撑长 */
    max-height: 360px;
  }

  .hidden-file {
    display: none;
  }

  /*
   * 编辑区内容样式。用 :deep 因为节点由 Tiptap 运行时生成，
   * 不带 scoped 属性。
   */
  .editor-body :deep(.rich-content) {
    font-size: 14px;
    line-height: 1.7;
    outline: none;

    p {
      margin: 0 0 8px;
    }


    p:last-child {
      margin-bottom: 0;
    }

    /* 图片限宽，避免大图撑破表单 */
    img {
      max-width: 100%;
      height: auto;
      border-radius: 4px;
    }

    /* 选中的图片描边，便于确认将要删除的是哪张 */
    img.ProseMirror-selectednode {
      outline: 2px solid var(--el-color-primary);
    }

    table {
      width: 100%;
      border-collapse: collapse;
      table-layout: fixed;

      td,
      th {
        padding: 6px 8px;
        border: 1px solid var(--art-border-color);
      }

      th {
        background: var(--art-gray-100);
      }
    }

    ul,
    ol {
      padding-left: 22px;
      margin: 0 0 8px;
    }
  }
</style>
