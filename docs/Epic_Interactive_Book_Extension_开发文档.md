# Epic Interactive Book Extension 第三方开发文档

> 版本：1.0.0
> 更新日期：2026-06-23

> **首次合作？** 请先阅读[合作入驻指南](./合作入驻指南.md)，完成仓库、API 凭证、测试账号等申请。

---

## 一、概述

### 1.1 什么是 Interactive Book

Epic Interactive Book 是 Epic 阅读器提供的互动书扩展机制，允许第三方团队开发完整的互动书应用（如闯关游戏、解谜、交互叙事等）。

与普通 Reader Extension 不同，Interactive Book **没有翻页概念**，内容完全由用户操作驱动，第三方全权负责内容呈现和交互逻辑。

### 1.2 设计理念

- **宿主**（阅读器）提供全屏渲染容器、书籍数据、进度接口、埋点通道
- **扩展**（第三方）负责完整的应用渲染和交互逻辑
- 两者通过稳定的 Context API 交互，互不依赖内部实现

### 1.3 技术栈要求

**无框架限制。** 你可以使用 Vue、React、Svelte、原生 JavaScript 或任何可以编译为 JS 的技术栈。

最终交付物是一个 **IIFE 格式的单 JS 文件**（`main.js`），重型依赖通过动态 `import()` 按需加载。

---

## 二、核心概念

### 2.1 扩展生命周期

```
宿主加载扩展 JS 文件（main.js）
    │
    ▼
宿主调用 extension.activate(context)
    │
    ├── 扩展通过 context.slots.get('interactive-stage') 获取全屏渲染容器
    ├── 扩展通过 context.data 读取书籍信息和互动数据（可选）
    ├── 扩展通过 context.config.assetBaseUrl 拼接媒体资源路径
    ├── 扩展通过 context.progress 上报进度和完成状态
    ├── 扩展通过 context.events 监听宿主事件（如退出通知）
    ├── 扩展通过 context.analytics 上报埋点事件
    │
    ▼
用户游玩、交互
    │
    ▼
宿主调用 cleanup()（activate 返回的清理函数）
    │
    └── 扩展清理 DOM、取消监听、销毁实例
```

### 2.2 ShadowDOM 隔离

扩展的 UI 渲染在 ShadowDOM 容器中：
- 你的 CSS **不会影响**宿主页面
- 宿主的 CSS **不会影响**你的 UI
- 你可以自由使用任意类名

**注意：ShadowDOM 只隔离 CSS，不隔离 JS。** 请勿直接操作宿主 DOM。

### 2.3 渲染容器

宿主提供一个全屏渲染容器：

| Slot | 说明 |
|------|------|
| `interactive-stage` | 全屏容器，扩展激活后立即可用，第三方完全接管渲染 |

```javascript
var container = context.slots.get('interactive-stage')
// container 是 ShadowRoot，直接往里挂载你的应用
```

### 2.4 媒体资源

所有媒体资源（图片、视频、音频等）部署在 Epic CDN 上。宿主通过 `context.config.assetBaseUrl` 提供 CDN 基础路径，第三方自行拼接完整 URL：

```javascript
var assetBaseUrl = context.config.assetBaseUrl
// 例如：https://cdn.getepic.com/extensions/penguin/v1.0/

function resolveUrl(path) {
  if (/^https?:\/\//i.test(path)) return path
  return assetBaseUrl.replace(/\/$/, '') + path
}

resolveUrl('/pictures/bg.jpg')
// → https://cdn.getepic.com/extensions/penguin/v1.0/pictures/bg.jpg
```

---

## 三、快速开始

### 3.1 最简示例

```javascript
(function() {
  window.MyInteractiveBook = {
    activate: function(context) {
      // 1. 获取渲染容器
      var container = context.slots.get('interactive-stage')

      // 2. 注入样式
      var style = document.createElement('style')
      style.textContent = '.app { position:absolute; inset:0; display:flex; align-items:center; justify-content:center; background:#1e160d; color:#fff; font-size:24px; }'
      container.appendChild(style)

      // 3. 渲染 UI
      var div = document.createElement('div')
      div.className = 'app'
      div.textContent = 'Hello Interactive Book! Book ID: ' + context.data.getBookId()
      container.appendChild(div)

      // 4. 返回清理函数
      return function() {
        style.remove()
        div.remove()
      }
    }
  }
})()
```

