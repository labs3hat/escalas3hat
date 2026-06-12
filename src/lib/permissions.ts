import { Profile } from "@/types";

export const permissions = {
  isAdmin(profile: Profile | null): boolean {
    if (!profile) return false;
    return ['regional', 'diretoria', 'rh'].includes(profile.role);
  },

  canEditSchedule(profile: Profile | null, storeId: string): boolean {
    if (!profile) return false;
    if (this.isAdmin(profile)) return true;
    return profile.store_ids?.includes(storeId) ?? false;
  },

  canPublish(profile: Profile | null): boolean {
    if (!profile) return false;
    // For now, managers can also publish their store schedules
    return true;
  }
};
