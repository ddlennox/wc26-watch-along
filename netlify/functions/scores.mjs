import { getStore } from "@netlify/blobs";

// Live + upcoming + recent Premier League matches from football-data.org.
// Cached in Netlify Blobs for ~45s so a crowd of friends polling at once
// doesn't blow the free 10-calls/minute limit. Also writes a compact
// results cache that the betting function reads to auto-settle bets.

const TOKEN = process.env.FOOTBALL_DATA_TOKEN || "";
const API = "https://api.football-data.org/v4/competitions/PL/matches";
const CACHE_MS = 45 * 1000;

const store = () => getStore({ name: "pl-scores", consistency: "strong" });

const json = (data, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json", "cache-control": "no-store" },
  });

// The clubs the group follows — pinned to the top of the feed.
const FOLLOWED = ["man united", "manchester united", "chelsea", "tottenham", "crystal palace"];
const isFollowed = (m) => {
  const s = ((m.home || "") + " " + (m.away || "")).toLowerCase();
  return FOLLOWED.some((c) => s.includes(c));
};

// The free feed doesn't carry UK TV, and Prem rights split across Sky/TNT with
// the 3pm Saturday blackout, so we don't guess a broadcaster per game here.
function channelFor() {
  return null;
}

function winnerCode(score) {
  // football-data: HOME_TEAM | AWAY_TEAM | DRAW | null
  if (!score) return null;
  if (score.winner === "HOME_TEAM") return "HOME";
  if (score.winner === "AWAY_TEAM") return "AWAY";
  if (score.winner === "DRAW") return "DRAW";
  return null;
}

function liveLabel(m) {
  if (m.status === "PAUSED") return "HT";
  if (m.status === "IN_PLAY") return m.minute ? m.minute + "'" : "LIVE";
  return "LIVE";
}

function normalise(matches) {
  const now = Date.now();
  const live = [];
  const upcoming = [];
  const recent = [];
  const results = {};

  for (const m of matches) {
    const home = m.homeTeam?.shortName || m.homeTeam?.name || "TBC";
    const away = m.awayTeam?.shortName || m.awayTeam?.name || "TBC";
    const ft = m.score?.fullTime || {};
    const base = {
      id: m.id,
      utc: m.utcDate,
      status: m.status,
      stage: m.stage,
      md: m.matchday || null,
      home,
      away,
      homeTla: m.homeTeam?.tla || "",
      awayTla: m.awayTeam?.tla || "",
      hScore: ft.home ?? null,
      aScore: ft.away ?? null,
      channel: channelFor(home, away),
      venue: m.venue || null,
    };

    if (m.status === "IN_PLAY" || m.status === "PAUSED") {
      live.push({ ...base, label: liveLabel(m) });
    } else if (m.status === "FINISHED") {
      recent.push(base);
      results[m.id] = {
        finished: true,
        winner: winnerCode(m.score),
        h: ft.home ?? null,
        a: ft.away ?? null,
        home,
        away,
      };
    } else if (
      (m.status === "SCHEDULED" || m.status === "TIMED") &&
      new Date(m.utcDate).getTime() > now - 2 * 60 * 60 * 1000
    ) {
      upcoming.push(base);
    }
  }

  upcoming.sort((a, b) => new Date(a.utc) - new Date(b.utc));
  recent.sort((a, b) => new Date(b.utc) - new Date(a.utc));
  live.sort((a, b) => new Date(a.utc) - new Date(b.utc));

  // Our clubs' upcoming games, pinned regardless of the general window.
  const featured = upcoming.filter(isFollowed).slice(0, 8);

  return {
    live,
    upcoming: upcoming.slice(0, 14),
    recent: recent.slice(0, 10),
    featured,
    results,
  };
}

export default async () => {
  // No key configured: tell the front-end so it shows its built-in fixtures.
  if (!TOKEN) return json({ configured: false, updated: new Date().toISOString() });

  const s = store();

  // Serve from cache if fresh.
  try {
    const cached = await s.get("feed", { type: "json" });
    if (cached && Date.now() - cached.ts < CACHE_MS) {
      return json(cached.body);
    }
  } catch (e) {
    /* fall through to a live fetch */
  }

  try {
    const res = await fetch(API, { headers: { "X-Auth-Token": TOKEN } });
    if (!res.ok) {
      const stale = await s.get("feed", { type: "json" }).catch(() => null);
      if (stale) return json(stale.body);
      return json(
        { configured: true, error: "upstream", status: res.status, live: [], upcoming: [], recent: [] },
        200
      );
    }
    const data = await res.json();
    const n = normalise(data.matches || []);
    const body = {
      configured: true,
      updated: new Date().toISOString(),
      live: n.live,
      upcoming: n.upcoming,
      recent: n.recent,
      featured: n.featured,
    };
    await s.setJSON("feed", { ts: Date.now(), body });
    await s.setJSON("results", { ts: Date.now(), results: n.results });
    return json(body);
  } catch (err) {
    const stale = await s.get("feed", { type: "json" }).catch(() => null);
    if (stale) return json(stale.body);
    return json(
      { configured: true, error: "fetch_failed", detail: String(err), live: [], upcoming: [], recent: [] },
      200
    );
  }
};

export const config = { path: "/api/scores" };
