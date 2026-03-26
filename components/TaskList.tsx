"use client";

import * as Dialog from "@radix-ui/react-dialog";
import { useCallback, useEffect, useMemo, useState } from "react";
import { ChevronDown, ChevronRight, Pencil, Plus, RefreshCw, Trash2 } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";

import { supabase } from "@/lib/supabase/client";
import { fetchMergedConfigRows } from "@/lib/supabase/merged-config";
import type {
  Project,
  ProjectStatus,
  Task,
  TaskCategory,
  TaskDomain,
  TaskFieldDefinition,
  TaskStatus,
} from "@/types";
import { TaskForm } from "@/components/TaskForm";
import { ProjectDialog, type ProjectCategoryRow } from "@/components/ProjectDialog";

/** 任务看板列顺序（与 DB task_status 枚举一致，中文存库） */
const TASK_STATUSES: TaskStatus[] = ["待办", "进行中", "已完成"];

const taskStatusLabel: Record<TaskStatus, string> = {
  待办: "待办",
  进行中: "进行中",
  已完成: "已完成",
};

/** 看板列：待办 / 进行中 / 已完成 分区配色 */
const taskBoardColumnTheme: Record<
  TaskStatus,
  { shell: string; heading: string; countBadge: string; emptyBox: string; cardSelect: string }
> = {
  待办: {
    shell:
      "rounded-2xl border border-slate-200/90 bg-gradient-to-b from-slate-50 to-slate-100/85 p-3 shadow-sm shadow-slate-900/5",
    heading: "text-slate-800",
    countBadge: "bg-white/95 text-slate-600 shadow-sm ring-1 ring-slate-200/80",
    emptyBox: "border-dashed border-slate-300/90 bg-white/50 text-slate-500",
    cardSelect:
      "border-0 bg-white/95 text-slate-700 shadow-sm ring-1 ring-slate-200/75 hover:bg-white focus-visible:ring-2 focus-visible:ring-slate-400/40",
  },
  进行中: {
    shell:
      "rounded-2xl border border-amber-200/90 bg-gradient-to-b from-amber-50/95 to-orange-50/70 p-3 shadow-sm shadow-amber-900/5",
    heading: "text-amber-950",
    countBadge: "bg-white/95 text-amber-900 shadow-sm ring-1 ring-amber-200/80",
    emptyBox: "border-dashed border-amber-300/80 bg-white/55 text-amber-900/65",
    cardSelect:
      "border-0 bg-white/95 text-amber-950 shadow-sm ring-1 ring-amber-200/75 hover:bg-white focus-visible:ring-2 focus-visible:ring-amber-400/45",
  },
  已完成: {
    shell:
      "rounded-2xl border border-emerald-200/90 bg-gradient-to-b from-emerald-50/95 to-teal-50/65 p-3 shadow-sm shadow-emerald-900/5",
    heading: "text-emerald-950",
    countBadge: "bg-white/95 text-emerald-900 shadow-sm ring-1 ring-emerald-200/80",
    emptyBox: "border-dashed border-emerald-300/80 bg-white/55 text-emerald-900/65",
    cardSelect:
      "border-0 bg-white/95 text-emerald-950 shadow-sm ring-1 ring-emerald-200/75 hover:bg-white focus-visible:ring-2 focus-visible:ring-emerald-400/45",
  },
};

/** 卡片标签：类型 / 领域 / 日期 分色 */
const taskCardTagChipClass = [
  "inline-flex max-w-full items-center truncate rounded-lg bg-violet-100 px-2 py-0.5 text-[11px] font-semibold text-violet-900 ring-1 ring-violet-200/90",
  "inline-flex max-w-full items-center truncate rounded-lg bg-sky-100 px-2 py-0.5 text-[11px] font-semibold text-sky-900 ring-1 ring-sky-200/90",
  "inline-flex max-w-full items-center truncate rounded-lg bg-amber-100 px-2 py-0.5 text-[11px] font-semibold text-amber-950 ring-1 ring-amber-200/90",
  "inline-flex max-w-full items-center truncate rounded-lg bg-emerald-100 px-2 py-0.5 text-[11px] font-semibold text-emerald-900 ring-1 ring-emerald-200/90",
] as const;

const ALL_PROJECTS_ID = "__all_projects__";

const projectStatusLabelMap: Record<ProjectStatus, string> = {
  待开始: "待开始",
  进行中: "进行中",
  暂停: "暂停",
  已结束: "已结束",
  已取消: "已取消",
};

function normalizeProjectStatus(raw: unknown): ProjectStatus {
  const v = String(raw ?? "").trim();
  const lower = v.toLowerCase();

  if (v === "待开始" || lower === "not_started" || lower === "not-started" || lower === "pending_start") {
    return "待开始";
  }
  if (v === "进行中" || lower === "in_progress" || lower === "inprogress") return "进行中";
  if (v === "暂停" || lower === "paused" || lower === "suspended" || lower === "hold") return "暂停";
  if (v === "已结束" || lower === "ended" || lower === "completed" || lower === "finished" || lower === "done") {
    return "已结束";
  }
  if (v === "已取消" || lower === "cancelled" || lower === "canceled") return "已取消";

  return "待开始";
}

function projectStatusLabel(project: Project) {
  if (project.status) return projectStatusLabelMap[project.status];

  // Fallback: if status isn't available, derive from start/end.
  if (!project.start_at && !project.end_at) return "未开始";
  const now = Date.now();
  const start = project.start_at ? new Date(project.start_at).getTime() : null;
  const end = project.end_at ? new Date(project.end_at).getTime() : null;

  if (start !== null && now < start) return "待开始";
  if (end !== null && now > end) return "已结束";
  return "进行中";
}

