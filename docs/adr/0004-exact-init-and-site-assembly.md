# ADR 0004: 唯一 INIT 契约与站点级事务装配

- 状态：Accepted
- 日期：2026-08-01

## 决策

Host bridge 只接受没有预设 `src`/`srcdoc` 的 iframe，并先注册 handshake listener，再设置属于 `HostContext.baseUrl` 的严格相对 entry URL。Guest 加载后只发送严格的 `gameyard:ready-for-init`，其中包含协议、游戏 ID 与站点 build ID，不包含实例 ID。Hub 精确校验发送窗口、同源 origin 和身份后，只发送一次 `gameyard:init`，在完整 `HostContext` 中分配实例 ID，并同时转移唯一 `MessagePort`。Guest 校验 context 后必须完成显式 `initialize(bridge)`，然后才在 port 上发送 `ready` 并开始接收命令；初始化失败或超时会终止 port 和已登记资源，不存在“transport ready 但游戏尚未启动”的状态。后续业务消息只走该 port。不存在旧 hello/connect、版本协商、bridge 外导航或替代初始化路径。

暂停策略属于 Hub。游戏内暂停与恢复控件只发送严格的 `lifecycle.changeRequest`；Hub 将其串行化为需要 ACK 的 `lifecycle.pause` 或 `lifecycle.resume` 命令。Guest 不直接建立第二套可见性或暂停状态源。

每次生产构建使用内容派生的 `gameyard@<16 lowercase hex>` 站点 build ID。Hub 和配置中的每个游戏先写入互斥 stage；游戏必须提供严格 `game.manifest.json`，并在 `site.assembly.json` 中显式声明 ID、stage 和参与 build ID 的源码输入。`games/` 输出命名空间只属于 assembler。Assembler 验证完整声明、相同 build ID、入口、路径、碰撞、相对 URL 与 Service Worker 禁令后，通过同卷临时目录和备份恢复替换 `dist`。验证失败时既有 `dist` 保持不变；新 artifact 已安装后若旧 backup 清理失败，保留新 artifact 和可见的残余 backup，不回滚到可能已部分删除的旧目录。

## 原因

实例 ID 只有 Host 能分配，把它放在 Guest 的第一条消息会形成启动循环。站点级 build ID 与白名单装配让 Hub、game 和 metadata 成为一个可证明的一致 artifact，并阻止陈旧 stage、遗漏文件和跨包并行写 `dist`。

## 后果

协议、build ID、manifest 或配置不匹配会立即可见失败。新增游戏必须先声明生产输入、输出独立 stage，并通过同一 assembler；不得直接写最终 `dist`。清单和 INIT 的破坏性变更需要新的协议/清单版本与 ADR，不以 alias、默认值或兼容 shim 隐藏。
