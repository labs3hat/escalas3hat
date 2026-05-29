DROP POLICY IF EXISTS schedules_insert ON public.schedules;
DROP POLICY IF EXISTS schedules_update ON public.schedules;

CREATE POLICY schedules_insert
ON public.schedules
FOR INSERT
TO authenticated
WITH CHECK (
  public.is_admin()
  OR (store_id::text = ANY (public.my_store_ids()))
);

CREATE POLICY schedules_update
ON public.schedules
FOR UPDATE
TO authenticated
USING (
  public.is_admin()
  OR (store_id::text = ANY (public.my_store_ids()))
)
WITH CHECK (
  public.is_admin()
  OR (store_id::text = ANY (public.my_store_ids()))
);

DROP POLICY IF EXISTS slots_insert ON public.schedule_slots;
DROP POLICY IF EXISTS slots_update ON public.schedule_slots;
DROP POLICY IF EXISTS slots_delete ON public.schedule_slots;

CREATE POLICY slots_insert
ON public.schedule_slots
FOR INSERT
TO authenticated
WITH CHECK (
  public.is_admin()
  OR EXISTS (
    SELECT 1 FROM public.schedules sc
    WHERE sc.id = schedule_slots.schedule_id
      AND (sc.store_id::text = ANY (public.my_store_ids()))
  )
);

CREATE POLICY slots_update
ON public.schedule_slots
FOR UPDATE
TO authenticated
USING (
  public.is_admin()
  OR EXISTS (
    SELECT 1 FROM public.schedules sc
    WHERE sc.id = schedule_slots.schedule_id
      AND (sc.store_id::text = ANY (public.my_store_ids()))
  )
)
WITH CHECK (
  public.is_admin()
  OR EXISTS (
    SELECT 1 FROM public.schedules sc
    WHERE sc.id = schedule_slots.schedule_id
      AND (sc.store_id::text = ANY (public.my_store_ids()))
  )
);

CREATE POLICY slots_delete
ON public.schedule_slots
FOR DELETE
TO authenticated
USING (
  public.is_admin()
  OR EXISTS (
    SELECT 1 FROM public.schedules sc
    WHERE sc.id = schedule_slots.schedule_id
      AND (sc.store_id::text = ANY (public.my_store_ids()))
  )
);