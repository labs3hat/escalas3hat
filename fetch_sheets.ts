const SPREADSHEET_ID = "1p7Fs30H1nzYYOXoYmm0P_4UPA78HfIrHByxbqXhjSvA";
const lovableKey = process.env.LOVABLE_API_KEY;
const sheetsKey = process.env.GOOGLE_SHEETS_API_KEY;

async function getSheetNames() {
  const url = `https://connector-gateway.lovable.dev/google_sheets/v4/spreadsheets/${SPREADSHEET_ID}`;
  const res = await fetch(url, {
    headers: {
      Authorization: `Bearer ${lovableKey}`,
      "X-Connection-Api-Key": sheetsKey,
    },
  });
  const data = await res.json();
  return data.sheets.map((s: any) => s.properties.title);
}

async function fetchSheetRows(sheetName: string, range: string) {
  const url = `https://connector-gateway.lovable.dev/google_sheets/v4/spreadsheets/${SPREADSHEET_ID}/values/${encodeURIComponent(sheetName + '!' + range)}`;
  const res = await fetch(url, {
    headers: {
      Authorization: `Bearer ${lovableKey}`,
      "X-Connection-Api-Key": sheetsKey,
    },
  });
  const json = await res.json();
  return json.values || [];
}

async function run() {
  try {
    const names = await getSheetNames();
    console.log("Sheet names found:", names);

    const sheetsToFetch = ["FUNCIONÁRIOS"];
    const sjpTab = names.find(n => n.toUpperCase().includes("SJP"));
    if (sjpTab) sheetsToFetch.push(sjpTab);

    for (const sheet of sheetsToFetch) {
      console.log(`\n--- ${sheet} (A1:I3) ---`);
      const rows = await fetchSheetRows(sheet, "A1:I3");
      rows.forEach((row, i) => {
        console.log(`Row ${i + 1}: ${JSON.stringify(row)}`);
      });
    }
  } catch (e) {
    console.error(e);
  }
}

run();
