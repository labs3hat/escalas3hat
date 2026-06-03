-- Limpeza de tabelas de dados dinâmicos (escalas e logs)
-- As tabelas de estrutura (stores, employees, store_rules, shift_templates) NÃO são afetadas.

DELETE FROM public.rule_violations;
DELETE FROM public.schedule_changes;
DELETE FROM public.sunday_off_tracking;
DELETE FROM public.monthly_sunday_off;
DELETE FROM public.freelancer_slots;
DELETE FROM public.hours_bank;

-- Ao deletar de schedules, os registros em schedule_slots são removidos automaticamente via ON DELETE CASCADE
DELETE FROM public.schedules;
