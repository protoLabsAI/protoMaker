/**
 * Convenience re-export of the singleton HTTP API client.
 *
 * Usage:
 *   import { api } from '@/lib/api';
 *   api.ava.getConfig(projectPath);
 */
import { getHttpApiClient } from './http-api-client';
import { apiFetch } from './api-fetch';
import type {
  Automation,
  AutomationRunRecord,
  CreateAutomationInput,
  UpdateAutomationInput,
} from '@protolabs-ai/types';

export const api = getHttpApiClient();

// Re-export types useful for consumers
export type { AvaConfig, AvaToolGroups } from './clients/ava-client';

// Automations API helpers

export async function listAutomations(): Promise<Automation[]> {
  const res = await apiFetch('/api/automations/list', 'GET');
  if (!res.ok) throw new Error(`Failed to list automations: ${res.status}`);
  const data = await res.json();
  return (data.automations ?? []) as Automation[];
}

export async function getAutomation(id: string): Promise<Automation> {
  const res = await apiFetch(`/api/automations/${id}`, 'GET');
  if (!res.ok) throw new Error(`Failed to get automation: ${res.status}`);
  const data = await res.json();
  return data.automation as Automation;
}

export async function createAutomation(input: CreateAutomationInput): Promise<Automation> {
  const res = await apiFetch('/api/automations/create', 'POST', { body: input });
  if (!res.ok) throw new Error(`Failed to create automation: ${res.status}`);
  const data = await res.json();
  return data.automation as Automation;
}

export async function updateAutomation(
  id: string,
  input: UpdateAutomationInput
): Promise<Automation> {
  const res = await apiFetch(`/api/automations/${id}`, 'PUT', { body: input });
  if (!res.ok) throw new Error(`Failed to update automation: ${res.status}`);
  const data = await res.json();
  return data.automation as Automation;
}

export async function deleteAutomation(id: string): Promise<void> {
  const res = await apiFetch(`/api/automations/${id}`, 'DELETE');
  if (!res.ok) throw new Error(`Failed to delete automation: ${res.status}`);
}

export async function runAutomation(id: string): Promise<void> {
  const res = await apiFetch(`/api/automations/${id}/run`, 'POST');
  if (!res.ok) throw new Error(`Failed to run automation: ${res.status}`);
}

export async function getAutomationHistory(id: string): Promise<AutomationRunRecord[]> {
  const res = await apiFetch(`/api/automations/${id}/history`, 'GET');
  if (!res.ok) throw new Error(`Failed to get automation history: ${res.status}`);
  const data = await res.json();
  return (data.runs ?? []) as AutomationRunRecord[];
}
