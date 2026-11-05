import { createContext, useContext } from "react"
import type { ExpensePreset } from "@/components/ExpenseSheet"
import type { PersonalPreset } from "@/components/PersonalSheet"
import type { Transfer } from "@/lib/balance"
import type { Bill, Expense, Payment, PersonalExpense } from "@/lib/types"
import type { BillStatus } from "./useTripData"

/** Sheets and dialogs every screen of a group can open */
export interface TripActions {
  /** The "+" chooser */
  openAdd: () => void
  addExpense: (preset?: ExpensePreset) => void
  editExpense: (e: Expense) => void
  /** Read-only details: full split, who owes whom, history */
  viewExpense: (e: Expense) => void
  viewPayment: (p: Payment) => void
  addPersonal: (preset?: PersonalPreset) => void
  editPersonal: (p: PersonalExpense) => void
  /** One person's statement: every item that moved their balance */
  viewMember: (memberId: string) => void
  recordPayment: (suggestion?: Transfer) => void
  payBill: (status: BillStatus) => void
  editBill: (bill?: Bill) => void
  invite: () => void
  /** Personal invite for one person: their own link (and an email), so they never pick a name */
  inviteMember: (memberId: string) => void
  changeMe: () => void
}

export const ActionsContext = createContext<TripActions | null>(null)

export function useTripActions() {
  const actions = useContext(ActionsContext)
  if (!actions) throw new Error("useTripActions must be used inside a group screen")
  return actions
}
