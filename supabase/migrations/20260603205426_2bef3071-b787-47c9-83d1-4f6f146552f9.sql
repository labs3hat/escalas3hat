-- Remove references first to avoid FK violations
DELETE FROM public.sunday_off_tracking WHERE employee_id = '01e40565-734b-45b8-a5e9-31d7868f45d2';
DELETE FROM public.schedule_changes WHERE employee_id = '01e40565-734b-45b8-a5e9-31d7868f45d2';
DELETE FROM public.hours_bank WHERE employee_id = '01e40565-734b-45b8-a5e9-31d7868f45d2';
DELETE FROM public.schedule_slots WHERE employee_id = '01e40565-734b-45b8-a5e9-31d7868f45d2';

-- Now delete the duplicate employee
DELETE FROM public.employees 
WHERE id = '01e40565-734b-45b8-a5e9-31d7868f45d2';