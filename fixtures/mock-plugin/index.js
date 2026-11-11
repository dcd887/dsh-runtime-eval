// 模拟 dsh-doc-read 的「插件形式」：导出 apply(ctx, config)，在 apply 里注册工具。
// 内部实现函数不导出，和真插件一致。
const PAGES = 12

function outline({ path } = {}) {
  if (!path) throw new Error('path is required')
  if (String(path).includes('missing')) throw new Error('file not found: ' + path)
  return { pages: PAGES, lines: PAGES * 40, title: 'sample' }
}

function read({ from = 1, to = from, path } = {}) {
  if (!path) throw new Error('path is required')
  if (from < 1) throw new Error('from must be >= 1')
  const out = []
  for (let p = from; p <= Math.min(to, PAGES); p++) out.push(`第 ${p} 页的内容`)
  return out.join('\n')
}

function grep({ pattern, path } = {}) {
  if (!path) throw new Error('path is required')
  if (pattern === 'absent-word') return []
  return [
    { page: 1, line: 3, text: `...${pattern}...` },
    { page: 7, line: 12, text: `...${pattern}...` },
  ]
}

export const name = 'mock-doc-read'
export const inject = ['tools']

export function apply(ctx, config) {
  ctx.effect(() => ctx.tools.register({
    name: 'doc_outline',
    description: 'mock of doc_outline',
    parameters: { type: 'object', properties: { path: { type: 'string' } }, required: ['path'] },
    execute: (a) => outline(a),
    isConcurrencySafe: () => true,
  }))

  ctx.effect(() => ctx.tools.register({
    name: 'doc_read',
    description: 'mock of doc_read',
    parameters: {
      type: 'object',
      properties: { path: { type: 'string' }, from: { type: 'number' }, to: { type: 'number' } },
      required: ['path'],
    },
    execute: (a) => read(a),
    isConcurrencySafe: () => true,
  }))

  ctx.effect(() => ctx.tools.register({
    name: 'doc_grep',
    description: 'mock of doc_grep',
    parameters: {
      type: 'object',
      properties: { path: { type: 'string' }, pattern: { type: 'string' } },
      required: ['path', 'pattern'],
    },
    execute: (a) => grep(a),
    isConcurrencySafe: () => true,
  }))
}
