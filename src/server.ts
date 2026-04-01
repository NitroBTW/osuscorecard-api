// Load environment variables from the .env file into process.env
import dotenv from "dotenv";
dotenv.config();

import express, { Request, Response } from "express"; // express framework for building the web server
import sqlite3 from "sqlite3";
import axios from "axios"; // for making HTTP requests to the osu! API
import cors from "cors"; // cors to enable cross origin recourse sharing (frontend can talk to backend)

sqlite3.verbose();

// Create a new Express application instance
const app = express();
const PORT = Number(process.env.PORT) || 3000;

// Get the frontend URL from environment variables for CORS configuration
const FRONTEND_URL = process.env.FRONTEND_URL || "http://localhost:5173";

// Retrieve the OAuth client credentials from environment variables
const CLIENT_ID = process.env.CLIENT_ID;
const CLIENT_SECRET = process.env.CLIENT_SECRET;

// Validate that the OAuth credentials have been provided
if (!CLIENT_ID || !CLIENT_SECRET) {
  console.error("Missing CLIENT_ID or CLIENT_SECRET in .env");
  process.exit(1);
}

// Open a connection to the SQLite database file
const db = new sqlite3.Database("./scorecards.db");

// Store the OAuth access token for the osu! API
let accessToken: string | null = null;

// Define TypeScript interfaces to describe the shape of data from the osu! API
interface StatsRow {
  count: number;
}

interface Beatmapset {
  id?: number;
  title?: string;
  creator?: string;
  status?: string;
  covers?: {
    "list@2x"?: string;
  };
}

interface Beatmap {
  version?: string;
  difficulty_rating?: number;
  count_sliders?: number;
}

interface ScoreStatistics {
  great?: number;
  ok?: number;
  meh?: number;
  slider_tail_hit?: number;
  miss?: number;
}

interface UserSummary {
  id?: number;
  avatar_url?: string;
  country_code?: string;
  username?: string;
}

interface OsuBeatmapResponse {
  beatmapset?: Beatmapset;
  version?: string;
  difficulty_rating?: number;
}

interface OsuScoreResponse {
  legacy_score_id?: number | null;
  has_replay?: boolean;
  total_score?: number;
  classic_total_score?: number;
  mods?: string[];
  statistics?: ScoreStatistics;
  rank?: string;
  accuracy?: number;
  ended_at?: string;
  is_perfect_combo?: boolean;
  max_combo?: number;
  pp?: number | null;
  rank_global?: number | null;
  beatmap?: Beatmap;
  beatmapset?: Beatmapset;
  user?: UserSummary;
}

interface OsuUserResponse {
  statistics?: {
    global_rank?: number | null;
  };
}

// Configure CORS  to allow the frontend to access this API
app.use(
  cors({
    origin: FRONTEND_URL,
  }),
);

// Add middleware to parse JSON bodies in incoming requests
app.use(express.json());

// Create the stats table if it doesn't already exist
db.run(
  "CREATE TABLE IF NOT EXISTS stats (id INTEGER PRIMARY KEY, count INTEGER)",
);

// Initialise the stats table with a default row if it doesn't exist
db.get(
  "SELECT count FROM stats WHERE id = 1",
  (err: Error | null, row: StatsRow | undefined) => {
    if (err) {
      console.error("DB init error:", err.message);
      return;
    }

    // If no row exists, create the initial stats record with a count of zero
    if (!row) {
      db.run("INSERT INTO stats (id, count) VALUES (1, 0)");
    }
  },
);

// API endpoint to increment the scorecard counter
app.post("/api/scorecards/increment", (_req: Request, res: Response) => {
  // Increment the count in the database by one
  db.run("UPDATE stats SET count = count + 1 WHERE id = 1", function (err) {
    if (err) {
      // Return a 500 error if the database operation fails
      return res.status(500).json({ error: err.message });
    }

    // Confirm successful update to the client
    res.json({ success: true });
  });
});

// API endpoint to retrieve the current scorecard count
app.get("/api/scorecards/count", (_req: Request, res: Response) => {
  db.get(
    "SELECT count FROM stats WHERE id = 1",
    (err: Error | null, row: StatsRow | undefined) => {
      if (err) {
        // Return a 500 error if the database query fails
        return res.status(500).json({ error: err.message });
      }

      // Return a 404 error if no stats row is found (shouldn't happen with proper init)
      if (!row) {
        return res.status(404).json({ error: "Stats row not found" });
      }

      // Return the count to the client
      res.json({ count: row.count });
    },
  );
});

// Construct the headers for accessing the osu!api and throw an error if the token is unavailable
function getOsuHeaders() {
  if (!accessToken) {
    throw new Error("No access token available");
  }

  return {
    Authorization: `Bearer ${accessToken}`,
    "Content-Type": "application/json",
    Accept: "application/json",
    "x-api-version": "20220705",
  };
}

