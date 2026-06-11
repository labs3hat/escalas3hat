import { useEffect, useState } from 'react'
import { supabase } from '@/integrations/supabase/client'
import type { Store } from '@/types'

export function useStores(storeIds?: string[]) {
  const [stores, setStores] = useState<Store[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function load() {
      let query = supabase.from('stores').select('*').eq('active', true).order('display_order', { ascending: true })
      if (storeIds && storeIds.length > 0) {
        query = query.in('id', storeIds)
      }
      const { data } = await query
      setStores((data as unknown as Store[]) ?? [])
      setLoading(false)
    }
    load()
  }, [storeIds?.join(',')])

  return { stores, loading }
}
