// netlify/functions/project.js
export async function handler(event) {
  try {
    const params = new URLSearchParams(event.queryStringParameters);
    const slug = (params.get("slug") || "").trim();
    const debug = params.get("debug") === "1";
    if (!slug) return resp(400, { error: "Missing 'slug' query param" });

    const apiKey = process.env.AIRTABLE_API_KEY;
    const baseId = process.env.AIRTABLE_BASE_ID;
    const table  = process.env.AIRTABLE_TABLE || "Projects";
    if (!apiKey || !baseId) {
      return resp(500, { error: "Missing Airtable env vars (AIRTABLE_API_KEY, AIRTABLE_BASE_ID)" });
    }

    const headers = { Authorization: `Bearer ${apiKey}` };
    const baseUrl = `https://api.airtable.com/v0/${baseId}/${encodeURIComponent(table)}`;

    // ---------- build tolerant queries ----------
    const raw = String(slug).trim();
    const q   = raw.toLowerCase();
    const qf  = fold(q);         // remove separators
    const qr  = escapeRegex(q);
    const qfr = escapeRegex(qf);

    // Field expressions (coerce to text with &'')
    const fSlug = "LOWER({Slug}&'')";
    const fName = "LOWER({Project Name}&'')";
    const fId   = "LOWER({ProjectID}&'')";

    // "Folded" (remove separators inside Airtable)
    const norm = (fld) =>
      `LOWER(` +
        `SUBSTITUTE(SUBSTITUTE(SUBSTITUTE(SUBSTITUTE(SUBSTITUTE(SUBSTITUTE(SUBSTITUTE(SUBSTITUTE(SUBSTITUTE(SUBSTITUTE(${fld}&'', ' ', ''), '-', ''), '_', ''), '/', ''), '.', ''), '’',''), '''',''), ',',''), '(', ''), ')',''))`;

    const nSlug = norm("{Slug}");
    const nName = norm("{Project Name}");
    const nId   = norm("{ProjectID}");

    const formulas = [
      // exact (lowercased)
      `OR(${fSlug}='${escapeAirtable(q)}', ${fName}='${escapeAirtable(q)}', ${fId}='${escapeAirtable(q)}')`,
      // exact (folded)
      `OR(${nSlug}='${escapeAirtable(qf)}', ${nName}='${escapeAirtable(qf)}', ${nId}='${escapeAirtable(qf)}')`,
      // regex contains (normal + folded)
      `OR(REGEX_MATCH(${fSlug}, '${escapeAirtable(qr)}'), REGEX_MATCH(${fName}, '${escapeAirtable(qr)}'), REGEX_MATCH(${fId}, '${escapeAirtable(qr)}'))`,
      `OR(REGEX_MATCH(${nSlug}, '${escapeAirtable(qfr)}'), REGEX_MATCH(${nName}, '${escapeAirtable(qfr)}'), REGEX_MATCH(${nId}, '${escapeAirtable(qfr)}'))`,
      // SEARCH contains (case-insensitive, guard with >0)
      `OR(SEARCH('${escapeAirtable(q)}', ${fSlug})>0, SEARCH('${escapeAirtable(q)}', ${fName})>0, SEARCH('${escapeAirtable(q)}', ${fId})>0)`,
      `OR(SEARCH('${escapeAirtable(qf)}', ${nSlug})>0, SEARCH('${escapeAirtable(qf)}', ${nName})>0, SEARCH('${escapeAirtable(qf)}', ${nId})>0)`
    ];

    // Try formulas in order
    let matched = null;
    let matchedBy = "none";
    const tried = [];
    for (const f of formulas) {
      tried.push(f);
      const url = `${baseUrl}?maxRecords=1&filterByFormula=${encodeURIComponent(f)}`;
      const r = await fetch(url, { headers });
      if (!r.ok) {
        const t = await r.text();
        return resp(r.status, { error: "Airtable request failed", details: t, debug: debug ? { q, qf, f } : undefined });
      }
      const j = await r.json();
      if (j.records && j.records.length) { matched = j.records[0]; matchedBy = "formula"; break; }
    }

    // Final fallback: paginate and match server-side (up to 1000)
    if (!matched) {
      const all = await fetchAll(baseUrl, headers, 200, 1000);
      const rec = all.find(r => recordMatches(r.fields, q, qf));
      if (rec) { matched = rec; matchedBy = "fallback-scan"; }
    }

    if (!matched) {
      return resp(404, {
        error: "No record found for that slug",
        debug: debug ? { q, qf, tried } : undefined
      });
    }

    const f = matched.fields;

    // ---------- normalize output ----------
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

      // Builders
      "Builder Owners": toCsvText(f["Builder Owners"]),
      "Builder Photo": toCsvUrls(f["Builder Photo"], f["Builder Photos"]) || "",
      "Builder Owner Titles": toCsvText(f["Builder Owner Titles"]),
      "Builder Latrice": f["Builder Latrice"] || "",
      "Builder JT": f["Builder JT"] || "",
      "About Latrice": f["About Latrice"] || "",
      "About JT": f["About JT"] || "",

      // Highlights & Amenities
      "Highlights": f["Highlights"] || f["Project Highlights"] || f["Property Highlights"] || "",
      "Amenities":  f["Amenities"]  || f["Project Amenities"]  || f["Property Amenities"]  || "",

      "Description": f["Description"] || f["About"] || "",

      "Marketing Video": f["Marketing Video"] || "",
      "Pre Dry Wall Matterport": f["Pre Dry Wall Matterport"] || f["PreDrywall Matterport"] || "",
      "Final Matterport": f["Final Matterport"] || "",

      // Agents
      "Listing Agent 2": toCsvText(f["Listing Agent 2"] || f["Listing Agents"]),
      "Agent Photo": toCsvUrls(f["Agent Photo"], f["Agent Photos"]) || "",
      "Agent Phone Number": toCsvText(f["Agent Phone Number"]),
      "Agent Email": toCsvText(f["Agent Email"]),
      "Agent Title": toCsvText(f["Agent Title"]),
      "About Agent": f["About Agent"] || "",
      "Instagram ID": toCsvText(f["Instagram ID"]),

      "Latitude": f["Latitude"] || (f["Location"] && f["Location"].latitude) || null,
      "Longitude": f["Longitude"] || (f["Location"] && f["Location"].longitude) || null
    };

    return resp(200, { project, debug: debug ? { matchedBy } : undefined });
  } catch (e) {
    return resp(500, { error: "Server error", details: String(e) });
  }
}

