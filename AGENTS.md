# AGENTS.md

本文件面向在本仓库中工作的 AI 编码助手（Agent），说明项目架构、可用命令、约定与已知坑。人类用户请先读 `README.md`。

## 项目是什么

**Grok Build Desktop** —— Grok Build 终端版的 Electron 桌面客户端（Electron 33 + React 18 + TypeScript + electron-vite 2.3）。

核心设计：**不重新实现模型调用**。桌面端作为 ACP（Agent Client Protocol）客户端 spawn `grok agent stdio`，登录态、模型、工具链、会话、记忆、插件全部复用终端版（`~/.grok`）。一个应用实例只维护一个 agent 长驻进程，多会话共用。

```
渲染进程 (React)  ──IPC(contextBridge)──▶  主进程 AcpClient (JSON-RPC over stdio)  ──spawn──▶  grok agent stdio
```

## 常用命令

| 命令 | 说明 |
| --- | --- |
| `npm run dev` | 开发模式（热更新）。注意：见下方「假 env 陷阱」 |
| `npm run build` | 构建到 `out/` |
| `npm start` | 预览构建产物 |
| `npm run typecheck` | 主进程 + 渲染进程类型检查（提交前必跑） |
| `npm run pack` | 打包免安装版到 `dist/win-unpacked/`（`--dir`，不出安装包） |
| `npm run dist` | 打包成 Windows 安装包（输出到 `dist/`） |
| `npm run version:show` | 查看当前版本号与最近变更 |
| `npm run version:patch -- "说明"` | 修订号 +1（0.2.0 → 0.2.1） |
| `npm run version:minor -- "说明"` | 次版本号 +1（0.2.0 → 0.3.0） |
| `npm run version:major -- "说明"` | 主版本号 +1（0.2.0 → 1.0.0） |
| `node scripts/acp-probe.mjs` | 命令行验证 ACP 全链路（initialize → session/new → session/prompt） |
| `node scripts/load-probe.mjs` / `ask-probe.mjs` / `auto-mode-probe.mjs` | 分别验证 session/load、权限询问、auto 权限模式 |
| `node scripts/concurrent-prompt-probe.mjs` | 验证「响应中并发发消息」：实测 ACP **串行排队、不报错**（0.25.0 排队发送的实测依据） |
| `node scripts/cancel-tool-probe.mjs` | 验证 tool 卡住时 `session/cancel` 的效果：实测 **prompt 立刻返回 `stopReason:cancelled`，但 tool 仍 in_progress 不停**（cancel 只收尾 prompt 层） |

⚠️ **本机打包/运行必须 `unset ELECTRON_RUN_AS_NODE`**：沙箱环境会注入该变量，让 Electron 退化成 Node 模式（`require('electron')` 返回字符串）。用户双击 exe 不受影响。

## 源码结构

```
src/
├── main/                 主进程
│   ├── acp/client.ts     ACP JSON-RPC over stdio 客户端（唯一 agent 进程由 service.ts 管理）
│   ├── acp/service.ts    会话服务：进程管理、权限模式、配置推送
│   ├── config.ts         持久化配置（userData/config.json），含 proxyEnv()
│   ├── proxy.ts          代理环境变量探测与注入
│   ├── diagnostics.ts    环境自检（可执行文件/登录态/令牌/模型/连通性）
│   ├── ipc.ts            IPC 注册
│   ├── mcp.ts            MCP 面板相关
│   └── index.ts          应用入口
├── preload/index.ts      contextBridge 白名单桥接（window.grok）
├── renderer/src/         React 界面（zustand store，见 store.ts / actions.ts）
│   └── components/       ChatView / Composer / Sidebar / Header / *Dialog / PlanPanel / AboutPanel / ...
└── shared/               三端共享：types.ts（含 PERMISSION_MODE_OPTIONS）、channels.ts、api.ts、globals.d.ts
```

## 版本管理机制

- **唯一入口**：`scripts/version.mjs`。不手改 `package.json` 的 version。
- **版本号来源**：`app.getVersion()` 读 `package.json`；打包时刻由
  `electron.vite.config.ts` 的 `define: { __APP_BUILD_TIME__ }` 在编译期注入
  （声明在 `shared/globals.d.ts`）。
