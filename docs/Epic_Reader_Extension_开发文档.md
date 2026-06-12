# Epic Reader Extension 第三方开发文档

> 版本：1.1.0  
> 更新日期：2026-06-12

> **首次合作？** 请先阅读[合作入驻指南](./合作入驻指南.md)，完成仓库、API 凭证、测试账号等申请。

---

## 一、概述

### 1.1 什么是 Reader Extension

Epic Reader Extension 是 Epic 阅读器提供的扩展机制，允许第三方团队为图书开发互动功能（如星星互动、游戏、问答等）。

扩展运行在真实阅读器环境中，通过宿主提供的 Context API 与阅读器交互。

### 1.2 设计理念

借鉴 VS Code Extension 的设计模式：
- **宿主**（阅读器）提供平台能力：渲染容器、数据接口、命令、事件
- **扩展**（第三方）负责具体功能实现和 UI
- 两者通过稳定的 API 契约交互，互不依赖内部实现

### 1.3 技术栈要求

**无框架限制。** 你可以使用 Vue、React、Svelte、原生 JavaScript 或任何可以编译为 JS 的技术栈。

最终交付物是一个**单独的 JS 文件**（IIFE 格式）。

---

## 二、核心概念

### 2.1 扩展生命周期

```
宿主加载扩展 JS 文件
    │
    ▼
宿主调用 extension.activate(context)
    │
    ├── 扩展通过 context.slots 获取渲染容器
    ├── 扩展通过 context.data 读取书籍和互动数据
    ├── 扩展通过 context.events 监听翻页、RTM 设置变更等事件
    ├── 扩展通过 context.commands 执行打开抽屉、弹窗等操作
    ├── 扩展通过 context.delegations 接管宿主控件（如 RTM 播放按钮）
    │
    ▼
用户阅读、交互
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
- 你可以自由使用 `.title`、`.button` 等通用类名

**注意：ShadowDOM 只隔离 CSS，不隔离 JS。** 请勿直接操作宿主 DOM。

### 2.3 渲染容器（Slots）

宿主提供三个渲染区域：

| Slot | 说明 | 用途 |
|------|------|------|
| `reading-area` | 覆盖在书页上方的透明层 | 渲染互动入口（如星星按钮） |
| `drawer` | 侧边抽屉内容区域 | 渲染互动内容（如问答、闪卡） |
| `modal` | 居中弹窗内容区域 | 渲染全屏互动内容（如游戏、视频） |

`reading-area` 在扩展激活后立即可用。`drawer` 在执行 `openDrawer` 命令后可用。`modal` 在执行 `openModal` 命令后可用。

---

## 三、快速开始

### 3.1 最简示例

创建 `{globalName}-main.js`（例如 `AcmeQuizExtension-main.js`）：

```javascript
(function() {
  window.AcmeQuizExtension = {
    activate: function(context) {
      // 1. 获取渲染容器
      var root = context.slots.get('reading-area');

      // 2. 注入样式
      var style = document.createElement('style');
      style.textContent = '.hello-btn { position:absolute; top:50%; left:50%; transform:translate(-50%,-50%); padding:12px 24px; font-size:16px; cursor:pointer; pointer-events:auto; }';
      root.appendChild(style);

      // 3. 渲染 UI
      var button = document.createElement('button');
      button.className = 'hello-btn';
      button.textContent = 'Hello Extension!';
      button.onclick = function() {
        alert('Book ID: ' + context.data.getBookId() + ', Page: ' + context.data.getCurrentPage());
      };
      root.appendChild(button);

      // 4. 返回清理函数
      return function() {
        style.remove();
        button.remove();
      };
    }
  };
})();
```

### 3.2 在阅读器中运行

**第一步：启动本地 HTTP 服务**

```bash
# 方式一：用 npx 快速启动
npx serve . --cors -l 8080

# 方式二：用 Python
python3 -m http.server 8080
```

确认 `http://localhost:8080/{globalName}-main.js` 可以访问（例如 `http://localhost:8080/AcmeQuizExtension-main.js`）。

**第二步：注册扩展地址**

打开测试环境阅读器页面，登录后打开一本书：

```
https://webqa-new.getepic.dev/app/read/{bookId}
```

> **测试环境账号：** 我们会为每个团队单独分配一个开发专用账号，具有书籍订阅权限，可以正常打开和阅读图书。请妥善保管，勿分享给无关人员。

在浏览器开发者工具的 Console 中执行：

