/** 项目阶段（研发场景：5 态，与 DB 枚举 project_status 一致，存中文） */
export type ProjectStatus = "待开始" | "进行中" | "暂停" | "已结束" | "已取消";

/** 任务执行状态（与 DB task_status 枚举一致，中文存库） */
export type TaskStatus = "待办" | "进行中" | "已完成";

/** 配置项作用域：全局仅 SQL 可改；user 为当前用户自建 */
export type ConfigScope = "global" | "user";

export type NamedConfigRow = {
  id: string;
  name: string;
  /** 排序用键（字符串比较，可用前导零如 01、02） */
  value: string;
  scope: ConfigScope;
  user_id: string | null;
};

export type Project = {
  id: string;
  parent_id: string | null;
  name: string;
  category_id: string;
  start_at: string | null;
  end_at: string | null;
  status: ProjectStatus;
};

/** 任务分类（全局 + 用户合并展示） */
export type TaskCategory = {
  id: string;
  name: string;
  value: string;
  scope?: ConfigScope;
  user_id?: string | null;
};

export type TaskDomain = {
  id: string;
  name: string;
  value: string;
  scope?: ConfigScope;
  user_id?: string | null;
};

export type TaskFieldInputType =
  | "text"
  | "number"
  | "date"
  | "datetime-local"
  | "textarea"
  | "email"
  | "url"
  | "tel"
  | string;

export type TaskFieldDefinition = {
  id?: string;
  key: string;
  label: string;
  input_type: TaskFieldInputType;
  placeholder?: string | null;
  pattern?: string | null;
  min?: string | null;
  max?: string | null;
  step?: string | null;
  sort_order?: number | null;
};

export type TaskCustomAttributes = Record<string, string>;

/** 任务：标题、问题描述、处理说明、领域、分类必选 */
export type Task = {
  id: string;
  project_id: string;
  title: string;
  description: string;
  handling_notes: string | null;
  submitter: string | null;
  remark: string | null;
  domain_id: string;
  category_id: string;
  status: TaskStatus;
  start_at: string | null;
  end_at: string | null;
  custom_attributes: TaskCustomAttributes | null;
  created_at: string;
};

export type ReportTemplate = {
  id: string;
  name: string;
  prompt: string;
};
