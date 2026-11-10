import type { ActivityType, Channel, Deal, DealDetail, PipelineSnapshot, Task } from "../../shared/types.ts";
import type { crmConfig } from "../../config/crm.config.ts";

export type AppConfig = typeof crmConfig & { hasApiKey: boolean };

export class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

async function request<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, {
    ...init,
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
  });
  if (!response.ok) {
    let message = `${response.status} ${response.statusText}`;
    try {
      const data = (await response.json()) as { error?: string };
      if (data.error) message = data.error;
    } catch {
      // keep status text
    }
    throw new ApiError(response.status, message);
  }
  return response.json() as Promise<T>;
}

export const api = {
  login: (password: string) =>
    request<{ ok: boolean }>("/api/login", { method: "POST", body: JSON.stringify({ password }) }),
  logout: () => request<{ ok: boolean }>("/api/logout", { method: "POST" }),
  config: () => request<AppConfig>("/api/config"),
  snapshot: () => request<PipelineSnapshot>("/api/deals"),
  deal: (id: string) => request<DealDetail>(`/api/deals/${id}`),
  createDeal: (body: Partial<Deal>) =>
    request<DealDetail>("/api/deals", { method: "POST", body: JSON.stringify(body) }),
  updateDeal: (id: string, body: Partial<Deal>) =>
    request<DealDetail>(`/api/deals/${id}`, { method: "PATCH", body: JSON.stringify(body) }),
  deleteDeal: (id: string) => request<{ ok: boolean }>(`/api/deals/${id}`, { method: "DELETE" }),
  log: (id: string, body: { type: ActivityType; body?: string; channel?: Channel }) =>
    request<DealDetail>(`/api/deals/${id}/log`, { method: "POST", body: JSON.stringify(body) }),
  addTask: (id: string, body: { title?: string; dueDate: string; pinned?: boolean }) =>
    request<DealDetail>(`/api/deals/${id}/tasks`, { method: "POST", body: JSON.stringify(body) }),
  updateTask: (dealId: string, taskId: string, body: Partial<Pick<Task, "title" | "dueDate" | "done" | "pinned">>) =>
    request<DealDetail>(`/api/deals/${dealId}/tasks/${taskId}`, {
      method: "PATCH",
      body: JSON.stringify(body),
    }),
  markNoShow: (id: string) =>
    request<DealDetail>(`/api/deals/${id}/no-show`, { method: "POST" }),
  chat: (messages: { role: "user" | "assistant"; content: string }[]) =>
    request<{ content: string }>("/api/chat", { method: "POST", body: JSON.stringify({ messages }) }),
};