- **展示链路**：主进程 `CH.appVersion` → preload `appVersion()` → store `appVersion` →
  ① 侧栏底栏常驻版本号（`conn-version`，开发模式带 `·dev` 后缀）
  ② `AboutPanel.tsx`「关于」弹窗（版本号 / 构建时刻 / Grok Build 版本 / 运行环境 / 代理，可一键复制）。
- **变更记录**：`CHANGELOG.md` 由脚本自动维护，勿手工编辑。
- 报问题时让用户附上「构建时刻」——同一版本号可能对应两次不同时间的构建。

## 必须遵守的约定

0. **⚠️ 每改一次功能，必须升一次版本号**（用户 2026-10-12 明确要求，长期生效）。
   唯一入口是 `scripts/version.mjs`，**不要手改 `package.json` 的 version**：
   ```bash
   node scripts/version.mjs patch "修复了xxx"    # 修 bug / 小调整
   node scripts/version.mjs minor "新增了xxx"    # 新增功能
   node scripts/version.mjs major "重构了xxx"    # 不兼容改动
   node scripts/version.mjs set 1.2.3 "说明"     # 直接指定
   ```
   脚本会自动同步 `package.json` + `package-lock.json` 的 version 并在 `CHANGELOG.md` 顶部
   插入一条记录（同一版本号重复执行会替换而非堆叠）。加 `--commit` / `--tag` 可顺带
   提交与打标签。**判断级别**：只是修 bug 或调 UI 文案 → patch；加了新面板 / 新入口 /
   新能力 → minor；数据结构或行为不兼容 → major。
   升完版本再跑 `npm run typecheck` 与打包。
1. **会话 cwd 不可变**。ACP 没有改目录接口，且 grok 按 cwd 分目录存会话（`~/.grok/sessions/<url-encoded cwd>/<sessionId>`）。「换工作目录」只能新建会话。给目录「改名」的唯一手段是 `store.workspaces` 里的 `alias`（展示层映射）。
2. **会话改名只写 `SessionMeta.customTitle`，不要写回 `title`**。`title` 是 grok 的自动标题，会被下一次 `session_info_update` 冲掉。
3. **`updatedAt` 只表示「真有内容产出」**。`session/load` 重放、元数据类更新（session_info_update / available_commands_update / config_option_update）不得刷新它。实现靠 `store.suppressActivityUntil`（`beginSessionReload` 屏蔽 → `endSessionReload` 在 `finally` 中解屏蔽并留 1.2s 静默窗）。**改这块务必保留 finally 解屏蔽**，否则抛错后该会话永远不再刷新活动时间。排序另有确定性兜底键（组内 `updatedAt→createdAt→id`、分组 `latest→key`）。
4. **权限模式共 6 种**（ACP `session/set_mode`）：`default` / `auto` / `bypassPermissions` / `acceptEdits` / `dontAsk` / `plan`。选项定义在 `shared/types.ts` 的 `PERMISSION_MODE_OPTIONS`，store 字段 `permissionMode`（旧布尔 `autoApprove` 有 persist 迁移）。
   - **实时改是支持的，但对「已经弹出的那条」无效**（最常见的困惑）：`setPermissionMode`（service.ts:552）只发 `session/set_mode`，**完全不碰 `pendingPermissions`**。权限请求是请求-响应式，发出那一刻就已经决定要问了；切模式只影响**之后**的工具调用决策，**不会撤回已在等待批准的那条**。所以「切到完全访问了怎么还在弹」——那条弹窗是切换**之前**发出的，手动点掉即可，之后的调用就真的不弹了。
   - **另一条静默失效路径**：`Header` 切模式走 `void applyPermissionModeToSession(...)`（actions.ts:129），会话不在 `loadedSessions` 时整个函数**直接 return、静默不报错**（UI 照常显示新模式）。判据：会话正跑着（有流/有弹窗）就说明它已 loaded，不适用这条；真正的未 loaded 场景（刚重连、被 closeSession 卸载过）切模式确实会丢，此时**发一条消息**可触发补同步（actions.ts:266）。
