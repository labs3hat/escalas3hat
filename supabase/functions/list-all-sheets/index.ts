import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const SPREADSHEET_ID = "1p7Fs30H1nzYYOXoYmm0P_4UPA78HfIrHByxbqXhjSvA";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const lovableKey = Deno.env.get("LOVABLE_API_KEY");
    const sheetsKey = Deno.env.get("GOOGLE_SHEETS_API_KEY");

    if (!lovableKey || !sheetsKey) {
      throw new Error("Missing API keys");
    }

    const url = "https://connector-gateway.lovable.dev/google_sheets/v4/spreadsheets/" + SPREADSHEET_ID;
    const res = await fetch(url, {
      headers: {
        Authorization: "Bearer " + lovableKey,
        "X-Connection-Api-Key": sheetsKey,
      },
    });

    if (!res.ok) {
      const txt = await res.text();
      return new Response(JSON.stringify({ error: "Sheets API error: " + txt }), {
        status: res.status,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const data = await res.json();
    const sheetNames = data.sheets.map((s: any) => s.properties.title);

    const allData: Record<string, any> = {};

    for (const name of sheetNames) {
      const rangeUrl = "https://connector-gateway.lovable.dev/google_sheets/v4/spreadsheets/" + SPREADSHEET_ID + "/values/" + encodeURIComponent(name + "!A1:Z5");
      const rangeRes = await fetch(rangeUrl, {
        headers: {
          Authorization: "Bearer " + lovableKey,
          "X-Connection-Api-Key": sheetsKey,
        },
      });
      if (rangeRes.ok) {
        const rangeData = await rangeRes.json();
        allData[name] = rangeData.values || [];
      }
    }

    return new Response(JSON.stringify({ sheets: sheetNames, data: allData }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
