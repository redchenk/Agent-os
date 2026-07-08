# Hermes Agent OS

纯前端 Agent OS 控制台，通过 WebSocket 调用后端 Hermes agent，并把 Hermes 返回的 Live2D 语义动作桥接到 Tsukuyomi/Yachiyo 的本地 Cubism 控制事件。UI 采用更简洁的 Fluent Web OS 结构：桌面图标、可拖拽/可拉伸亚克力窗口、开始菜单、控制中心和居中任务栏。Live2D 舞台支持鼠标拖拽移动模型、滚轮缩放模型、双击还原模型位置。

## 启动

```bash
npm install
npm run dev
```

默认地址：

- Frontend: http://127.0.0.1:5173
- Hermes WebSocket: `ws://127.0.0.1:8787/hermes`
- Live2D Studio: `http://127.0.0.1:5174`

## Hermes 消息

前端发送：

- `agent.hello`
- `agent.run`
- `agent.stop`
- `live2d.control`

前端接收时兼容 `type` / `event` / `kind`，正文兼容 `text` / `message` / `reply` / `delta` / `content`。如果消息内包含 `live2d`、`control` 或 `intent` 字段，会规范化为语义动作。

## Live2D 桥

项目已复用 `E:\visualstudio\yachiyo-live2d-studio` 的 Live2D 前端架构：

- `src/services/room`
- `src/constants/room`
- `src/composables/room/useLive2D.js`
- `public/lib`
- `public/models`

本地页面会通过 Yachiyo 的 `dispatchRoomLive2D` 派发：

```js
window.dispatchEvent(new CustomEvent('tsukuyomi:room-act', { detail: intent }))
```

`intent` 采用 Yachiyo 项目同类语义结构：

```json
{
  "emotion": "happy",
  "actions": [
    { "type": "smile", "duration": 1.2 },
    { "type": "look_at_chat", "duration": 1.2 }
  ],
  "speechStyle": { "speed": 1.05, "pitch": 0.05 }
}
```

已有的 `yachiyo-live2d-studio` 若运行在同页或接收 iframe `postMessage`，即可复用该语义控制流。
