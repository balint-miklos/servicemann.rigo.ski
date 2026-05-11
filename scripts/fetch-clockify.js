import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

/**
 * PHASE 1: Clockify Data Extraction
 * Fetches all time entries from your workspace and saves them to src/data/data.json.
 */

// Reconstruct __dirname in ES module scope
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Try to load local .env file natively (available in Node v20.6+)
try {
  process.loadEnvFile(path.join(__dirname, "../.env"));
  console.log("Loaded .env file successfully.");
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

  console.log("Starting data extraction from Clockify...");

  // 1. Get the current user's ID first
  const userResponse = await fetch(`${BASE_URL}/user`, {
    headers: { "X-Api-Key": API_KEY },
  });

  if (!userResponse.ok) {
    const errText = await userResponse.text();
    throw new Error(
      `Failed to fetch user data: ${userResponse.statusText} - ${errText}`,
    );
  }

  const userData = await userResponse.json();
  const userId = userData.id;
  console.log(`Authenticated as User ID: ${userId}`);

  // 2. Fetch the time entries using the real User ID
  let allEntries = [];
  let page = 1;
  let hasMore = true;

  while (hasMore) {
    const response = await fetch(
      `${BASE_URL}/workspaces/${WORKSPACE_ID}/user/${userId}/time-entries?page=${page}&page-size=50`,
      {
        headers: { "X-Api-Key": API_KEY },
      },
    );

    if (!response.ok) {
      const errText = await response.text();
      throw new Error(
        `Clockify API error: ${response.statusText} - ${errText}`,
      );
    }

    const entries = await response.json();

    if (entries.length === 0) {
      hasMore = false;
    } else {
      // Map raw entries to our lightweight schema
      const mapped = entries.map((entry) => {
        // Calculate duration in minutes
        const start = new Date(entry.timeInterval.start);
        const end = new Date(entry.timeInterval.end);
        const durationMinutes = Math.round((end - start) / 60000);

        return {
          id: entry.id,
          date: entry.timeInterval.start,
          durationMinutes,
          tags: entry.tags ? entry.tags.map((t) => t.name.toLowerCase()) : [],
        };
      });

      // Filter out any entries that might have 0 duration or are actively running
      const validEntries = mapped.filter(
        (e) => e.durationMinutes > 0 && !isNaN(e.durationMinutes),
      );

      allEntries = [...allEntries, ...validEntries];
      console.log(`Fetched page ${page} (${validEntries.length} entries)`);
      page++;
    }
  }

  // Extract unique tags for the frontend filter list
  const availableTags = [...new Set(allEntries.flatMap((e) => e.tags))].sort();

  const output = {
    lastUpdated: new Date().toISOString(),
    availableTags,
    sessions: allEntries,
  };

  // Ensure the src/data directory exists before writing
  const dir = path.join(__dirname, "../src/data");
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  fs.writeFileSync(
    path.join(dir, "data.json"),
    JSON.stringify(output, null, 2),
  );

  console.log(
    `Success! Saved ${allEntries.length} sessions to src/data/data.json`,
  );
}

fetchAllTimeEntries().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