// Obtain an osu! api access token
async function getAccessToken(): Promise<string> {
  try {
    // Request a new access token from the osu! OAuth endpoint
    const response = await axios.post<{ access_token: string }>(
      "https://osu.ppy.sh/oauth/token",
      {
        client_id: CLIENT_ID,
        client_secret: CLIENT_SECRET,
        grant_type: "client_credentials",
        scope: "public",
      },
    );

    // Cache the token for future requests
    accessToken = response.data.access_token;
    return accessToken;
  } catch (error) {
    console.error("Error getting access token:", error);
    throw error;
  }
}

// Make an authenticated request to the osu! API
async function makeOsuRequest<T>(endpoint: string): Promise<T> {
  // Obtain an access token if we don't have one already
  if (!accessToken) {
    await getAccessToken();
  }

  try {
    // Make the API request with authentication headers
    const response = await axios.get<T>(
      `https://osu.ppy.sh/api/v2${endpoint}`,
      {
        headers: getOsuHeaders(),
      },
    );

    return response.data;
  } catch (error: unknown) {
    // If we receive a 401 Unauthorized response, the token has expired
    if (axios.isAxiosError(error) && error.response?.status === 401) {
      await getAccessToken();

      // Retry the original request with the new token
      const retryResponse = await axios.get<T>(
        `https://osu.ppy.sh/api/v2${endpoint}`,
        {
          headers: getOsuHeaders(),
        },
      );

      return retryResponse.data;
    }

    // Re-throw any other errors to be handled by the caller
    throw error;
  }
}

// Attempts to find the best quality cover image for a beatmapset
// First tries the raw cover URL, falling back to the API provided cover if unavailable
async function getBestCoverUrl(
  beatmapSetId?: number,
  fallback = "",
): Promise<string> {
  // Return the fallback immediately if no beatmapset ID was provided
  if (!beatmapSetId) {
    return fallback;
  }

  // Construct the URL for the raw cover image (highest quality)
  const rawUrl = `https://assets.ppy.sh/beatmaps/${beatmapSetId}/covers/raw.jpg`;

  try {
    // Send a HEAD request to check if the raw cover exists
    // HEAD requests are faster as they don't download the actual image
    const headResponse = await axios.head(rawUrl, {
      timeout: 5000,
      headers: {
        "User-Agent": "osu-scorecard-generator/1.0",
      },
    });

    // If the raw cover exists (HTTP 200), use it
    if (headResponse.status === 200) {
      return rawUrl;
    }

    // Otherwise, fall back to the API-provided cover
    return fallback;
  } catch {
    // If there's any error (e.g., image doesn't exist), use the fallback
    return fallback;
  }
}

// API endpoint to retrieve beatmap information by map ID
app.get(
  "/api/map/:mapId",
  async (req: Request<{ mapId: string }>, res: Response) => {
    try {
      const { mapId } = req.params;

      // Fetch beatmap data from the osu! API using the map ID
      const mapData = await makeOsuRequest<OsuBeatmapResponse>(
        `/beatmaps/${mapId}`,
      );

      // Try to get the best quality cover image available
      const coverUrl = await getBestCoverUrl(
        mapData.beatmapset?.id,
        mapData.beatmapset?.covers?.["list@2x"] || "",
      );

      // Structure the response data in the expected format
      const formattedData = {
        beatmap: {
          id: mapData.beatmapset?.id || "",
          title: mapData.beatmapset?.title || "",
          difficulty: mapData.version || "",
          star_rating: mapData.difficulty_rating || 0,
          cover: coverUrl,
          creator: mapData.beatmapset?.creator || "",
          status: mapData.beatmapset?.status || "",
        },
      };

      res.json(formattedData);
    } catch (error) {
      console.error("Error fetching map data:", error);
      res.status(500).json({ error: "Failed to fetch map data" });
    }
  },
);

