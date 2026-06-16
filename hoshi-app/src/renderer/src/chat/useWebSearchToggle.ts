import { useState } from 'react'
import { useAppPreferences } from '../settings/useAppPreferences'

const WEB_SEARCH_TITLE = '开启后星奈可检索近期网络信息'
const WEB_SEARCH_LOCKED_TITLE = '已在设置中默认开启联网，此处不可关闭'

export function useWebSearchToggle(): {
  active: boolean
  locked: boolean
  title: string
  toggle: () => void
} {
  const { preferences } = useAppPreferences()
  const locked = preferences.defaultWebSearch
  const [manualEnabled, setManualEnabled] = useState(false)

  return {
    active: locked || manualEnabled,
    locked,
    title: locked ? WEB_SEARCH_LOCKED_TITLE : WEB_SEARCH_TITLE,
    toggle: () => {
      if (locked) {
        return
      }
      setManualEnabled((current) => !current)
    }
  }
}
