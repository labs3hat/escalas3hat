import { useEffect, useState } from 'react'
import { supabase } from '@/integrations/supabase/client'
import type { Employee } from '@/types'

export function useEmployees(storeId: string | null) {
  const [employees, setEmployees] = useState<Employee[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!storeId) { setEmployees([]); setLoading(false); return }
    async function load() {
      const { data } = await supabase
        .from('employees')
        .select('*')
        .eq('store_id', storeId)
        .eq('active', true)
        .order('name')
      setEmployees(data ?? [])
      setLoading(false)
    }
    load()
  }, [storeId])

  return { employees, loading, setEmployees }
}