### 3.2 本地调试

**第一步：构建扩展**

```bash
npm run build   # 输出 dist/main.js
npm run serve   # 启动本地 HTTP 服务 localhost:8080
```

确认 `http://localhost:8080/main.js` 可以访问。

**第二步：注册调试地址**

打开测试环境阅读器，在浏览器控制台执行：

```javascript
localStorage.setItem('epic_debug_interactive_plugin', 'http://localhost:8080/main.js')
```

> 此设置持久生效，只需执行一次。

**第三步：打开互动书**

访问调试入口页面：

```
https://webqa-new.getepic.dev/app/interactive-debug
```

页面会展示当前注册的调试地址，点击 **"Launch Interactive Book"** 按钮即可跳转到阅读器加载你的扩展。

> 调试页面仅在测试环境（`webqa-new.getepic.dev`、`docker.getepic.dev`、`localhost`）可用，且需要先设置 `epic_debug_interactive_plugin`。

**清除调试：**

```javascript
localStorage.removeItem('epic_debug_interactive_plugin')
```

---

## 四、Context API 完整参考

`activate(context)` 中的 `context` 对象包含以下接口：

### 4.1 context.version — API 版本

```javascript
console.log(context.version)  // "1.0.0"
```

### 4.2 context.config — 配置信息

| 属性 | 类型 | 说明 |
|------|------|------|
| `assetBaseUrl` | `string` | CDN 基础路径，用于拼接媒体资源完整 URL |

```javascript
var baseUrl = context.config.assetBaseUrl
// https://cdn.getepic.com/extensions/penguin/v1.0/
```

### 4.3 context.slots — 渲染容器

```javascript
// 获取全屏渲染容器（返回 ShadowRoot）
var container = context.slots.get('interactive-stage')
```

**样式注入方式：**

由于 ShadowDOM 隔离，需通过 `<style>` 元素直接注入到 ShadowRoot：

```javascript
var style = document.createElement('style')
style.textContent = '.my-class { color: red; }'
container.appendChild(style)
```

### 4.4 context.data — 数据读取

| 方法 | 返回值 | 说明 |
|------|--------|------|
| `getBookId()` | `number` | 当前书籍 ID |
| `getBookData()` | `object` | 书籍元信息（title、author 等） |
| `getLabsData()` | `string \| null` | 书籍关卡数据（第三方自定义格式，宿主透传）。无需外部数据的互动书可忽略此接口 |

```javascript
var bookId = context.data.getBookId()
var labsData = context.data.getLabsData()
var parsedData = JSON.parse(labsData)  // 第三方自行解析
```

### 4.5 context.progress — 进度与完成

| 方法 | 说明 |
|------|------|
| `save(data)` | 保存用户当前进度，下次打开书时可恢复 |
| `load()` | 读取用户上次保存的进度，返回 `Promise<object \| null>` |
| `start(data?)` | **通知宿主用户已进入体验**，宿主据此上报"打开这本书" |
| `pageChange(pageIndex, data?)` | **通知宿主用户进入了新的"页"**（关卡/场景/画面），宿主据此统计各节点的停留时长和阅读路径 |
| `checkpoint(name, data?)` | 上报关键节点信息，用于进度统计和完读率计算 |
| `complete(data?)` | **通知宿主用户已完成**，宿主据此上报"完成这本书" |

```javascript
// 用户真正进入体验时调用一次（资源就绪、首屏已可见）
context.progress.start()

// 每次进入新的"页"（关卡/场景/画面）时调用
context.progress.pageChange(0)   // 进入第一个场景
context.progress.pageChange(1)   // 进入第二个场景

// 保存进度（在关键节点调用，用户下次打开可恢复）
await context.progress.save({ chapter: 2, score: 650 })

// 读取上次进度（在 activate 时调用）
var saved = await context.progress.load()
if (saved) {
  resumeFrom(saved)  // 从上次进度继续
}

// 上报关键节点（在章节完成、重要事件等时机调用）
context.progress.checkpoint('chapter_1_done', { score: 300 })
context.progress.checkpoint('chapter_2_done', { score: 650 })

// 通知完成
context.progress.complete({ finalScore: 1200 })
```

