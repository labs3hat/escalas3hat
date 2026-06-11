export const BUSINESS_RULES = {
  DEFAULT_6X1_HOURS: 500, // 8h20 - interval (standard shift length in minutes)
  DEFAULT_5X2_HOURS: 588, // 9h48 - interval (standard shift length in minutes)
  MAX_WORK_BEFORE_BREAK_MINS: 360, // 6 hours
  MIN_INTERVAL_MINS: 60,
  SLOT_DURATION_MINS: 30,
};

export const WORK_REGIMES = {
  R6X1: '6x1',
  R5X2: '5x2',
} as const;

export const USER_ROLES = {
  GERENTE: 'gerente',
  REGIONAL: 'regional',
  DIRETORIA: 'diretoria',
  RH: 'rh',
} as const;

export const SCHEDULE_STATUS = {
  DRAFT: 'draft',
  PUBLISHED: 'published',
  FROZEN: 'frozen',
} as const;