```javascript
localStorage.setItem('epic_debug_plugin', 'http://localhost:8080/AcmeQuizExtension-main.js')
```

> 此设置持久生效，只需执行一次。清除方式：`localStorage.removeItem('epic_debug_plugin')`
> **注意：** 文件名必须为 `{globalName}-main.js` 格式，宿主会从 URL 中自动提取 globalName。

**第三步：刷新页面**

刷新阅读器页面，打开一本书，你的扩展即可加载运行。

---

## 四、Context API 完整参考

`activate(context)` 中的 `context` 对象包含以下接口：

### 4.1 context.version — API 版本

```javascript
console.log(context.version);  // "1.0.0"
```

当前 API 版本为 `1.0.0`。后续 API 有变动时版本号会更新，扩展可据此做兼容性判断。

### 4.2 context.analytics — 埋点上报

```javascript
// 只传事件名
context.analytics.log('event_name');

// 传事件名 + 自定义参数
context.analytics.log('event_name', { key1: 'value1', key2: 'value2' });
```

数据通过宿主的统一数据通道上报，扩展不需要自己对接埋点服务。具体的事件名称和参数规范由我们另行约定。

### 4.3 context.slots — 渲染容器


```javascript
// 获取书页覆盖层容器（返回 ShadowRoot）
var readingArea = context.slots.get('reading-area');

// 获取抽屉内容容器（需先执行 openDrawer 命令）
var drawer = context.slots.get('drawer');

// 获取弹窗内容容器（需先执行 openModal 命令）
var modal = context.slots.get('modal');
```

**样式注入方式：**

由于 ShadowDOM 隔离，外部 CSS 文件和 `document.head` 中的样式不会生效。需要通过 `<style>` 元素直接注入到 ShadowRoot 中：

```javascript
var style = document.createElement('style');
style.textContent = '.my-class { color: red; }';
root.appendChild(style);
```

> 如果使用 Vue/React 等框架，框架默认将 CSS 注入 `document.head`，需要自行处理样式注入到 ShadowRoot。

### 4.4 context.data — 数据读取

| 方法 | 返回值 | 说明 |
|------|--------|------|
| `getBookId()` | `number \| undefined` | 当前书籍 ID |
| `getBookData()` | `object` | 完整的书籍对象（见下方字段说明） |
| `getCurrentPage()` | `number` | 当前页码（从 0 开始） |
| `getLabsData()` | `string \| null` | 书籍绑定的互动数据（原始格式，由第三方自行解析） |
| `getFlipBookRect()` | `object \| null` | 书页在屏幕上的精确位置和尺寸 |
| `getPageAudioUrl(pageIndex)` | `string` | 指定页的朗读音频 CDN 地址（无音频时返回空字符串） |
| `getWordTimingData(pageIndex)` | `Promise<object \| null>` | 指定页的单词时间轴数据（异步） |
| `getRtmVolume()` | `number` | 当前音量值（0–100） |
| `getRtmSpeed()` | `number` | 当前播放速度（0.5–2.0） |
| `getRtmHighlight()` | `boolean` | 当前是否启用单词高亮 |

**getBookData() 常用字段：**

| 字段 | 类型 | 说明 |
|------|------|------|
| `id` | `number` | 书籍 ID |
| `title` | `string` | 书名 |
| `type` | `number` | 书籍类型（1=标准, 2=有声书, 3=文章, 4=视频） |
| `author` | `string` | 作者 |
| `numPages` | `number` | 总页数 |
| `labData` | `string` | 互动数据（与 `getLabsData()` 返回值相同） |
| `aspectRatio` | `number` | 书页宽高比 |
| `coverColorR/G/B` | `number` | 封面主色调 RGB |
| `language` | `number` | 语言代码 |
| `bookDescription` | `string` | 书籍简介 |

> 以上为常用字段，实际对象包含更多属性。建议通过 `console.log(context.data.getBookData())` 查看完整结构。

**getFlipBookRect() 返回值：**

```javascript
{
  x: 15.5,      // 书页左上角 X 坐标（相对于视口）
  y: 82,        // 书页左上角 Y 坐标（相对于视口）
  width: 1138,  // 书页宽度（像素）
  height: 567   // 书页高度（像素）
}
```

> 用于精确定位互动元素在书页上的位置。

**getLabsData() 说明：**

返回书籍绑定的互动原始数据。数据格式由第三方团队与我们后端协商定义，宿主只做透传，不解析不处理。第三方在扩展内自行解析。

