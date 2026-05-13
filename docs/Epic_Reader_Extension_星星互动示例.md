# Epic Reader Extension 示例：星星互动扩展

本示例演示如何开发一个完整的星星互动扩展，包括：
- 在书页上按坐标渲染互动星星
- 监听翻页事件更新星星
- 点击星星打开侧边抽屉并渲染内容（问答、闪卡、拼图）
- 点击游戏星星打开弹窗展示游戏
- 完整的清理函数实现

---

## 一、项目结构

```
thinkacademy-star-extension/
├── src/
│   └── extension/
│       ├── index.ts               ← 扩展入口
│       ├── types.ts               ← TypeScript 类型定义
│       ├── utils/
│       │   ├── styles.ts          ← ShadowDOM 样式注入工具
│       │   └── parse-labs-xml.ts  ← 互动数据 XML 解析器
│       └── components/
│           ├── StarOverlay.vue    ← 星星覆盖层组件
│           ├── DrawerPanel.vue    ← 抽屉内容路由组件
│           ├── MultipleChoice.vue ← 问答互动组件
│           ├── Flashcard.vue      ← 闪卡翻转组件
│           ├── Puzzle.vue         ← 拼图游戏组件
│           └── GameContent.vue    ← 游戏内容组件（渲染在宿主弹窗中）
├── scripts/
│   └── dev-server.mjs             ← 本地开发服务
├── manifest.json
├── vite.config.ts
└── package.json
```

---

## 二、manifest.json

```json
{
  "id": "thinkacademy-star-extension",
  "name": "ThinkAcademy Star Extension",
  "version": "1.0.0",
  "globalName": "ThinkacademyStarExtension",
  "entry": "ThinkacademyStarExtension-main.js"
}
```

---

## 三、核心代码

### 3.1 扩展入口（纯 JS 版本）

以下是不依赖任何框架的纯 JavaScript 实现：

