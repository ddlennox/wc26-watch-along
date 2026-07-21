import { getStore } from "@netlify/blobs";

// Premier League table from football-data.org, cached in Blobs for 5 minutes
// (it changes slowly). One upstream call per refresh, well within the free
// 10-calls/minute limit thanks to the cache.

const TOKEN = process.env.FOOTBALL_DATA_TOKEN || "";
const BASE = "https://api.football-data.org/v4/competitions/PL";
const CACHE_MS = 5 * 60 * 1000;

const store = () => getStore({ name: "pl-standings", consistency: "strong" });
const json = (data, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json", "cache-control": "no-store" },
  });

async function api(path) {
  const r = await fetch(BASE + path, { headers: { "X-Auth-Token": TOKEN } });
  if (!r.ok) throw new Error("upstream " + r.status);
  return r.json();
}

function normTable(data) {
  const total = (data.standings || []).find((s) => !s.type || s.type === "TOTAL");
  if (!total) return [];
  return (total.table || []).map((r) => ({
    pos: r.position,
    team: r.team?.shortName || r.team?.name || "TBC",
    tla: r.team?.tla || "",
    crest: r.team?.crest || "",
    p: r.playedGames,
    w: r.won,
    d: r.draw,
    l: r.lost,
    gf: r.goalsFor,
    ga: r.goalsAgainst,
    gd: r.goalDifference,
    pts: r.points,
    form: r.form || "",
  }));
}

export default async () => {
  if (!TOKEN) return json({ configured: false, updated: new Date().toISOString() });

  const s = store();
  try {
    const c = await s.get("snapshot", { type: "json" });
    if (c && Date.now() - c.ts < CACHE_MS) return json(c.body);
  } catch (e) {
    /* fall through */
  }

  try {
    const st = await api("/standings");
    const table = normTable(st);
    const body = {
      configured: true,
      updated: new Date().toISOString(),
      table,
    };
    await s.setJSON("snapshot", { ts: Date.now(), body });
    return json(body);
  } catch (err) {
    const stale = await s.get("snapshot", { type: "json" }).catch(() => null);
    if (stale) return json(stale.body);
    return json({ configured: true, error: String(err), table: [] });
  }
};

export const config = { path: "/api/standings" };
