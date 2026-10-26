import { Link } from '@tanstack/react-router'
import { ChevronRight, Salad } from 'lucide-react'

import { Card } from '@/shared/ui/card'

export function NutritionHomeCard() {
  return (
    <Link to="/nutrition/daily" className="block rounded-2xl">
      <Card className="flex items-center gap-4 transition hover:bg-highlight">
        <Salad className="size-8 shrink-0 text-accent" />
        <div className="flex-1">
          <h2 className="font-semibold">Nutrition</h2>
          <p className="text-sm text-muted">Log today's food.</p>
        </div>
        <ChevronRight className="size-5 text-muted" />
      </Card>
    </Link>
  )
}