```javascript
(function() {

  // ==========================================
  // 工具函数
  // ==========================================

  /**
   * 注入样式到 ShadowRoot（幂等，不会重复注入）
   */
  function injectStyles(shadowRoot, css, id) {
    if (shadowRoot.querySelector('#' + id)) return;
    var style = document.createElement('style');
    style.id = id;
    style.textContent = css;
    shadowRoot.prepend(style);
  }

  /**
   * 获取书页相对于 slot 父容器的偏移位置
   * 用于精确定位互动元素在书页上的位置
   */
  function getFlipBookOffset(context) {
    var rect = context.data.getFlipBookRect();
    if (!rect) return null;
    var parent = document.getElementById('read-container');
    if (!parent) return { top: 0, left: 0, width: rect.width, height: rect.height };
    var parentRect = parent.getBoundingClientRect();
    return {
      top: rect.y - parentRect.y,
      left: rect.x - parentRect.x,
      width: rect.width,
      height: rect.height,
    };
  }

  // ==========================================
  // 数据解析（根据你的数据格式自行实现）
  // ==========================================

  /**
   * 解析互动数据，获取当前页的互动点列表
   * @param {*} labsData - context.data.getLabsData() 返回的原始数据
   * @param {number} currentPage - 当前页码
   * @returns {Array} 互动点数组
   *
   * 返回的每个互动点格式：
   * {
   *   type: 'multiple-choice',           // 互动类型
   *   coordinates: { x: 0.45, y: 0.60 }, // 在书页上的位置（0-1）
   *   content: { ... }                   // 互动内容（根据 type 不同而不同）
   * }
   */
  function getStarsForPage(labsData, currentPage) {
    // 这里是示例实现，假设 labsData 是解析后的 JSON
    // 第三方团队根据实际数据格式替换此函数
    if (!labsData || !labsData.pages) return [];
    var page = labsData.pages.find(function(p) {
      return p.pageNumber === currentPage;
    });
    return page ? page.stars || [] : [];
  }

  // ==========================================
  // 样式定义
  // ==========================================

  var STAR_CSS = [
    // 星星覆盖层（覆盖在书页上）
    '.star-overlay {',
    '  position: relative;',
    '  width: 100%;',
    '  height: 100%;',
    '}',

    // 星星按钮
    '.star-btn {',
    '  position: absolute;',
    '  pointer-events: auto;',
    '  width: 10%;',
    '  height: 10%;',
    '  padding: 0;',
    '  cursor: pointer;',
    '  border: none;',
    '  background: transparent;',
    '  box-shadow: none;',
    '  transform: translate(-50%, -100%);',
    '  font-size: 28px;',
    '  z-index: 1;',
    '  transition: transform 0.2s ease;',
    '}',
    '.star-btn:hover {',
    '  transform: translate(-50%, -100%) scale(1.15);',
    '}',

    // 呼吸动画
    '.star-btn--animated {',
    '  animation: star-breathe 2.6s ease-in-out infinite;',
    '}',
    '@keyframes star-breathe {',
    '  0%, 100% { transform: translate(-50%, -100%) scale(0.9); }',
    '  50% { transform: translate(-50%, -100%) scale(1); }',
    '}',
  ].join('\n');

  var DRAWER_CSS = [
    '.drawer-content {',
    '  padding: 24px;',
    '  font-family: Arial, sans-serif;',
    '  height: 100%;',
    '  box-sizing: border-box;',
    '  overflow-y: auto;',
    '}',
    '.drawer-title {',
    '  margin: 0 0 16px;',
    '  font-size: 20px;',
    '  font-weight: 700;',
    '  color: #17324d;',
    '}',
    '.drawer-type {',
    '  display: inline-block;',
    '  padding: 4px 12px;',
    '  border-radius: 12px;',
    '  background: #e8f4fd;',
    '  color: #0a96e6;',
    '  font-size: 13px;',
    '  font-weight: 600;',
    '  margin-bottom: 16px;',
    '}',
    '.drawer-text {',
    '  margin: 0 0 12px;',
    '  font-size: 14px;',
    '  line-height: 1.6;',
    '  color: #4c5f75;',
    '}',
  ].join('\n');

  // ==========================================
  // 扩展主体
  // ==========================================

  window.ThinkacademyStarExtension = {
    activate: function(context) {

      // --- 初始化渲染容器 ---
      var readingRoot = context.slots.get('reading-area');
      injectStyles(readingRoot, STAR_CSS, 'star-styles');

      var container = document.createElement('div');
      container.style.cssText = 'position:absolute;inset:0;pointer-events:none;';
      readingRoot.appendChild(container);

      var selectedStar = null;

      // --- 渲染星星 ---
      function renderStars() {
        container.innerHTML = '';

        var labsData = context.data.getLabsData();
        var currentPage = context.data.getCurrentPage();
        var stars = getStarsForPage(labsData, currentPage);

        if (stars.length === 0) return;

        var offset = getFlipBookOffset(context);
        if (!offset) return;

        // 创建覆盖层，精确覆盖书页
        var overlay = document.createElement('div');
        overlay.className = 'star-overlay';
        overlay.style.cssText =
          'position:absolute;' +
          'top:' + offset.top + 'px;' +
          'left:' + offset.left + 'px;' +
          'width:' + offset.width + 'px;' +
          'height:' + offset.height + 'px;' +
          'pointer-events:none;';

        stars.forEach(function(star, index) {
          var btn = document.createElement('button');
          btn.className = 'star-btn star-btn--animated';
          btn.style.left = (star.coordinates.x * 100) + '%';
          btn.style.top = (star.coordinates.y * 100) + '%';
          btn.textContent = star.type === 'game' ? '🎮' : '⭐';
          btn.setAttribute('aria-label', 'Interactive ' + star.type + ' content');

          btn.onclick = function() {
            selectedStar = star;
            if (star.type === 'game') {
              // 游戏类型使用弹窗而非抽屉
              context.commands.execute('openModal', { width: 960, height: 640 });
            } else {
              context.commands.execute('openDrawer', {
                star: star,
                starIndex: index,
              });
            }
          };

          overlay.appendChild(btn);
        });

        container.appendChild(overlay);
      }

      // 首次渲染
      renderStars();

      // --- 事件监听 ---

      // 翻页完成：更新星星
      var unsubPage = context.events.on('pageChange', function() {
        selectedStar = null;
        renderStars();
      });

      // 翻页动画开始：立即清除当前页星星（避免残留）
      var unsubTurn = context.events.on('pageTurnStart', function() {
        container.innerHTML = '';
      });

      // 抽屉状态变化：渲染/清除抽屉内容
      var unsubDrawer = context.events.on('drawerStateChange', function(payload) {
        if (payload && payload.mounted && selectedStar) {
          var drawerRoot = context.slots.get('drawer');
          injectStyles(drawerRoot, DRAWER_CSS, 'drawer-styles');

          var content = document.createElement('div');
          content.className = 'drawer-content';

          var title = document.createElement('h3');
          title.className = 'drawer-title';
          title.textContent = 'Interactive Content';

          var typeBadge = document.createElement('span');
          typeBadge.className = 'drawer-type';
          typeBadge.textContent = selectedStar.type;

          var desc = document.createElement('p');
          desc.className = 'drawer-text';
          desc.textContent = 'This content is rendered by a third-party extension. The extension has full control over the drawer UI.';

          var pageInfo = document.createElement('p');
          pageInfo.className = 'drawer-text';
          pageInfo.textContent = 'Book: ' + context.data.getBookId() + ' | Page: ' + context.data.getCurrentPage();

          content.appendChild(title);
          content.appendChild(typeBadge);
          content.appendChild(desc);
          content.appendChild(pageInfo);
          drawerRoot.appendChild(content);
        }
      });

      // 弹窗状态变化：渲染/清除游戏内容
      var unsubModal = context.events.on('modalStateChange', function(payload) {
        if (payload && payload.mounted && selectedStar) {
          var modalRoot = context.slots.get('modal');

          var iframe = document.createElement('iframe');
          iframe.src = selectedStar.content.url || '';
          iframe.style.cssText = 'width:100%;height:100%;border:none;';
          iframe.setAttribute('allowfullscreen', '');
          modalRoot.appendChild(iframe);
        }
      });

      // --- 返回清理函数 ---
      return function() {
        unsubPage();
        unsubTurn();
        unsubDrawer();
        unsubModal();
        container.remove();
      };
    }
  };

})();
```

