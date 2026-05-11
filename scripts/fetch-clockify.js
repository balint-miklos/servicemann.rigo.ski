import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

try {
  process.loadEnvFile(path.join(__dirname, "../.env"));
} catch (err) {
  console.warn("Notice: Could not load .env file:", err.message);
}

const API_KEY = process.env.CLOCKIFY_API_KEY;
const WORKSPACE_ID = process.env.CLOCKIFY_WORKSPACE_ID;
const BASE_URL = "https://api.clockify.me/api/v1";

async function fetchAllTimeEntries() {
  if (!API_KEY || !WORKSPACE_ID) {
    throw new Error(
      "Missing CLOCKIFY_API_KEY or CLOCKIFY_WORKSPACE_ID environment variables",
    );
  }

  const headers = { "X-Api-Key": API_KEY };

  // 1. FETCH TAG LOOKUP TABLE
  // Clockify often returns tagIds in entries, so we need a map of ID -> Name
  console.log("Fetching tags for workspace...");
  const tagsResponse = await fetch(
    `${BASE_URL}/workspaces/${WORKSPACE_ID}/tags?page-size=1000`,
    { headers },
  );
  const tagsData = await tagsResponse.json();
  const tagMap = {};
  if (Array.isArray(tagsData)) {
    tagsData.forEach((t) => {
      tagMap[t.id] = t.name;
    });
  }

  // 2. GET USER ID
  const userResponse = await fetch(`${BASE_URL}/user`, { headers });
  const userData = await userResponse.json();
  const userId = userData.id;

  let allEntries = [];
  let page = 1;
  let hasMore = true;

  console.log("Fetching time entries...");
  while (hasMore) {
    const response = await fetch(
      `${BASE_URL}/workspaces/${WORKSPACE_ID}/user/${userId}/time-entries?page=${page}&page-size=50`,
      { headers },
    );
    const entries = await response.json();

    if (!Array.isArray(entries) || entries.length === 0) {
      hasMore = false;
    } else {
      // DEBUG: Log the first entry of the first page to see the structure
      if (page === 1) {
        console.log("Debug: Sample entry keys:", Object.keys(entries[0]));
        console.log("Debug: Sample entry tags/tagIds:", {
          tags: entries[0].tags,
          tagIds: entries[0].tagIds,
        });
      }

      const mapped = entries.map((entry) => {
        const start = new Date(entry.timeInterval.start);
        const end = new Date(entry.timeInterval.end);
        const durationMinutes = Math.round((end - start) / 60000);

        // Logic: Try 'tags' objects first, then fallback to 'tagIds' mapped via our tagMap
        let sessionTags = [];
        if (entry.tags && entry.tags.length > 0) {
          sessionTags = entry.tags.map((t) => t.name);
        } else if (entry.tagIds && entry.tagIds.length > 0) {
          sessionTags = entry.tagIds.map((id) => tagMap[id] || id);
        }

        return {
          id: entry.id,
          date: entry.timeInterval.start,
          durationMinutes,
          description: entry.description || "",
          tags: sessionTags,
        };
      });

      const validEntries = mapped.filter(
        (e) => e.durationMinutes > 0 && !isNaN(e.durationMinutes),
      );
      allEntries = [...allEntries, ...validEntries];
      page++;
    }
  }

  const availableTags = [...new Set(allEntries.flatMap((e) => e.tags))].sort();

  const output = {
    lastUpdated: new Date().toISOString(),
    availableTags,
    sessions: allEntries,
  };

  const dir = path.join(__dirname, "../src/data");
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(
    path.join(dir, "data.json"),
    JSON.stringify(output, null, 2),
  );

  console.log(`Success! Saved ${allEntries.length} sessions.`);
  console.log(`Discovered tags: ${availableTags.join(", ") || "None"}`);
}

fetchAllTimeEntries().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
