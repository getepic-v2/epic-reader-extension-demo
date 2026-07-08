# SDK 未实现接口清单

> 记录 Extension 已按文档契约编写代码、但 SDK runtime/类型尚未暴露的接口。
> Extension 逻辑本身正确,SDK 落地后无需改动即生效;落地前均优雅降级(no-op / 默认值),不报错。
> 维护者:Extension 侧。最后更新:2026-07-07。

## 1. `context.globalState` — 数据持久化(影响:宝石跨会话丢失)

### 现状
- **文档**:`docs/Epic_Reader_Extension_开发文档.md` §4.8 已定义 `save(data): Promise<void>` / `load(): Promise<object|null>`,按 用户+书籍 隔离,无 appKey 时优雅 no-op。
- **SDK runtime**:未暴露。`context.globalState` 为 `undefined`。
- **SDK 类型**:`@getepic-v2/reader-extension-types` 1.2.0 的 `ExtensionContext` 无 `globalState` 字段。

### Extension 侧实现(已就绪,待 SDK)
`src/extension/index.ts` `activate` 内,宝石持久化适配器调 `augContext.globalState.save/load`,复刻 EpicWeb `EpicLabsUserDataService` + `saveGemsToServer`/`loadGemsFromServer` 的逻辑:

| 行为 | EpicWeb 原型 | Extension 实现 |
|---|---|---|
| 进书恢复 | `getBookInteractiveInfo(bookId)` → `restoreGems(collectedIds)` | `globalState.load()` → `info.gems.collectedIds` → `restoreGems` |
| 收集宝石保存 | `{ ...serverInfo, gems: { collectedIds } }` 全量覆盖 upsert | 同:内存 `serverInfo` 合并 + `gems.collectedIds` 全量覆盖 `globalState.save` |
| 状态合并 | 内存 `serverInfo` 缓存,save 后回写 | 同(`serverInfo` 局部变量) |

数据结构沿用 `EpicLabsInteractiveInfo { gems?: { collectedIds: string[] } }`(见 `composables/useBookInteractiveInfo.ts`),与 EpicWeb 后端 `WebUser/getBookInteractiveInfo` 返回一致。

### 降级行为(SDK 未落地时)
- `augContext.globalState` 为 `undefined` → `sdkLog.warn` 打印"SDK has not exposed globalState yet" → load 返回 `[]`、save 直接 return。
- **后果:宝石不会跨会话持久化**(刷新/切书后丢失)。这是 SDK 缺口导致,非 Extension bug。
- 不报错、不阻塞收集流程。

### EpicWeb 后端真实接口(供 SDK 团队参考)
`EpicWeb/src/app/web-app/routes/read/epic-labs/services/epic-labs-user-data.service.ts`:
- `GET {serviceBase}?class=WebUser&method=getBookInteractiveInfo&appKey=think_studio&bookId=<id>&dev=web&ver=3.5&reqSig=<md5>`
- `POST {serviceBase}?class=WebUser&method=upsertBookInteractiveInfo`,body `application/x-www-form-urlencoded`:`appKey/bookId/info=<JSON stringified>&dev=web&ver=3.5&reqSig=<md5>`
- 认证:`withCredentials: true`(cookie)+ `User-Id` header
- 签名:`reqSig = md5(env.slt + 按key排序拼接的kv)`,`env.slt` 为环境注入密钥

> Extension 无法自行 fetch 这俩端点:`env.slt`(签名密钥)、`env.serviceBase`(base URL)、`User-Id`/cookie 认证均不可得。必须由 SDK 暴露 `globalState` 封装。

---

## 2. `context.data.getBookCoverUrl()` — 封面图 URL(影响:评价弹窗无封面)

### 现状
- **文档**:§4.4 已定义,返回封面 CDN 绝对路径,无书返回 `''`。
- **SDK runtime/类型**:均未暴露。

### Extension 侧实现(已就绪)
`src/extension/index.ts` `BookRatingModal` 挂载分支:优先级 `bookRatingData.coverUrl > augContext.data.getBookCoverUrl?.() > ''`。

### 降级行为
`getBookCoverUrl` 为 `undefined` → `?.()` 返回 `undefined` → 回退 `''` → 评价弹窗不显示封面图(不报错)。

---

## 3. `context.user.isParent()` — 用户信息(影响:summary-game 无法按账户类型选 URL)

### 现状
- **文档**:§4.9 已定义,返回当前 profile 是否家长。
- **SDK runtime/类型**:均未暴露。

### Extension 侧实现(已就绪)
`src/extension/types-sdk-augment.ts` `resolveAccountType`:`isParent()=true → 'family'`,否则 `'school'`。`src/extension/index.ts` `getLabsData` 用其选 `<url type="school/family">`。

### 降级行为
`user.isParent` 非函数 → `resolveAccountType` 返回 `null` → 跳过选择 → `gameUrl` 取 `gameUrls[]`(解析时已填,school 在前则用 school)。不报错,行为退化为"总用第一个 URL"。

---

## 4. RTM 暂停/恢复命令(影响:抽屉打开时无法暂停 RTM 旁白)

### 现状
- **文档**:§4.7 delegations 仅支持 `takeOver('rtm-playback')` 全接管(自建 Audio),**无**被动查询/控制宿主已有 RTM 的命令。
- **SDK runtime**:`context.commands` 只有 `openDrawer/closeDrawer/openModal/closeModal/nextPage/previousPage/goToPage/lookup_word`,**无 `rtmPause`/`rtmResume`/`rtmToggle`**。也无 `getRtmPlaying()` 查询接口。

### Extension 侧实现(占位,待 SDK 命令名确定)
`src/extension/types-sdk-augment.ts` `createRtmController`:抽屉 `drawerStateChange` mounted → `pause()`,unmounted → `resume()`。内部 `context.commands.execute('rtmPause'/'rtmResume')`,带 `pausedByUs` 状态防误恢复。

### 降级行为
命令不存在 → 宿主 `commands.execute` 不识别 → 静默 no-op(try/catch 吞)。SDK 若以别的命令名暴露(如 `rtm.toggle`),只改 `createRtmController` 一处。

### 需要 SDK 补的接口(建议)
- 查询:`context.data.getRtmPlaying(): boolean` 或事件 `rtmPlayingChange`
- 控制:`context.commands.execute('rtmPause' | 'rtmResume')`

---

## 5. 类型增强文件

`src/extension/types-sdk-augment.ts` —— 给上述未暴露接口提供本地类型 + 助手(`augmentContext` cast、`resolveAccountType`、`createRtmController`)。**SDK 落地对应接口后,删此文件并去掉 `index.ts` 里的 cast 即可,业务逻辑不动。**

## 统一日志
所有 SDK 调用带 `[EpicLabsExt]` 前缀(`src/extension/utils/logger.ts`),上述降级均在 console 可见 `warn`,便于排查"为什么没生效"。
