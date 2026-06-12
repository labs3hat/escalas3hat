import { createClient } from "npm:@supabase/supabase-js";

const SPREADSHEET_ID = "1p7Fs30H1nzYYOXoYmm0P_4UPA78HfIrHByxbqXhjSvA";
const SUPABASE_URL = process.env.SUPABASE_URL!;
const SERVICE_ROLE = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const LOVABLE_KEY = process.env.LOVABLE_API_KEY!;
const SHEETS_KEY = process.env.GOOGLE_SHEETS_API_KEY!;

const admin = createClient(SUPABASE_URL, SERVICE_ROLE);

async function fetchSheetRows(sheetName: string, range: string) {
  const url = `https://connector-gateway.lovable.dev/google_sheets/v4/spreadsheets/${SPREADSHEET_ID}/values/${encodeURIComponent(sheetName + '!' + range)}`;
  const res = await fetch(url, {
    headers: {
      Authorization: `Bearer ${LOVABLE_KEY}`,
      "X-Connection-Api-Key": SHEETS_KEY,
    },
  });
  if (!res.ok) {
    console.error(`Failed to fetch ${sheetName}:`, await res.text());
    return [];
  }
  const json = await res.json();
  return (json.values ?? []);
}

async function run() {
  console.log("Fetching main rows...");
  const mainRows = await fetchSheetRows("FUNCIONÁRIOS", "A2:B2000");
  const mariaMain = mainRows.find(r => r[1]?.includes("MARIA EDUARDA DA ROCHA"));
  console.log("Maria in main sheet:", mariaMain);

  if (!mariaMain) return;

  console.log("Fetching SJP 1 rows...");
  const sjpRows = await fetchSheetRows("SJP 1 - Loja São José", "A3:I100");
  const mariaSJP = sjpRows.find(r => r[0]?.includes("MARIA EDUARDA DA ROCHA"));
  console.log("Maria in SJP sheet:", mariaSJP);

  if (mariaSJP) {
    const notes = (mariaSJP[8] ?? "").trim();
    console.log("Extracted notes:", notes);
    
    // Check if we can update the DB
    const { data: emp, error: fetchErr } = await admin
      .from("employees")
      .select("id, name, notes")
      .ilike("name", "%MARIA EDUARDA DA ROCHA%")
      .eq("active", true)
      .single();
    
    if (fetchErr) {
      console.error("Error fetching employee from DB:", fetchErr);
      return;
    }
    
    console.log("Found employee in DB:", emp);
    
    if (emp.notes !== notes) {
      console.log(`Updating notes for ${emp.name} to: ${notes}`);
      const { error: updateErr } = await admin
        .from("employees")
        .update({ notes: notes })
        .eq("id", emp.id);
      
      if (updateErr) {
        console.error("Error updating employee notes:", updateErr);
      } else {
        console.log("Successfully updated notes!");
      }
    } else {
      console.log("Notes already match.");
    }
  }
}

run();
