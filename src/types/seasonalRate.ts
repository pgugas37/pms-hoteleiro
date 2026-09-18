export interface SeasonalRate {
  id: string
  room_type_id: string
  label: string
  start_date: string
  end_date: string
  daily_rate: number
  created_at: string
}

export interface SeasonalRateWithType extends SeasonalRate {
  room_types: { id: string; name: string } | null
}
