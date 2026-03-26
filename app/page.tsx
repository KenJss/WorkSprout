"use client";

import { AppShell } from "@/components/AppShell";
import { RequireAuth } from "@/components/RequireAuth";
import { TaskList } from "@/components/TaskList";

export default function Home() {
  return (
    <RequireAuth>
      <AppShell
        title="工作台"
        subtitle="左侧维护项目树；右侧在末级项目下新建与管理任务。"
      >
        <TaskList />
      </AppShell>
    </RequireAuth>
  );
}
