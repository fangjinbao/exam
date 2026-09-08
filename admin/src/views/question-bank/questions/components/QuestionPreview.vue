<!-- 题目答题预览：按考生实际作答的版式渲染题干与选项，并高亮标准答案 -->
<template>
  <div v-if="data" class="question-preview">
    <!-- 题头：题型 / 难度 / 分值 -->
    <div class="q-head">
      <ElTag size="small" effect="plain" disable-transitions>{{ typeLabel }}</ElTag>
      <ElTag size="small" :type="difficultyTagType" effect="light" disable-transitions>
        {{ difficultyLabel }}
      </ElTag>
      <span class="q-score">{{ data.suggestedScore ?? 0 }} 分</span>
    </div>

    <!-- 材料题：题干是各小题共用的材料，包成卡片以区别于小题本身 -->
    <!-- 题干为富文本，按 HTML 渲染；内容入库前已经服务端净化 -->
    <div v-if="isComposite" class="material-card">
      <span class="material-tag">材料</span>
      <div class="q-stem rich-text is-material" v-html="data.stem"></div>
    </div>
    <div v-else class="q-stem rich-text" v-html="data.stem"></div>

    <!-- 材料题的小题为空时给出明确提示，避免看起来像加载失败 -->
    <ElEmpty v-if="isComposite && !items.length" description="该材料题下暂无小题" :image-size="60" />

    <!-- 逐题渲染：非材料题时只有一项，材料题时为各个小题 -->
    <div v-for="item in items" :key="item.key" :class="item.no ? 'child-block' : ''">
      <div v-if="item.no" class="child-head">
        <!-- 圆标只显示数字，读屏会念成裸「1」，补 aria-label 保住语境 -->
        <span class="child-badge" :aria-label="`第 ${item.no} 小题`">{{ item.no }}</span>
        <ElTag size="small" effect="plain" disable-transitions>{{ item.typeLabel }}</ElTag>
        <span class="child-score">{{ item.score }} 分</span>
      </div>

      <div v-if="item.no" class="child-stem rich-text" v-html="item.stem"></div>

      <!-- 选项区：单选/多选/判断 -->
      <div v-if="item.options.length" class="q-options">
        <div
          v-for="opt in item.options"
          :key="opt.label"
          class="opt"
          :class="{ 'is-correct': opt.correct }"
        >
          <span class="opt-mark" :class="item.isMultiple ? 'is-square' : 'is-circle'">
            {{ opt.label }}
          </span>
          <!-- 选项内容支持富文本（可含图片） -->
          <span class="opt-text rich-text" v-html="opt.content"></span>
          <ElIcon v-if="opt.correct" class="opt-check"><Select /></ElIcon>
        </div>
      </div>

      <!-- 填空题：按空位展示 -->
      <div v-else-if="item.isBlank" class="q-blanks">
        <div v-for="(ans, idx) in item.blanks" :key="idx" class="blank-row">
          <span class="blank-label">第 {{ idx + 1 }} 空</span>
          <span class="blank-value">{{ ans || '—' }}</span>
        </div>
      </div>

      <!-- 问答题：答题区占位 + 参考答案 -->
      <div v-else class="q-textarea-placeholder">考生在此作答</div>

      <!-- 答案与解析：统一为细线分隔、无底色，避免实心色块盖过题目内容 -->
      <div class="q-answer-box">
        <div class="ans-row">
          <span class="ans-label">正确答案</span>
          <span class="ans-value">{{ item.answerText }}</span>
        </div>
        <div v-if="item.analysis" class="ans-row">
          <span class="ans-label">答案解析</span>
          <!-- 解析同为富文本 -->
          <span class="ans-analysis rich-text" v-html="item.analysis"></span>
        </div>
        <!-- 知识点挂在材料题上，小题不重复显示 -->
        <div v-if="!item.no" class="ans-row">
          <span class="ans-label">知识点</span>
          <span v-if="!kpList(item.knowledgePointNames).length" class="ans-plain">—</span>
          <span v-else class="kp-list">
            <span v-for="name in kpList(item.knowledgePointNames)" :key="name" class="kp-chip">
              {{ name }}
            </span>
          </span>
        </div>
      </div>
    </div>

    <!-- 材料题自身的知识点：降级成一行 meta，不再占一整块底色 -->
    <div v-if="isComposite" class="q-meta">
      <span class="meta-label">知识点</span>
      <span v-if="!kpList(data.knowledgePointNames).length" class="meta-value">—</span>
      <span v-else class="kp-list">
        <span v-for="name in kpList(data.knowledgePointNames)" :key="name" class="kp-chip">
          {{ name }}
        </span>
      </span>
    </div>
  </div>