11. **响应中允许继续发消息（排队语义）**（0.25.0 起，此前是禁用输入框）：输入框**不禁用**，agent 跑 turn 时仍可编辑和发送。语义由实测确定——ACP 会把后发的 `session/prompt` **串行排队、不报错**（见 `scripts/concurrent-prompt-probe.mjs`：并发第 2 条不返回 ERROR，但要等第 1 条跑完才响应）。UI 上 ■ 与 ➤ **同一位置互斥**：无草稿时显示 ■（`cancelCurrent`）；有输入/附图时变成 ➤（排队发送引导，并显示「已排队」提示行）；要立刻停须先清空输入让按钮变回 ■。
   - **⚠️ 关键坑：并发回合计数**。每条 `sendPrompt` 的 `finally` 都会 `setRunning(false)`，若不计数，**先完成的那条会把还在队列里的那条标记成「已结束」** → 界面提前显示生成完毕、输入框解锁，实际 agent 还在跑。已用 `actions.ts` 模块级 `activeTurns: Map<sessionId, number>` 解决：**只有计数归零才 `setRunning(false)`**。改这块务必保留计数，不要改回无条件 `setRunning(false)`。
   - **打断 vs 排队是两回事**：打断=立即 `cancel` 当前 turn（丢弃已生成内容）；排队=等当前 turn 跑完再处理（不丢内容）。用户要的是后者。
   - **⚠️ prompt 级别 vs tool 级别（两套独立状态，别混）**：`running` / `activeTurns` 计的是 **turn（一轮对话）**——你发消息→agent 回复完为止；`ToolCallCard` 上那个转圈计的是**单个工具调用**，一个 turn 里可以有几十个。所以「`session/prompt` 超时」出现后 turn 已结束、running=false、■ 消失，**但 agent 内部那个 tool 可能还在 in_progress**（典型：mcp server 没响应）。`session/cancel` 实测**只收尾 prompt（立即返回 `stopReason:cancelled`），停不掉已在跑的 tool**（见 `scripts/cancel-tool-probe.mjs`）——真要杀掉只能重启 agent 进程。
   - **❌ 别去补「tool 级别的 stop 按钮」（实测否决）**：prompt 已结束、只剩 tool 在跑的场景下，补按钮**无效且体验更差**——点了之后 prompt 确实收尾，但 agent **不会**补发 `tool_call_update`，实测 **cancel 后观察 60 秒，tool 状态始终 `in_progress` 不变**，UI 上那个卡片会永远转圈，用户点了 stop 却看不到任何变化。此场景 ACP 层面无解（要真结束那个 tool 只能**重启 agent 进程**或**新建会话**），但**界面**不该跟着永远转圈——0.25.1 起由下一条的客户端兜底收尾。
   - **✅ 客户端兜底已实现（0.25.1）**：新增工具状态 `interrupted`（`ToolStatus = AcpToolStatus | 'interrupted'`，**客户端本地态，agent 永远不会下发**），由 `store.markStuckTools(sessionId, reason?, onlyToolCallIds?)` 把非终态（`in_progress`/`pending`）的卡标成它，文案「已中断」+ 说明「回合已结束，客户端未收到该工具的返回结果」。**三个调用点**：① `sendPrompt` 的 `finally`（只在 `activeTurns` 归零时，避免误伤排队中的下一轮）；② `cancelCurrent` 点 ■ 后延迟 15s 扫描（**只清算中断那一刻在飞的那批 toolCallId**，应对 prompt 迟迟不返回、finally 迟迟不跑的情况；主进程单条 prompt 超时是 15 分钟）；③ 重放收尾 `finishSessionReplay`（**「重启客户端后某张卡一直『执行中』」的真正成因**：历史里未完成的调用属于上一个 agent 进程，新进程不会为它补发终态）。
     - **⚠️ 生成途中绝不无条件扫**：一个跑了 3 分钟的长命令会被误判。要扫必须传 `onlyToolCallIds`。
     - **自愈性**：真结果晚到会自动覆盖回 `completed`/`failed`（`upsertTool` 按 `toolCallId` 合并），所以兜底标记不会「锁死」真实状态。
     - **不刷 `updatedAt`**：这是界面纠偏不是新内容，刷了会让会话在侧栏凭空跳到最前（见约定 3）。
     - **文案刻意不写「失败」**：失败=agent 明确报错，中断=agent 压根没再说话，混在一起等于替 agent 编结论；样式上中断用 `--warn`、失败才用 `--err`。
   - **`bypassPermissions` 不等于「绝对不弹」**：deny 规则和 hook 仍生效（types.ts 659 行）。要排查时查 `~/.grok/sessions/<cwd>/permission.toml` 的 `disallowed_*` 段，以及 grok 的 hook 配置。
