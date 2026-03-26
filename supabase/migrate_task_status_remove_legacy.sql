-- =============================================================================
-- 将任务状态从 5 态缩为 3 态：去掉「阻塞」「待验收」
-- 适用：已按旧版 schema 建库、枚举仍为 5 个值的 Supabase 项目。
-- 在 SQL Editor 中整段执行（建议先备份）。新库请直接跑最新 schema.sql，无需本脚本。
-- =============================================================================

begin;

-- 1. 数据归并到「进行中」
update public.tasks
set status = '进行中'::public.task_status
where status::text in ('阻塞', '待验收');

-- 2. 去掉状态目录表（其 code 列依赖旧枚举，需随类型一起重建）
drop table if exists public.task_status_options;

-- 3. 用新枚举替换列类型
create type public.task_status_new as enum (
  '待办',
  '进行中',
  '已完成'
);

alter table public.tasks
  alter column status drop default;

alter table public.tasks
  alter column status type public.task_status_new using (
    case status::text
      when '待办' then '待办'::public.task_status_new
      when '进行中' then '进行中'::public.task_status_new
      when '已完成' then '已完成'::public.task_status_new
      else '进行中'::public.task_status_new
    end
  );

alter table public.tasks
  alter column status set default '待办'::public.task_status_new;

drop type public.task_status;
alter type public.task_status_new rename to task_status;

-- 4. 重建目录表与策略（与 schema.sql 一致）
create table public.task_status_options (
  code public.task_status primary key,
  sort_order int not null,
  label text not null
);

create index task_status_options_sort_idx on public.task_status_options (sort_order);

alter table public.task_status_options enable row level security;

create policy "task_status_options_select_auth"
  on public.task_status_options for select to authenticated using (true);

insert into public.task_status_options (code, sort_order, label) values
  ('待办', 1, '待办'),
  ('进行中', 2, '进行中'),
  ('已完成', 3, '已完成');

commit;