function formatDate(value: string | null) {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  return d.toLocaleDateString();
}

function toTime(value: string | null | undefined) {
  if (!value) return 0;
  const n = new Date(value).getTime();
  return Number.isNaN(n) ? 0 : n;
}

function todayLocalISODate() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function normalizeTaskStatus(raw: unknown): TaskStatus {
  const v = String(raw ?? "").trim();
  const lower = v.toLowerCase();

  // 中文存库值
  if (v === "待办") return "待办";
  if (v === "进行中") return "进行中";
  if (v === "已完成") return "已完成";
  // 已废弃状态：并入「进行中」展示与编辑
  if (v === "阻塞" || v === "待验收") return "进行中";

  // 历史英文值兼容
  if (lower === "todo" || lower === "backlog" || lower === "not_started" || lower === "not-started") {
    return "待办";
  }
  if (lower === "in_progress" || lower === "inprogress") return "进行中";
  if (lower === "blocked" || lower === "block") return "进行中";
  if (
    lower === "pending_review" ||
    lower === "pending-review" ||
    lower === "awaiting_review" ||
    lower === "review"
  ) {
    return "进行中";
  }
  if (lower === "done" || lower === "completed" || lower === "ended" || lower === "end") return "已完成";

  return "待办";
}

export function TaskList() {
  const router = useRouter();

  const [projects, setProjects] = useState<Project[]>([]);
  const [projectsLoading, setProjectsLoading] = useState(true);
  const [projectsError, setProjectsError] = useState<string | null>(null);

  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(null);

  const [taskCategories, setTaskCategories] = useState<TaskCategory[]>([]);
  const [taskDomains, setTaskDomains] = useState<TaskDomain[]>([]);
  const [projectCategories, setProjectCategories] = useState<ProjectCategoryRow[]>([]);
  const [fieldDefinitions, setFieldDefinitions] = useState<TaskFieldDefinition[]>([]);

  const [tasks, setTasks] = useState<Task[]>([]);
  // 初始必须为 false：若无选中项目则不会触发 refreshTasksForProject，否则 tasksLoading 永远为 true，顶部按钮会一直被禁用。
  const [tasksLoading, setTasksLoading] = useState(false);
  const [tasksError, setTasksError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const [formOpen, setFormOpen] = useState(false);
  const [formMode, setFormMode] = useState<"create" | "edit">("create");
  const [editingTask, setEditingTask] = useState<Task | null>(null);
  const [formProjectId, setFormProjectId] = useState<string | null>(null);
  const [aiParseAvailable, setAiParseAvailable] = useState(false);

  const [topError, setTopError] = useState<string | null>(null);
  const [projectDialogOpen, setProjectDialogOpen] = useState(false);
  const [projectDialogMode, setProjectDialogMode] = useState<"create" | "edit">("create");
  const [projectDialogEditing, setProjectDialogEditing] = useState<Project | null>(null);
  const [expandedProjectIds, setExpandedProjectIds] = useState<Record<string, boolean>>({});

  const [completeDialogOpen, setCompleteDialogOpen] = useState(false);
  const [completeDialogTaskId, setCompleteDialogTaskId] = useState<string | null>(null);
  const [completeDialogNotes, setCompleteDialogNotes] = useState("");
  const [completeDialogError, setCompleteDialogError] = useState<string | null>(null);
  const [completeDialogSubmitting, setCompleteDialogSubmitting] = useState(false);

  const categoryNameById = useMemo(() => {
    const map = new Map<string, string>();
    for (const c of taskCategories) map.set(c.id, c.name);
    return map;
  }, [taskCategories]);

  const taskCategoryName = (categoryId: string | null) => {
    if (!categoryId) return "未分类";
    return categoryNameById.get(categoryId) ?? "未分类";
  };

  const domainNameById = useMemo(() => {
    const map = new Map(taskDomains.map((d) => [d.id, d.name]));
    return (domainId: string) => map.get(domainId) ?? "—";
  }, [taskDomains]);

  const projectCategoryNameById = useMemo(() => {
    const map = new Map(projectCategories.map((c) => [c.id, c.name]));
    return (categoryId: string) => map.get(categoryId) ?? "—";
  }, [projectCategories]);

  const projectChildrenMap = useMemo(() => {
    const map = new Map<string | null, Project[]>();
    for (const p of projects) {
      const key = p.parent_id;
      const arr = map.get(key) ?? [];
      arr.push(p);
      map.set(key, arr);
    }
    // stable ordering by start_at desc then name
    for (const [k, arr] of map) {
      arr.sort((a, b) => {
        const byStart = toTime(b.start_at) - toTime(a.start_at);
        if (byStart !== 0) return byStart;
        return a.name.localeCompare(b.name);
      });
      map.set(k, arr);
    }
    return map;
  }, [projects]);

  const leafProjectIds = useMemo(() => {
    const childrenExists = new Set<string>();
    for (const p of projects) {
      if (p.parent_id) childrenExists.add(p.parent_id);
    }
    const leafs = new Set<string>();
    for (const p of projects) {
      if (!childrenExists.has(p.id)) leafs.add(p.id);
    }
    return leafs;
  }, [projects]);

  const descendantProjectIdsById = useMemo(() => {
    const map = new Map<string, string[]>();
    const dfs = (id: string): string[] => {
      if (map.has(id)) return map.get(id)!;
      const children = projectChildrenMap.get(id) ?? [];
      const acc = [id];
      for (const c of children) acc.push(...dfs(c.id));
      map.set(id, acc);
      return acc;
    };
    for (const p of projects) dfs(p.id);
    return map;
  }, [projectChildrenMap, projects]);

  const projectPathById = useMemo(() => {
    const byId = new Map(projects.map((p) => [p.id, p]));
    const memo = new Map<string, string>();
    const buildPath = (id: string): string => {
      if (memo.has(id)) return memo.get(id)!;
      const p = byId.get(id);
      if (!p) return "—";
      if (!p.parent_id) {
        memo.set(id, p.name);
        return p.name;
      }
      const path = `${buildPath(p.parent_id)} / ${p.name}`;
      memo.set(id, path);
      return path;
    };
    for (const p of projects) buildPath(p.id);
    return memo;
  }, [projects]);

  const selectedProject = useMemo(() => {
    if (!selectedProjectId) return null;
    return projects.find((p) => p.id === selectedProjectId) ?? null;
  }, [projects, selectedProjectId]);

  const selectedProjectIsLeaf = useMemo(() => {
    if (!selectedProjectId) return false;
    return leafProjectIds.has(selectedProjectId);
  }, [leafProjectIds, selectedProjectId]);

  const grouped = useMemo(() => {
    const groups: Record<TaskStatus, Task[]> = {
      待办: [],
      进行中: [],
      已完成: [],
    };
    for (const t of tasks) groups[t.status].push(t);
    for (const key of TASK_STATUSES) {
      groups[key].sort((a, b) => {
        const byStart = toTime(b.start_at) - toTime(a.start_at);
        if (byStart !== 0) return byStart;
        return toTime(b.created_at) - toTime(a.created_at);
      });
    }
    return groups;
  }, [tasks]);

  useEffect(() => {
    if (!formOpen) return;
    let cancelled = false;
    void (async () => {
      try {
        const r = await fetch("/api/ai/settings", { credentials: "include" });
        if (!r.ok || cancelled) return;
        const d = (await r.json()) as { can_use_ai?: boolean };
        if (!cancelled) setAiParseAvailable(!!d.can_use_ai);
      } catch {
        if (!cancelled) setAiParseAvailable(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [formOpen]);

  const reloadProjectList = useCallback(
    async (opts?: { selectId?: string | null }) => {
      try {
        const { data: userData, error: userError } = await supabase.auth.getUser();
        if (userError || !userData.user) {
          router.replace("/login");
          return;
        }
        const projectSelect = "id,parent_id,name,category_id,start_at,end_at,status";
        const { data: projectsData, error: projectsErr } = await supabase
          .from("projects")
          .select(projectSelect)
          .order("name");
        if (projectsErr) throw projectsErr;
        const nextProjects = (projectsData ?? []) as Record<string, unknown>[];
        const parsedProjects: Project[] = nextProjects.map((p) => ({
          id: String(p.id),
          parent_id: p.parent_id ? String(p.parent_id) : null,
          name: String(p.name ?? ""),
          category_id: String(p.category_id ?? ""),
          start_at: typeof p.start_at === "string" ? p.start_at : null,
          end_at: typeof p.end_at === "string" ? p.end_at : null,
          status: normalizeProjectStatus(p.status),
        }));
        setProjects(parsedProjects);
        setExpandedProjectIds((prev) => {
          const next: Record<string, boolean> = {};
          for (const p of parsedProjects) {
            next[p.id] = p.id in prev ? prev[p.id] : true;
          }
          return next;
        });
        const selectId = opts?.selectId;
        if (selectId && parsedProjects.some((p) => p.id === selectId)) {
          setSelectedProjectId(selectId);
        } else {
          const parentIds = new Set<string>();
          for (const p of parsedProjects) {
            if (p.parent_id) parentIds.add(p.parent_id);
          }
          const leafs = parsedProjects
            .filter((p) => !parentIds.has(p.id))
            .sort((a, b) => a.name.localeCompare(b.name));
          setSelectedProjectId(ALL_PROJECTS_ID);
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : "刷新项目列表失败。";
        setProjectsError(message);
        setTopError(message);
      }
    },
    [router]
  );

  useEffect(() => {
    let cancelled = false;

    async function loadInitial() {
      setProjectsLoading(true);
      setProjectsError(null);
      setTopError(null);

      try {
        const { data: userData, error: userError } = await supabase.auth.getUser();
        if (userError || !userData.user) {
          router.replace("/login");
          return;
        }

        // Load projects（全局，不按用户）
        const projectSelect = "id,parent_id,name,category_id,start_at,end_at,status";
        const { data: projectsData, error: projectsErr } = await supabase
          .from("projects")
          .select(projectSelect)
          .order("name");
        if (projectsErr) throw projectsErr;
        const nextProjects = (projectsData ?? []) as Record<string, unknown>[];

        const parsedProjects: Project[] = nextProjects.map((p) => ({
          id: String(p.id),
          parent_id: p.parent_id ? String(p.parent_id) : null,
          name: String(p.name ?? ""),
          category_id: String(p.category_id ?? ""),
          start_at: typeof p.start_at === "string" ? p.start_at : null,
          end_at: typeof p.end_at === "string" ? p.end_at : null,
          status: normalizeProjectStatus(p.status),
        }));

        if (cancelled) return;
        setProjects(parsedProjects);
        setExpandedProjectIds((prev) => {
          const next: Record<string, boolean> = {};
          for (const p of parsedProjects) {
            next[p.id] = p.id in prev ? prev[p.id] : true;
          }
          return next;
        });

        // Default selected project: first leaf by alphabetical order.
        const parentIds = new Set<string>();
        for (const p of parsedProjects) {
          if (p.parent_id) parentIds.add(p.parent_id);
        }
        const leafs = parsedProjects
          .filter((p) => !parentIds.has(p.id))
          .sort((a, b) => a.name.localeCompare(b.name));
        setSelectedProjectId(ALL_PROJECTS_ID);

        const userId = userData.user.id;

        // 任务分类：全局 + 当前用户
        const mergedTaskCats = await fetchMergedConfigRows<TaskCategory>(
          supabase,
          "task_categories",
          userId
        );
        if (!cancelled) {
          setTaskCategories(
            mergedTaskCats.map((c) => ({
              id: String(c.id),
              name: String(c.name ?? ""),
              value: String(c.value ?? ""),
            }))
          );
        }

        // 项目分类：全局 + 当前用户
        const mergedProjCats = await fetchMergedConfigRows<ProjectCategoryRow>(
          supabase,
          "project_categories",
          userId
        );
        if (!cancelled) {
          setProjectCategories(
            mergedProjCats.map((c) => ({
              id: String(c.id),
              name: String(c.name ?? ""),
              value: String(c.value ?? ""),
            }))
          );
        }

        // 领域：全局 + 当前用户
        const mergedDomains = await fetchMergedConfigRows<TaskDomain>(supabase, "task_domains", userId);
        if (!cancelled) {
          setTaskDomains(
            mergedDomains.map((d) => ({
              id: String(d.id),
              name: String(d.name ?? ""),
              value: String(d.value ?? ""),
            }))
          );
        }

        // Load field definitions（全局）
        const { data: defsData } = await supabase
          .from("task_field_definitions")
          .select("id,key,label,input_type,placeholder,pattern,min,max,step,sort_order")
          .order("sort_order", { ascending: true });
        if (!cancelled) {
          setFieldDefinitions(
            ((defsData ?? []) as Record<string, unknown>[]).map((d) => ({
              id: d.id ? String(d.id) : undefined,
              key: String(d.key ?? ""),
              label: String(d.label ?? d.key ?? ""),
              input_type: (d.input_type ?? "text") as TaskFieldDefinition["input_type"],
              placeholder: typeof d.placeholder === "string" ? d.placeholder : null,
              pattern: typeof d.pattern === "string" ? d.pattern : null,
              min: typeof d.min === "string" ? d.min : null,
              max: typeof d.max === "string" ? d.max : null,
              step: typeof d.step === "string" ? d.step : null,
              sort_order: typeof d.sort_order === "number" ? d.sort_order : null,
            }))
          );
        }

      } catch (err) {
        const message = err instanceof Error ? err.message : "加载失败。";
        if (!cancelled) {
          setProjectsError(message);
          setTopError(message);
        }
      } finally {
        if (!cancelled) setProjectsLoading(false);
      }
    }

    loadInitial();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function refreshTasksForProject(projectId: string) {
    setTasksLoading(true);
    setTasksError(null);
    setRefreshing(true);

    try {
      const { data: userData, error: userError } = await supabase.auth.getUser();
      if (userError || !userData.user) {
        router.replace("/login");
        return;
      }
      const select =
        "id,project_id,title,description,handling_notes,submitter,remark,domain_id,category_id,status,start_at,end_at,custom_attributes,created_at";
      const projectIds =
        projectId === ALL_PROJECTS_ID
          ? projects.map((p) => p.id)
          : descendantProjectIdsById.get(projectId) ?? [projectId];
      const { data, error } = await supabase.from("tasks").select(select).in("project_id", projectIds);
      if (error) throw error;
      const next = (data ?? []) as Record<string, unknown>[];

      const parsedTasks: Task[] = next.map((t) => ({
        id: String(t.id),
        project_id: String(t.project_id),
        title: String(t.title ?? t.description ?? "").trim() || String(t.description ?? "未命名"),
        description: String(t.description ?? t.title ?? ""),
        handling_notes: t.handling_notes != null ? String(t.handling_notes) : null,
        submitter: t.submitter != null ? String(t.submitter) : null,
        remark: t.remark != null ? String(t.remark) : null,
        domain_id: String(t.domain_id ?? ""),
        category_id: String(t.category_id ?? ""),
        status: normalizeTaskStatus(t.status),
        start_at: typeof t.start_at === "string" ? t.start_at : null,
        end_at: typeof t.end_at === "string" ? t.end_at : null,
        custom_attributes: (t.custom_attributes ?? null) as Task["custom_attributes"],
        created_at: String(t.created_at ?? new Date().toISOString()),
      }));

      setTasks(parsedTasks);
    } catch (err) {
      const message = err instanceof Error ? err.message : "加载任务失败。";
      setTasksError(message);
    } finally {
      setTasksLoading(false);
      setRefreshing(false);
    }
  }

  useEffect(() => {
    if (!selectedProjectId) {
      setTasks([]);
      setTasksLoading(false);
      return;
    }
    refreshTasksForProject(selectedProjectId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedProjectId]);

  /** 在指定末级项目下直接打开创建任务（与顶部「新建任务」共用） */
  function openCreateForLeafProject(projectId: string) {
    setTopError(null);
    if (!leafProjectIds.has(projectId)) {
      setTopError("只能在末级项目下创建任务。");
      return;
    }
    setSelectedProjectId(projectId);
    setEditingTask(null);
    setFormMode("create");
    setFormProjectId(projectId);
    setFormOpen(true);
  }

  function openCreate() {
    setTopError(null);
    if (!selectedProjectId || !selectedProjectIsLeaf) {
      setTopError("请先选中左侧末级项目，再点顶部「新建任务」。");
      return;
    }
    if (taskCategories.length === 0 || taskDomains.length === 0) {
      setTopError("请先在「分类与领域」中配置至少一项任务类型与领域。");
      return;
    }
    openCreateForLeafProject(selectedProjectId);
  }

  function openEdit(task: Task) {
    setTopError(null);
    setEditingTask(task);
    setFormMode("edit");
    setFormProjectId(task.project_id);
    setFormOpen(true);
  }

  async function onDelete(taskId: string) {
    const ok = window.confirm("确定删除此任务？");
    if (!ok) return;

    try {
      setTasksError(null);
      const { data: userData, error: userError } = await supabase.auth.getUser();
      if (userError || !userData.user) {
        router.replace("/login");
        return;
      }
      const { error } = await supabase.from("tasks").delete().eq("id", taskId);
      if (error) throw error;

      if (selectedProjectId) await refreshTasksForProject(selectedProjectId);
    } catch (err) {
      const message = err instanceof Error ? err.message : "删除任务失败。";
      setTasksError(message);
    }
  }

  async function onChangeStatus(taskId: string, newStatus: TaskStatus) {
    setTasksError(null);
    const task = tasks.find((t) => t.id === taskId);
    if (newStatus === "已完成" && task && task.status !== "已完成") {
      setCompleteDialogError(null);
      setCompleteDialogTaskId(taskId);
      setCompleteDialogNotes((task.handling_notes ?? "").trim() ? String(task.handling_notes) : "");
      setCompleteDialogOpen(true);
      return;
    }

    try {
      const { data: userData, error: userError } = await supabase.auth.getUser();
      if (userError || !userData.user) {
        router.replace("/login");
        return;
      }
      const today = todayLocalISODate();
      const patch: Record<string, unknown> = { status: newStatus };
      if (newStatus === "已完成") {
        patch.end_at = today;
      } else {
        patch.end_at = null;
      }

      const { error } = await supabase.from("tasks").update(patch).eq("id", taskId);
      if (error) throw error;

      if (selectedProjectId) await refreshTasksForProject(selectedProjectId);
    } catch (err) {
      const message = err instanceof Error ? err.message : "更新任务状态失败。";
      setTasksError(message);
    }
  }

  async function confirmCompleteWithHandlingNotes() {
    const taskId = completeDialogTaskId;
    if (!taskId) return;
    const notes = completeDialogNotes.trim();
    if (!notes) {
      setCompleteDialogError("请填写处理说明后再标记为已完成。");
      return;
    }
    setCompleteDialogError(null);
    setCompleteDialogSubmitting(true);
    try {
      const { data: userData, error: userError } = await supabase.auth.getUser();
      if (userError || !userData.user) {
        router.replace("/login");
        return;
      }
      const today = todayLocalISODate();
      const { error } = await supabase
        .from("tasks")
        .update({
          status: "已完成",
          end_at: today,
          handling_notes: notes,
        })
        .eq("id", taskId);
      if (error) throw error;
      setCompleteDialogOpen(false);
      setCompleteDialogTaskId(null);
      setCompleteDialogNotes("");
      if (selectedProjectId) await refreshTasksForProject(selectedProjectId);
    } catch (err) {
      const message = err instanceof Error ? err.message : "更新任务状态失败。";
      setTasksError(message);
    } finally {
      setCompleteDialogSubmitting(false);
    }
  }

  function openProjectCreate() {
    setTopError(null);
    setProjectDialogMode("create");
    setProjectDialogEditing(null);
    setProjectDialogOpen(true);
  }

  function openProjectEdit(project: Project) {
    setTopError(null);
    setProjectDialogMode("edit");
    setProjectDialogEditing(project);
    setProjectDialogOpen(true);
  }

  async function deleteProject(p: Project) {
    const ok = window.confirm(
      `确定删除项目「${p.name}」？\n其子项目与下属任务将一并删除（数据库级联）。`
    );
    if (!ok) return;

    try {
      setProjectsError(null);
      setTopError(null);
      const { data: userData, error: userError } = await supabase.auth.getUser();
      if (userError || !userData.user) {
        router.replace("/login");
        return;
      }

      const { error } = await supabase.from("projects").delete().eq("id", p.id);
      if (error) throw error;

      const keepSelection =
        selectedProjectId && selectedProjectId !== p.id ? selectedProjectId : undefined;
      await reloadProjectList(keepSelection ? { selectId: keepSelection } : undefined);
      if (projectDialogOpen && projectDialogEditing?.id === p.id) {
        setProjectDialogOpen(false);
        setProjectDialogEditing(null);
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : "删除项目失败。";
      setProjectsError(message);
      setTopError(message);
    }
  }

  function renderTreeNode(project: Project, depth: number) {
    const children = projectChildrenMap.get(project.id) ?? [];
    const hasChildren = children.length > 0;
    const expanded = expandedProjectIds[project.id] ?? true;
    const status = projectStatusLabel(project);
    const catLabel = project.category_id
      ? projectCategoryNameById(project.category_id)
      : "—";

    return (
      <div key={project.id}>
        <div className="flex items-stretch gap-1.5" style={{ paddingLeft: 8 + depth * 14 }}>
          <button
            type="button"
            onClick={() => {
              if (!hasChildren) return;
              setExpandedProjectIds((prev) => ({ ...prev, [project.id]: !expanded }));
            }}
            className="inline-flex size-7 items-center justify-center rounded-md border border-zinc-200 bg-white text-zinc-500 hover:bg-zinc-50 disabled:opacity-40"
            disabled={!hasChildren}
            title={hasChildren ? (expanded ? "折叠子项目" : "展开子项目") : "无子项目"}
            aria-label={hasChildren ? (expanded ? "折叠子项目" : "展开子项目") : "无子项目"}
          >
            {hasChildren ? (
              expanded ? (
                <ChevronDown className="size-4" strokeWidth={2} />
              ) : (
                <ChevronRight className="size-4" strokeWidth={2} />
              )
            ) : (
              <span className="text-[10px]">-</span>
            )}
          </button>
          <button
            type="button"
            onClick={() => setSelectedProjectId(project.id)}
            className={[
              "flex min-w-0 flex-1 items-center justify-between gap-2 rounded-lg border px-2 py-1.5 text-left text-sm transition-all",
              selectedProjectId === project.id
                ? "border-emerald-300 bg-emerald-50/90 shadow-sm shadow-emerald-900/5 ring-1 ring-emerald-200/70"
                : "border-zinc-200/80 bg-white/85 hover:border-zinc-300 hover:bg-white",
            ].join(" ")}
          >
            <span className="min-w-0 flex-1 truncate font-medium leading-5 text-zinc-900" title={project.name}>
              {project.name}
            </span>
            <span className="flex shrink-0 items-center gap-1.5">
              <span className="rounded-full bg-zinc-100 px-2 py-0.5 text-[11px] text-zinc-700">
                {status}
              </span>
              <span
                className="max-w-[7rem] truncate rounded-full border border-violet-200 bg-violet-50 px-2 py-0.5 text-[11px] text-violet-700"
                title={catLabel}
              >
                {catLabel}
              </span>
            </span>
          </button>
          <div className="flex shrink-0 items-center gap-0.5">
            <button
              type="button"
              onClick={() => openProjectEdit(project)}
              className="inline-flex size-7 items-center justify-center rounded-md border border-zinc-200 bg-white text-zinc-600 hover:bg-zinc-50 disabled:opacity-50"
              disabled={projectsLoading}
              title="编辑项目"
              aria-label="编辑项目"
            >
              <Pencil className="size-3.5" strokeWidth={2} />
            </button>
            <button
              type="button"
              onClick={() => void deleteProject(project)}
              className="inline-flex size-7 items-center justify-center rounded-md border border-rose-200 bg-rose-50 text-rose-700 hover:bg-rose-100 disabled:opacity-50"
              disabled={projectsLoading}
              title="删除项目"
              aria-label="删除项目"
            >
              <Trash2 className="size-3.5" strokeWidth={2} />
            </button>
          </div>
        </div>
        {hasChildren && expanded ? (
          <div className="mt-1 space-y-1">
            {children.map((child) => renderTreeNode(child, depth + 1))}
          </div>
        ) : null}
      </div>
    );
  }

  const rootProjects = projectChildrenMap.get(null) ?? [];

  return (
    <div className="flex min-h-[70vh] flex-col bg-background text-foreground">
      <div className="mx-auto w-full max-w-7xl flex-1 px-4 py-6">
        {topError ? (
          <div className="mb-4 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
            {topError}
          </div>
        ) : null}

        {projectsLoading ? (
          <div className="text-sm text-zinc-600">加载项目中...</div>
        ) : projectsError ? (
          <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
            {projectsError}
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-2.5 lg:grid-cols-[380px_1fr]">
            <aside className="rounded-2xl border border-emerald-100/80 bg-gradient-to-b from-white via-white to-emerald-50/35 p-3 shadow-sm shadow-emerald-900/5">
              <div className="mb-2.5 flex items-center justify-between gap-2">
                <div className="text-sm font-semibold text-zinc-900">项目</div>
                <button
                  type="button"
                  className="h-8 shrink-0 rounded-lg border border-emerald-200 bg-emerald-50 px-2.5 text-xs font-semibold text-emerald-800 hover:bg-emerald-100 disabled:opacity-50"
                  onClick={openProjectCreate}
                  disabled={projectsLoading}
                >
                  新建项目
                </button>
              </div>
              <div className="mb-2 rounded-xl border border-emerald-100 bg-white/75 px-2.5 py-1.5 text-[11px] text-emerald-800">
                点击项目查看任务；仅末级项目可新建任务
              </div>
              <div className="space-y-1">
                <button
                  type="button"
                  onClick={() => setSelectedProjectId(ALL_PROJECTS_ID)}
                  className={[
                    "mb-1 flex w-full items-center justify-between rounded-lg border px-2 py-1.5 text-left text-sm transition-all",
                    selectedProjectId === ALL_PROJECTS_ID
                      ? "border-emerald-300 bg-emerald-50/90 shadow-sm shadow-emerald-900/5 ring-1 ring-emerald-200/70"
                      : "border-zinc-200/80 bg-white/85 hover:border-zinc-300 hover:bg-white",
                  ].join(" ")}
                >
                  <span className="font-medium text-zinc-900">我的项目</span>
                  <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[11px] text-emerald-800">
                    全部任务
                  </span>
                </button>
                {rootProjects.length === 0 ? (
                  <div className="rounded-lg border border-dashed border-zinc-200 bg-white p-3 text-xs text-zinc-600">
                    暂无项目
                  </div>
                ) : (
                  rootProjects.map((p) => renderTreeNode(p, 0))
                )}
              </div>
            </aside>

            <main className="rounded-xl border border-zinc-200 bg-white/70 p-3">
              <div className="mb-3 flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                <div className="min-w-0 flex-1">
                  <h2 className="truncate text-base font-semibold text-zinc-900">
                    {selectedProjectId === ALL_PROJECTS_ID
                      ? "我的项目 / 全部"
                      : selectedProject
                        ? projectPathById.get(selectedProject.id) ?? selectedProject.name
                        : "请选择项目"}
                  </h2>
                  {selectedProjectId === ALL_PROJECTS_ID ? (
                    <p className="mt-1 text-xs text-zinc-500">当前展示全部项目下的任务。</p>
                  ) : selectedProjectId && !selectedProjectIsLeaf ? (
                    <p className="mt-1 text-xs text-amber-800/90">当前为父级项目，已展示其全部子项目下的任务。</p>
                  ) : selectedProject && selectedProjectIsLeaf ? (
                    <p className="mt-1 text-xs text-zinc-500">在此项目下管理看板任务</p>
                  ) : !selectedProjectId ? (
                    <p className="mt-1 text-xs text-zinc-500">在左侧点击一个项目以查看任务</p>
                  ) : null}
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <button
                    type="button"
                    onClick={openCreate}
                    disabled={
                      projectsLoading || tasksLoading || !selectedProjectId || !selectedProjectIsLeaf
                    }
                    className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-zinc-900 px-3 text-sm font-medium text-white hover:bg-zinc-800 disabled:pointer-events-none disabled:opacity-40"
                    title={
                      !selectedProjectId
                        ? "请先选择项目"
                        : !selectedProjectIsLeaf
                          ? "请选择末级项目"
                          : "新建任务"
                    }
                  >
                    <Plus className="size-4 shrink-0" strokeWidth={2.25} />
                    新建任务
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      if (selectedProjectId) refreshTasksForProject(selectedProjectId);
                    }}
                    disabled={!selectedProjectId || tasksLoading}
                    className="inline-flex size-9 items-center justify-center rounded-lg border border-zinc-200 bg-white text-zinc-600 hover:bg-zinc-50 disabled:opacity-40"
                    title="刷新任务"
                    aria-label="刷新任务"
                  >
                    <RefreshCw
                      className={`size-4 ${refreshing ? "animate-spin" : ""}`}
                      strokeWidth={2}
                    />
                  </button>
                </div>
              </div>

              {tasksError ? (
                <div className="mb-3 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
                  {tasksError}
                </div>
              ) : null}

              {tasksLoading ? (
                <div className="grid grid-cols-1 gap-2 md:grid-cols-2 lg:grid-cols-3">
                  {TASK_STATUSES.map((s) => {
                    const th = taskBoardColumnTheme[s];
                    return (
                      <div key={s} className={`flex min-h-[200px] flex-col ${th.shell}`}>
                        <div className="mb-2 flex items-center justify-between px-0.5">
                          <div className="h-3 w-14 animate-pulse rounded bg-white/60" />
                          <div className="h-5 w-6 animate-pulse rounded-md bg-white/70" />
                        </div>
                        <div className="flex flex-col gap-2">
                          {Array.from({ length: 2 }).map((_, idx) => (
                            <div key={idx} className="h-[4.5rem] animate-pulse rounded-xl bg-white/75 shadow-sm" />
                          ))}
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : selectedProjectId ? (
                <div className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-3">
                  {TASK_STATUSES.map((s) => {
                    const th = taskBoardColumnTheme[s];
                    return (
                    <div key={s} className={`flex min-h-[210px] flex-col ${th.shell}`}>
                      <div className="mb-2 flex items-center justify-between gap-2 px-0.5">
                        <span className={`text-xs font-bold tracking-tight ${th.heading}`}>
                          {taskStatusLabel[s]}
                        </span>
                        <span
                          className={`tabular-nums rounded-lg px-2 py-0.5 text-[11px] font-semibold ${th.countBadge}`}
                        >
                          {grouped[s].length}
                        </span>
                      </div>

                      <div className="flex flex-1 flex-col gap-1.5">
                        {grouped[s].length === 0 ? (
                          <div
                            className={`flex flex-1 items-center justify-center rounded-xl border py-8 text-center text-[11px] font-medium ${th.emptyBox}`}
                          >
                            空
                          </div>
                        ) : null}

                        {grouped[s].slice(0, 10).map((task) => {
                          const cardTagTexts = [
                            taskCategoryName(task.category_id),
                            domainNameById(task.domain_id),
                            formatDate(task.start_at),
                            projectPathById.get(task.project_id) ?? "—",
                          ];
                          return (
                            <div
                              key={task.id}
                              className="group rounded-xl border border-white/80 bg-white/95 p-2.5 shadow-sm shadow-zinc-900/5 ring-1 ring-zinc-200/40 transition-[box-shadow,transform] hover:shadow-md hover:ring-zinc-300/50"
                            >
                              <div className="flex items-start justify-between gap-2">
                                <p className="min-w-0 flex-1 text-[13px] font-semibold leading-snug text-zinc-900">
                                  {task.title}
                                </p>
                                <div className="flex shrink-0 gap-0.5 opacity-90 group-hover:opacity-100">
                                  <button
                                    type="button"
                                    onClick={() => openEdit(task)}
                                    className="inline-flex size-7 items-center justify-center rounded-md text-zinc-500 hover:bg-zinc-100 hover:text-zinc-800 disabled:opacity-50"
                                    disabled={refreshing}
                                    title="编辑"
                                    aria-label="编辑任务"
                                  >
                                    <Pencil className="size-3.5" strokeWidth={2} />
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => onDelete(task.id)}
                                    className="inline-flex size-7 items-center justify-center rounded-md text-zinc-400 hover:bg-rose-50 hover:text-rose-700 disabled:opacity-50"
                                    disabled={refreshing}
                                    title="删除"
                                    aria-label="删除任务"
                                  >
                                    <Trash2 className="size-3.5" strokeWidth={2} />
                                  </button>
                                </div>
                              </div>

                              <div
                                className="mt-2 flex flex-wrap gap-1.5"
                                aria-label={cardTagTexts.join("，")}
                              >
                                {cardTagTexts.map((text, idx) => (
                                  <span
                                    key={idx}
                                    className={
                                      taskCardTagChipClass[idx] ?? taskCardTagChipClass[taskCardTagChipClass.length - 1]
                                    }
                                  >
                                    {text}
                                  </span>
                                ))}
                              </div>

                              <div className="mt-2.5">
                                <select
                                  aria-label="更改任务状态（切换列）"
                                  className={`h-8 w-full cursor-pointer rounded-lg px-2 text-xs font-semibold outline-none transition-colors focus-visible:ring-2 ${th.cardSelect}`}
                                  value={task.status}
                                  onChange={(e) => onChangeStatus(task.id, e.target.value as TaskStatus)}
                                  disabled={refreshing || completeDialogSubmitting}
                                >
                                  {TASK_STATUSES.map((st) => (
                                    <option key={st} value={st}>
                                      移至：{taskStatusLabel[st]}
                                    </option>
                                  ))}
                                </select>
                              </div>
                            </div>
                          );
                        })}
                        {grouped[s].length > 10 ? (
                          <Link
                            href={`/tasks?project_id=${encodeURIComponent(selectedProjectId ?? "")}&status=${encodeURIComponent(s)}`}
                            className="mt-1 inline-flex items-center justify-center rounded-lg border border-zinc-200 bg-white/85 px-2 py-1 text-xs font-medium text-zinc-700 hover:bg-white"
                          >
                            更多 {grouped[s].length - 10} 条...
                          </Link>
                        ) : null}
                      </div>
                    </div>
                    );
                  })}
                </div>
              ) : (
                <div className="rounded-lg border border-dashed border-zinc-200 bg-white p-3 text-sm text-zinc-600">
                  请先选择项目
                </div>
              )}
            </main>
          </div>
        )}

        <TaskForm
          open={formOpen}
          onOpenChange={setFormOpen}
          mode={formMode}
          initialTask={editingTask}
          projectId={formProjectId}
          taskCategories={taskCategories}
          taskDomains={taskDomains}
          fieldDefinitions={fieldDefinitions}
          aiParseAvailable={aiParseAvailable}
          onSaved={() => {
            setFormOpen(false);
            if (selectedProjectId) refreshTasksForProject(selectedProjectId);
          }}
        />

        <Dialog.Root
          open={completeDialogOpen}
          onOpenChange={(open) => {
            if (!open && completeDialogSubmitting) return;
            setCompleteDialogOpen(open);
            if (!open) {
              setCompleteDialogTaskId(null);
              setCompleteDialogNotes("");
              setCompleteDialogError(null);
            }
          }}
        >
          <Dialog.Portal>
            <Dialog.Overlay className="fixed inset-0 z-50 bg-zinc-950/45 backdrop-blur-[2px]" />
            <Dialog.Content className="fixed left-1/2 top-1/2 z-50 w-[95vw] max-w-lg -translate-x-1/2 -translate-y-1/2 overflow-hidden rounded-2xl border border-zinc-200/90 bg-white shadow-2xl shadow-zinc-900/15 outline-none">
              <Dialog.Title className="border-b border-zinc-100 bg-gradient-to-r from-emerald-50/80 to-white px-5 py-3.5 text-base font-semibold text-zinc-900">
                标记为已完成
              </Dialog.Title>
              <Dialog.Description className="sr-only">
                填写处理说明后确认，将任务移至已完成。
              </Dialog.Description>
              <div className="px-5 py-4">
                {completeDialogTaskId ? (
                  <p className="mb-2 text-sm font-medium text-zinc-900">
                    {tasks.find((t) => t.id === completeDialogTaskId)?.title ?? "任务"}
                  </p>
                ) : null}
                <p className="mb-2 text-sm text-zinc-600">
                  请填写本次完成的处理说明（必填），将写入任务的「处理说明」字段。
                </p>
                {completeDialogError ? (
                  <div className="mb-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
                    {completeDialogError}
                  </div>
                ) : null}
                <textarea
                  value={completeDialogNotes}
                  onChange={(e) => setCompleteDialogNotes(e.target.value)}
                  rows={5}
                  className="w-full rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/25"
                  placeholder="例如：问题根因、处理步骤、验证结果…"
                />
              </div>
              <div className="flex justify-end gap-2 border-t border-zinc-100 bg-zinc-50/80 px-5 py-3">
                <Dialog.Close asChild>
                  <button
                    type="button"
                    disabled={completeDialogSubmitting}
                    className="h-9 rounded-lg border border-zinc-200 bg-white px-4 text-sm font-medium text-zinc-700 hover:bg-zinc-50 disabled:opacity-50"
                  >
                    取消
                  </button>
                </Dialog.Close>
                <button
                  type="button"
                  onClick={() => void confirmCompleteWithHandlingNotes()}
                  disabled={completeDialogSubmitting}
                  className="h-9 rounded-lg bg-emerald-600 px-4 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-50"
                >
                  {completeDialogSubmitting ? "保存中..." : "确认完成"}
                </button>
              </div>
            </Dialog.Content>
          </Dialog.Portal>
        </Dialog.Root>

        <ProjectDialog
          open={projectDialogOpen}
          onOpenChange={setProjectDialogOpen}
          mode={projectDialogMode}
          editingProject={projectDialogMode === "edit" ? projectDialogEditing : null}
          projects={projects}
          projectCategories={projectCategories}
          onComplete={async (opts) => {
            setTopError(null);
            setProjectsError(null);
            await reloadProjectList(
              opts?.selectProjectId != null ? { selectId: opts.selectProjectId } : undefined
            );
          }}
        />
      </div>
    </div>
  );
}

