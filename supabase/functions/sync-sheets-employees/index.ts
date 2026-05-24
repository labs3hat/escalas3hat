// Sync employees from Google Sheets (FUNCIONÁRIOS tab) into the `employees` table.
// Reads via Lovable connector gateway (google_sheets). Writes via service role.
// Auth: requires a valid Supabase user JWT.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const SPREADSHEET_ID = "1p7Fs30H1nzYYOXoYmm0P_4UPA78HfIrHByxbqXhjSvA";
const SHEET_RANGE = "FUNCIONÁRIOS!A2:J2000";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const COLOR_PALETTE = [
  "#185FA5", "#E11D48", "#16A34A", "#9333EA", "#EA580C", "#0891B2",
  "#CA8A04", "#DB2777", "#65A30D", "#7C3AED", "#DC2626", "#0EA5E9",
];

const DAY_NAME_TO_INT: Record<string, number> = {
  dom: 0, domingo: 0,
  seg: 1, "seg.": 1, segunda: 1, "segunda-feira": 1,
  ter: 2, "ter.": 2, terca: 2, "terça": 2, "terça-feira": 2, "terca-feira": 2,
  qua: 3, "qua.": 3, quarta: 3, "quarta-feira": 3,
  qui: 4, "qui.": 4, quinta: 4, "quinta-feira": 4,
  sex: 5, "sex.": 5, sexta: 5, "sexta-feira": 5,
  sab: 6, "sab.": 6, sabado: 6, "sábado": 6, "sabado-feira": 6,
};

type Row = string[];

function parseFolga(value: string, regime: string): number | null {
  if (regime !== "5x2") return null;
  const v = (value ?? "").trim().toLowerCase();
  if (!v || v.startsWith("não") || v.startsWith("nao") || v === "-") return null;
  const key = v.replace(/\./g, "").trim();
  return DAY_NAME_TO_INT[key] ?? null;
}

function parseShifts(value: string): { preferred: string; allowed: string[] } {
  const raw = (value ?? "").trim().toLowerCase();
  const all = ["abertura", "intermediario", "fechamento"];
  if (!raw || raw === "todos") return { preferred: "flutuante", allowed: all };
  if (raw.startsWith("abert")) return { preferred: "abertura", allowed: ["abertura"] };
  if (raw.startsWith("fech")) return { preferred: "fechamento", allowed: ["fechamento"] };
  if (raw.startsWith("inter")) return { preferred: "intermediario", allowed: ["intermediario"] };
  return { preferred: "flutuante", allowed: all };
}

function parseRegime(value: string): "6x1" | "5x2" {
  return (value ?? "").trim().toLowerCase().includes("5x2") ? "5x2" : "6x1";
}

function isYes(value: string): boolean {
  const v = (value ?? "").trim().toLowerCase();
  return v === "s" || v === "sim" || v === "y" || v === "yes" || v === "1";
}

async function fetchSheetRows(): Promise<Row[]> {
  const lovableKey = Deno.env.get("LOVABLE_API_KEY");
  const sheetsKey = Deno.env.get("GOOGLE_SHEETS_API_KEY");
  if (!lovableKey) throw new Error("LOVABLE_API_KEY not configured");
  if (!sheetsKey) throw new Error("GOOGLE_SHEETS_API_KEY not configured (link Google Sheets connector)");

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

    // Auth check
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

    // Resolve which stores the user can sync
    const { data: profile } = await admin
      .from("profiles").select("role, store_ids").eq("id", userData.user.id).single();
    if (!profile) {
      return new Response(JSON.stringify({ error: "Profile not found" }), {
        status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const isAdmin = ["regional", "diretoria", "rh"].includes(profile.role);

    const { data: stores } = await admin.from("stores").select("id, code").eq("active", true);
    const allStores = stores ?? [];
    const codeToId = new Map<string, string>();
    for (const s of allStores) codeToId.set((s.code as string).toUpperCase(), s.id as string);

    const allowedStoreIds = new Set<string>(
      isAdmin ? allStores.map((s) => s.id as string) : (profile.store_ids ?? []),
    );

    // Fetch existing employees once (only for stores we may touch)
    const allowedIdList = Array.from(allowedStoreIds);
    const { data: existing } = allowedIdList.length
      ? await admin.from("employees").select("id, store_id, name, active").in("store_id", allowedIdList)
      : { data: [] as any[] };
    const existingByKey = new Map<string, { id: string; active: boolean }>();
    for (const e of existing ?? []) {
      existingByKey.set(`${e.store_id}::${(e.name as string).trim().toUpperCase()}`, {
        id: e.id, active: e.active,
      });
    }

    // Pull rows from Sheets
    const rows = await fetchSheetRows();

    let created = 0, updated = 0, skipped = 0;
    const touchedKeys = new Set<string>();
    const touchedStores = new Set<string>();

    for (const row of rows) {
      const codeRaw = (row[0] ?? "").trim().toUpperCase();
      const name = (row[1] ?? "").trim();
      if (!codeRaw || !name) { skipped++; continue; }
      const storeId = codeToId.get(codeRaw);
      if (!storeId || !allowedStoreIds.has(storeId)) { skipped++; continue; }

      const role = (row[2] ?? "Atendente").trim() || "Atendente";
      const regime = parseRegime(row[3] ?? "");
      const fixedDayOff = parseFolga(row[4] ?? "", regime);
      const responsibilities: string[] = [];
      if (isYes(row[5] ?? "")) responsibilities.push("estoque");
      if (isYes(row[6] ?? "")) responsibilities.push("maquina");
      const { preferred, allowed } = parseShifts(row[7] ?? "");
      const notes = (row[9] ?? "").trim();

      const key = `${storeId}::${name.toUpperCase()}`;
      touchedKeys.add(key);
      touchedStores.add(storeId);
      const found = existingByKey.get(key);

      const payload: Record<string, unknown> = {
        store_id: storeId,
        name,
        role,
        work_regime: regime,
        fixed_day_off: fixedDayOff,
        responsibilities,
        preferred_shift: preferred,
        allowed_shifts: allowed,
        notes,
        active: true,
      };

      if (found) {
        const { error } = await admin.from("employees").update(payload).eq("id", found.id);
        if (error) throw new Error(`Update failed for ${name}: ${error.message}`);
        updated++;
      } else {
        payload.color = COLOR_PALETTE[created % COLOR_PALETTE.length];
        const { error } = await admin.from("employees").insert(payload);
        if (error) throw new Error(`Insert failed for ${name}: ${error.message}`);
        created++;
      }
    }

    // Deactivate employees in synced stores that no longer appear in the sheet
    let deactivated = 0;
    for (const [key, info] of existingByKey) {
      const [storeId] = key.split("::");
      if (!touchedStores.has(storeId)) continue;
      if (touchedKeys.has(key)) continue;
      if (!info.active) continue;
      const { error } = await admin.from("employees").update({ active: false }).eq("id", info.id);
      if (error) throw new Error(`Deactivate failed: ${error.message}`);
      deactivated++;
    }

    return new Response(
      JSON.stringify({ created, updated, deactivated, skipped }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (err) {
    console.error("sync-sheets-employees error:", err);
    return new Response(
      JSON.stringify({ error: (err as Error).message ?? "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
