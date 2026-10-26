import {
  BedDouble,
  Car,
  Coffee,
  HandHelping,
  Handshake,
  House,
  Pill,
  Receipt,
  Ship,
  ShoppingBag,
  ShoppingCart,
  SprayCan,
  Ticket,
  Utensils,
  Wifi,
  Zap,
  type LucideIcon,
} from "lucide-react"
import type { GroupKind } from "./types"

export interface Category {
  id: string
  label: string
  short: string
  icon: LucideIcon
}

export const CATEGORIES: Category[] = [
  { id: "groceries", label: "Bazar & groceries", short: "Bazar", icon: ShoppingCart },
  { id: "food", label: "Food & eating out", short: "Food", icon: Utensils },
  { id: "rent", label: "Rent", short: "Rent", icon: House },
  { id: "utilities", label: "Electricity, gas & water", short: "Utilities", icon: Zap },
  { id: "internet", label: "Internet & phone", short: "Internet", icon: Wifi },
  { id: "staff", label: "Maid & help", short: "Help", icon: HandHelping },
  { id: "household", label: "Household & cleaning", short: "Household", icon: SprayCan },
  { id: "drinks", label: "Coffee & drinks", short: "Drinks", icon: Coffee },
  { id: "transport", label: "Transport", short: "Transport", icon: Car },
  { id: "travel", label: "Ferry & flights", short: "Travel", icon: Ship },
  { id: "stay", label: "Stay", short: "Stay", icon: BedDouble },
  { id: "activities", label: "Activities", short: "Fun", icon: Ticket },
  { id: "health", label: "Medicine & health", short: "Health", icon: Pill },
  { id: "shopping", label: "Shopping", short: "Shopping", icon: ShoppingBag },
  { id: "loan", label: "Loan", short: "Loan", icon: Handshake },
  { id: "other", label: "Other", short: "Other", icon: Receipt },
]

const byId = new Map(CATEGORIES.map((c) => [c.id, c]))

export function getCategory(id: string): Category {
  return byId.get(id) ?? byId.get("other")!
}

const ORDER: Record<GroupKind, string[]> = {
  home: ["groceries", "food", "rent", "utilities", "internet", "staff", "household", "transport", "health", "shopping", "other"],
  trip: ["food", "drinks", "groceries", "transport", "travel", "stay", "activities", "shopping", "health", "other"],
}

/** Categories offered when adding, most likely first for the group type */
export function categoriesFor(kind: GroupKind = "trip"): Category[] {
  return ORDER[kind].map((id) => byId.get(id)!)
}

/** Group covers are user content, not UI icons, so emoji are fine here */
export const TRIP_EMOJIS = ["🏠", "🏡", "🏢", "🛏️", "🇧🇩", "🇬🇷", "🏝️", "⛵", "✈️", "🏔️", "🎉", "🍽️"]

export interface QuickPick {
  title: string
  category: string
}

const PICKS: Record<GroupKind, QuickPick[]> = {
  home: [
    { title: "Bazar", category: "groceries" },
    { title: "Vegetables", category: "groceries" },
    { title: "Fish & meat", category: "groceries" },
    { title: "Rice", category: "groceries" },
    { title: "Drinking water", category: "groceries" },
    { title: "Gas cylinder", category: "utilities" },
    { title: "Snacks", category: "food" },
    { title: "Food delivery", category: "food" },
    { title: "Cleaning", category: "household" },
    { title: "Toiletries", category: "household" },
    { title: "Medicine", category: "health" },
    { title: "Rickshaw", category: "transport" },
  ],
  trip: [
    { title: "Coffee", category: "drinks" },
    { title: "Gyros", category: "food" },
    { title: "Dinner", category: "food" },
    { title: "Lunch", category: "food" },
    { title: "Supermarket", category: "groceries" },
    { title: "Taxi", category: "transport" },
    { title: "Ferry", category: "travel" },
    { title: "Drinks", category: "drinks" },
    { title: "Bus", category: "transport" },
    { title: "Fuel", category: "transport" },
    { title: "Hotel", category: "stay" },
    { title: "Museum", category: "activities" },
  ],
}

export function quickPicksFor(kind: GroupKind = "trip"): QuickPick[] {
  return PICKS[kind]
}

/** Starter monthly bills offered when creating a home */
export const STARTER_BILLS = [
  { title: "Rent", category: "rent", dueDay: 5, variable: false },
  { title: "Electricity", category: "utilities", dueDay: 10, variable: true },
  { title: "Gas", category: "utilities", dueDay: 10, variable: false },
  { title: "Water", category: "utilities", dueDay: 10, variable: true },
  { title: "Internet", category: "internet", dueDay: 5, variable: false },
  { title: "Maid", category: "staff", dueDay: 1, variable: false },
  { title: "Cook", category: "staff", dueDay: 1, variable: false },
  { title: "Service charge", category: "rent", dueDay: 5, variable: false },
]

const KEYWORDS: [RegExp, string][] = [
  [/\brent\b|bhara|vara|service charge|landlord/i, "rent"],
  [/electric|current|bidyut|biddut|prepaid meter|\bgas\b|titas|water|pani|wasa|utility/i, "utilities"],
  [/internet|wifi|wi-fi|broadband|\bnet\b|mobile recharge|recharge|phone bill/i, "internet"],
  [/maid|bua|khala|cook|bawarchi|driver|guard|darwan|helper|salary/i, "staff"],
  [/clean|detergent|soap|toilet|tissue|broom|harpic|vim|household|bulb|repair|plumber/i, "household"],
  [/medicine|pharmacy|doctor|hospital|ousud|oshud|sunscreen/i, "health"],
  [/loan|borrow|lend|dhar/i, "loan"],
  [/coffee|freddo|frapp|espresso|cappuc|beer|wine|ouzo|drink|\bbar\b|cocktail|juice|\bcha\b|\btea\b/i, "drinks"],
  [/bazar|bazaar|sabji|shobji|vegetable|fish|mach|meat|mangsho|chicken|murgi|\brice\b|chal|\boil\b|tel|\begg|dim|dal|onion|peyaj|alu|grocer|super ?market|shwapno|meena|agora|lidl|water|kiosk/i, "groceries"],
  [/gyro|souvlaki|pita|dinner|lunch|breakfast|nasta|brunch|taverna|pizza|burger|biryani|kacchi|food|snack|bakery|ice ?cream|restaurant|meal|foodpanda|pathao food/i, "food"],
  [/taxi|uber|bolt|pathao|rickshaw|cng|bus|metro|train|tram|fuel|petrol|octane|parking|toll|scooter|car|rental|fare/i, "transport"],
  [/ferry|flight|plane|airline|boat|launch|cruise|airport/i, "travel"],
  [/hotel|airbnb|hostel|room|villa|booking|resort/i, "stay"],
  [/museum|tour|ticket|acropolis|beach|sunbed|movie|cinema|club|activity/i, "activities"],
  [/shop|souvenir|gift|clothes|daraz/i, "shopping"],
]

export function guessCategory(title: string): string | null {
  const hit = KEYWORDS.find(([re]) => re.test(title))
  return hit ? hit[1] : null
}