> 互动数据（labData）的查询和上传通过 Open API 完成，详见 [Open API - Book Data Interface](./open-api-book.md)。

**getPageAudioUrl(pageIndex) 说明：**

返回指定页面的朗读音频 CDN 地址。`pageIndex` 使用 `getCurrentPage()` 返回的页码。仅对启用了 Read to Me 功能的书籍有效，未启用时返回空字符串。

```javascript
var audioUrl = context.data.getPageAudioUrl(context.data.getCurrentPage());
if (audioUrl) {
  // 使用音频地址播放
}
```

**getWordTimingData(pageIndex) 说明：**

异步返回指定页面的单词时间轴数据。`pageIndex` 使用 `getCurrentPage()` 返回的页码。返回 Promise，resolve 后为该页的单词数据对象，无数据时为 `null`。

```javascript
var wordData = await context.data.getWordTimingData(context.data.getCurrentPage());
// wordData.word_data = [{ text, time, duration, bbox, coords, ... }, ...]
```

单词数据字段：

| 字段 | 类型 | 说明 |
|------|------|------|
| `text` | `string` | 单词文本 |
| `time` | `string` | 音频中开始朗读的时间（秒） |
| `duration` | `string` | 朗读持续时长（秒） |
| `bbox` | `object` | 单词边界框（百分比坐标）：`{ x1, y1, x2, y2, width, height }` |
| `coords` | `number[]` | 单词像素坐标：`[x1, y1, x2, y2]` |

> 适用场景：扩展自行实现朗读高亮、跟读互动等功能。

**getRtmVolume() / getRtmSpeed() / getRtmHighlight() 说明：**

这三个方法在扩展实现 Read to Me 功能时使用，用于读取用户在工具栏上的当前设置初始值。设置变更时通过事件通知（见 `rtmVolumeChange`、`rtmSpeedChange`、`rtmHighlightChange`）。

```javascript
// 读取初始值
var volume = context.data.getRtmVolume();      // 例如 80
var speed  = context.data.getRtmSpeed();       // 例如 1.0
var highlight = context.data.getRtmHighlight(); // 例如 true

audio.volume = volume / 100;
audio.playbackRate = speed;
```

> 只有在扩展实现了 Read to Me 功能时才需要使用这三个接口。

### 4.5 context.commands — 执行命令

```javascript
// 打开侧边抽屉
context.commands.execute('openDrawer', payload);

// 关闭侧边抽屉
context.commands.execute('closeDrawer');

// 打开居中弹窗
context.commands.execute('openModal', { width: 900, height: 600 });

// 关闭弹窗
context.commands.execute('closeModal');

// 翻到上一页
context.commands.execute('previousPage');

// 翻到下一页
context.commands.execute('nextPage');

// 跳转到指定页
context.commands.execute('goToPage', 4);

// 查词释义
context.commands.execute('lookup_word', 'apple');
```

**openDrawer 说明：**

调用后宿主会：
1. 计算抽屉尺寸（与书页高度一致，9:16 宽高比）
2. 缩小书页为抽屉腾出空间
3. 显示蓝色边框标识
4. 创建 `drawer` slot 容器
5. 触发 `drawerStateChange` 事件（`mounted: true`）

第三方在 `drawerStateChange` 事件回调中渲染抽屉内容。

**openModal 说明：**

调用后宿主会：
1. 显示遮罩层
2. 创建居中弹窗容器，使用指定的 `width` 和 `height`（默认 800×600）
3. 创建 `modal` slot 容器
4. 触发 `modalStateChange` 事件（`mounted: true`）

宿主提供关闭按钮（右上角 ✕）、遮罩点击关闭、ESC 键关闭。弹窗关闭时无动画，直接移除。第三方只需往 `modal` slot 中渲染内容即可。

| 参数 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| `width` | `number` | `800` | 弹窗宽度（像素） |
| `height` | `number` | `600` | 弹窗高度（像素） |

**goToPage 说明：**

跳转到指定页面。

```javascript
context.commands.execute('goToPage', 4);
```

| 参数 | 类型 | 必须 | 说明 |
|------|------|------|------|
| payload | `number` | 是 | 目标页面索引（从 0 开始的偶数） |

> 边界处理：传入值会自动校正为偶数（向下取整），并 clamp 到有效范围 [0, 最大页索引]。传入非数字值时不执行任何操作。

**lookup_word 说明：**

