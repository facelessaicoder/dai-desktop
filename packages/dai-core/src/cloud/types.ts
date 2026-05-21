// Dataspheres API — shared TypeScript types

export interface Datasphere {
  id: string;
  uri: string;
  name: string;
  description?: string;
  isPrivate: boolean;
}

export interface Page {
  id: string;
  slug: string;
  title: string;
  content: string;
  status: string;
  folderName?: string;
  url?: string;
  updatedAt?: string;
  createdAt?: string;
}

export interface Task {
  id: string;
  title: string;
  status: string;
  statusGroupId: string;
  tags: string[];
  content?: string;
  priority?: string;
  planModeId?: string;
  planModeName?: string;
  assignee?: string;
  dueAt?: string;
  updatedAt?: string;
}

export interface PlanMode {
  id: string;
  name: string;
  tagFilter: string[];
}

export interface StatusGroup {
  id: string;
  name: string;
  color?: string;
  position?: number;
}

export interface Comment {
  id: string;
  content: string;
  createdAt: string;
  authorId?: string;
}

export interface CreatePageInput {
  slug: string;
  title: string;
  content: string;
  status?: string;
  isPubliclyVisible?: boolean;
  folderName?: string;
}

export interface CreateTaskInput {
  title: string;
  statusGroupId: string;
  tags?: string[];
  content?: string;
  priority?: string;
  status?: string;
  planModeId?: string;
  assignee?: string;
  dueAt?: string;
}