> 所有接口的 `data` 参数格式由第三方自定义，宿主只负责透传和存取，不解析内容。认证由宿主内部处理，第三方无需关心用户身份。

#### start() / complete() 的调用时机（重要）

这两个方法会驱动宿主的内容数据上报，直接影响互动书的打开量与完读率统计，**必须调用**。

**`start()`** —— 在用户**真正进入体验**时调用一次，而不是在 `activate()` 一开始就调。判断标准是首屏已经可见、用户可以开始操作。宿主无法自己判断这个时机（扩展的资源加载和启动流程只有扩展自己知道），所以由扩展决定。

```javascript
activate: function(context) {
  var container = context.slots.get('interactive-stage')

  // ❌ 不要在这里调 —— 资源还没加载完，用户还看不到任何内容
  // context.progress.start()

  return preloadAssets().then(function() {
    renderFirstScreen(container)
    context.progress.start()   // ✅ 首屏可见，用户可以开始玩了
    return cleanup
  })
}
```

**`complete()`** —— 在用户完成整个体验时调用（走完最后一个关卡、看完结局等）。不要在中途的章节完成时调用，那是 `checkpoint()` 的职责。

**两者都是幂等的**：宿主内部有去重守卫，重复调用不会重复上报。但请不要依赖这一点来偷懒 —— 语义上各自只应调用一次。

**`data` 参数**（可选）会作为附加维度合并进上报事件，仅支持 number / string / boolean 三种值类型（boolean 会转成 `1`/`0`），嵌套对象和数组会被丢弃 —— 需要上报结构化数据请自行 `JSON.stringify()` 成字符串。

```javascript
context.progress.start({ resumed: !!saved })
context.progress.complete({ finalScore: 1200, ending: 'survived' })
```

#### pageChange() 的用法

互动书没有宿主侧的翻页概念，所以"用户在哪里、停留了多久、按什么顺序走"这些节点数据完全依赖扩展主动上报。**每次用户进入一个新的"页"时调用** —— "页"的划分由你决定（关卡、场景、章节画面都可以），只要求：

- `pageIndex` 是数字，同一个"页"始终用同一个序号
- 用户**进入**新页时调（宿主自动计算上一页的停留时长）
- 首屏也算一页：`start()` 之后紧接着调 `pageChange(0)`

```javascript
function enterScene(sceneIndex) {
  renderScene(sceneIndex)
  context.progress.pageChange(sceneIndex)
}

// 可选：附带自定义维度（约束同 start/complete 的 data 参数）
context.progress.pageChange(3, { scene_name: 'iceberg' })
```

注意事项：

- 重复调用同一个序号是无操作，不会重复统计
- 用户回退到之前的页**要照常调用**，宿主会记录完整的访问路径（含重复访问）
- 退出时最后一页的停留时长由宿主自动补报，无需在退出逻辑里处理
- 不调用 `pageChange` 不影响 `start()` / `complete()` 的上报，但书籍的节点级数据（流失位置、各关卡停留时长）会完全缺失，请务必接入

#### 宿主据此上报什么（参考）

以下上报全部由宿主自动完成，扩展只需要在正确的时机调用 `start()` / `pageChange()` / `complete()`。列出来是为了让你理解每个调用的数据意义 —— 这些数据直接决定这本书的打开量、完读率、各节点停留时长等核心指标。

| 时机 | 宿主上报的内容 |
|------|------|
| `start()` 首次调用 | "打开这本书"事件 + 内容打开日志（后续所有日志靠它串成一次会话） |
| 会话期间（激活成功后持续） | 每 10 秒一次心跳快照：当前页（来自 `pageChange`）、是否挂机、是否已完成。用于统计有效停留时长和中途流失位置 |
| `pageChange()` 换页 | 离开页的关闭事件：页序号 + 停留秒数 |
| `complete()` 首次调用 | "完成这本书"事件（含总时长、翻页数）+ 完成日志。完读率以此计算 |
| 退出（关闭 / 刷新 / 跳走） | 最后一页停留补报 + 内容关闭日志 + 会话汇总（总时长、翻页数、完整阅读路径） |

