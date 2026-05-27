// Sync stores from Google Sheets (LOJAS tab) into the `stores` table.
// Reads via Lovable connector gateway (google_sheets). Writes via service role.
// Auth: requires a valid Supabase user JWT with role regional/diretoria/rh.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const SPREADSHEET_ID = "1p7Fs30H1nzYYOXoYmm0P_4UPA78HfIrHByxbqXhjSvA";
const SHEET_RANGE = "LOJAS!A2:X2000";

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
  // Already HH:MM or HH:MM:SS
  if (/^\d{1,2}:\d{2}(:\d{2})?$/.test(raw)) {
    const [h, m] = raw.split(":");
    return `${h.padStart(2, "0")}:${m}`;
  }
  // Excel decimal fraction of a day
  const num = Number(raw.replace(",", "."));
  if (!isFinite(num)) return null;
  const totalMin = Math.round(num * 24 * 60);
  const h = Math.floor(totalMin / 60) % 24;
  const m = totalMin % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

function parseDays(value: string): number[] {
  const raw = (value ?? "").trim();
  if (!raw) return [];
  return raw
    .split(/[,;/\s]+/)
    .map((p) => p.trim().toLowerCase().replace(/\./g, ""))
    .filter(Boolean)
    .map((p) => {
      if (/^\d+$/.test(p)) return Number(p);
      return DAY_NAME_TO_INT[p];
    })
    .filter((n): n is number => typeof n === "number" && n >= 0 && n <= 6);
}

function parseInt0(value: string, fallback = 0): number {
  const n = parseInt((value ?? "").toString().replace(",", "."), 10);
  return isFinite(n) ? n : fallback;
}

function parseNum(value: string, fallback = 0): number {
  const n = Number((value ?? "").toString().replace(",", "."));
  return isFinite(n) ? n : fallback;
}

async function fetchSheetRows(): Promise<Row[]> {
  const lovableKey = Deno.env.get("LOVABLE_API_KEY");
  const sheetsKey = Deno.env.get("GOOGLE_SHEETS_API_KEY");
  if (!lovableKey) throw new Error("LOVABLE_API_KEY not configured");
  if (!sheetsKey) throw new Error("GOOGLE_SHEETS_API_KEY not configured");

  const url = `https://connector-gateway.lovable.dev/google_sheets/v4/spreadsheets/${SPREADSHEET_ID}/values/${encodeURIComponent(SHEET_RANGE)}`;
  const res = await fetch(url, {
    headers: {
      Authorization: `Bearer ${lovableKey}`,
      "X-Connection-Api-Key": sheetsKey,
    },
  });
  if (!res.ok) {
    const txt = await res.text();
    throw new Error(`Sheets gateway error ${res.status}: ${txt}`);
  }
  const json = await res.json();
  return (json.values ?? []) as Row[];
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
    const { data: userData, error: userErr } = await userClient.auth.getUser();
    if (userErr || !userData.user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const admin = createClient(SUPABASE_URL, SERVICE_ROLE);

    const { data: profile } = await admin
      .from("profiles").select("role").eq("id", userData.user.id).single();
    if (!profile || !["regional", "diretoria", "rh"].includes(profile.role)) {
      return new Response(JSON.stringify({ error: "Forbidden — requires regional/rh/diretoria" }), {
        status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: existing } = await admin.from("stores").select("id, code");
    const codeToId = new Map<string, string>();
    for (const s of existing ?? []) {
      codeToId.set((s.code as string).toUpperCase(), s.id as string);
    }

    const rows = await fetchSheetRows();
    let created = 0, updated = 0, skipped = 0;

    for (const row of rows) {
      const code = (row[0] ?? "").trim().toUpperCase();
      const name = (row[1] ?? "").trim();
      if (!code || !name) { skipped++; continue; }

      const payload: Record<string, unknown> = {
        code,
        name,
        type: (row[2] ?? "").trim() || "shopping",
        shopping: (row[3] ?? "").trim(),
        city: (row[4] ?? "").trim(),
        region: (row[5] ?? "").trim() || "sudeste",
        opening_time_weekday: parseTime(row[6]) ?? "10:00",
        closing_time_weekday: parseTime(row[7]),
        opening_time_saturday: parseTime(row[8]) ?? "10:00",
        closing_time_saturday: parseTime(row[9]),
        opening_time_sunday: parseTime(row[10]) ?? "12:00",
        closing_time_sunday: parseTime(row[11]),
        machine_wash_days: parseDays(row[12]),
        stock_count_days: parseDays(row[13]),
        min_opening_staff: parseInt0(row[14], 1),
        min_opening_weekend: parseInt0(row[15], 1),
        min_closing_staff: parseInt0(row[16], 2),
        min_closing_weekend: parseInt0(row[17], 1),
        min_weekday_staff: parseInt0(row[18], 2),
        min_weekend_staff: parseInt0(row[19], 3),
        min_sunday_staff: parseInt0(row[20], 1),
        display_order: parseInt0(row[21], 0),
        weekly_hours_6x1: parseNum(row[22], 44),
        weekly_hours_5x2: parseNum(row[23], 44),
        active: true,
      };

      const existingId = codeToId.get(code);
      if (existingId) {
        const { error } = await admin.from("stores").update(payload).eq("id", existingId);
        if (error) throw new Error(`Update ${code}: ${error.message}`);
        updated++;
      } else {
        const { error } = await admin.from("stores").insert(payload);
        if (error) throw new Error(`Insert ${code}: ${error.message}`);
        created++;
      }
    }

    return new Response(
      JSON.stringify({ created, updated, skipped }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (err) {
    console.error("sync-sheets-stores error:", err);
    return new Response(
      JSON.stringify({ error: (err as Error).message ?? "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
