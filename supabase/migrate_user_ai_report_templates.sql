-- 已有库增量：默认提示词独立配置表（不再依赖 user_ai_settings 列 default）
-- 在 Supabase SQL Editor 以 postgres 执行一次。

alter table public.user_ai_settings
  add column if not exists report_templates jsonb not null default '[]'::jsonb;

alter table public.user_ai_settings
  alter column global_prompt drop default;

alter table public.user_ai_settings
  alter column report_templates drop default;

create table if not exists public.ai_prompt_defaults (
  singleton text primary key default 'global' check (singleton = 'global'),
  global_prompt text not null,
  report_templates jsonb not null,
  updated_at timestamptz not null default now(),
  constraint ai_prompt_defaults_report_templates_is_array check (jsonb_typeof(report_templates) = 'array')
);

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'user_ai_settings_report_templates_is_array'
  ) then
    alter table public.user_ai_settings
      add constraint user_ai_settings_report_templates_is_array
      check (jsonb_typeof(report_templates) = 'array');
  end if;
end $$;

drop trigger if exists ai_prompt_defaults_set_updated_at on public.ai_prompt_defaults;
create trigger ai_prompt_defaults_set_updated_at
  before update on public.ai_prompt_defaults
  for each row execute procedure public.set_updated_at();

alter table public.ai_prompt_defaults enable row level security;

do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'ai_prompt_defaults'
      and policyname = 'ai_prompt_defaults_select_auth'
  ) then
    create policy "ai_prompt_defaults_select_auth"
      on public.ai_prompt_defaults for select to authenticated using (true);
  end if;
end $$;

insert into public.ai_prompt_defaults (singleton, global_prompt, report_templates) values (
  'global',
  $$你是 WorkSprout 工作台里的「任务录入与报告助手」。用户会粘贴一段口语化、邮件或聊天记录式的非结构化文字，你需要协助整理成可录入系统的任务信息；在报告场景下，你需要基于任务事实生成结构化汇报。
【通用原则】
读懂事实与诉求，不要编造用户没说的内容；不确定就写进 remark 并注明「待确认」。
输出风格专业、简洁，默认使用简体中文。
【任务录入字段建议】
title：一句话概括，尽量 8～20 个字，不用句号；突出「什么事」。
description：结构化写清：当前现象或问题，不要与 title 简单重复。
handling_notes：可执行的后续项：建议排查方向、需要对接的角色、风险或依赖、若有的时间节点；没有可执行项则填空字符串 ""。
submitter：任务的提交人，若无法判断则填空字符串 ""。
【任务类型与领域】
task_category_name 与 domain_name 必须与本次消息中给出的枚举列表中的某一条名称完全一致（逐字复制，含标点与空格），禁止自造、禁止同义词替换。
若信息不足无法判断，两个字段都填各自枚举列表中的第 1 条名称（系统会兜底，你仍应优先选最贴近原文的一项）。
【报告生成补充】
当用于报告生成时，请严格基于提供的任务样本与统计数据进行总结，不得杜撰；输出需分层清晰（概览、成果、风险、计划、待协同事项），并给出可执行建议。
【禁止】
不要在输出里解释你的推理过程；除 JSON（任务识别）或报告正文（报告生成）外不要输出其它无关内容。$$,
  $$[
    {"id":"work_summary","name":"工作汇报（管理视角）","prompt":"请输出结构化工作汇报，包含：一、总体概览；二、重点成果（按项目）；三、风险与阻塞；四、下阶段计划；五、需协同事项。语言简洁，适合周会/复盘会。"},
    {"id":"service_report","name":"服务报告（客户视角）","prompt":"请输出服务报告，包含：一、服务范围与时间窗口；二、事项处理明细与结果；三、SLA/时效观察；四、遗留问题与改进建议；五、下周期服务计划。语气专业、可对外发送。"}
  ]$$::jsonb
)
on conflict (singleton) do update set
  global_prompt = excluded.global_prompt,
  report_templates = excluded.report_templates;

update public.user_ai_settings u
set global_prompt = d.global_prompt
from public.ai_prompt_defaults d
where d.singleton = 'global' and trim(coalesce(u.global_prompt, '')) = '';

update public.user_ai_settings u
set report_templates = d.report_templates
from public.ai_prompt_defaults d
where d.singleton = 'global' and coalesce(jsonb_array_length(u.report_templates), 0) = 0;
