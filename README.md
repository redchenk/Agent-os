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

`npm run dev` 会同时启动前端和本机 Hermes System Bridge。只调单侧时可以使用：

```bash
npm run dev:ui
npm run dev:bridge
```

## Hermes System Bridge

本机桥服务运行在 `127.0.0.1:8787/hermes`，负责把 Agent OS 的 WebSocket 请求转换成 Windows 系统动作。当前支持：

- `agentos.capabilities`：列出 Agent OS 前端、Live2D、桌宠和系统 Runtime 能力
- `agentos.petMode`：要求前端显示或隐藏 Agent OS 内的常驻桌宠
- `system.status`：查看桥服务、工作区和权限状态
- `system.listApps` / `system.launchApp`：列出快捷入口并启动应用
- `system.listWindows` / `system.activeWindow` / `system.focusWindow`：枚举、查看、聚焦窗口
- `system.hotkey` / `system.typeText`：向当前窗口发送快捷键或文本
- `system.screenshot`：保存屏幕截图到 `output/system-bridge`
- `fs.list` / `fs.readFile` / `fs.writeFile`：访问允许根目录内的文件
- `shell.run`：可选 PowerShell 执行能力

危险能力默认关闭：

```powershell
$env:HERMES_ALLOW_WRITE="1"   # 允许 fs.writeFile
$env:HERMES_ALLOW_SHELL="1"   # 允许 shell.run
$env:HERMES_ALLOW_INPUT="0"   # 禁用键盘/文本输入
$env:HERMES_ALLOWED_ROOTS="C:\Users\lenovo\Documents\agent os;E:\visualstudio\agent-os"
npm run dev:bridge
```

可以直接在 Hermes 输入框发送自然语言，例如“打开记事本”“列出窗口”“截图”。更精确的控制建议发送 JSON：

```json
{
  "actions": [
    { "name": "system.launchApp", "args": { "app": "notepad" } },
    { "name": "system.typeText", "args": { "text": "Hello from Agent OS" } }
  ]
}
```

## 桌宠模式

桌宠模式是在 Agent OS 内常驻的右下角控制层，不会切到空白专用页面，也不会隐藏桌面、窗口、开始菜单或任务栏。开启后会在右下角保留 Live2D，并显示一个对话/命令气泡。

桌宠不走 Hermes 对话通道：它会直接使用“设置 > 模型 API”里的 OpenAI-compatible API URL、API Key 和 Model 调用大模型。模型返回 `app.*` / `ui.*` actions 后，Agent OS 会直接调用各应用暴露的接口执行动作。

浏览器预览：

```bash
npm run dev
# 打开 http://127.0.0.1:5173/?pet=1
```

常用 Agent OS 内部动作：

```json
{
  "actions": [
    { "name": "ui.focusApp", "args": { "app": "settings" } },
    { "name": "app.notepad.createNote", "args": { "title": "桌宠笔记", "body": "从桌宠创建。" } },
    { "name": "app.calculator.evaluate", "args": { "expression": "2*(3+4)" } },
    { "name": "app.weather.searchCity", "args": { "query": "上海", "selectFirst": true } },
    { "name": "ui.openControlCenter", "args": {} },
    { "name": "app.stream.summary", "args": {} }
  ]
}
```

当前应用接口包括：

- `app.appCenter.list` / `app.appCenter.open`
- `app.notepad.createNote` / `app.notepad.appendActive` / `app.notepad.search` / `app.notepad.readActive`
- `app.browser.open` / `app.browser.search`
- `app.calculator.evaluate`
- `app.weather.current` / `app.weather.searchCity` / `app.weather.refresh`
- `app.clock.show` / `app.clock.setTimer` / `app.clock.addAlarm`
- `app.stream.summary`
- `app.settings.open`

Hermes 面板仍然可以作为 Agent OS 里的一个应用使用。发送 Hermes 任务时，Agent OS 会把同一套模型 API 配置放到 `metadata.llm`，便于 Hermes 运行时复用系统设置里的 API Key / API URL / Model。

可选桌面宿主：

```bash
npm run desktop:pet
```

桌面宿主会打开透明、无边框、置顶的 Electron 窗口，并加载同一个 Agent OS `?pet=1&nativePet=1` 入口。它不是新的空页面，只是给同一套常驻桌宠提供一个可选外壳。快捷键：

- `Ctrl+Alt+P`：隐藏/显示桌宠窗口
- `Ctrl+Alt+R`：重载桌宠窗口

系统层能力采用用户态 Runtime：桌宠调用本机桥服务，本机桥服务再调用 Win32 / PowerShell / 文件系统 / 进程 API。真正的 Windows 内核驱动不放在桌宠进程里；如果未来需要驱动级能力，应作为单独签名驱动和独立安全边界接入。

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