5. **安全边界**：渲染进程保持 `contextIsolation` 开启、`nodeIntegration` 关闭，只通过 preload 暴露白名单 API；外部链接仅允许 `http/https`。
6. **删除操作一律用 Python 直删**（`shutil.rmtree` / `os.remove`）。本环境 `rm` 会被 safe-delete 包装器接管移入回收站，且移动需独占句柄——若文件被 WorkBuddy 自己占用会直接失败。详见下方坑 7。
7. **`build/` 是脚本产物，不是手工资源**：`icon.ico` + `tray-*.png` + `taskbar-badge-*.png` 等由 `npm run gen:icons`（`scripts/gen-icons.mjs`）生成——白色标志是从设计稿描摹的轮廓多边形（`scripts/icon-outline.json`，even-odd 填充），圆角方底/配色/托盘 badge / 任务栏角标是脚本参数。确定性生成，两次运行字节一致；改外观 = 改 JSON 或参数后重跑，**不要手改二进制**。改了生成器忘重生成会被 `--check` 在构建期暴露。所有产物必须提交进仓库（dev 模式不走打包，直接读 `build/`）。重描轮廓的工具链：`.workbuddy/tmp/trace-outline.py`（依赖 venv 里的 pillow + opencv-python-headless，用法见脚本头注释）。
8. **托盘资源走 `build/` + extraResources，不走 src/assets**：`package.json` 的 `extraResources: ["build"]` 把整个 build/ 拷到 `resources/build/`。`src/main/tray.ts` 打包态读 `process.resourcesPath/build/`、开发态读项目 `build/`——与窗口图标 `iconPath()` 同一条通道。**不要学 PeerSync 把托盘图放 src/assets**：那要求源码不编译直接进 asar（PeerSync 用 `__dirname` 相对路径）；Grok Build 的 main 是编译产物（`out/**`），src 下的资源不会进包。托盘状态直接挂 `service.on('state')`（主进程是状态源头，无需 IPC 转发）。

## 已知坑（踩过的，别重踩）

