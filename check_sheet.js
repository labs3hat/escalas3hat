
const SPREADSHEET_ID = "1p7Fs30H1nzYYOXoYmm0P_4UPA78HfIrHByxbqXhjSvA";
const SHEET_RANGE = "LOJAS!A2:X2000";

async function checkSheet() {
  const lovableKey = process.env.LOVABLE_API_KEY;
  const sheetsKey = process.env.GOOGLE_SHEETS_API_KEY;
  
  const url = `https://connector-gateway.lovable.dev/google_sheets/v4/spreadsheets/${SPREADSHEET_ID}/values/${encodeURIComponent(SHEET_RANGE)}`;
  const res = await fetch(url, {
    headers: {
      Authorization: `Bearer ${lovableKey}`,
      "X-Connection-Api-Key": sheetsKey,
    },
  });
  
  if (!res.ok) {
    console.error(await res.text());
    return;
  }
  
  const json = await res.json();
  const rows = json.values || [];
  
  const regions = new Set();
  const types = new Set();
  
  for (const row of rows) {
    types.add(row[2]);
    regions.add(row[5]);
  }
  
  console.log("Types:", Array.from(types));
  console.log("Regions:", Array.from(regions));
}

checkSheet();
