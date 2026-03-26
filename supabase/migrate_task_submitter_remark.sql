-- 已有库增量：tasks 增加提交人与备注（均为可选）
-- 在 Supabase SQL Editor 以 postgres 执行一次。

alter table public.tasks add column if not exists submitter text;
alter table public.tasks add column if not exists remark text;