调用后宿主会弹出一个查词释义弹窗，展示指定单词的定义。

```javascript
context.commands.execute('lookup_word', 'apple');
```

| 参数 | 类型 | 必须 | 说明 |
|------|------|------|------|
| payload | `string` | 是 | 要查询的单词 |

> 适用场景：扩展中的文本内容包含生词时，允许用户点击查看释义。如果传入空字符串或未传参数，命令不会执行任何操作。

### 4.6 context.events — 事件监听

```javascript
// 订阅事件，返回取消订阅函数
var unsubscribe = context.events.on('pageChange', function(payload) {
  console.log('翻到第', payload.pageIndex, '页');
});

// 取消订阅
unsubscribe();
```

**可用事件：**

| 事件名 | payload | 触发时机 | 建议操作 |
|--------|---------|---------|---------|
| `pageChange` | `{ pageIndex: number }` | 翻页完成 | 更新互动内容 |
| `pageTurnStart` | 无 | 翻页动画开始 | 立即清除当前页 UI |
| `drawerStateChange` | `{ mounted: boolean }` | 抽屉打开/关闭 | `mounted: true` 时渲染抽屉内容 |
| `modalStateChange` | `{ mounted: boolean }` | 弹窗打开/关闭 | `mounted: true` 时渲染弹窗内容 |
| `rtmVolumeChange` | `number` | 用户调整音量滑块 | 更新 `audio.volume` |
| `rtmSpeedChange` | `number` | 用户切换播放速度 | 更新 `audio.playbackRate` |
| `rtmHighlightChange` | `boolean` | 用户切换单词高亮开关 | 启用/停止高亮逻辑 |

### 4.7 context.delegations — 接管宿主控件

Delegation（接管）机制允许扩展声明对宿主 UI 控件的接管。被接管的控件点击后由扩展处理，宿主不再执行原有逻辑。

目前支持接管的控件：

| ID | 说明 |
|----|------|
| `'rtm-playback'` | 工具栏上的 Read to Me 播放/暂停按钮 |

**takeOver(id, config) — 接管控件**

```javascript
var state = { playing: false };

var registration = context.delegations.takeOver('rtm-playback', {
  state: state,
  onToggle: function() {
    // 用户点击播放/暂停按钮时触发
    if (state.playing) {
      audio.pause();
      registration.setState({ playing: false });
    } else {
      audio.play();
      registration.setState({ playing: true });
    }
  }
});
```

| 参数 | 类型 | 说明 |
|------|------|------|
| `id` | `string` | 控件 ID，目前仅支持 `'rtm-playback'` |
| `config.state` | `object` | 状态对象，宿主通过 `state.playing` 决定按钮显示播放还是暂停图标 |
| `config.onToggle` | `function` | 按钮点击时的回调 |

返回 `DelegationRegistration`：

| 方法 | 说明 |
|------|------|
| `setState(partial)` | 更新状态并触发宿主按钮 UI 刷新。**必须使用此方法**，直接赋值 `state.playing = true` 不会更新按钮图标 |
| `release()` | 释放接管，宿主恢复原生 RTM 逻辑 |

> 扩展 deactivate 时接管会自动清除，但建议在清理函数中显式调用 `release()`。

**完整的 RTM 扩展实现流程：**

```javascript
activate: function(context) {
  var audio = new Audio();

  // 1. 读取工具栏当前设置
  audio.volume = context.data.getRtmVolume() / 100;
  audio.playbackRate = context.data.getRtmSpeed();
  var highlightEnabled = context.data.getRtmHighlight();

  // 2. 接管播放按钮
  var state = { playing: false };
  var reg = context.delegations.takeOver('rtm-playback', {
    state: state,
    onToggle: function() {
      if (state.playing) {
        audio.pause();
        reg.setState({ playing: false });
      } else {
        loadAndPlay(context.data.getCurrentPage());
      }
    }
  });

  async function loadAndPlay(pageIndex) {
    audio.src = context.data.getPageAudioUrl(pageIndex);
    var timingData = await context.data.getWordTimingData(pageIndex);
    // 用 timingData 初始化高亮逻辑...
    audio.play();
    reg.setState({ playing: true });
  }

  audio.onended = function() {
    reg.setState({ playing: false });
  };

  // 3. 监听工具栏设置变更
  var unsubVolume = context.events.on('rtmVolumeChange', function(v) {
    audio.volume = v / 100;
  });
  var unsubSpeed = context.events.on('rtmSpeedChange', function(v) {
    audio.playbackRate = v;
  });
  var unsubHighlight = context.events.on('rtmHighlightChange', function(v) {
    highlightEnabled = v;
    // 更新高亮显示...
  });

  // 4. 翻页时停止当前页播放
  var unsubPage = context.events.on('pageChange', function() {
    audio.pause();
    audio.src = '';
    reg.setState({ playing: false });
  });

  // 5. 清理
  return function() {
    audio.pause();
    reg.release();
    unsubVolume();
    unsubSpeed();
    unsubHighlight();
    unsubPage();
  };
}
```

