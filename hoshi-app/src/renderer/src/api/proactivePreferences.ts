import { apiFetch } from '../lib/http'

export interface ProactivePreferences {
  enabled: boolean
  followUpEnabled: boolean
}

export type UpdateProactivePreferencesRequest = Partial<ProactivePreferences>

export function fetchProactivePreferences() {
  return apiFetch<ProactivePreferences>('/api/v1/users/me/proactive-preferences')
}

export function updateProactivePreferences(request: UpdateProactivePreferencesRequest) {
  return apiFetch<ProactivePreferences>('/api/v1/users/me/proactive-preferences', {
    method: 'PATCH',
    body: JSON.stringify(request)
  })
}