---

## 四、Vue 3 版本

如果使用 Vue 3 开发，扩展入口的核心逻辑：

```typescript
// src/extension/index.ts
import { createApp, reactive } from 'vue'
import StarOverlay from './components/StarOverlay.vue'
import DrawerPanel from './components/DrawerPanel.vue'
import GameContent from './components/GameContent.vue'
import { injectStyles } from './utils/styles'
import { parseLabsXml } from './utils/parse-labs-xml'
import type { ExtensionContext, Star, EpicReaderBookData } from './types'

let parsedData: EpicReaderBookData | null = null

function getLabsData(context: ExtensionContext): EpicReaderBookData | null {
  if (parsedData) return parsedData
  const raw = context.data.getLabsData()
  if (!raw || typeof raw !== 'string') return null
  try { parsedData = parseLabsXml(raw) } catch { /* 解析失败 */ }
  return parsedData
}

function getPageStars(context: ExtensionContext): Star[] {
  const data = getLabsData(context)
  if (!data?.pages) return []
  const page = data.pages.find(p => p.pageNumber === context.data.getCurrentPage())
  return page?.stars || []
}

;(window as any).ThinkacademyStarExtension = {
  activate(context: ExtensionContext) {
    const root = context.slots.get('reading-area')
    injectStyles(root, STAR_CSS, 'star-styles')

    const container = document.createElement('div')
    container.style.cssText = 'position:absolute;inset:0;pointer-events:none;'
    root.appendChild(container)

    // 响应式状态
    const state = reactive({
      page: context.data.getCurrentPage(),
      stars: getPageStars(context),
      selectedStar: null as Star | null,
    })

    // 挂载 Vue 组件到 ShadowRoot
    const app = createApp(StarOverlay, { context, state })
    app.mount(container)

    // 翻页更新
    const unsubPage = context.events.on('pageChange', () => {
      state.page = context.data.getCurrentPage()
      state.stars = getPageStars(context)
      state.selectedStar = null
    })

    // 抽屉渲染（问答、闪卡、拼图）
    let drawerApp: ReturnType<typeof createApp> | null = null
    let drawerContainer: HTMLElement | null = null

    const unsubDrawer = context.events.on('drawerStateChange', (payload: any) => {
      if (payload?.mounted && state.selectedStar) {
        const drawerRoot = context.slots.get('drawer')
        injectStyles(drawerRoot, DRAWER_CSS, 'drawer-styles')
        drawerContainer = document.createElement('div')
        drawerContainer.style.cssText = 'width:100%;height:100%;'
        drawerRoot.appendChild(drawerContainer)
        drawerApp = createApp(DrawerPanel, { star: state.selectedStar })
        drawerApp.mount(drawerContainer)
      } else {
        drawerApp?.unmount()
        drawerContainer?.remove()
        drawerApp = null
        drawerContainer = null
      }
    })

    // 弹窗渲染（游戏）
    let modalApp: ReturnType<typeof createApp> | null = null
    let modalContainer: HTMLElement | null = null

    const unsubModal = context.events.on('modalStateChange', (payload: any) => {
      if (payload?.mounted && state.selectedStar) {
        const modalRoot = context.slots.get('modal')
        injectStyles(modalRoot, MODAL_CSS, 'modal-styles')
        modalContainer = document.createElement('div')
        modalContainer.style.cssText = 'width:100%;height:100%;'
        modalRoot.appendChild(modalContainer)
        modalApp = createApp(GameContent, { content: state.selectedStar.content })
        modalApp.mount(modalContainer)
      } else {
        modalApp?.unmount()
        modalContainer?.remove()
        modalApp = null
        modalContainer = null
      }
    })

    // 拦截 openDrawer：游戏类型路由到弹窗
    const originalExecute = context.commands.execute.bind(context.commands)
    context.commands.execute = (command: string, payload?: any) => {
      if (command === 'openDrawer' && payload?.star) {
        if (payload.star.type === 'game') {
          state.selectedStar = payload.star
          originalExecute('openModal', { width: 960, height: 640 })
          return
        }
        state.selectedStar = payload.star
      }
      originalExecute(command, payload)
    }

    // 清理
    return () => {
      unsubPage()
      unsubDrawer()
      unsubModal()
      modalApp?.unmount()
      modalContainer?.remove()
      drawerApp?.unmount()
      drawerContainer?.remove()
      app.unmount()
      container.remove()
    }
  }
}
```