</template>

<script setup lang="ts">
  import { computed } from 'vue'
  import { Select } from '@element-plus/icons-vue'
  import type { Question } from '@/api/question'

  interface DictItem {
    value: string
    name: string
  }

  const props = defineProps<{
    data: Question | null
    typeOptions?: DictItem[]
    difficultyOptions?: DictItem[]
  }>()

  /** 字典取名，取不到时回落原值 */
  function dictLabel(list: DictItem[] | undefined, value?: string) {
    if (!value) return '—'
    return list?.find((i) => i.value === value)?.name ?? value
  }

  const typeLabel = computed(() => dictLabel(props.typeOptions, props.data?.type))
  const difficultyLabel = computed(() => dictLabel(props.difficultyOptions, props.data?.difficulty))

  const difficultyTagType = computed(() => {
    const map: Record<string, 'success' | 'warning' | 'danger'> = {
      easy: 'success',
      medium: 'warning',
      hard: 'danger'
    }
    return map[props.data?.difficulty ?? ''] ?? 'info'
  })

  /** 材料题：题干是共用材料，实际作答内容在 children 里 */
  const isComposite = computed(() => props.data?.type === 'composite')

  /** 与主页面 questionKind 保持一致：非 single/multiple/judge/blank 一律视为主观题 */
  function isSubjectiveType(type: string) {
    return !['single', 'multiple', 'judge', 'blank'].includes(type)
  }

  /** 标准答案里被判为正确的标签集合（单选 A、多选 A,C、判断 正确/错误） */
  function correctSetOf(answer: string) {
    const raw = (answer ?? '').trim()
    if (!raw) return new Set<string>()
    return new Set(
      raw
        .split(/[,，\s]+/)
        .map((s) => s.trim().toUpperCase())
        .filter(Boolean)
    )
  }

  /**
   * 解析存储的选项为预览用结构（兼容新 JSON 与旧「A. 内容」两种存法）
   *
   * 新格式：`[{"key":"A","value":"<p>内容</p>"}]`，value 可含富文本。
   * 旧格式：一行一个，选择题带字母前缀、判断题为纯文本。
   * 首字符判 [ 时按 JSON 解析并带失败回退——历史脏数据可能有 `[A] 内容`
   * 这类方括号前缀，直接 JSON.parse 会抛错。
   */
  function parseOptions(options: string | null | undefined, type: string, answer: string) {
    const raw = options ?? ''
    if (!raw.trim() || type === 'blank' || isSubjectiveType(type)) return []
    const correct = correctSetOf(answer)

    const trimmed = raw.trim()
    if (trimmed.startsWith('[')) {
      try {
        const parsed = JSON.parse(trimmed)
        if (Array.isArray(parsed) && parsed.every((o) => o && typeof o.key === 'string')) {
          return parsed.map((o: any) => ({
            label: o.key,
            content: String(o.value ?? ''),
            correct: correct.has(String(o.key).toUpperCase())
          }))
        }
      } catch {
        // 落回旧格式解析
      }
    }

    return trimmed
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line, idx) => {
        const matched = line.match(/^([A-Z])[.、．)\s]\s*(.*)$/)
        const label = matched ? matched[1] : String.fromCharCode(65 + idx)
        const content = matched ? matched[2] : line
        // 判断题按文本比对，选择题按字母比对
        const isCorrect = matched ? correct.has(label) : correct.has(line.toUpperCase())
        return { label, content, correct: isCorrect }
      })
  }

  function blankAnswersOf(answer: string) {
    return (answer ?? '').split('\n').map((s) => s.trim())
  }

  function answerTextOf(answer: string, type: string) {
    const raw = (answer ?? '').trim()
    if (!raw) return '—'
    if (type === 'blank') {
      return blankAnswersOf(answer)
        .map((a, i) => `${i + 1}. ${a}`)
        .join('  ')
    }
    return raw
  }

  /** 知识点名按中英文逗号/顿号拆成标签，空值返回空数组 */
  function kpList(names?: string | null) {
    return (names ?? '')
      .split(/[,，、]/)
      .map((s) => s.trim())
      .filter(Boolean)
  }

  /** 归一成一份可循环渲染的列表：材料题取 children，其余题型就是自己 */
  interface PreviewItem {
    key: string | number
    /** 小题序号；非材料题为 0（模板据此决定是否显示小题标头） */
    no: number
    typeLabel: string
    score: number
    stem: string
    isMultiple: boolean
    isBlank: boolean
    isSubjective: boolean
    options: ReturnType<typeof parseOptions>
    blanks: string[]
    answerText: string
    analysis: string
    knowledgePointNames: string
  }

  function toItem(q: any, no: number): PreviewItem {
    const type = q.type ?? ''
    const answer = q.answer ?? ''
    return {
      key: q.id ?? `n-${no}`,
      no,
      typeLabel: dictLabel(props.typeOptions, type),
      score: q.suggestedScore ?? 0,
      stem: q.stem ?? '',
      isMultiple: type === 'multiple',
      isBlank: type === 'blank',
      isSubjective: isSubjectiveType(type),
      options: parseOptions(q.options, type, answer),
      blanks: blankAnswersOf(answer),
      answerText: answerTextOf(answer, type),
      analysis: q.analysis ?? '',
      knowledgePointNames: q.knowledgePointNames ?? ''
    }
  }

  const items = computed<PreviewItem[]>(() => {
    const d = props.data
    if (!d) return []
    if (isComposite.value) return (d.children ?? []).map((c, i) => toItem(c, i + 1))
    return [toItem(d, 0)]
  })