1. **代理（最易踩）**：grok（Rust 侧）只读 `HTTP_PROXY` / `HTTPS_PROXY` 环境变量，**不读 Windows 系统代理设置**。境外端点 `cli-chat-proxy.grok.com` 必须靠环境变量走代理。桌面端在 spawn agent 时通过 `main/config.ts` 的 `proxyEnv()` 注入，配置存 `userData/config.json`。界面入口：左下角状态栏 → 环境自检 → 网络代理区。
2. **假 `env` 静默吞命令**：`C:\Users\fanji\.local\bin\env`（PATH 修复脚本，从不 exec）排在 `/usr/bin` 之前，`env -u ELECTRON_RUN_AS_NODE npm run pack` 会输出为空、exit 0、什么都没跑。**可靠写法：`unset ELECTRON_RUN_AS_NODE; npm run pack`**。配套教训：**空输出 + exit 0 ≠ 成功**，构建后必须 `stat -c '%y %n' out/main/index.js dist/win-unpacked/resources/app.asar` 验证 mtime 变化。
3. **打包时应用在运行会锁文件**：`dist/win-unpacked` 的 exe 与 app.asar 被占用时报 EnsureEmptyDir 失败。先关运行中的 `Grok Build Desktop.exe`（用 bash 的 `tasklist | grep -i grok` 确认，PowerShell 工具在本环境枚举不到进程、返回空且 exit 0，很误导）。
4. **robocopy 两个必须**：① 加 `MSYS_NO_PATHCONV=1`，否则 Git Bash 把 `/MIR` 转成 PortableGit 路径、exit=16 一个文件都不复制；② 显式加 `/R:3 /W:2`，默认 `/R:1000000 /W:30` 会在目标被占用时每 30 秒重试、表现为「挂住但不报错」。
5. **部署到 `app/` 绿版**：`npm run deploy`（= `pack` + `sync-app`）一键完成；或单独 `npm run sync-app` 只做同步。脚本 `scripts/sync-app.mjs` 会自动检测应用是否在运行（占用会导致拷贝失败）、创建 `app/resources/`、成对拷贝 `exe` + `app.asar` 并校验大小。**两个文件必须成对更新**（exe 内嵌 asar 的完整性哈希），缺一不可。手动等价命令（兜底）：`cp "dist/win-unpacked/Grok Build Desktop.exe" app/` + `cp "dist/win-unpacked/resources/app.asar" app/resources/`。验证：`grep -c "<新增文案>" app/resources/app.asar`。
6. **UI 自验**：真实 renderer 依赖 preload 注入的 `window.grok`，浏览器直接打开 `out/renderer/index.html` 只会看到「无法加载应用桥接层」。可行办法：静态假数据 HTML + 复用 `src/renderer/src/styles/global.css`，再用 Electron 离屏截图（`app.disableHardwareAcceleration()` + `--disable-gpu --no-sandbox` + `BrowserWindow({offscreen:true})` + `capturePage()`）。样例在 `.workbuddy/tmp/`。
7. **删除失败先查 WorkBuddy 自己**：删 `dist-v*` / `release` / `app/` 里的 app.asar 反复报「另一个程序正在使用此文件」，根因是 WorkBuddy 自己持有句柄，且 safe-delete 包装器的「移入回收站」动作需要独占句柄、失败后 fail-closed。解法：用 Python 直删（约定 6），或让用户在 WorkBuddy 未运行时删除。曾错误归因坚果云并强杀其进程造成同步中断——**不要为了验证错误假设去杀用户的其他进程**。
8. **首会话目录**：`App.tsx` 曾用 `homedir()` 预填 `store.cwd`，导致首个会话静默以用户主目录为根；Header 路径 chip 点选现在是「以所选目录新建会话」（`actions.ts` 的 `chooseWorkspace()`），chip 与默认目录不一致时另显示「新会话默认：X」。
9. **grok 权限弹窗相关**：ACP 客户端不会被 "Auto mode blocked" 拦掉（那只会发生在无法交互的 stdio 会话）；auto 模式行为见 `scripts/auto-mode-probe.mjs` 实证。
   - **否决是谁处理的**：客户端（`service.ts` 的 `handleIncomingRequest`）只转发 `session/request_permission` 并把用户选的 optionId 原样回传，**没有任何否决逻辑、不改会话状态**；把工具调用标记失败/取消、落盘、决定重试，全是 grok agent 干的。渲染层 `STATUS_LABEL` 只有「等待中/执行中/已完成/失败」四态，界面上出现的其它状态文案都是 agent 下发的。
   - **`session/request_permission` 不落盘**：会话目录的 `events.jsonl` / `updates.jsonl` 里搜不到 `request_permission`，也搜不到 denied/rejected —— 权限往返只在内存里走 ACP，**想从磁盘追查「谁点了拒绝」必然白费力气**。
   - **白名单在 `~/.grok/sessions/<cwd>/permission.toml`**（grok 私有维护，客户端不写）：用户点「允许，不再询问」后由 agent 自己把命令写进 `allowed_bash_commands`、工具写进 `allowed_mcp_tools`。「为什么这个工具每次都弹窗」的答案就在这里 —— 查它是否在白名单里。
10. **`.workbuddy/` 是项目数据目录，不是临时缓存，不要删。**

## 环境事实

- grok 可执行文件：`~/.grok/bin/grok.exe`
- 本机可用代理：SOCKS5 `127.0.0.1:10808`（v2rayN / Xray）
- `.npmrc` 只给 electron / electron-builder-binaries 配了 npmmirror；`registry` 仍指向官方 `registry.npmjs.org`，国内装包慢时可改 `https://registry.npmmirror.com/`
- 打包固定输出到 `dist/`（`package.json` 的 `build.directories.output`），不要手动指定 `dist-vN`
- git 分支 `main`；`.gitignore` 已忽略 `node_modules/ dist/ dist-v*/ app/ release/ out/ .workbuddy*/`
