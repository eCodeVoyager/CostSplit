import { Minus, Plus } from "lucide-react"
import { Button } from "@/components/ui/button"
import { setMeals } from "@/lib/repo"
import type { Member } from "@/lib/types"
import { MemberAvatar } from "./common"

/** One person's meals for one day. `half` adds a ½ button for breakfast-style half meals. */
export function MealStepper({
  tripId,
  date,
  member,
  count,
  label,
  half,
}: {
  tripId: string
  date: string
  member: Member
  count: number
  label: string
  half?: boolean
}) {
  const change = (delta: number) => setMeals(tripId, date, member.id, count + delta)
  return (
    <div className="flex min-h-13 items-center gap-2 px-3 py-1.5">
      <MemberAvatar id={member.id} name={member.name} className="size-8" />
      <span className="min-w-0 flex-1 truncate text-sm font-medium">{label}</span>
      {half && (
        <Button variant="ghost" className="h-10 px-2 text-sm" onClick={() => change(0.5)} aria-label={`Half meal for ${member.name}`}>
          +½
        </Button>
      )}
      <Button
        variant="outline"
        size="icon"
        className="size-10"
        onClick={() => change(-Math.min(1, count))}
        disabled={count <= 0}
        aria-label={`Fewer meals for ${member.name}`}
      >
        <Minus />
      </Button>
      <span className="w-9 text-center text-lg font-semibold tabular" aria-live="polite">
        {count}
      </span>
      <Button variant="outline" size="icon" className="size-10" onClick={() => change(1)} aria-label={`More meals for ${member.name}`}>
        <Plus />
      </Button>
    </div>
  )
}
