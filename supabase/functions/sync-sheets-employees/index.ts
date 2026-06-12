// Sync employees from multiple Google Sheets sources into the `employees` table.
// Primary source: "FUNCIONÁRIOS" tab for active/inactive status and basic info.
// Secondary source: Store-specific tabs for scheduling preferences.
// Reads via Lovable connector gateway (google_sheets). Writes via service role.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const SPREADSHEET_ID = "1p7Fs30H1nzYYOXoYmm0P_4UPA78HfIrHByxbqXhjSvA";

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

function parseFolga(value: string): number | null {
  const v = (value ?? "").trim().toLowerCase();
  if (!v || v === "não" || v === "nao" || v === "-" || v === "todos") return null;
  const key = v.replace(/\./g, "").trim();
  return DAY_NAME_TO_INT[key] ?? null;
}

function parseShifts(value: string): { preferred: string | null; allowed: string[] } {
  const raw = (value ?? "").trim().toLowerCase();
  const all = ["abertura", "intermediario", "fechamento"];
  if (!raw || raw === "todos" || raw === "não" || raw === "nao" || raw === "flutuante") return { preferred: null, allowed: all };
  
  if (raw === "abertura") return { preferred: "abertura", allowed: ["abertura"] };
  if (raw === "fechamento") return { preferred: "fechamento", allowed: ["fechamento"] };
  if (raw === "intermediário" || raw === "intermediario") return { preferred: "intermediario", allowed: ["intermediario"] };
  
  // Fallback for unexpected values
  if (raw.startsWith("abert")) return { preferred: "abertura", allowed: ["abertura"] };
  if (raw.startsWith("fech")) return { preferred: "fechamento", allowed: ["fechamento"] };
  if (raw.startsWith("inter")) return { preferred: "intermediario", allowed: ["intermediario"] };
  
  return { preferred: null, allowed: all };
}

function parseRegime(value: string): "6x1" | "5x2" {
  return (value ?? "").trim().toLowerCase().includes("5x2") ? "5x2" : "6x1";
}

function isYes(value: string): boolean {
  const v = (value ?? "").trim().toLowerCase();
  return v === "s" || v === "sim" || v === "y" || v === "yes" || v === "1";
}

async function fetchSheetRows(sheetName: string, range: string, lovableKey: string, sheetsKey: string): Promise<Row[]> {
  const url = `https://connector-gateway.lovable.dev/google_sheets/v4/spreadsheets/${SPREADSHEET_ID}/values/${encodeURIComponent(sheetName + '!' + range)}`;
  const res = await fetch(url, {
    headers: {
      Authorization: `Bearer ${lovableKey}`,
      "X-Connection-Api-Key": sheetsKey,
    },
  });
  if (!res.ok) return []; 
  const json = await res.json();
  return (json.values ?? []) as Row[];
}