---

## 五、TypeScript 类型支持

我们提供了官方的 TypeScript 类型定义包，包含 Extension API 的完整类型（`ExtensionContext`、`Extension`、`BookData`）。

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
  ExtensionContext,
  Extension,
  DelegationRegistration,
  RtmPlaybackState,
} from '@getepic-v2/reader-extension-types'

const extension: Extension = {
  activate(context: ExtensionContext) {
    const root = context.slots.get('reading-area')
    const page = context.data.getCurrentPage()

    // RTM delegation 示例（有完整类型推断）
    const state: RtmPlaybackState = { playing: false }
    const reg: DelegationRegistration<RtmPlaybackState> =
      context.delegations.takeOver('rtm-playback', {
        state,
        onToggle: () => { /* ... */ },
      })

    return () => { reg.release() }
  }
}
```

> 类型包仅包含 Extension API 的接口定义。互动数据（labData）的类型由第三方团队根据自己的数据格式自行定义。

---

## 六、开发环境搭建

### 6.1 项目结构（推荐）

```
my-extension/
├── src/
│   └── extension/
│       ├── index.ts           ← 扩展入口（实现 activate）
│       ├── types.ts           ← Context API TypeScript 类型定义（可选）
│       └── components/        ← UI 组件
├── scripts/
│   └── dev-server.mjs         ← 本地开发服务
├── manifest.json              ← 扩展元数据
├── vite.config.ts             ← 构建配置（或 webpack / rollup）
└── package.json
```

### 6.2 构建要求

输出一个**单独的 JS 文件**（IIFE 格式），加载后在 `window` 上注册扩展对象：

```javascript
(function() {
  // 你的代码...
  window.AcmeQuizExtension = {
    activate: function(context) {
      // ...
      return function cleanup() { /* ... */ };
    }
  };
})();
```

**关键要求：**

| 项目 | 要求 |
|------|------|
| 格式 | IIFE（自执行函数） |
| 输出 | 单个 JS 文件，命名为 `{globalName}-main.js` |
| 全局变量 | 在 `window` 上注册，名称全局唯一 |
| CSS | 打包进 JS（不能有独立 CSS 文件） |
| 依赖 | 所有依赖打包进去，不能有外部 import |

### 6.3 Vite 构建配置示例

```typescript
// vite.config.ts
import { readFileSync } from 'node:fs'
import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'  // 如果用 Vue

const manifest = JSON.parse(readFileSync('./manifest.json', 'utf-8'))
const globalName: string = manifest.globalName

export default defineConfig({
  plugins: [vue()],
  define: {
    'process.env.NODE_ENV': JSON.stringify('production'),
    '__EXTENSION_GLOBAL_NAME__': JSON.stringify(globalName),
  },
  build: {
    lib: {
      entry: 'src/extension/index.ts',
      name: globalName,               // 从 manifest.json 读取
      formats: ['iife'],
      fileName: () => `${globalName}-main.js`,
    },
    cssCodeSplit: false,               // CSS 打入 JS
    outDir: 'dist-extension',
    emptyOutDir: true,
  },
})
```

> `globalName` 和输出文件名均从 `manifest.json` 自动读取，无需手动维护。
> `__EXTENSION_GLOBAL_NAME__` 会在构建时被替换为实际值，用于运行时注册全局变量（见下方扩展入口示例）。

> `process.env.NODE_ENV` 的 define 是必须的，否则 Vue/React 等框架的代码在浏览器中会报错。

### 6.4 本地开发服务

```javascript
// scripts/dev-server.mjs
import http from 'node:http';
import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';

const port = 8080;
const distDir = 'dist-extension';