// API endpoint to retrieve score information by score ID
app.get(
  "/api/score/:scoreId",
  async (req: Request<{ scoreId: string }>, res: Response) => {
    try {
      const { scoreId } = req.params;

      // Fetch score data from the osu! API using the score ID
      const scoreData = await makeOsuRequest<OsuScoreResponse>(
        `/scores/${scoreId}`,
      );

      // Extract the user ID from the score data to fetch their rank
      let userRank: number | null = null;
      const userId = scoreData.user?.id;

      // Get the user's global rank if we have a user ID
      if (userId) {
        const userData = await makeOsuRequest<OsuUserResponse>(
          `/users/${userId}/osu`,
        );
        userRank = userData.statistics?.global_rank ?? null;
      }

      // Determine if this is a lazer score (score without legacy ID)
      const isLazer = !scoreData.legacy_score_id;

      // Try to get the best quality cover image for the beatmapset
      const coverUrl = await getBestCoverUrl(
        scoreData.beatmapset?.id,
        scoreData.beatmapset?.covers?.["list@2x"] || "",
      );

      // Structure the response data in the expected format
      const formattedData = {
        lazer: isLazer,
        score: {
          score: scoreData.total_score || 0,
          classic_score: scoreData.classic_total_score || 0,
          mods: scoreData.mods || [],
          c300: scoreData.statistics?.great || 0,
          c100: scoreData.statistics?.ok || 0,
          c50: scoreData.statistics?.meh || 0,
          cEnds: scoreData.statistics?.slider_tail_hit || 0,
          cSliders: scoreData.beatmap?.count_sliders || 0,
          misses: scoreData.statistics?.miss || 0,
          rank: scoreData.rank || "",
          accuracy: scoreData.accuracy || 0,
          time: scoreData.ended_at || "",
          full_combo: scoreData.is_perfect_combo || false,
          max_combo: scoreData.max_combo || 0,
          pp: scoreData.pp || 0,
          leaderboard: scoreData.rank_global || 0,
        },
        beatmap: {
          id: scoreData.beatmapset?.id || "",
          title: scoreData.beatmapset?.title || "",
          difficulty: scoreData.beatmap?.version || "",
          star_rating: scoreData.beatmap?.difficulty_rating || 0,
          cover: coverUrl,
          creator: scoreData.beatmapset?.creator || "",
          status: scoreData.beatmapset?.status || "",
        },
        user: {
          avatar_url: scoreData.user?.avatar_url || "",
          country: scoreData.user?.country_code || "",
          username: scoreData.user?.username || "",
          user_rank: userRank,
        },
      };

      res.json(formattedData);
    } catch (error) {
      console.error("Error fetching score:", error);
      res.status(500).json({ error: "Failed to fetch score data" });
    }
  },
);

// API endpoint to proxy image requests through the server
app.get(
  "/api/proxy-image/:type",
  async (
    req: Request<{ type: string }, unknown, unknown, { url?: string }>,
    res: Response,
  ) => {
    try {
      // Extract the type parameter and URL query parameter
      const { type } = req.params;
      const { url } = req.query;

      // Validate that a URL was provided in the query parameters
      if (!url) {
        return res
          .status(400)
          .json({ error: "No URL provided in query parameter" });
      }

      // Define allowed image types
      const validTypes = new Set(["avatar", "background"]);
      if (!validTypes.has(type)) {
        return res.status(400).json({ error: "Invalid image type" });
      }

      // Decode and parse the provided URL
      const decodedUrl = decodeURIComponent(url);
      const parsedUrl = new URL(decodedUrl);

      // Whitelist allowed hostnames to prevent SSRF attacks
      const allowedHosts = new Set(["a.ppy.sh", "assets.ppy.sh"]);
      if (
        !["http:", "https:"].includes(parsedUrl.protocol) ||
        !allowedHosts.has(parsedUrl.hostname)
      ) {
        return res.status(400).json({ error: "URL not allowed" });
      }

      // Fetch the image from the allowed URL
      const response = await axios.get(decodedUrl, {
        responseType: "arraybuffer",
        timeout: 10000,
        headers: {
          "User-Agent": "osu-scorecard-generator/1.0",
        },
      });

      // Extract the content type from the response headers
      const contentType = response.headers["content-type"] || "image/jpeg";

      // Set appropriate headers for the proxied image response
      res.set({
        "Content-Type": contentType,
        "Cache-Control": "public, max-age=3600",
        "Access-Control-Allow-Origin": "*",
      });

      // Send the image data back to the client
      res.send(response.data);
    } catch (error) {
      // Log the error for debugging purposes
      console.error("Error proxying image:", error);

      // Return a transparent PNG as a fallback when the image cannot be fetched
      const transparentPng = Buffer.from([
        0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d,
        0x49, 0x48, 0x44, 0x52, 0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01,
        0x08, 0x06, 0x00, 0x00, 0x00, 0x1f, 0x15, 0xc4, 0x89, 0x00, 0x00, 0x00,
        0x0b, 0x49, 0x44, 0x41, 0x54, 0x78, 0x9c, 0x63, 0x00, 0x01, 0x00, 0x00,
        0x05, 0x00, 0x01, 0x0d, 0x0a, 0x2d, 0xb4, 0x00, 0x00, 0x00, 0x00, 0x49,
        0x45, 0x4e, 0x44, 0xae, 0x42, 0x60, 0x82,
      ]);

      // Set headers for the fallback image
      res.set({
        "Content-Type": "image/png",
        "Cache-Control": "no-cache",
      });

      // Send the transparent PNG as a placeholder
      res.send(transparentPng);
    }
  },
);

// Start the Express server and listen for incoming connections
app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});