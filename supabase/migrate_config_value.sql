-- 已有库增量：项目分类 / 任务分类 / 领域 增加 value（排序键，按字符串比较）
-- 在 Supabase SQL Editor 以 postgres 执行一次。

alter table public.project_categories add column if not exists value text not null default '';
alter table public.task_categories add column if not exists value text not null default '';
alter table public.task_domains add column if not exists value text not null default '';

-- 历史行 value 为空时回填为名称，下拉顺序与原先按 name 接近
update public.project_categories set value = name where trim(value) = '';
update public.task_categories set value = name where trim(value) = '';
update public.task_domains set value = name where trim(value) = '';
