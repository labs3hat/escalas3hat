Implement the "Alterações" module to track and display changes made to published schedules.

### 1. Database & Types
- Update `schedule_changes` table via migration (already started, but ensuring all columns match).
- Update `ScheduleChange` interface in `src/types/index.ts`.

### 2. Schedule Editing (SlotModal)
- Update `SlotModal.tsx` to include a mandatory "Reason" field when editing a published schedule.
- Update `GradeHoraria.tsx` to pass the schedule status to the modal.

### 3. Logic (EscalasClient)
- Update `updateDayWithAudit` in `EscalasClient.tsx` to calculate differences between old and new slots.
- Insert audit record into `schedule_changes` when a published schedule is modified.

### 4. Alterações Screen
- Refactor `AlteracoesClient.tsx` to display the list of changes with filters (Week, Store, Employee).
- Implement the "Sincronizar tudo" functionality if applicable (though this was mentioned in a previous turn, I'll ensure the UI for changes is complete).

### 5. Employee Awareness
- Add logic to show pending changes to employees.
- Implement "Confirmar ciência" button in the employee's view.

Technical Details:
- Mandatory reason for published schedules (min 10 chars).
- RLS policies to restrict visibility by store and role.
- Filtering by current week as default.