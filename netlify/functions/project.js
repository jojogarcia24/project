// netlify/functions/project.js
export async function handler(event) {
  try {
    const { slug } = Object.fromEntries(new URLSearchParams(event.queryStringParameters));
    if (!slug) {
      return resp(400, { error: "Missing 'slug' query param" });
    }

    const apiKey = process.env.AIRTABLE_API_KEY;
    const baseId = process.env.AIRTABLE_BASE_ID;
    const table = process.env.AIRTABLE_TABLE || "Projects";
    if (!apiKey || !baseId) {
      return resp(500, { error: "Missing Airtable env vars (AIRTABLE_API_KEY, AIRTABLE_BASE_ID)" });
    }

    // Try to match either {Slug} or {Project Name} to the provided slug
    const formula = `OR({Slug}='${escapeAirtable(slug)}',{Project Name}='${escapeAirtable(slug)}')`;
    const url = `https://api.airtable.com/v0/${baseId}/${encodeURIComponent(table)}?maxRecords=1&filterByFormula=${encodeURIComponent(formula)}`;

    const res = await fetch(url, {
      headers: {
        Authorization: `Bearer ${apiKey}`
      }
    });

    if (!res.ok) {
      const t = await res.text();
      return resp(res.status, { error: "Airtable request failed", details: t });
    }
    const json = await res.json();
    if (!json.records || json.records.length === 0) {
      return resp(404, { error: "No record found for that slug" });
    }

    const rec = json.records[0];
    const f = rec.fields;

    // Normalize fields to what the frontend expects
    const project = {
      "Project Name": f["Project Name"] || f["Name"] || "",
      "Address": f["Address"] || "",
      "Status": f["Status"] || "",
      "Listing Price": f["Listing Price"] || f["Price"] || "",
      "Beds": f["Beds"] || "",
      "Baths": f["Baths"] || "",
      "Sq Footage": f["Sq Footage"] || f["SqFt"] || "",
      "Estimated Completion": f["Estimated Completion"] || f["Completion Date"] || "",
      "Site Plans": fileUrl(f["Site Plans"]) || f["Site Plans URL"] || "",
      "HeroImageURL": firstAssetUrl(f["HeroImageURL"], f["Hero Image"], f["Hero"]) || "",
      "GalleryURLsCSV": toCsvUrls(f["GalleryURLsCSV"], f["Gallery"], f["Photos"]) || "",
      "Builder Name": f["Builder Name"] || "",
      "Builder Owners": (Array.isArray(f["Builder Owners"]) ? f["Builder Owners"].join(", ") : (f["Builder Owners"] || "")),
      "Builder Photo": toCsvUrls(f["Builder Photo"], f["Builder Photos"]) || "",
      "Builder Owner Titles": (Array.isArray(f["Builder Owner Titles"]) ? f["Builder Owner Titles"].join(", ") : (f["Builder Owner Titles"] || "")),
      "Description": f["Description"] || f["About"] || "",
      "Marketing Video": f["Marketing Video"] || "",
      "Pre Dry Wall Matterport": f["Pre Dry Wall Matterport"] || f["PreDrywall Matterport"] || "",
      "Final Matterport": f["Final Matterport"] || "",
      "Listing Agent 2": (Array.isArray(f["Listing Agent 2"]) ? f["Listing Agent 2"].join(", ") : (f["Listing Agent 2"] || f["Listing Agents"] || "")),
      "Agent Photo": toCsvUrls(f["Agent Photo"], f["Agent Photos"]) || "",
      "Agent Phone Number": (Array.isArray(f["Agent Phone Number"]) ? f["Agent Phone Number"].join(", ") : (f["Agent Phone Number"] || "")),
      "Agent Email": (Array.isArray(f["Agent Email"]) ? f["Agent Email"].join(", ") : (f["Agent Email"] || "")),
      "Agent Title": (Array.isArray(f["Agent Title"]) ? f["Agent Title"].join(", ") : (f["Agent Title"] || "")),
      "About Agent": f["About Agent"] || "",
      "Instagram ID": (Array.isArray(f["Instagram ID"]) ? f["Instagram ID"].join(", ") : (f["Instagram ID"] || "")),
      "Latitude": f["Latitude"] || (f["Location"] && f["Location"].latitude) || null,
      "Longitude": f["Longitude"] || (f["Location"] && f["Location"].longitude) || null
    };

    return resp(200, { project });
  } catch (e) {
    return resp(500, { error: "Server error", details: String(e) });
  }
}

// Utilities
function resp(status, body) {
  return {
    statusCode: status,
    headers: {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": "*"
    },
    body: JSON.stringify(body)
  };
}

// Escape single quotes for Airtable formula
function escapeAirtable(str) {
  return String(str).replace(/'/g, "\\'");
}

// If a field is an attachment array, return first url; if it's a string, return it; else ""
function firstAssetUrl(...candidates) {
  for (const c of candidates) {
    if (!c) continue;
    if (typeof c === "string") return c;
    if (Array.isArray(c) && c.length && c[0].url) return c[0].url;
  }
  return "";
}

// Convert attachment arrays or arrays of strings into a CSV of URLs
function toCsvUrls(...candidates) {
  for (const c of candidates) {
    if (!c) continue;
    if (typeof c === "string") return c;
    if (Array.isArray(c)) {
      // If it's an array of attachments, map to urls; if strings, keep as is
      const urls = c.map(x => (x && x.url) ? x.url : (typeof x === "string" ? x : null)).filter(Boolean);
      if (urls.length) return urls.join(", ");
    }
  }
  return "";
}

// Return first attachment url if exists
function fileUrl(field) {
  if (Array.isArray(field) && field.length && field[0].url) return field[0].url;
  if (typeof field === "string") return field;
  return "";
}