const server = http.createServer(async (req, res) => {
  const pathname = req.url?.split('?')[0];
  // Serve any {globalName}-main.js from dist-extension/
  if (pathname?.endsWith('-main.js')) {
    try {
      const bundle = await readFile(path.join(distDir, pathname.slice(1)), 'utf8');
      res.writeHead(200, {
        'Content-Type': 'application/javascript; charset=utf-8',
        'Access-Control-Allow-Origin': '*',
        'Cache-Control': 'no-store',
      });
      res.end(bundle);
    } catch {
      res.writeHead(404, { 'Content-Type': 'text/plain' });
      res.end(pathname.slice(1) + ' not found in ' + distDir + '. Run build first.');
    }
    return;
  }
  res.writeHead(200, { 'Content-Type': 'text/plain' });
  res.end('Extension dev server running on http://localhost:' + port);
});

server.listen(port, '0.0.0.0', () => {
  console.log('Dev server: http://localhost:' + port);
});
```

### 6.5 package.json scripts（推荐）

```json
{
  "scripts": {
    "dev:extension": "vite build --mode extension --watch",
    "dev:serve": "node scripts/dev-server.mjs",
    "build:extension": "vite build --mode extension"
  }
}
```

### 6.6 开发工作流

```
┌─ 终端 1 ──────────────────────────────────┐
│ npm run dev:extension                      │
│ → Vite watch 模式，代码变更自动重新构建      │
└────────────────────────────────────────────┘

┌─ 终端 2 ──────────────────────────────────────────────┐
│ npm run dev:serve                                     │
│ → HTTP 服务，提供 localhost:8080/{globalName}-main.js  │
└───────────────────────────────────────────────────────┘

┌─ 浏览器 ─────────────────────────────────────────────────────────┐
│ 1. 打开测试环境阅读器                                              │
│ 2. 控制台执行（只需一次）：                                         │
│    localStorage.setItem(                                         │
│      'epic_debug_plugin',                                        │
│      'http://localhost:8080/{globalName}-main.js'                │
│    )                                                             │
│ 3. 刷新页面 → 扩展加载                                            │
│ 4. 修改代码 → 自动构建 → 刷新 → 看效果                             │
└──────────────────────────────────────────────────────────────────┘
```

---

## 七、完整示例

完整的星星互动扩展示例请参见：[Epic_Reader_Extension_星星互动示例.md](./Epic_Reader_Extension_星星互动示例.md)

该示例演示了：
- 在书页上按坐标渲染互动星星
- 监听翻页事件更新星星
- 点击星星打开侧边抽屉并渲染内容（问答、闪卡、拼图）
- 点击游戏星星打开弹窗展示游戏
- 完整的清理函数实现

---

## 八、注意事项

### 8.1 样式隔离

| 规则 | 说明 |
|------|------|
| CSS 隔离 | ShadowDOM 自动隔离，无需 BEM 前缀或 CSS Modules |
| 样式注入 | 必须通过 `<style>` 元素插入到 ShadowRoot，不能用 `<link>` 或外部 CSS 文件 |
| 框架 CSS | Vue/React 默认注入到 `document.head`，需手动处理（见下方说明） |
| JS 不隔离 | ShadowDOM 只隔离 CSS，请勿操作宿主 DOM |

**Vue 3 样式处理方案：**

将 CSS 写成字符串常量，通过工具函数注入 ShadowRoot：

```javascript
function injectStyles(shadowRoot, css, id) {
  if (shadowRoot.querySelector('#' + id)) return;
  var style = document.createElement('style');
  style.id = id;
  style.textContent = css;
  shadowRoot.prepend(style);
}
```

### 8.2 清理函数

`activate` **必须**返回一个清理函数，扩展卸载时（如切换书籍、页面销毁）会调用：

```javascript
activate: function(context) {
  var unsub1 = context.events.on('pageChange', handler);
  var unsub2 = context.events.on('drawerStateChange', handler);
  var unsub3 = context.events.on('modalStateChange', handler);
  var container = document.createElement('div');
  root.appendChild(container);

  // 必须返回清理函数
  return function() {
    unsub1();           // 取消事件监听
    unsub2();
    unsub3();
    container.remove(); // 移除 DOM
    // 如果用 Vue：app.unmount()
    // 如果用 React：root.unmount()
  };
}
```

### 8.3 全局变量命名

扩展注册到 `window` 上的变量名必须**全局唯一**，建议格式：`[公司名][产品名]Extension`

```javascript
window.AcmeStarExtension = { activate: ... };    // acme-star-extension
window.BytedanceGameExtension = { activate: ... }; // bytedance-game-extension
```

此名称需要与 `manifest.json` 中的 `globalName` 字段一致。

### 8.4 书页定位

互动元素需要精确覆盖在书页上时，使用 `context.data.getFlipBookRect()` 获取书页位置：

```javascript
var rect = context.data.getFlipBookRect();
// rect = { x: 15.5, y: 82, width: 1138, height: 567 }

