
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const SPREADSHEET_ID = "1p7Fs30H1nzYYOXoYmm0P_4UPA78HfIrHByxbqXhjSvA";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

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
    const { employeeId } = await req.json();
    if (!employeeId) throw new Error("Employee ID is required");

    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const admin = createClient(SUPABASE_URL, SERVICE_ROLE);

    // 1. Get Employee data
    const { data: employee, error: empError } = await admin
      .from("employees")
      .select("*, stores(code)")
      .eq("id", employeeId)
      .single();

    if (empError || !employee) throw new Error("Employee not found");

    const lovableKey = Deno.env.get("LOVABLE_API_KEY")!;
    const sheetsKey = Deno.env.get("GOOGLE_SHEETS_API_KEY")!;

    // 2. Find the correct sheet
    const sheetNames = await getSheetNames(lovableKey, sheetsKey);
    const normalizedCode = employee.stores.code.replace(/([a-zA-Z]+)(\d+)/, "$1 $2").toUpperCase();
    const targetSheet = sheetNames.find(s => s.toUpperCase().startsWith(normalizedCode));

    if (!targetSheet) throw new Error(`Target sheet for store ${employee.stores.code} not found`);

    // 3. Fetch current sheet values to find the row
    const fetchRange = `${targetSheet}!A3:A100`;
    const fetchUrl = `https://connector-gateway.lovable.dev/google_sheets/v4/spreadsheets/${SPREADSHEET_ID}/values/${encodeURIComponent(fetchRange)}`;
    const fetchRes = await fetch(fetchUrl, {
      headers: {
        Authorization: `Bearer ${lovableKey}`,
        "X-Connection-Api-Key": sheetsKey,
      },
    });
    
    const sheetData = await fetchRes.json();
    const rows = sheetData.values || [];
    
    // Find the row index (1-indexed, starting at A3)
    let rowIndex = -1;
    const employeeName = employee.name.trim().toUpperCase();

    for (let i = 0; i < rows.length; i++) {
      const rowName = (rows[i][0] || "").trim().toUpperCase();
      if (rowName === employeeName) {
        rowIndex = i + 3; // +3 because range starts at A3
        break;
      }
    }

    if (rowIndex === -1) {
      throw new Error("Employee not found in spreadsheet to update");
    }

    // 4. Prepare row data (Columns D to H)
    // D:Folga fixa, E:Estoque, F:Máquina, G:Turno, H:Restrição (Preferência)
    const dayNamesAbbr = ["Não", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];
    // Since dayNamesAbbr[0] is "Não", and fixed_day_off/preferred_day_off are 1-based for Mon-Sat (based on DAY_NAME_TO_INT logic in sync),
    // but standard JS getDay() is 0-Sun. 
    // Wait, in sync function: dom=0, seg=1, ter=2, qua=3, qui=4, sex=5, sab=6.
    // The list in sheet is "Seg", "Ter", "Qua", "Qui", "Sex", "Não". (No Sunday/Saturday mentioned in user's prompt list but "Sáb" might exist)
    
    const getSheetDay = (val: number | null) => {
      if (val === null) return "Não";
      const mapping: Record<number, string> = {
        1: "Seg", 2: "Ter", 3: "Qua", 4: "Qui", 5: "Sex", 6: "Sáb", 0: "Dom"
      };
      return mapping[val] || "Não";
    };

    const fixedDayOffText = getSheetDay(employee.fixed_day_off);
    const estoqueText = employee.responsibilities?.includes('estoque') ? "S" : "N";
    const maquinaText = employee.responsibilities?.includes('maquina') ? "S" : "N";
    
    let shiftText = "Todos";
    if (employee.preferred_shift === "abertura") shiftText = "Abertura";
    else if (employee.preferred_shift === "intermediário" || employee.preferred_shift === "intermediario") shiftText = "Intermediário";
    else if (employee.preferred_shift === "fechamento") shiftText = "Fechamento";
    
    const preferredDayOffText = getSheetDay(employee.preferred_day_off);

    const rowData = [
      fixedDayOffText,
      estoqueText,
      maquinaText,
      shiftText,
      preferredDayOffText
    ];

    // 5. Update the row (Range D to H)
    const updateRange = `${targetSheet}!D${rowIndex}:H${rowIndex}`;
    const updateUrl = `https://connector-gateway.lovable.dev/google_sheets/v4/spreadsheets/${SPREADSHEET_ID}/values/${encodeURIComponent(updateRange)}?valueInputOption=USER_ENTERED`;
    
    const updateRes = await fetch(updateUrl, {
      method: "PUT",
      headers: {
        Authorization: `Bearer ${lovableKey}`,
        "X-Connection-Api-Key": sheetsKey,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        values: [rowData]
      }),
    });

    if (!updateRes.ok) {
      const errText = await updateRes.text();
      throw new Error(`Failed to update sheet: ${errText}`);
    }

    return new Response(JSON.stringify({ success: true }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("update-sheet-employee error:", err);
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});