
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const SPREADSHEET_ID = "1p7Fs30H1nzYYOXoYmm0P_4UPA78HfIrHByxbqXhjSvA";
const EMPLOYEES_SHEET_RANGE = "FUNCIONÁRIOS!A2:I2000";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

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

    // 2. Fetch current sheet values to find the row
    const lovableKey = Deno.env.get("LOVABLE_API_KEY");
    const sheetsKey = Deno.env.get("GOOGLE_SHEETS_API_KEY");
    
    const fetchUrl = `https://connector-gateway.lovable.dev/google_sheets/v4/spreadsheets/${SPREADSHEET_ID}/values/${encodeURIComponent(EMPLOYEES_SHEET_RANGE)}`;
    const fetchRes = await fetch(fetchUrl, {
      headers: {
        Authorization: `Bearer ${lovableKey}`,
        "X-Connection-Api-Key": sheetsKey!,
      },
    });
    
    const sheetData = await fetchRes.json();
    const rows = sheetData.values || [];
    
    // Find the row index (1-indexed for Google Sheets range, +1 for starting at A2)
    let rowIndex = -1;
    const storeCode = employee.stores?.code?.toUpperCase();
    const employeeName = employee.name.trim().toUpperCase();

    for (let i = 0; i < rows.length; i++) {
      const rowStoreCode = (rows[i][0] || "").trim().toUpperCase();
      const rowName = (rows[i][1] || "").trim().toUpperCase();
      
      if (rowStoreCode === storeCode && rowName === employeeName) {
        rowIndex = i + 2; // +2 because range starts at A2 (index 0 is row 2)
        break;
      }
    }

    if (rowIndex === -1) {
      // If not found, we could append, but for now let's just return error to be safe
      throw new Error("Employee not found in spreadsheet to update");
    }

    // 3. Prepare row data
    // Sheets Columns: A:Loja, B:Nome, C:Cargo, D:Regime, E:Folga Fixa, F:Estoque?, G:Máquina?, H:Turno, I:Preferencia
    const dayNames = ['domingo', 'segunda', 'terça', 'quarta', 'quinta', 'sexta', 'sábado'];
    const rowData = [
      storeCode,
      employee.name,
      employee.role,
      employee.work_regime,
      employee.fixed_day_off !== null ? dayNames[employee.fixed_day_off] : "",
      employee.responsibilities?.includes('estoque') ? "S" : "N",
      employee.responsibilities?.includes('maquina') ? "S" : "N",
      employee.preferred_shift || "todos",
      employee.preferred_day_off !== null ? dayNames[employee.preferred_day_off] : ""
    ];

    // 4. Update the row
    const updateRange = `FUNCIONÁRIOS!A${rowIndex}:I${rowIndex}`;
    const updateUrl = `https://connector-gateway.lovable.dev/google_sheets/v4/spreadsheets/${SPREADSHEET_ID}/values/${encodeURIComponent(updateRange)}?valueInputOption=USER_ENTERED`;
    
    const updateRes = await fetch(updateUrl, {
      method: "PUT",
      headers: {
        Authorization: `Bearer ${lovableKey}`,
        "X-Connection-Api-Key": sheetsKey!,
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
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
