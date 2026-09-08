/**
 * 批量生成移动端图标。
 *
 * 两组风格不同，各自共用一段 STYLE 前缀 —— 逐个调用但措辞完全一致，
 * 是这里能拿到的最强一致性保证（同一 prompt 骨架 + 只换主体描述）。
 *
 * 用法：node scripts/gen-icons.mjs [组名]   组名: home | profile | all(默认)
 */
import { execFileSync } from 'node:child_process'
import { mkdirSync, existsSync, renameSync } from 'node:fs'
import { resolve } from 'node:path'

const ROOT = resolve(import.meta.dirname, '..')
const CLI = resolve(ROOT, '.claude/skills/gpt-image-generator/scripts/gpt-image.mjs')
const OUT = resolve(ROOT, 'output/icons')

/** 首页快捷功能：渐变圆角底板 + 白色图形（参考图 158 的语言） */
const STYLE_HOME = [
  'A single mobile app icon, centered, filling about 78% of the frame.',
  'Style: modern iOS-style squircle tile with a smooth diagonal gradient,',
  'rounded corners with a large radius, flat design, no bevel, no drop shadow,',
  'no outer glow, no border. Inside the tile sits one simple pictogram in pure',
  'white (#FFFFFF), solid filled, geometric, thick even strokes, no gradient on',
  'the glyph itself, no text, no letters, no numbers.',
  'Background outside the tile must be pure flat white (#FFFFFF), completely empty.',
  'Vector-crisp edges, clean and minimal, professional enterprise app quality.',
].join(' ')

/** 个人中心：无底板彩色图形（参考图 161 的语言） */
const STYLE_PROFILE = [
  'A single mobile list-menu icon, centered, filling about 70% of the frame.',
  'Style: one simple pictogram only, NO background tile, NO container shape,',
  'NO rounded square behind it. The glyph is solid filled in the specified color',
  'with a subtle smooth gradient of that same hue, flat design, geometric,',
  'thick even strokes, generously rounded line ends, no outline, no drop shadow,',
  'no text, no letters, no numbers.',
  'Background must be pure flat white (#FFFFFF), completely empty.',
  'Vector-crisp edges, clean and minimal, friendly and modern.',
].join(' ')

const HOME = [
  {
    slug: 'calendar',
    label: '待考提醒 日历',
    subject:
      'The tile gradient goes from #3D8BFF to #1064F5 (blue). The white glyph is a ' +
      'simple calendar: a rounded rectangle body, a thin header bar across the top, ' +
      'two small tabs or rings on top, and a neat 3-by-4 grid of small round dots inside.',
  },
  {
    slug: 'target',
    label: '岗位练兵 靶心',
    subject:
      'The tile gradient goes from #4A93FF to #1B6BF7 (blue). The white glyph is a ' +
      'concentric target: three even rings plus a solid filled bullseye dot in the ' +
      'exact center, perfectly circular and symmetric, no arrow, no dart.',
  },
  {
    slug: 'pencil',
    label: '自主练习 铅笔',
    subject:
      'The tile gradient goes from #35D68A to #08A45C (green). The white glyph is a ' +
      'single pencil tilted 45 degrees pointing to the lower left, with a clear ' +
      'triangular tip, a straight body and a flat eraser end. No paper, no hand, no line.',
  },
  {
    slug: 'book',
    label: '错题本 本子',
    subject:
      'The tile gradient goes from #FFA653 to #F07A0C (orange). The white glyph is a ' +
      'closed notebook standing upright: a rounded rectangle cover with a vertical ' +
      'spine strip down the left side and two or three short horizontal lines on the ' +
      'right half suggesting text. No pen, no bookmark.',
  },
  {
    slug: 'chart',
    label: '我的成绩 柱状图',
    subject:
      'The tile gradient goes from #8B7BF7 to #5F4CE6 (purple). The white glyph is a ' +
      'simple bar chart of exactly three vertical rounded bars sitting on a common ' +
      'baseline, ascending in height from left to right. No axis labels, no arrow, no line.',
  },
]

const PROFILE = [
  {
    slug: 'person',
    label: '个人信息 人像',
    subject:
      'The glyph color is blue #2383FC. Draw a simple user avatar: a solid circular ' +
      'head above a smooth rounded shoulders shape, centered and symmetric. ' +
      'No card, no frame, no badge.',
  },
  {
    slug: 'trending',
    label: '我的成绩 上升折线',
    subject:
      'The glyph color is green #04BA63. Draw a rising trend line: a zigzag polyline ' +
      'climbing from lower left to upper right with a small arrowhead at the top right ' +
      'end. Thick rounded stroke. No axis, no bars, no grid.',
  },
  {
    slug: 'medal',
    label: '我的证书 奖牌',
    subject:
      'The glyph color is orange #FE7517. Draw an award medal: a round medallion with ' +
      'a small star or check mark in its center, hanging from a short ribbon of two ' +
      'angled bands at the top. Centered and symmetric. No text, no laurel.',
  },
  {
    slug: 'gear',
    label: '设置 齿轮',
    subject:
      'The glyph color is violet #6F5CF3. Draw a settings gear: a cog wheel with six ' +
      'evenly spaced rounded teeth and a clean round hole in the center. ' +
      'Perfectly symmetric. No wrench, no screwdriver.',
  },
  {
    slug: 'question',
    label: '帮助与反馈 问号',
    subject:
      'The glyph color is cyan #03B2D1. Draw a help symbol: a rounded speech bubble ' +
      'with a small tail at the bottom left, and a bold question mark centered inside ' +
      'it knocked out in white. Nothing else.',
  },
]

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

/** 调一次生图，返回临时落盘路径 */
const gen = (prompt, dir) => {
  const out = execFileSync(
    'node',
    [CLI, 'generate', '--prompt', prompt, '--size', '1024x1024', '--quality', 'high', '--n', '1', '--out', dir],
    { cwd: ROOT, encoding: 'utf8', maxBuffer: 1 << 26 }
  )
  const hit = out
    .trim()
    .split('\n')
    .filter((l) => l.includes('.png'))
    .pop()
  return hit ? hit.trim() : null
}

/**
 * 上游 502/504 属间歇故障，退避重试即可拿到结果。
 * 已存在 <slug>.png 直接跳过，方便反复补跑不重复烧额度。
 */
const RETRY = 4
const run = async (items, style, group) => {
  const dir = resolve(OUT, group)
  mkdirSync(dir, { recursive: true })
  for (const it of items) {
    const dest = resolve(dir, `${it.slug}.png`)
    if (existsSync(dest)) {
      console.log(`[${group}/${it.slug}] 已存在，跳过`)
      continue
    }
    for (let a = 1; a <= RETRY; a++) {
      process.stdout.write(`[${group}/${it.slug}] ${it.label} 第${a}次 ... `)
      try {
        const p = gen(`${style} ${it.subject}`, dir)
        if (p) {
          renameSync(p, dest)
          console.log(`OK -> ${it.slug}.png`)
        } else {
          console.log('OK(未解析到路径)')
        }
        break
      } catch (e) {
        const msg = e.message.split('\n')[0].slice(0, 60)
        console.log(`FAIL ${msg}`)
        if (a < RETRY) await sleep(a * 8000)
      }
    }
  }
}

const which = process.argv[2] || 'all'
if (which === 'home' || which === 'all') await run(HOME, STYLE_HOME, 'home')
if (which === 'profile' || which === 'all') await run(PROFILE, STYLE_PROFILE, 'profile')