</script>

<style lang="scss" scoped>
  .question-preview {
    .q-head {
      display: flex;
      align-items: center;
      gap: 8px;
      margin-bottom: 14px;

      .q-score {
        margin-left: auto;
        font-size: 13px;
        color: var(--el-text-color-secondary);
      }
    }

    /* 共用材料：浅底卡片 + 角标，和下方小题卡形成层级 */
    .material-card {
      position: relative;
      padding: 14px 16px;
      margin-bottom: 16px;
      background: var(--el-fill-color-light);
      border-radius: 10px;

      .material-tag {
        display: inline-block;
        margin-bottom: 8px;
        font-size: 11px;
        font-weight: 600;
        letter-spacing: 1px;
        color: var(--el-text-color-secondary);
      }
    }

    /* 每个小题一张白底卡片 */
    .child-block {
      padding: 14px 16px;
      margin-bottom: 12px;
      background: var(--el-bg-color);
      border: 1px solid var(--el-border-color-lighter);
      border-radius: 10px;
      /* 不用 :last-of-type 清尾部间距：兄弟里还有 .q-meta 等 div，
         按标签名匹配会落空。末卡与 .q-meta 之间的外边距本就会合并成
         max(12, 14)=14px，无需补偿。 */
    }

    .child-head {
      display: flex;
      align-items: center;
      gap: 8px;
      margin-bottom: 10px;

      /* 实心序号圆标，比「第 N 小题」四个字更省空间也更清晰 */
      .child-badge {
        flex: none;
        width: 20px;
        height: 20px;
        font-size: 12px;
        font-weight: 600;
        line-height: 20px;
        color: #fff;
        text-align: center;
        background: var(--el-color-primary);
        border-radius: 50%;
      }

      .child-score {
        margin-left: auto;
        font-size: 12px;
        color: var(--el-text-color-secondary);
      }
    }

    .child-stem {
      margin-bottom: 12px;
      font-size: 14px;
      line-height: 1.7;
      color: var(--el-text-color-primary);
      word-break: break-word;
    }

    /* 小题卡内的选项收窄间距：卡里再套大块会显得臃肿 */
    .child-block .q-options {
      gap: 8px;
    }

    .child-block .q-textarea-placeholder {
      padding: 16px 12px;
    }

    .q-stem {
      margin-bottom: 16px;
      font-size: 15px;
      font-weight: 500;
      line-height: 1.7;
      color: var(--el-text-color-primary);
      word-break: break-word;
      /* 题干改富文本后不再用 pre-wrap：换行由 <p>/<br> 表达，
         保留空白会让标签之间的缩进变成可见空行 */

      /* 材料卡内的题干：外边距由卡片的 padding 负责 */
      &.is-material {
        margin-bottom: 0;
        font-weight: 400;
      }
    }

    /*
     * 富文本内容（题干/选项/解析共用）。
     * 用 :deep 因为 v-html 插入的节点不带 scoped 属性。
     */
    .rich-text {
      :deep(p) {
        margin: 0 0 8px;
      }

      :deep(p:last-child) {
        margin-bottom: 0;
      }

      /* 图片限宽，避免大图撑破预览抽屉 */
      :deep(img) {
        max-width: 100%;
        height: auto;
        border-radius: 4px;
      }

      :deep(table) {
        width: 100%;
        border-collapse: collapse;

        td,
        th {
          padding: 6px 8px;
          border: 1px solid var(--el-border-color);
        }
      }
    }

    .q-options {
      display: flex;
      flex-direction: column;
      gap: 10px;

      /* 未选项白底描边，正确项才上浅绿：让绿色自己跳出来，
         不用四个灰块垫底 */
      .opt {
        display: flex;
        align-items: center;
        gap: 10px;
        padding: 10px 14px;
        font-size: 14px;
        line-height: 1.6;
        background: var(--el-bg-color);
        border: 1px solid var(--el-border-color-lighter);
        border-radius: 8px;

        &.is-correct {
          background: var(--el-color-success-light-9);
          border-color: var(--el-color-success-light-7);
        }

        .opt-mark {
          flex: none;
          width: 20px;
          height: 20px;
          font-size: 12px;
          line-height: 20px;
          color: var(--el-text-color-secondary);
          text-align: center;
          background: transparent;
          border: 1px solid var(--el-border-color);

          &.is-circle {
            border-radius: 50%;
          }

          &.is-square {
            border-radius: 4px;
          }
        }

        &.is-correct .opt-mark {
          color: #fff;
          background: var(--el-color-success);
          border-color: var(--el-color-success);
        }

        .opt-text {
          flex: 1;
          word-break: break-word;
        }

        .opt-check {
          flex: none;
          color: var(--el-color-success);
        }
      }
    }

    .q-blanks {
      display: flex;
      flex-direction: column;
      gap: 8px;

      .blank-row {
        display: flex;
        gap: 10px;
        align-items: baseline;
        padding: 10px 14px;
        font-size: 14px;
        background: var(--el-bg-color);
        border: 1px solid var(--el-border-color-lighter);
        border-radius: 8px;

        .blank-label {
          flex: none;
          color: var(--el-text-color-secondary);
        }

        .blank-value {
          word-break: break-word;
        }
      }
    }

    .q-textarea-placeholder {
      padding: 22px 14px;
      font-size: 13px;
      color: var(--el-text-color-placeholder);
      text-align: center;
      background: var(--el-fill-color-lighter);
      border: 1px dashed var(--el-border-color);
      border-radius: 8px;
    }

    /* 答案区：细线分隔、无底色。原来的实心淡紫块比题目本身还抢眼 */
    .q-answer-box {
      display: flex;
      flex-direction: column;
      gap: 8px;
      padding-top: 12px;
      margin-top: 16px;
      border-top: 1px solid var(--el-border-color-lighter);

      .ans-row {
        display: flex;
        gap: 12px;
        font-size: 13px;
        line-height: 1.7;

        .ans-label {
          flex: none;
          width: 56px;
          color: var(--el-text-color-secondary);
        }

        /* 正确答案用 success 色呼应选项高亮，不跟主色抢 */
        .ans-value {
          font-weight: 600;
          color: var(--el-color-success);
          word-break: break-word;
        }

        .ans-plain {
          color: var(--el-text-color-regular);
        }

        .ans-analysis {
          color: var(--el-text-color-regular);
          word-break: break-word;
          white-space: pre-wrap;
        }
      }
    }

    /* 知识点标签组 */
    .kp-list {
      display: flex;
      flex-wrap: wrap;
      gap: 6px;
    }

    .kp-chip {
      padding: 1px 8px;
      font-size: 12px;
      line-height: 20px;
      color: var(--el-color-primary);
      background: var(--el-color-primary-light-9);
      border-radius: 4px;
    }

    /* 材料题收尾的知识点行 */
    .q-meta {
      display: flex;
      gap: 12px;
      margin-top: 14px;
      font-size: 13px;

      .meta-label {
        flex: none;
        color: var(--el-text-color-secondary);
      }

      .meta-value {
        color: var(--el-text-color-regular);
        word-break: break-word;
      }
    }
  }
</style>
