# 状态字段约定（研发场景）

**数据库枚举与 API 存库值均为中文**（与 `types/index.ts`、`supabase/schema.sql` 一致）。

## 项目 `projects.status`（`project_status`）

| 存库值 |
|--------|
| 待开始 |
| 进行中 |
| 暂停 |
| 已结束 |
| 已取消 |

## 任务 `tasks.status`（`task_status`）

| 存库值 |
|--------|
| 待办 |
| 进行中 |
| 已完成 |

说明：项目与任务里都有「进行中」，分属两个不同的 PostgreSQL 枚举类型，互不冲突。  
历史数据若曾为「阻塞」「待验收」，迁移时请统一改为「进行中」等有效枚举值（见 `supabase/migrate_task_status_remove_legacy.sql`）。

前端仍会将历史英文值（如 `not_started`、`todo`、`done` 等）归一化为上表中文值，便于迁移旧数据。

## 状态目录表（可选，用于排序/展示）

与枚举值一一对应，可在 Supabase 中维护 `label`、`sort_order`：

- `project_status_options`（主键 `code` → `project_status`）
- `task_status_options`（主键 `code` → `task_status`）

初始化数据见 **`supabase/schema.sql`** 文末 `INSERT`，或单独执行 **`supabase/seed_status_options.sql`**（可重复执行，UPSERT）。
