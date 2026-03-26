-- =============================================================================
-- 状态目录表 INSERT（与 public.project_status / public.task_status 枚举一致）
-- 在已有表与枚举的前提下可单独执行；可重复执行（UPSERT）。
-- =============================================================================

insert into public.project_status_options (code, sort_order, label) values
  ('待开始', 1, '待开始'),
  ('进行中', 2, '进行中'),
  ('暂停', 3, '暂停'),
  ('已结束', 4, '已结束'),
  ('已取消', 5, '已取消')
on conflict (code) do update set
  sort_order = excluded.sort_order,
  label = excluded.label;

insert into public.task_status_options (code, sort_order, label) values
  ('待办', 1, '待办'),
  ('进行中', 2, '进行中'),
  ('已完成', 3, '已完成')
on conflict (code) do update set
  sort_order = excluded.sort_order,
  label = excluded.label;
