import { Link } from '@tanstack/react-router'

import { buttonClasses } from '@/shared/ui/button'
import { PageHeader } from '@/shared/ui/page'

export function NotFoundPage() {
  return (
    <>
      <PageHeader title="Page not found" description="There's nothing at this address." />
      <Link to="/" className={buttonClasses('outline')}>
        Go home
      </Link>
    </>
  )
}