**挂机判定**：连续 5 分钟没有任何点击、按键，也没有 `pageChange` 调用，该时段在心跳中标记为挂机，会从有效停留时长中剔除。正常做法下无需关心 —— 用户真实操作自然会重置计时。

由此可见时机的重要性：`start()` 调早了（首屏还没出来）会虚增打开量拉低完读率；`complete()` 不调，这本书的完读率永远是 0；`pageChange()` 不接，流失分析没有数据。

### 4.6 context.commands — 执行命令

| 方法 | 说明 |
|------|------|
| `close()` | 关闭互动书，退出阅读器页面 |

```javascript
// 用户完成互动内容后，主动关闭
context.commands.close()
```

调用后宿主会：
1. 触发 `beforeExit` 事件（扩展可在此保存进度）
2. 关闭阅读器页面，返回上一页面

> 适用场景：扩展内的"退出"按钮、完成流程后自动关闭等。用户也可以通过按 ESC 键退出。

### 4.7 context.events — 事件监听

```javascript
// 订阅事件，返回取消订阅函数
var unsubscribe = context.events.on('beforeExit', function() {
  // 用户即将离开，保存当前进度
  context.progress.save(currentState)
})

// 取消订阅（在清理函数中调用）
unsubscribe()
```

**可用事件：**

| 事件名 | 触发时机 | 建议操作 |
|--------|---------|---------|
| `beforeExit` | 用户退出互动书前 | 调用 `context.progress.save()` 保存当前进度 |

### 4.8 context.analytics — 埋点上报

```javascript
// 事件名以 ib_ 开头，其余及参数由第三方自定义
context.analytics.log('ib_chapter_start')
context.analytics.log('ib_game_over', { score: 850, chapter: 3 })
```

数据通过宿主的统一数据通道上报，第三方不需要自己对接埋点服务。事件名以 `ib_` 开头，其余部分及参数由第三方自定义。

> 会话停留时长由宿主自动统计，第三方无需自行上报。

---

## 五、TypeScript 类型支持

我们提供了官方的 TypeScript 类型定义包，包含 Interactive Book Extension API 的完整类型。

**安装：**

在项目根目录创建 `.npmrc` 文件：

```
@getepic-v2:registry=https://npm.pkg.github.com
```

然后安装：

```bash
npm install -D @getepic-v2/reader-extension-types
```

**使用：**

```typescript
import type {
  InteractiveBookContext,
  InteractiveExtension,
} from '@getepic-v2/reader-extension-types'

const extension: InteractiveExtension = {
  activate(context: InteractiveBookContext) {
    const container = context.slots.get('interactive-stage')
    const bookId = context.data.getBookId()

    // 渲染你的应用...

    return () => {
      // 清理
    }
  }
}
```

> 类型包同时包含 Reader Extension 和 Interactive Book Extension 两套 API 的类型定义，按需导入即可。

> `context.progress.start()` 和 `context.progress.pageChange()` 是较新加入的接口。如果 TypeScript 提示 `progress` 上不存在这些属性，请升级类型包到最新版本（`npm install -D @getepic-v2/reader-extension-types@latest`）。

---

## 六、构建配置

### 6.1 构建要求

| 项目 | 要求 |
|------|------|
| 格式 | IIFE（自执行函数） |
| 输出 | 单个 JS 文件，命名为 `main.js` |
| 全局变量 | 在 `window` 上注册，名称全局唯一 |
| CSS | 打包进 JS（不能有独立 CSS 文件） |
| 依赖 | 所有依赖打包进去或动态加载，不能有外部 import |
| 重型依赖 | 使用动态 `import()` 按需加载，减小主文件体积 |
| 资源路径 | 使用相对路径，构建时由我们注入 `--base` CDN 路径 |

