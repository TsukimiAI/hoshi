import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import * as proactiveApi from '../api/proactivePreferences'

describe('proactivePreferences api', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  beforeEach(() => {
    vi.spyOn(proactiveApi, 'fetchProactivePreferences').mockResolvedValue({
      code: 0,
      message: 'ok',
      data: {
        enabled: true,
        followUpEnabled: true
      }
    })
  })

  it('fetches simplified proactive preferences', async () => {
    const response = await proactiveApi.fetchProactivePreferences()
    expect(response.data).toEqual({
      enabled: true,
      followUpEnabled: true
    })
  })
})
