// Compare Google Sheets data vs database. READ-ONLY — returns a diff,
// never writes. Auth: requires regional/rh/diretoria role.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const SPREADSHEET_ID = "1p7Fs30H1nzYYOXoYmm0P_4UPA78HfIrHByxbqXhjSvA";
const STORES_RANGE = "LOJAS!A2:X2000";
const EMPLOYEES_RANGE = "FUNCIONÁRIOS!A2:J2000";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const DAY_NAME_TO_INT: Record<string, number> = {
  dom: 0, domingo: 0,
  seg: 1, segunda: 1,
  ter: 2, terca: 2, "terça": 2,
  qua: 3, quarta: 3,
  qui: 4, quinta: 4,
  sex: 5, sexta: 5,
  sab: 6, sabado: 6, "sábado": 6,
};

type Row = string[];

function parseTime(value: string): string | null {
  const raw = (value ?? "").trim();
  if (!raw) return null;
  if (/^\d{1,2}:\d{2}(:\d{2})?$/.test(raw)) {
    const [h, m] = raw.split(":");
    return `${h.padStart(2, "0")}:${m}`;
  }
  const num = Number(raw.replace(",", "."));
  if (!isFinite(num)) return null;
  const totalMin = Math.round(num * 24 * 60);
  const h = Math.floor(totalMin / 60) % 24;
  const m = totalMin % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

function normalizeDbTime(value: string | null): string | null {
  if (!value) return null;
  return value.slice(0, 5);
}

function parseDays(value: string): number[] {
  const raw = (value ?? "").trim();
  if (!raw) return [];
  return raw
    .split(/[,;/\s]+/)
    .map((p) => p.trim().toLowerCase().replace(/\./g, ""))
    .filter(Boolean)
    .map((p) => (/^\d+$/.test(p) ? Number(p) : DAY_NAME_TO_INT[p]))
    .filter((n): n is number => typeof n === "number" && n >= 0 && n <= 6)
    .sort((a, b) => a - b);
}

function parseIntS(value: string, fb = 0): number {
  const n = parseInt((value ?? "").toString().replace(",", "."), 10);
  return isFinite(n) ? n : fb;
}
function parseNum(value: string, fb = 0): number {
  const n = Number((value ?? "").toString().replace(",", "."));
  return isFinite(n) ? n : fb;
}

function parseFolga(value: string, regime: string): number | null {
  if (regime !== "5x2") return null;
  const v = (value ?? "").trim().toLowerCase();
  if (!v || v.startsWith("não") || v.startsWith("nao") || v === "-") return null;
  const key = v.replace(/\./g, "").trim();
  return DAY_NAME_TO_INT[key] ?? null;
}

function parseShifts(value: string): string {
  const raw = (value ?? "").trim().toLowerCase();
  if (!raw || raw === "todos") return "flutuante";
  if (raw.startsWith("abert")) return "abertura";
  if (raw.startsWith("fech")) return "fechamento";
  if (raw.startsWith("inter")) return "intermediario";
  return "flutuante";
}

function parseRegime(value: string): "6x1" | "5x2" {
  return (value ?? "").trim().toLowerCase().includes("5x2") ? "5x2" : "6x1";
}

function isYes(value: string): boolean {
  const v = (value ?? "").trim().toLowerCase();
  return v === "s" || v === "sim" || v === "y" || v === "yes" || v === "1";
}

async function fetchRange(range: string): Promise<Row[]> {
  const lovableKey = Deno.env.get("LOVABLE_API_KEY");
  const sheetsKey = Deno.env.get("GOOGLE_SHEETS_API_KEY");
  if (!lovableKey || !sheetsKey) throw new Error("Sheets credentials missing");
  const url = `https://connector-gateway.lovable.dev/google_sheets/v4/spreadsheets/${SPREADSHEET_ID}/values/${encodeURIComponent(range)}`;
  const res = await fetch(url, {
    headers: {
      Authorization: `Bearer ${lovableKey}`,
      "X-Connection-Api-Key": sheetsKey,
    },
  });
  if (!res.ok) throw new Error(`Sheets ${range}: ${res.status} ${await res.text()}`);
  const json = await res.json();
  return (json.values ?? []) as Row[];
}

type Diff = {
  field: string;
  db: unknown;
  sheet: unknown;
};

function compare(fields: Record<string, [unknown, unknown]>): Diff[] {
  const out: Diff[] = [];
  for (const [field, [db, sheet]] of Object.entries(fields)) {
    const a = Array.isArray(db) ? JSON.stringify(db) : String(db ?? "");
    const b = Array.isArray(sheet) ? JSON.stringify(sheet) : String(sheet ?? "");
    if (a !== b) out.push({ field, db, sheet });
  }
  return out;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const ANON = Deno.env.get("SUPABASE_ANON_KEY")!;

    const authHeader = req.headers.get("Authorization") ?? "";
    if (!authHeader.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const userClient = createClient(SUPABASE_URL, ANON, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: userData } = await userClient.auth.getUser();
    if (!userData.user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const admin = createClient(SUPABASE_URL, SERVICE_ROLE);
    const { data: profile } = await admin
      .from("profiles").select("role").eq("id", userData.user.id).single();
    if (!profile || !["regional", "diretoria", "rh"].includes(profile.role)) {
      return new Response(JSON.stringify({ error: "Forbidden" }), {
        status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const [storesRows, empRows, { data: dbStores }, { data: dbEmployees }] = await Promise.all([
      fetchRange(STORES_RANGE),
      fetchRange(EMPLOYEES_RANGE),
      admin.from("stores").select("*"),
      admin.from("employees").select("*"),
    ]);

    // ── Stores diff ────────────────────────────────────────────────
    const dbStoreByCode = new Map<string, any>();
    for (const s of dbStores ?? []) dbStoreByCode.set((s.code as string).toUpperCase(), s);

    const sheetStoreCodes = new Set<string>();
    const storeResults: any[] = [];

    for (const row of storesRows) {
      const code = (row[0] ?? "").trim().toUpperCase();
      const name = (row[1] ?? "").trim();
      if (!code || !name) continue;
      sheetStoreCodes.add(code);

      const sheet = {
        name,
        opening_time_weekday: parseTime(row[6]),
        closing_time_weekday: parseTime(row[7]),
        opening_time_saturday: parseTime(row[8]),
        closing_time_saturday: parseTime(row[9]),
        opening_time_sunday: parseTime(row[10]),
        closing_time_sunday: parseTime(row[11]),
        machine_wash_days: parseDays(row[12]),
        stock_count_days: parseDays(row[13]),
        min_opening_staff: parseIntS(row[14], 1),
        min_opening_weekend: parseIntS(row[15], 1),
        min_closing_staff: parseIntS(row[16], 2),
        min_closing_weekend: parseIntS(row[17], 1),
        min_weekday_staff: parseIntS(row[18], 2),
        min_weekend_staff: parseIntS(row[19], 3),
        min_sunday_staff: parseIntS(row[20], 1),
        weekly_hours_6x1: parseNum(row[22], 44),
        weekly_hours_5x2: parseNum(row[23], 44),
      };

      const db = dbStoreByCode.get(code);
      if (!db) {
        storeResults.push({ status: "new", code, name, sheet });
        continue;
      }
      const diffs = compare({
        name: [db.name, sheet.name],
        opening_time_weekday: [normalizeDbTime(db.opening_time_weekday), sheet.opening_time_weekday],
        closing_time_weekday: [normalizeDbTime(db.closing_time_weekday), sheet.closing_time_weekday],
        opening_time_saturday: [normalizeDbTime(db.opening_time_saturday), sheet.opening_time_saturday],
        closing_time_saturday: [normalizeDbTime(db.closing_time_saturday), sheet.closing_time_saturday],
        opening_time_sunday: [normalizeDbTime(db.opening_time_sunday), sheet.opening_time_sunday],
        closing_time_sunday: [normalizeDbTime(db.closing_time_sunday), sheet.closing_time_sunday],
        machine_wash_days: [[...(db.machine_wash_days ?? [])].sort((a, b) => a - b), sheet.machine_wash_days],
        stock_count_days: [[...(db.stock_count_days ?? [])].sort((a, b) => a - b), sheet.stock_count_days],
        min_opening_staff: [db.min_opening_staff, sheet.min_opening_staff],
        min_opening_weekend: [db.min_opening_weekend, sheet.min_opening_weekend],
        min_closing_staff: [db.min_closing_staff, sheet.min_closing_staff],
        min_closing_weekend: [db.min_closing_weekend, sheet.min_closing_weekend],
        min_weekday_staff: [db.min_weekday_staff, sheet.min_weekday_staff],
        min_weekend_staff: [db.min_weekend_staff, sheet.min_weekend_staff],
        min_sunday_staff: [db.min_sunday_staff, sheet.min_sunday_staff],
        weekly_hours_6x1: [Number(db.weekly_hours_6x1 ?? 44), sheet.weekly_hours_6x1],
        weekly_hours_5x2: [Number(db.weekly_hours_5x2 ?? 44), sheet.weekly_hours_5x2],
      });
      storeResults.push({
        status: diffs.length === 0 ? "equal" : "diff",
        code, name: db.name, diffs,
      });
    }
    for (const [code, db] of dbStoreByCode) {
      if (!sheetStoreCodes.has(code)) {
        storeResults.push({ status: "inactive", code, name: db.name });
      }
    }

    // ── Employees diff ─────────────────────────────────────────────
    const dbEmpByKey = new Map<string, any>();
    for (const e of dbEmployees ?? []) {
      const store = (dbStores ?? []).find((s) => s.id === e.store_id);
      const code = store ? (store.code as string).toUpperCase() : "";
      dbEmpByKey.set(`${code}::${(e.name as string).trim().toUpperCase()}`, e);
    }

    const sheetEmpKeys = new Set<string>();
    const empResults: any[] = [];

    for (const row of empRows) {
      const code = (row[0] ?? "").trim().toUpperCase();
      const name = (row[1] ?? "").trim();
      if (!code || !name) continue;
      const key = `${code}::${name.toUpperCase()}`;
      sheetEmpKeys.add(key);

      const regime = parseRegime(row[3] ?? "");
      const responsibilities: string[] = [];
      if (isYes(row[5] ?? "")) responsibilities.push("estoque");
      if (isYes(row[6] ?? "")) responsibilities.push("maquina");
      responsibilities.sort();

      const sheet = {
        role: (row[2] ?? "Atendente").trim() || "Atendente",
        work_regime: regime,
        fixed_day_off: parseFolga(row[4] ?? "", regime),
        responsibilities,
        preferred_shift: parseShifts(row[7] ?? ""),
      };

      const db = dbEmpByKey.get(key);
      if (!db) {
        empResults.push({ status: "new", code, name, sheet });
        continue;
      }
      const dbResp = [...(db.responsibilities ?? [])].sort();
      const diffs = compare({
        role: [db.role, sheet.role],
        work_regime: [db.work_regime, sheet.work_regime],
        fixed_day_off: [db.fixed_day_off, sheet.fixed_day_off],
        responsibilities: [dbResp, sheet.responsibilities],
        preferred_shift: [db.preferred_shift, sheet.preferred_shift],
        active: [db.active, true],
      });
      empResults.push({
        status: diffs.length === 0 ? "equal" : "diff",
        code, name: db.name, diffs, active: db.active,
      });
    }
    for (const [key, db] of dbEmpByKey) {
      if (!sheetEmpKeys.has(key) && db.active) {
        const [code] = key.split("::");
        empResults.push({ status: "inactive", code, name: db.name });
      }
    }

    return new Response(
      JSON.stringify({ stores: storeResults, employees: empResults }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (err) {
    console.error("check-sheets-consistency error:", err);
    return new Response(
      JSON.stringify({ error: (err as Error).message ?? "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