**关键点：**
- Vue 的 `createApp().mount()` 支持挂载到 ShadowRoot 内的任意 DOM 节点
- 使用 `reactive()` 让状态变化自动更新 UI
- CSS 必须以字符串形式注入 ShadowRoot，不能用 Vue 的 `<style>` 标签（会被注入到 `document.head`）
- 游戏类型使用 `openModal` 而非 `openDrawer`。宿主提供弹窗外壳（遮罩、关闭按钮、ESC 处理），扩展只需往 `modal` slot 中渲染内容

---

## 五、Vite 构建配置

```typescript
// vite.config.ts
import { fileURLToPath, URL } from 'node:url'
import { readFileSync } from 'node:fs'
import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'

const manifest = JSON.parse(readFileSync('./manifest.json', 'utf-8'))
const globalName: string = manifest.globalName

export default defineConfig(({ mode }) => ({
  plugins: [vue()],
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
  ...(mode === 'extension' ? {
    define: {
      'process.env.NODE_ENV': JSON.stringify('production'),
    },
    build: {
      lib: {
        entry: fileURLToPath(new URL('./src/extension/index.ts', import.meta.url)),
        name: globalName,
        formats: ['iife'] as const,
        fileName: () => `${globalName}-main.js`,
      },
      cssCodeSplit: false,
      outDir: 'dist-extension',
      emptyOutDir: true,
    },
  } : {}),
}))
```

**构建命令：**

```bash
# 开发模式（watch）
npm run dev:extension    # vite build --mode extension --watch

# 生产构建
npm run build:extension  # vite build --mode extension
```

---

## 六、调试流程

```bash
# 终端 1：持续构建
npm run dev:extension

# 终端 2：启动本地服务
npm run dev:serve

# 浏览器：打开测试环境阅读器
# https://webqa-new.getepic.dev/app/read/{bookId}

# 控制台设置（只需一次）：
localStorage.setItem('epic_debug_plugin', 'http://localhost:8080/ThinkacademyStarExtension-main.js')

# 刷新页面，扩展即可加载
# 修改代码 → 自动构建 → 刷新浏览器 → 看到更新
```
