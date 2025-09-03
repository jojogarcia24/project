# Elite Developments – Airtable-powered Template

This repo is the **clean 4-file** version wired to Airtable through a Netlify Function. It preserves your exact layout and only swaps the static data for live Airtable fetches.

## Files
- `index.html` – your full page (unchanged visuals). It calls `/.netlify/functions/project?slug=...`.
- `netlify/functions/project.js` – serverless function that queries Airtable for one record.
- `netlify.toml` – points Netlify at the functions folder.
- `README.md` – this file.

## Environment Variables (Netlify → Site settings → Build & deploy → Environment)
Set these **exact** keys:
- `AIRTABLE_API_KEY` – a Personal Access Token
- `AIRTABLE_BASE_ID` – your Base ID
- `AIRTABLE_TABLE` – **Projects** (or whatever your table is named)

## How the page finds a record
Open the page with a query param:  
`/index.html?project=YOUR-SLUG`

The function tries to match either `{Slug}` or `{Project Name}` in Airtable to the given `YOUR-SLUG` value:

```
OR({Slug}='YOUR-SLUG',{Project Name}='YOUR-SLUG')
```

> If your table uses different field names, either rename them in Airtable **or** edit the mapping section inside `project.js` (search for `// Normalize fields` comment).

## CSV headers
Your CSV is only for reference to field names. The function maps many of your known headers out of the box:
`Project Name, Address, Status, Listing Price, Beds, Baths, Sq Footage, Estimated Completion, Site Plans, HeroImageURL, GalleryURLsCSV, Builder Name, Builder Owners, Builder Photo, Builder Owner Titles, Description, Marketing Video, Pre Dry Wall Matterport, Final Matterport, Listing Agent 2, Agent Photo, Agent Phone Number, Agent Email, Agent Title, About Agent, Instagram ID, Latitude, Longitude`

It also auto-detects Airtable **attachment fields** and converts them to proper URLs.

## Deploy steps (fresh + clean)
1. **Create a brand new GitHub repo** (to avoid old clutter).
2. Add these 4 files (exactly as-is) to the repo.
3. Connect the repo to **Netlify** (or drag–drop the folder).
4. Add the three environment variables.
5. Visit `/index.html?project=YOUR-SLUG` – you should see the live data render in your perfect layout.

> If you must keep the old repo, you can still drop these 4 files at root and remove the unused ones. Fresh repo is simply cleaner.

## Troubleshooting
- **“Missing ?project= slug in URL”** → Append `?project=Your-Slug`.
- **404 from function** → No Airtable record matched. Check `{Slug}` or `{Project Name}` values.
- **Images not showing** → Ensure attachments are real Airtable attachment fields or direct URLs.
- **Map blank** → Make sure `Latitude` and `Longitude` fields exist and are numbers.
