// scripts/fetch-youtube-videos.mjs
//
// Pulls every video currently in a YouTube playlist and merges any NEW
// ones into videos.json. Existing entries (matched by videoId) are left
// completely untouched, so any category/genre/album/movie/starcast/tags
// you've already filled in by hand are safe.
//
// Requires two environment variables:
//   YOUTUBE_API_KEY      - your YouTube Data API v3 key
//   YOUTUBE_PLAYLIST_ID  - the playlist to pull from
//
// Run with: node scripts/fetch-youtube-videos.mjs
// (from the repo root, so videos.json is found at ./videos.json)

import { readFileSync, writeFileSync, existsSync } from "fs";
import path from "path";

const API_KEY = process.env.YOUTUBE_API_KEY;
const PLAYLIST_ID = process.env.YOUTUBE_PLAYLIST_ID;
const VIDEOS_JSON_PATH = path.join(process.cwd(), "videos.json");

if (!API_KEY || !PLAYLIST_ID) {
  console.error("Missing YOUTUBE_API_KEY or YOUTUBE_PLAYLIST_ID environment variables.");
  process.exit(1);
}

async function fetchAllPlaylistItems() {
  let items = [];
  let pageToken = "";
  do {
    const url = new URL("https://www.googleapis.com/youtube/v3/playlistItems");
    url.searchParams.set("part", "snippet");
    url.searchParams.set("playlistId", PLAYLIST_ID);
    url.searchParams.set("maxResults", "50");
    url.searchParams.set("key", API_KEY);
    if (pageToken) url.searchParams.set("pageToken", pageToken);

    const res = await fetch(url);
    if (!res.ok) {
      const body = await res.text();
      throw new Error(`YouTube API error ${res.status}: ${body}`);
    }
    const data = await res.json();
    items = items.concat(data.items || []);
    pageToken = data.nextPageToken || "";
  } while (pageToken);
  return items;
}

function loadExistingVideos() {
  if (!existsSync(VIDEOS_JSON_PATH)) return [];
  const raw = readFileSync(VIDEOS_JSON_PATH, "utf-8").trim();
  if (!raw) return [];
  return JSON.parse(raw);
}

function nextId(existing) {
  if (existing.length === 0) return 1;
  return Math.max(...existing.map(v => v.id || 0)) + 1;
}

async function main() {
  console.log(`Fetching playlist ${PLAYLIST_ID}...`);
  const playlistItems = await fetchAllPlaylistItems();
  console.log(`Found ${playlistItems.length} videos in the playlist.`);

  const existing = loadExistingVideos();
  const existingIds = new Set(existing.map(v => v.videoId));

  let idCounter = nextId(existing);
  const added = [];

  for (const item of playlistItems) {
    const snippet = item.snippet;
    const videoId = snippet?.resourceId?.videoId;
    if (!videoId || existingIds.has(videoId)) continue; // skip already-known videos

    const publishedAt = snippet.publishedAt
      ? snippet.publishedAt.slice(0, 10)
      : new Date().toISOString().slice(0, 10);

    const newEntry = {
      id: idCounter++,
      title: snippet.title || "",
      titleGu: "",
      artist: "",
      category: "",
      genre: "",
      album: "",
      movie: "",
      starcast: [],
      tags: [],
      videoId: videoId,
      dateAdded: publishedAt,
      featured: false,
      needsReview: true
    };

    existing.push(newEntry);
    existingIds.add(videoId);
    added.push(newEntry);
  }

  if (added.length === 0) {
    console.log("No new videos to add. videos.json is already up to date.");
    return;
  }

  writeFileSync(VIDEOS_JSON_PATH, JSON.stringify(existing, null, 2) + "\n", "utf-8");
  console.log(`Added ${added.length} new video(s) to videos.json:`);
  added.forEach(v => console.log(`  - ${v.title} (${v.videoId})`));
  console.log(`These are flagged "needsReview": true — fill in category, genre, tags etc. when you get a chance.`);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
