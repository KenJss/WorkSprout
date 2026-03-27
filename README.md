# WorkSprout

基于 **Next.js** 与 **Supabase** 的任务与报表工作台：任务看板、报表导出、分类与领域、大模型 API 设置，以及需密码解锁的「全局配置」。

## 环境要求

- Node.js 20+（建议与本地开发环境一致）
- 一个 [Supabase](https://supabase.com) 项目（或自建兼容 Postgres + Auth 的环境）

## 快速开始

### 1. 安装依赖

```bash
npm install
```

### 2. 配置环境变量

复制示例文件并编辑：

```bash
cp .env.example .env.local
```

变量说明见仓库根目录 [`.env.example`](./.env.example)。至少需要配置：

| 变量 | 说明 |
|------|------|
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase 项目 URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | 匿名（anon）公钥，用于浏览器与中间件会话 |
| `SUPABASE_SERVICE_ROLE_KEY` | 服务端密钥；**保存全局配置**等接口会用到，勿提交、勿暴露到前端 |

可选：`GLOBAL_CONFIG_PASSWORD` — 未设置时，全局配置页默认解锁密码为 `admin`（生产环境请务必修改）。

### 3. 初始化数据库

在 Supabase **SQL Editor** 中执行：

1. [`supabase/schema.sql`](./supabase/schema.sql) — 完整建表（会删除同名表，仅建议在空库或可清空库使用）
2. 若从旧结构升级，按需执行 `supabase/migrate_*.sql`（按文件名与业务顺序执行）

### 4. 本地开发

```bash
npm run dev
```

浏览器打开 [http://localhost:3000](http://localhost:3000)。未登录会话会跳转至 `/login`，使用 Supabase 中已创建的用户登录。

### 5. 生产构建

```bash
npm run build
npm run start
```

部署到 Vercel 等平台时，在控制台配置与 `.env.local` 相同含义的环境变量（含 `SUPABASE_SERVICE_ROLE_KEY` 若需使用全局配置保存能力）。

## 功能概览

- **任务**：创建与维护任务，关联项目、分类、领域与状态。
- **报表**：按条件查询与导出。
- **设置 → 分类与领域**：维护个人分类/领域；全局项由数据库 `scope = 'global'` 维护，应用内只读。详见 [`docs/config-scope.md`](./docs/config-scope.md)。
- **设置 → 大模型 API**：用户级 AI 相关配置与连通性测试。
- **设置 → 全局配置**：需先输入密码解锁（Cookie 会话）；写入依赖服务角色密钥。详见 [`lib/global-config-auth.ts`](./lib/global-config-auth.ts) 中的密码逻辑。

状态等业务取值说明见 [`docs/status-values.md`](./docs/status-values.md)。

## 代码规范

见仓库内 [`AGENTS.md`](./AGENTS.md)（含 Next.js 版本相关说明）。

## 仓库

<https://github.com/KenJss/WorkSprout>
