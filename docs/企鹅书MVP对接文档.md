# 企鹅书 MVP 对接文档

> 背景及整体架构方案详见：[互动书接入架构方案](./互动书接入架构方案.md)

---

## 一、我们要做的事

### 1.1 前端

- 新增书籍类型 `BOOK_TYPE.INTERACTIVE = 6`
- `ReadComponent` 新增 `INTERACTIVE` 分支，渲染新子组件
- 新子组件实现：
  - 提供全屏渲染容器
  - 加载第三方 `main.js`（优先读 `localStorage.epic_debug_interactive_plugin`，其次用 `book.extensionUrl`）
  - 构建 Context API，调用 `extension.activate(context)`
- `ExtensionConfig` 新增 `globalName` 字段，加载时优先从此取，兜底从文件名解析

### 1.2 运营页

- 提供一个入口页面，写死第一本书的基本信息（封面、标题、简介）
- 点击进入跳转 `/read/{bookId}`

---

## 二、企鹅方要做的事

### 2.1 打包改造

- 新建独立扩展入口文件，实现 `activate(context)` 和清理函数
- 入口不包含编辑器、调试工具、登录模块
- Vite 构建配置改为 IIFE 格式，输出文件命名为 `main.js`
- 重型依赖（Three.js 等）改为动态 `import()`，减小主文件体积
- 资源路径使用相对路径，构建时我们注入 `--base` 参数

### 2.2 资源路径改造

将 `resolveMediaUrl` 改为使用 `context.config.assetBaseUrl` 拼接：

```js
// activate(context) 时保存
const assetBaseUrl = context.config.assetBaseUrl

function resolveMediaUrl(path) {
  if (!path) return path
  if (/^https?:\/\//i.test(path)) return path
  return assetBaseUrl.replace(/\/$/, '') + path
}
```

### 2.3 移除自有后端依赖

- 移除 `/_api/sign-map` 调用（替换为上面的 `resolveMediaUrl`）
- 移除 `/_api/login` / `/_api/me` 调用（打包时排除 `authStore`）
- 移除 `/_api/book` 调用（打包时排除编辑器模块）

### 2.4 接入 Context API

扩展入口实现示例：

```js
window.PenguinExtension = {
  activate(context) {
    // 1. 获取渲染容器
    const container = context.slots.get('main')

    // 2. 获取书籍数据
    const labsData = context.data.getLabsData()

    // 3. 渲染应用
    const app = createApp(App, { labsData, context })
    app.mount(container)

    // 4. 返回清理函数
    return () => {
      app.unmount()
    }
  }
}
```

### 2.5 资源部署

- 将构建产物（`main.js`、chunk 文件、静态资源）提供给我们
- 由我们统一部署到 CDN，并配置 `extensionUrl` 和 `assetBaseUrl`

### 2.6 提供关卡数据

- 提供 `labData` JSON 内容，由我们写入数据库

---

## 三、本地联调方式

企鹅方本地构建完成后，在测试环境阅读器控制台执行：

```js
localStorage.setItem('epic_debug_interactive_plugin', 'http://localhost:8080/main.js')
```

打开运营页入口，跳转到 `/read/{bookId}` 即可看到扩展加载运行。

清除调试：

```js
localStorage.removeItem('epic_debug_interactive_plugin')
```