// 注意：rect 是相对于视口的坐标
// 如果 slot 容器不在视口左上角，需要计算偏移
var parent = document.getElementById('read-container');
var parentRect = parent.getBoundingClientRect();
var offsetTop = rect.y - parentRect.y;
var offsetLeft = rect.x - parentRect.x;
```

### 8.5 性能建议

**JS 文件：**

| 要求 | 说明 |
|------|------|
| 入口体积 | 建议 < 200KB（gzip 后） |
| 按需加载 | 重型功能（游戏、复杂动画）使用动态 `import()` 拆分，用户交互时再加载 |

**图片资源：**

| 建议 | 说明 |
|------|------|
| 单张大小 | 建议不超过 1MB |
| 分辨率 | 建议不超过 2K（2560px），按实际显示尺寸的 2 倍出图即可 |

**运行时性能：**

| 要求 | 说明 |
|------|------|
| 翻页不阻塞 | `pageChange` 回调中避免同步耗时操作 |
| 翻页先清后渲染 | 监听 `pageTurnStart` 立即清除当前页 UI，`pageChange` 时再渲染新内容 |
| 避免频繁重排 | DOM 操作尽量批量处理 |

### 8.6 静态资源

所有静态资源（图片、动画、字体等）均以独立文件形式部署到 CDN，不内联到 JS 中。这样 JS 体积更小，资源可被浏览器缓存，加载更快。

**CDN 部署目录规范：**

我们会为每个团队在 CDN 上分配独立目录，按版本管理：

```
https://cdn.example.com/extensions/
├── {公司名}/
│   └── v{版本号}/
│       ├── {globalName}-main.js  ← 入口脚本
│       ├── assets/           ← 构建产物中的静态资源
│       │   ├── star.png
│       │   └── puzzle.jpg
│       └── images/           ← 其他静态资源
```

示例：
```
https://cdn.example.com/extensions/acme/v1.0.0/AcmeQuizExtension-main.js
https://cdn.example.com/extensions/acme/v1.0.0/assets/star.png
```

**第三方开发时使用相对路径即可**（如 `./images/star.png`），我们在编译构建时会通过 `--base` 参数自动注入 CDN 绝对路径，第三方无需关心。

**重要：第三方不要自行设置 `base` 配置。** 我们在编译时会统一处理：

```bash
vite build --base=https://cdn.example.com/extensions/acme/v1.0.0/
```

这样构建产物中所有静态资源的引用路径会自动指向正确的 CDN 地址。

**Vite 构建配置（第三方）：**

```javascript
build: {
  assetsInlineLimit: 0,  // 所有资源输出为独立文件，不内联 base64
}
```

> **注意：** 不要在 `vite.config.ts` 中设置 `base`，保持默认即可。我们会在构建命令中注入正确的 CDN 路径。

---

## 九、全接管模式（自定义书页内容）

### 9.1 概述

默认情况下，扩展的 UI 以覆盖层形式叠加在原始书页图片之上。如果你希望**完全替换书页内容**（自己渲染页面插画、文字和互动元素），可以启用「全接管模式」。

启用后，阅读器不会渲染原始书页图片，扩展通过 `reading-area` slot 全权负责每一页的内容呈现。

### 9.2 启用方式

全接管模式通过后端配置启用。联系 Epic 对接人为目标书籍设置：

```json
{
  "extensionConfig": {
    "skipPageRender": true
  }
}
```

该配置为**插件级别**，一旦启用，该插件关联的所有书籍均生效。命中扩展灰度的用户打开书时，所有书页图片不会渲染，扩展获得空白画布。未命中灰度的用户仍然看到原始书页，正常阅读。

> **如需启用此模式，请在入驻时或开发过程中告知 Epic 对接人。**

### 9.3 本地调试

无需等待后端配置，可在浏览器控制台启用本地调试：

```javascript
// 启用空白页面（配合 epic_debug_plugin 使用）
localStorage.setItem('epic_debug_skip_page_render', '1')

