# 分类与领域（全局 / 用户）

## 数据模型

`project_categories`、`task_categories`、`task_domains` 均包含：

- `scope`: `'global' | 'user'`
- `user_id`: 全局项为 `NULL`，用户项为 `auth.users.id`

## 权限（RLS）

| scope   | SELECT（已登录） | INSERT/UPDATE/DELETE（应用） |
|--------|------------------|-------------------------------|
| global | ✅               | ❌（仅能在 Supabase SQL Editor 以 postgres 维护） |
| user   | ✅ 本人          | ✅ 本人                       |

## 应用入口

- 工作台右上角 **「分类与领域」** → `/settings/configuration`
- 任务表单内链到同一页

## 任务字段

- `title`：标题（看板卡片主文案）
- `description`：问题描述
- `handling_notes`：处理说明（可空）
- `domain_id`、`category_id`：必选，引用 `task_domains` / `task_categories`（默认选列表首项，一般为全局项）
- `start_at`：默认当天；`end_at` 仅在状态为「已完成」时可填，改为已完成时默认当天

## 展示列

默认 `task_display_fields.display_fields` 含：`title`、`description`、`status`、`domain_id`、`handling_notes`、日期与任务分类等。看板卡片固定展示：标题、领域、分类、状态、开始时间（不受该列表驱动）。

## 旧库迁移

若从更早版本升级，需自行在 SQL 中：

1. 为三张分类/领域表增加 `scope` / `user_id` 并回填 `scope='global'`
2. 任务表：保留或新增 `title`；`description` / `handling_notes` / `domain_id` / `category_id` 按最新 `schema.sql` 约束；`projects.category_id` 与任务的 `domain_id`、`category_id` 改为非空前需先为每行填有效外键

最简单方式：可清空数据后执行最新 `supabase/schema.sql`。