### 6.2 Vite 构建配置示例

```typescript
// vite.config.ts
import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'  // 如果用 Vue

export default defineConfig({
  plugins: [vue()],
  define: {
    'process.env.NODE_ENV': JSON.stringify('production'),
  },
  build: {
    lib: {
      entry: 'src/extension/index.ts',
      name: 'MyInteractiveBook',       // window 上的全局变量名
      formats: ['iife'],
      fileName: () => 'main.js',
    },
    cssCodeSplit: false,               // CSS 打入 JS
    outDir: 'dist',
    emptyOutDir: true,
    assetsInlineLimit: 0,             // 所有资源输出为独立文件，不内联 base64
  },
})
```

### 6.3 重型依赖按需加载示例

```javascript
// 不要静态 import 重型库
// import * as THREE from 'three'  ← 会打进 main.js

// 改为动态 import，用到时再加载
async function loadGlobe() {
  const { GlobeGame } = await import('./globe-game.js')  // 独立 chunk
  return new GlobeGame()
}
```

---

## 七、注意事项

### 7.1 资源路径

代码中字符串形式的资源路径**不能使用相对路径**。扩展 JS 是被宿主页面动态加载的，相对路径会相对宿主页面解析，导致指向错误地址：

```javascript
// ❌ 错误 — 相对路径会相对宿主页面解析
img.src = './pictures/bg.jpg'
// → https://webqa-new.getepic.dev/app/read/pictures/bg.jpg  （错误）

// ✅ 正确 — 用 assetBaseUrl 拼成绝对路径
img.src = context.config.assetBaseUrl.replace(/\/$/, '') + '/pictures/bg.jpg'
// → https://cdn.getepic.com/extensions/penguin/v1.0/pictures/bg.jpg  （正确）
```

> 通过静态 `import` 引用的资源（如 `import img from './pictures/bg.jpg'`）不受此影响，Vite 打包时会自动处理路径。

### 7.2 样式隔离

| 规则 | 说明 |
|------|------|
| CSS 隔离 | ShadowDOM 自动隔离，无需 BEM 前缀或 CSS Modules |
| 样式注入 | 必须通过 `<style>` 元素插入到 ShadowRoot |
| JS 不隔离 | ShadowDOM 只隔离 CSS，请勿操作宿主 DOM |

### 7.3 清理函数

`activate` **必须**返回一个清理函数：

```javascript
activate: function(context) {
  var container = context.slots.get('interactive-stage')
  var app = createApp(App)
  app.mount(container)

  return function() {
    app.unmount()  // 必须清理，否则切换书籍时会内存泄漏
  }
}
```

### 7.4 全局变量命名

扩展注册到 `window` 上的变量名必须**全局唯一**，建议格式：`[公司名][产品名]Book`

```javascript
window.PenguinInteractiveBook = { activate: ... }
window.AcmeAdventureBook = { activate: ... }
```

此名称需要与我们后台配置的 `globalName` 字段一致。

### 7.5 不要设置 base 配置

```javascript
// ❌ 不要在 vite.config.ts 中设置 base
// base: 'https://cdn.example.com/...'

// ✅ 保持默认，我们在编译时统一注入
// vite build --base=https://cdn.getepic.com/extensions/penguin/v1.0/
```

---

## 八、交付与上线

### 8.1 交付物清单

| 文件 | 必须 | 说明 |
|------|------|------|
| 项目源码 | **是** | 完整项目代码，我们负责编译构建 |
| 媒体资源 | **是** | 图片、视频、音频等静态资源，我们负责部署到 CDN |
| 关卡数据（labData） | 可选 | 如有动态内容数据，提供 JSON 格式，我们写入书籍数据库 |

### 8.2 上线流程

```
第三方提交源码 + 媒体资源（+ 互动数据，如有）
    │
    ▼
我们审核 + 编译构建 + 部署到 CDN
    │
    ▼
后台配置书籍 extensionUrl、assetBaseUrl、globalName
    │
    ▼
用户打开互动书页面 → 阅读器自动加载扩展，呈现互动内容
```