/* ---------------- utilities ---------------- */

function resp(status, body) {
  return {
    statusCode: status,
    headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
    body: JSON.stringify(body)
  };
}

function escapeAirtable(str) {
  return String(str).replace(/'/g, "\\'");
}

// remove common separators/punctuation
function fold(s) {
  return String(s).toLowerCase().replace(/[\s_\-\/\.,'’–—(),]/g, "");
}

// regex-safe
function escapeRegex(s) {
  return String(s).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function firstAssetUrl(...candidates) {
  for (const c of candidates) {
    if (!c) continue;
    if (typeof c === "string") return c;
    if (Array.isArray(c) && c.length && c[0].url) return c[0].url;
  }
  return "";
}

function toCsvUrls(...candidates) {
  for (const c of candidates) {
    if (!c) continue;
    if (typeof c === "string") return c;
    if (Array.isArray(c)) {
      const urls = c.map(x => (x && x.url) ? x.url : (typeof x === "string" ? x : null)).filter(Boolean);
      if (urls.length) return urls.join(", ");
    }
  }
  return "";
}

function toCsvText(val) {
  if (!val) return "";
  if (typeof val === "string") return val;
  if (Array.isArray(val)) {
    return val
      .map(x => x == null ? "" :
        typeof x === "string" ? x :
        (x && x.name) ? x.name :
        (x && x.text) ? x.text : String(x))
      .filter(Boolean)
      .join(", ");
  }
  return String(val);
}

function fileUrl(field) {
  if (Array.isArray(field) && field.length && field[0].url) return field[0].url;
  if (typeof field === "string") return field;
  return "";
}

// fetch all records up to cap
async function fetchAll(baseUrl, headers, pageSize = 100, cap = 1000) {
  let offset = null, all = [];
  do {
    const url = new URL(baseUrl);
    url.searchParams.set("pageSize", String(pageSize));
    if (offset) url.searchParams.set("offset", offset);
    const r = await fetch(url.toString(), { headers });
    if (!r.ok) throw new Error(`Airtable paging failed: ${r.status}`);
    const j = await r.json();
    all = all.concat(j.records || []);
    offset = j.offset;
  } while (offset && all.length < cap);
  return all;
}

// server-side tolerant match
function recordMatches(fields, q, qf) {
  const vals = [
    fields["Slug"], fields["Project Name"], fields["ProjectID"]
  ].map(v => (v == null ? "" : String(v)));

  const lowered = vals.map(v => v.toLowerCase());
  const folded  = lowered.map(v => fold(v));

  // exact lower
  if (lowered.some(v => v === q)) return true;
  // exact folded
  if (folded.some(v => v === qf)) return true;
  // contains
  if (lowered.some(v => v.includes(q))) return true;
  if (folded.some(v => v.includes(qf))) return true;

  return false;
}