async function getSheetNames(lovableKey: string, sheetsKey: string): Promise<string[]> {
  const url = `https://connector-gateway.lovable.dev/google_sheets/v4/spreadsheets/${SPREADSHEET_ID}`;
  const res = await fetch(url, {
    headers: {
      Authorization: `Bearer ${lovableKey}`,
      "X-Connection-Api-Key": sheetsKey,
    },
  });
  if (!res.ok) throw new Error(`Failed to fetch spreadsheet info: ${await res.text()}`);
  const data = await res.json();
  return data.sheets.map((s: any) => s.properties.title);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const ANON = Deno.env.get("SUPABASE_ANON_KEY")!;
    const lovableKey = Deno.env.get("LOVABLE_API_KEY")!;
    const sheetsKey = Deno.env.get("GOOGLE_SHEETS_API_KEY")!;

    // Auth check
    const authHeader = req.headers.get("Authorization") ?? "";
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

    // Get profile to check permissions
    const { data: profile } = await admin
      .from("profiles").select("role, store_ids").eq("id", userData.user.id).single();
    if (!profile) throw new Error("Profile not found");
    const isAdmin = ["regional", "diretoria", "rh"].includes(profile.role);

    // Get active stores
    const { data: dbStores } = await admin.from("stores").select("id, code, name").eq("active", true);
    const storesMap = new Map<string, any>();
    for (const s of dbStores ?? []) storesMap.set(s.code.toUpperCase(), s);
    
    // Get all existing employees - Group by name+store_id to handle duplicates
    const { data: existing } = await admin.from("employees").select("id, store_id, name, active");
    const existingByKey = new Map<string, any[]>();
    for (const e of existing ?? []) {
      const store = (dbStores ?? []).find(s => s.id === e.store_id);
      if (!store) continue;
      const key = `${store.code.toUpperCase()}::${(e.name as string).trim().toUpperCase()}`;
      if (!existingByKey.has(key)) existingByKey.set(key, []);
      existingByKey.get(key)!.push(e);
    }

    // 1. Fetch main "FUNCIONÁRIOS" sheet (Source of Truth for active/inactive)
    const mainRows = await fetchSheetRows("FUNCIONÁRIOS", "A2:J2000", lovableKey, sheetsKey);
    
    // 2. Fetch all sheet names to find store-specific tabs
    const sheetNames = await getSheetNames(lovableKey, sheetsKey);

    // 3. Collect store-specific data
    const storeSpecificData = new Map<string, any>(); // key: storeCode::employeeName
    
    for (const store of dbStores ?? []) {
      const normalizedCode = store.code.replace(/([a-zA-Z]+)(\d+)/, "$1 $2").toUpperCase();
      const targetSheet = sheetNames.find(s => s.toUpperCase().startsWith(normalizedCode));
      if (!targetSheet) continue;

      const rows = await fetchSheetRows(targetSheet, "A3:I100", lovableKey, sheetsKey);
      for (const row of rows) {
        const name = (row[0] ?? "").trim().toUpperCase();
        if (!name) continue;
        storeSpecificData.set(`${store.code.toUpperCase()}::${name}`, {
          regime: parseRegime(row[2] ?? ""),
          fixedDayOff: parseFolga(row[3] ?? ""),
          responsibilities: [
            ...(isYes(row[4] ?? "") ? ["estoque"] : []),
            ...(isYes(row[5] ?? "") ? ["maquina"] : [])
          ],
          shifts: parseShifts(row[6] ?? ""),
          preferredDayOff: parseFolga(row[7] ?? ""),
          notes: (row[8] ?? "").trim()
        });
      }
    }

    let created = 0, updated = 0, deactivated = 0;
    const processedKeys = new Set<string>();

    // 4. Process employees based on "FUNCIONÁRIOS" tab
    for (const row of mainRows) {
      const storeCode = (row[0] ?? "").trim().toUpperCase();
      const name = (row[1] ?? "").trim();
      if (!storeCode || !name) continue;

      const store = storesMap.get(storeCode);
      if (!store) continue; // Skip employees from unknown stores

      const key = `${storeCode}::${name.toUpperCase()}`;
      processedKeys.add(key);
      
      const role = (row[2] ?? "Atendente").trim();
      
      const specific = storeSpecificData.get(key);
      const candidates = existingByKey.get(key) ?? [];
      const found = candidates.find(c => c.active) || candidates[0];

      const payload: Record<string, unknown> = {
        store_id: store.id,
        name: name,
        role: role,
        active: true, // If they are in the main sheet, they are active
        work_regime: specific?.regime ?? parseRegime(row[3] ?? ""),
        fixed_day_off: specific?.fixedDayOff ?? parseFolga(row[4] ?? ""),
        responsibilities: specific?.responsibilities ?? [
          ...(isYes(row[5] ?? "") ? ["estoque"] : []),
          ...(isYes(row[6] ?? "") ? ["maquina"] : [])
        ],
        preferred_shift: specific?.shifts?.preferred ?? parseShifts(row[7] ?? "").preferred,
        allowed_shifts: specific?.shifts?.allowed ?? parseShifts(row[7] ?? "").allowed,
        preferred_day_off: specific?.preferredDayOff,
        notes: specific?.notes
      };

      if (found) {
        const { error } = await admin.from("employees").update(payload).eq("id", found.id);
        if (error) throw new Error(`Update failed for ${name}: ${error.message}`);
        updated++;
      } else {
        payload.color = COLOR_PALETTE[(created + updated) % COLOR_PALETTE.length];
        const { error } = await admin.from("employees").insert(payload);
        if (error) throw new Error(`Insert failed for ${name}: ${error.message}`);
        created++;
      }
    }

    // 5. Cleanup: Deactivate OR remove duplicates
    for (const [key, emps] of existingByKey) {
      if (processedKeys.has(key)) {
        const mainEmp = emps.find(e => e.active) || emps[0];
        for (const emp of emps) {
          if (emp.id !== mainEmp.id && emp.active) {
            await admin.from("employees").update({ active: false }).eq("id", emp.id);
            deactivated++;
          }
        }
      } else {
        for (const emp of emps) {
          if (emp.active) {
            const { error } = await admin.from("employees").update({ active: false }).eq("id", emp.id);
            if (error) throw new Error(`Deactivate failed for ${emp.name}: ${error.message}`);
            deactivated++;
          }
        }
      }
    }

    return new Response(
      JSON.stringify({ created, updated, deactivated }),
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