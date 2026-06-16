interface WebSearchBadgeProps {
  label?: string
  className?: string
}

export function WebSearchBadge({
  label = '本次已联网',
  className = ''
}: WebSearchBadgeProps): React.JSX.Element {
  return (
    <span className={`web-search-badge ${className}`.trim()} title={label}>
      {label}
    </span>
  )
}
