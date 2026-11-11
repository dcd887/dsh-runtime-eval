/**
 * 适配层：把「DSH 插件」包成「可直接调用的函数集合」。
 *
 * DSH 插件导出的是 `apply(ctx, config)`，工具是在 `apply` 里通过
 * `ctx.tools.register({ name, execute, ... })` 注册的。内部实现函数不导出。
 *
 * 所以适配层做的事：
 *   1. 造一个假的 ctx
 *   2. 调 apply(mockCtx, config)
 *   3. 把 register 到的工具收进一个 map
 *   4. 对外暴露 call(toolName, args) → execute(args)
 *
 * 这样断言集就能写 { fn: "doc_outline", args: {...} }，和工具名一一对应。
 *
 * mock ctx 故意做得「窄」：只提供评测需要的服务面（tools / web / webServer /
 * commands / skills / sessionQuery）。缺的服务不会伪造，依赖它的注册按 Cordis
 * 语义整段跳过——假装注册成功会让评测结果失真。
 */

import { readFileSync, existsSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'

/** 读插件 package.json 的入口 */
export function entryOf(pluginDir) {
  const dir = resolve(pluginDir)
  if (!existsSync(dir)) throw new Error(`plugin directory not found: ${dir}`)
  const pkgPath = join(dir, 'package.json')
  if (!existsSync(pkgPath)) throw new Error(`package.json not found in ${dir}`)
  const pkg = JSON.parse(readFileSync(pkgPath, 'utf8'))
  const rel = pkg.main ?? pkg.exports?.['.'] ?? pkg.exports?.['.']?.default ?? 'index.js'
  const entry = typeof rel === 'string' ? rel : 'index.js'
  return { dir, pkg, entry: join(dir, entry) }
}

/**
 * 造一个 Host `web.fetch` 的替身。
 *
 * Host 的形状是 `fetch({ url }, signal)` → `{ statusCode, truncated, body: { content } }`
 * （见 project-dashboard 的 fetchJson：它只读 statusCode / truncated / body.content，
 * 拿不到响应头）。
 *
 * 替身按 `options.web.fixtures` 顺序匹配 URL：命中就返回该条目的 json（会序列化）；
 * 一条都不命中返回 404，让插件的降级路径仍然可测。
 *
 * fixture 是声明式的（JSON 可写），因为断言集本身就是 JSON：
 *   { "match": "api.github.com/users/", "json": [...] }
 *   { "match": "example.com/page", "statusCode": 200, "content": "<html>…</html>" }
 *   { "regex": "page=2$", "json": [] }
 */
function makeWebFetch(webOptions) {
  const fixtures = Array.isArray(webOptions?.fixtures) ? webOptions.fixtures : []
  const calls = []

  const fetch = async (request) => {
    const url = typeof request === 'string' ? request : String(request?.url ?? '')
    calls.push(url)
    for (const f of fixtures) {
      const hit = f.regex
        ? new RegExp(f.regex).test(url)
        : f.match
          ? url.includes(f.match)
          : false
      if (!hit) continue
      const statusCode = typeof f.statusCode === 'number' ? f.statusCode : 200
      if (statusCode !== 200) {
        return { statusCode, truncated: false, body: { content: f.content ?? '' } }
      }
      const content =
        typeof f.content === 'string'
          ? f.content
          : JSON.stringify(f.json === undefined ? null : f.json)
      return { statusCode, truncated: f.truncated === true, body: { content } }
    }
    return {
      statusCode: 404,
      truncated: false,
      body: { content: '{"message":"dsh-runtime-eval: no web.fetch fixture matched this URL"}' },
    }
  }

  fetch.calls = calls
  return fetch
}

/**
 * 造一个 logger 替身。
 *
 * 真实 Cordis 的 `ctx.logger` 是带 `.info/.warn/.error/.debug` 的 Logger 对象，
 * 但有的插件按工厂用（`ctx.logger('scope')`）。两种形状都给：
 * 对象可调用、调用后仍返回同一个带方法的对象。
 */
function makeLogger(logs) {
  const fn = (...args) => {
    logs.push({ level: 'info', args })
    return fn
  }
  fn.info = (...args) => logs.push({ level: 'info', args })
  fn.warn = (...args) => logs.push({ level: 'warn', args })
  fn.error = (...args) => logs.push({ level: 'error', args })
  fn.debug = (...args) => logs.push({ level: 'debug', args })
  fn.trace = (...args) => logs.push({ level: 'trace', args })
  fn.child = () => makeLogger(logs)
  fn.scope = () => makeLogger(logs)
  return fn
}

/**
 * 加载插件并收集它注册的工具。
 * @param {string} pluginDir
 * @param {object} config 传给 apply 的插件配置
 * @param {{ web?: { fixtures?: Array<object> } }} options 评测侧的 mock 选项（不进插件）
 * @returns {Promise<{ name: string, tools: Map<string, any>, module: any }>}
 */
export async function loadPlugin(pluginDir, config = {}, options = {}) {
  const { dir, pkg, entry } = entryOf(pluginDir)
  const module = await import(pathToFileURL(entry.replace(/\\/g, '/')).href)

  const tools = new Map()
  const disposers = []
  const logs = []
  const routes = []
  const commands = []
  const skills = []

  const mockCtx = {
    // apply 里用 ctx.effect(() => ctx.tools.register(...))
    effect(fn) {
      const stop = fn()
      if (typeof stop === 'function') disposers.push(stop)
      return () => {}
    },
    tools: {
      register(tool) {
        if (!tool?.name) throw new Error('tools.register called without a name')
        tools.set(tool.name, tool)
        return () => {}
      },
    },
    // 有些插件（project-dashboard / record-search）注入 webServer 注册路由；
    // 评测只关心 tools，所以路由先收集起来不执行。
    webServer: {
      host: '127.0.0.1',
      port: 0,
      register(route) {
        routes.push(route)
        return () => {}
      },
    },
    web: {
      register(route) {
        routes.push(route)
        return () => {}
      },
      // Host 的 web.fetch。不给 fixture 就一律 404，插件的降级路径照旧可测。
      fetch: makeWebFetch(options.web),
    },
    // 宿主命令与 skill 的注册面。第三方插件用 ctx.inject(['commands']) /
    // ctx.inject(['skills']) 注册用户命令和 skill，它们不是工具，单独收着。
    commands: {
      register(definition) {
        commands.push(definition)
        return () => {}
      },
    },
    skills: {
      register(definition) {
        skills.push(definition)
        return () => {}
      },
    },
    // Cordis 的依赖注入声明。语义是「deps 里的服务都在，才执行回调」，
    // 所以这里先查 mockCtx 上有没有这些服务：缺了就整段跳过，和宿主一致。
    // 以前它不存在时，插件会走 catch 分支打印 "ctx.inject is not a function"，
    // 注册被静默丢掉。
    inject(deps, callback) {
      const list = Array.isArray(deps) ? deps : [deps]
      const ready = list.every((name) => mockCtx[name] !== undefined)
      if (ready && typeof callback === 'function') {
        const stop = callback(mockCtx)
        if (typeof stop === 'function') disposers.push(stop)
      }
      return () => {}
    },
    // record-search 注入 sessionQuery 读历史会话；评测时给一个空查询器。
    sessionQuery: {
      search: async () => [],
      list: async () => [],
      get: async () => undefined,
    },
    // 两种形状都给（见 makeLogger 注释），避免插件按对象用法时整段注册崩掉
    logger: makeLogger(logs),
    log: (...args) => logs.push({ level: 'log', args }),
    get: () => undefined,
    set: () => {},
    on: () => () => {},
    emit: () => {},
  }

  if (typeof module.apply !== 'function') {
    throw new Error(`plugin ${pkg.name} does not export apply(ctx, config)`)
  }
  const returned = await module.apply(mockCtx, config)
  if (typeof returned === 'function') disposers.push(returned)

  if (tools.size === 0) {
    throw new Error(`plugin ${pkg.name} registered no tools (apply ran but ctx.tools.register was never called)`)
  }

  return { name: module.name ?? pkg.name, tools, module, logs, dir, routes, commands, skills }
}

/**
 * 调一个工具。
 * @param {Map<string, any>} tools
 * @param {string} toolName
 * @param {object} args
 */
export async function callTool(tools, toolName, args = {}) {
  const tool = tools.get(toolName)
  if (!tool) {
    throw new Error(`tool "${toolName}" is not registered (registered: ${[...tools.keys()].join(', ') || 'none'})`)
  }
  if (typeof tool.execute !== 'function') {
    throw new Error(`tool "${toolName}" has no execute()`)
  }
  return await tool.execute(args)
}
