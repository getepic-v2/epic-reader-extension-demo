# Interactive Book Extension Analytics Schema

> 版本：1.0.0（草案，待双方对齐）
> 更新日期：2026-06-30

本文档定义 Interactive Book Extension 的埋点事件规范。第三方扩展通过 `context.analytics.log(event, params)` 上报事件，宿主统一转发至数据平台。

---

## 一、命名规范

- 事件名前缀统一：`ib_`（interactive book）
- 全小写 + 下划线分隔
- 命名采用「动词/状态」式：`ib_game_start`、`ib_video_end`

---

## 二、公共字段（宿主自动注入）

以下字段由宿主在转发时自动附加，**第三方无需、也不应**在 `params` 中重复传入：

| 字段 | 说明 |
|------|------|
| `book_id` | 当前书籍 ID |
| `user_id` | 当前用户 ID |
| `session_id` | 本次阅读会话 ID |
| `timestamp` | 事件时间戳 |
| `extension_name` | 扩展全局变量名 |

---

## 三、触发方式说明

事件分为两类：

| 触发方式 | 含义 |
|---------|------|
| **自动** | 由宿主或 `context.progress` 自动触发，第三方**无需手动调用** `analytics.log()` |
| **手动** | 第三方在对应交互发生时主动调用 `context.analytics.log()` |

> ⚠️ 进度相关事件（`ib_checkpoint`、`ib_complete`、`ib_progress_save`、`ib_progress_resume`）由 `context.progress` 的方法自动触发，第三方只调用 progress 方法即可，不要重复调 analytics，否则会**重复上报**。

---

## 四、生命周期事件

| 事件名 | 触发方式 | 触发时机 | 附加参数 |
|--------|---------|---------|---------|
| `ib_open` | 自动 | 互动书打开 | — |
| `ib_start` | 手动 | 用户真正开始体验（如通过 intro/片头后点 Start）。区别于 `ib_open`：打开 ≠ 开始，部分用户会打开后未开始即离开 | `duration_from_open_ms`（可选，从打开到开始耗时） |
| `ib_close` | 自动 | 互动书关闭 | `duration_ms`, `close_reason`（`user_exit` / `complete` / `error`） |

---

## 五、进度事件（自动，由 `context.progress` 触发）

| 事件名 | 对应 progress 方法 | 触发时机 | 附加参数 |
|--------|-------------------|---------|---------|
| `ib_progress_save` | `save(data)` | 保存进度 | — |
| `ib_progress_resume` | `load()` | 恢复进度 | — |
| `ib_checkpoint` | `checkpoint(name, data?)` | 到达关键节点 | `checkpoint_name`, `checkpoint_index`(可选), `data`(可选) |
| `ib_complete` | `complete(data?)` | 完成互动书 | `total_duration_ms`, `data`(可选) |

第三方调用示例（宿主会自动上报对应 `ib_*` 事件）：

```javascript
await context.progress.save({ chapter: 2, score: 650 })
// → 自动上报 ib_progress_save

var saved = await context.progress.load()
// → 自动上报 ib_progress_resume

context.progress.checkpoint('chapter_1_done', { score: 300 })
// → 自动上报 ib_checkpoint { checkpoint_name: 'chapter_1_done', data: { score: 300 } }

context.progress.complete({ finalScore: 1200 })
// → 自动上报 ib_complete { data: { finalScore: 1200 } }
```

---

## 六、游戏 / 互动事件（手动）

| 事件名 | 触发时机 | 附加参数 |
|--------|---------|---------|
| `ib_game_start` | 开始一个小游戏 | `game_id`, `game_type` |
| `ib_game_attempt` | 一次尝试（答题/拖拽/点击） | `game_id`, `game_type`, `is_correct`, `attempt_index` |
| `ib_game_complete` | 完成小游戏 | `game_id`, `game_type`, `result`（`success` / `fail`）, `attempts`, `duration_ms` |
| `ib_game_quit` | 中途退出小游戏 | `game_id`, `game_type`, `progress_pct`(可选) |

`game_type` 参考值（可扩展）：`globe` / `sort` / `puzzle` / `dance` / `food` / `memory` / `quiz` 等，由第三方按实际内容自定义。

---

## 七、视频事件（手动）

| 事件名 | 触发时机 | 附加参数 |
|--------|---------|---------|
| `ib_video_play` | 视频开始播放 | `video_id`, `video_duration_ms` |
| `ib_video_pause` | 视频暂停 | `video_id`, `position_ms` |
| `ib_video_end` | 视频播放结束 | `video_id`, `watched_pct` |

---

## 八、选择 / 分支事件（手动）

| 事件名 | 触发时机 | 附加参数 |
|--------|---------|---------|
| `ib_choice_presented` | 展示选择分支 | `choice_id`, `options`(选项列表) |
| `ib_choice_selected` | 用户做出选择 | `choice_id`, `selected_option`, `duration_ms`（思考时间） |

---

## 九、死亡 / 重生事件（手动）

| 事件名 | 触发时机 | 附加参数 |
|--------|---------|---------|
| `ib_death` | 触发死亡/失败 | `death_cause`, `spread_index` |
| `ib_respawn` | 用户选择重生 | `death_cause`, `respawn_to` |

---

## 十、调用示例

```javascript
// 用户真正开始体验（如通过 intro 后点 Start）
context.analytics.log('ib_start', {
  duration_from_open_ms: 3200
})

// 游戏开始
context.analytics.log('ib_game_start', {
  game_id: 'globe_antarctica',
  game_type: 'globe'
})

// 一次错误尝试
context.analytics.log('ib_game_attempt', {
  game_id: 'globe_antarctica',
  game_type: 'globe',
  is_correct: false,
  attempt_index: 1
})

// 游戏完成
context.analytics.log('ib_game_complete', {
  game_id: 'globe_antarctica',
  game_type: 'globe',
  result: 'success',
  attempts: 3,
  duration_ms: 15000
})

// 视频播放完毕
context.analytics.log('ib_video_end', {
  video_id: 'intro_penguin_march',
  watched_pct: 100
})

// 选择分支
context.analytics.log('ib_choice_selected', {
  choice_id: 'food_choice_s4',
  selected_option: 'fish',
  duration_ms: 3200
})

// 死亡
context.analytics.log('ib_death', {
  death_cause: 'frozen',
  spread_index: 4
})
```

---

## 十一、补充说明

1. **公共字段不要重复传**：`book_id`、`user_id`、`session_id`、`timestamp`、`extension_name` 由宿主自动注入。
2. **`data` 字段为自由格式**：`ib_checkpoint`、`ib_complete` 等事件的 `data` 参数格式由第三方自定义，宿主只透传存储，不解析。
3. **`game_type` 可扩展**：第三方可自行新增游戏类型值，无需事先在宿主注册。
4. **进度事件不要手动调 analytics**：调 `context.progress` 的方法即可，宿主自动上报对应埋点，避免重复。