// 关闭
localStorage.removeItem('epic_debug_skip_page_render')
```

建议同时设置扩展调试地址：

```javascript
localStorage.setItem('epic_debug_plugin', 'http://localhost:8080/YourExtension-main.js')
localStorage.setItem('epic_debug_skip_page_render', '1')
```

刷新页面后生效。

### 9.4 保留的系统页面

启用全接管模式后，以下页面**不受影响**，仍由阅读器渲染：

| 页面 | 说明 |
|------|------|
| 书籍介绍页 | 阅读器自带的第一屏左侧页面（书名、作者等） |
| 完成页 | 读完后的完成动画页面 |
| 推荐页 | 读完后的推荐书籍页面 |

所有书页内容（包括封面和尾页）由扩展接管渲染。

---

## 十、manifest.json 规范

每个扩展需要提供一份 `manifest.json` 元数据文件。

**命名规范：`公司名-产品名-extension`**

```json
{
  "id": "acme-quiz-extension",
  "name": "Acme Quiz Extension",
  "version": "1.0.0",
  "globalName": "AcmeQuizExtension",
  "entry": "AcmeQuizExtension-main.js"
}
```

更多示例：
```
thinkacademy-star-extension      → ThinkacademyStarExtension
bytedance-game-extension         → BytedanceGameExtension
tencent-flashcard-extension      → TencentFlashcardExtension
```

| 字段 | 类型 | 必须 | 说明 | 示例 |
|------|------|------|------|------|
| `id` | string | 是 | 扩展唯一标识（公司-产品-extension） | `acme-quiz-extension` |
| `name` | string | 是 | 扩展显示名称 | `Acme Quiz Extension` |
| `version` | string | 是 | 语义化版本号 | `1.0.0` |
| `globalName` | string | 是 | `window` 上的全局变量名（大驼峰，与代码一致） | `AcmeQuizExtension` |
| `entry` | string | 是 | 入口 JS 文件名（`{globalName}-main.js`） | `AcmeQuizExtension-main.js` |

---

## 十一、交付与上线

### 11.1 交付物清单

| 文件 | 必须 | 说明 |
|------|------|------|
| 项目源码 | **是** | 完整项目代码，我们负责编译构建 |
| `manifest.json` | **是** | 扩展元数据 |
| 静态资源 | 视情况 | 大图片、视频等需要单独部署到 CDN 的资源 |

### 11.2 上线流程

```
第三方提交源码
    │
    ▼
我们审核 + 编译构建
    │
    ▼
构建产物（{globalName}-main.js + 静态资源）部署到 CDN
    │
    ▼
后台配置书籍关联的扩展地址
    │
    ▼
用户打开书 → 阅读器自动加载扩展
```

第三方**无需**了解我们的部署流程。源码提交后，我们统一编译、部署、上线。

### 11.3 版本更新

提交新版本源码 + 更新 `manifest.json` 中的 `version` 字段。我们重新编译部署，对用户透明。

---

## 十二、源码协作流程

### 12.1 仓库结构

我们会在 GitHub 上为每个团队创建一个独立仓库：

```
getepic-v2/
├── extension-acme-quiz              ← Acme 团队的问答扩展
├── extension-bytedance-game         ← 字节团队的游戏扩展
├── extension-tencent-flashcard      ← 腾讯团队的闪卡扩展
└── ...
```

仓库命名规范：`extension-{公司名}-{产品名}`

### 12.2 初始仓库内容

仓库初始只包含基础文件，不限定技术栈：

```
extension-acme-quiz/
├── README.md          ← 开发文档链接
├── manifest.json      ← 预填好 id 和 globalName
└── .gitignore
```

第三方 fork 后自行初始化项目（Vue / React / 原生 JS 均可）。

### 12.3 协作方式（Fork + PR）

```
1. 我们创建仓库，预填 manifest.json
       │
       ▼
2. 第三方 fork 到自己的 GitHub
       │
       ▼
3. 第三方在 fork 中开发（技术栈自选）
       │
       ▼
4. 开发完成，向我们的仓库提交 Pull Request
       │
       ▼
5. 我们 Code Review → 合并 → 编译构建 → 部署到 CDN
```

- 第三方不需要我们仓库的写权限
- 所有改动都经过 PR review 才能合并
- 版本更新同样通过 PR 提交

### 12.4 分支规范（建议）

| 分支 | 用途 |
|------|------|
| `main` | 稳定版本，我们从此分支编译部署 |
| `develop` | 第三方日常开发分支 |
| `feature/*` | 功能分支 |

第三方提交 PR 时，目标分支为 `main`。

