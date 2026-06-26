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
| `checkpoint(name, data?)` | 上报关键节点信息，用于进度统计和完读率计算 |
| `complete(data?)` | 通知宿主用户已完成，触发完成奖励流程 |

```javascript
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
// 只传事件名
context.analytics.log('chapter_start')

// 传事件名 + 自定义参数
context.analytics.log('game_over', { score: 850, chapter: 3 })
```

数据通过宿主的统一数据通道上报，第三方不需要自己对接埋点服务。具体事件名称和参数规范由双方 PM 另行约定。

---

## 五、构建配置

### 5.1 构建要求

| 项目 | 要求 |
|------|------|
| 格式 | IIFE（自执行函数） |
| 输出 | 单个 JS 文件，命名为 `main.js` |
| 全局变量 | 在 `window` 上注册，名称全局唯一 |
| CSS | 打包进 JS（不能有独立 CSS 文件） |
| 依赖 | 所有依赖打包进去或动态加载，不能有外部 import |
| 重型依赖 | 使用动态 `import()` 按需加载，减小主文件体积 |
| 资源路径 | 使用相对路径，构建时由我们注入 `--base` CDN 路径 |

### 5.2 Vite 构建配置示例

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

### 5.3 重型依赖按需加载示例

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

## 六、注意事项

### 6.1 资源路径

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

### 6.2 样式隔离

| 规则 | 说明 |
|------|------|
| CSS 隔离 | ShadowDOM 自动隔离，无需 BEM 前缀或 CSS Modules |
| 样式注入 | 必须通过 `<style>` 元素插入到 ShadowRoot |
| JS 不隔离 | ShadowDOM 只隔离 CSS，请勿操作宿主 DOM |

### 6.3 清理函数

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

### 6.4 全局变量命名

扩展注册到 `window` 上的变量名必须**全局唯一**，建议格式：`[公司名][产品名]Book`

```javascript
window.PenguinInteractiveBook = { activate: ... }
window.AcmeAdventureBook = { activate: ... }
```

此名称需要与我们后台配置的 `globalName` 字段一致。

### 6.5 不要设置 base 配置

```javascript
// ❌ 不要在 vite.config.ts 中设置 base
// base: 'https://cdn.example.com/...'

// ✅ 保持默认，我们在编译时统一注入
// vite build --base=https://cdn.getepic.com/extensions/penguin/v1.0/
```

---

## 七、交付与上线

### 7.1 交付物清单

| 文件 | 必须 | 说明 |
|------|------|------|
| 项目源码 | **是** | 完整项目代码，我们负责编译构建 |
| 媒体资源 | **是** | 图片、视频、音频等静态资源，我们负责部署到 CDN |
| 关卡数据（labData） | 可选 | 如有动态内容数据，提供 JSON 格式，我们写入书籍数据库 |

### 7.2 上线流程

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
