# 测试约定

| 目录 | 用途 | 约束 |
|---|---|---|
| `tests/unit` | 纯函数、状态机、计时与构造器 | 不访问真实网络或持久化存储 |
| `tests/integration` | IndexedDB、Repository、迁移与模块协作 | 使用 `fake-indexeddb`，每个用例后自动清理 |
| `tests/contract` | Transport 与跨模块契约 | 使用可控替身，不连接真实服务端 |
| `tests/fixtures` | 契约对齐的共享 Fixture 与构造器 | 默认数据确定；业务场景通过 overrides 明确差异 |
| `tests/support` | 可控时钟、顺序 ID、网络替身和存储清理 | 不包含业务断言 |

## 验证命令

| 命令 | 用途 |
|---|---|
| `pnpm test` | 单次运行全部 Vitest 测试 |
| `pnpm test:watch` | 本地开发时监听相关测试 |
| `pnpm test:unit` | 仅运行单元测试 |
| `pnpm test:integration` | 仅运行 IndexedDB 等集成测试 |
| `pnpm typecheck:test` | 检查生产代码、测试支持与测试用例类型 |
| `pnpm lint` | 检查生产代码和测试代码规范 |

测试入口默认加载 `tests/setup.ts`，将浏览器 IndexedDB 替换为内存实现，并在每个用例后关闭 Forge 数据库单例、删除已创建的数据库。测试自行创建额外数据库连接时，应在用例结束前关闭连接。需要可重复时间、ID 或网络状态时，应显式创建 `ManualClock`、`SequenceIdGenerator` 或 `NetworkStateStub`，避免依赖系统时钟、随机 UUID 和真实网络事件。
