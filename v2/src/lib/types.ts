export type ID = string

export type TableName = "trips" | "members" | "expenses" | "payments" | "bills" | "meals" | "items" | "personal"

/** Fields shared by every synced row. `dirty` is local-only (not yet pushed). */
export interface Row {
  id: ID
  tripId: ID
  createdAt: number
  updatedAt: number
  deleted: 0 | 1
  dirty: 0 | 1
}

/** A home shared by flatmates (the main use) or a trip */
export type GroupKind = "home" | "trip"

/**
 * One shared group. Named "trip" in storage and sync for history's sake;
 * `kind` says whether it's a home or a trip.
 */
export interface Trip extends Row {
  name: string
  emoji: string
  kind?: GroupKind
  /** Base currency every balance is shown in */
  currency: string
  /** Extra currencies: units of that currency per 1 unit of base (1 EUR = 130 BDT -> { BDT: 130 }) */
  rates: Record<string, number>
  /** Mess-style meal counting: bazar is split by meals eaten */
  mealMode?: boolean
}

export interface Member extends Row {
  name: string
  /** Moved out: hidden from new expenses, kept in balances until settled */
  archived?: 0 | 1
  /** Account that joined as this person; their phones pick this person by themselves */
  userId?: string
  /** Invited (or signed-in) email: signing in with it on a new phone also picks this person */
  email?: string
  /** Profile photo id of the linked account */
  avatar?: string
}

/** meals: weights are the month's meal counts (mess bazar) */
export type SplitMode = "equal" | "shares" | "exact" | "meals"

export interface Expense extends Row {
  /** income: money the group received (refund, sold items); flips who owes whom */
  kind?: "expense" | "income"
  title: string
  category: string
  /** Minor units (cents) in `currency` */
  amount: number
  currency: string
  /** Units of `currency` per 1 unit of trip base currency, snapshotted at entry time */
  rate: number
  /** YYYY-MM-DD */
  date: string
  /** memberId -> minor units paid (in `currency`) */
  paidBy: Record<ID, number>
  splitMode: SplitMode
  /** memberId -> weight. equal: 1, shares: n, exact: minor units, meals: who can be charged */
  split: Record<ID, number>
  note?: string
  /** Set when this expense pays a recurring bill */
  billId?: ID
  /** Bill month, YYYY-MM */
  period?: string
  /** Photo of the receipt (file id) */
  receipt?: ID
  /** Member who added it, and who changed it last (shown as the item's history) */
  createdBy?: ID
  updatedBy?: ID
  /** What was bought (bazar items), e.g. from the to-buy list */
  items?: string[]
}

export interface Payment extends Row {
  from: ID
  to: ID
  /** Minor units in trip base currency */
  amount: number
  date: string
  note?: string
  /** Photo proving the payment, e.g. a bKash/bank screenshot (file id) */
  proof?: ID
  createdBy?: ID
  updatedBy?: ID
}

/** A monthly bill template (rent, electricity, internet, maid...) */
export interface Bill extends Row {
  title: string
  category: string
  /** Typical amount in base minor units; 0 = ask every month */
  amount: number
  /** Amount changes monthly (electricity) */
  variable: boolean
  /** Day of month it's due, 1-28 */
  dueDay: number
  splitMode: Exclude<SplitMode, "meals">
  /** Empty = everyone living there at payment time */
  split: Record<ID, number>
  payer?: ID
  active: 0 | 1
}

/** Meals one person ate on one day. id = `${date}_${memberId}` so edits merge per person-day. */
export interface Meal extends Row {
  date: string
  memberId: ID
  count: number
}

/** Shared shopping list entry */
export interface ShopItem extends Row {
  name: string
  done: 0 | 1
  /** Who is going to buy it ("I'll buy"), so two people don't buy the same thing */
  assignee?: ID
  /** Who set the assignee (someone else assigning you shows up in your updates) */
  assignedBy?: ID
  createdBy?: ID
  /** Who ticked it as bought */
  boughtBy?: ID
  /** Needed right away (gas ran out, no rice for dinner) */
  urgent?: 0 | 1
  updatedBy?: ID
  /** Needed by this day, YYYY-MM-DD */
  needBy?: string
}

/**
 * Something only you paid for and only you consume (your own lunch, phone bill).
 * Never part of group balances. The server sends it to its owner's devices only.
 */
export interface PersonalExpense extends Row {
  title: string
  category: string
  /** Minor units in `currency` */
  amount: number
  currency: string
  /** Units of `currency` per 1 unit of the group's base currency */
  rate: number
  /** YYYY-MM-DD */
  date: string
  note?: string
  /** Account id of the owner, set by the server */
  owner?: string
}

export type AnyRow = Trip | Member | Expense | Payment | Bill | Meal | ShopItem | PersonalExpense
