"use client";

import { AppShell } from "@/components/AppShell";
import { RequireAuth } from "@/components/RequireAuth";

import { TasksQueryClient } from "./tasks-query-client";

export default function TasksPage() {
  return (
    <RequireAuth>
      <AppShell title="任务查询" subtitle="按项目、状态、类型、领域、日期等条件筛选任务。">
        <TasksQueryClient />
      </AppShell>
    </RequireAuth>
  );
}
