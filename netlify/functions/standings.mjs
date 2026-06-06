import { getStore } from "@netlify/blobs";

// Group standings + knockout bracket from football-data.org, cached in Blobs
// for 5 minutes (they change slowly). Two upstream calls per refresh, well
// within the free 10-calls/minute limit thanks to the cache.

const TOKEN = process.env.FOOTBALL_DATA_TOKEN || "";
const BASE = "https://api.football-data.org/v4/competitions/WC";
const CACHE_MS = 5 * 60 * 1000;

const store = () => getStore({ name: "wc-standings", consistency: "strong" });
const json = (data, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json", "cache-control": "no-store" },
  });

const KO = ["LAST_16", "QUARTER_FINALS", "SEMI_FINALS", "THIRD_PLACE", "FINAL"];
const ROUND_NAME = {
  LAST_16: "Round of 16",
  QUARTER_FINALS: "Quarter-finals",
  SEMI_FINALS: "Semi-finals",
  THIRD_PLACE: "Third place",
  FINAL: "Final",
};

async function api(path) {
  const r = await fetch(BASE + path, { headers: { "X-Auth-Token": TOKEN } });
  if (!r.ok) throw new Error("upstream " + r.status);
  return r.json();
}

function normGroups(data) {
  const out = [];
  for (const s of data.standings || []) {
    if (s.type && s.type !== "TOTAL") continue;
    const g = (s.group || "").replace(/^group[ _]?/i, "").trim();
    out.push({
      group: g || (s.stage || "").replace(/_/g, " "),
      rows: (s.table || []).map((r) => ({
        pos: r.position,
        team: r.team?.shortName || r.team?.name || "TBC",
        tla: r.team?.tla || "",
        p: r.playedGames,
        w: r.won,
        d: r.draw,
        l: r.lost,
        gf: r.goalsFor,
        ga: r.goalsAgainst,
        gd: r.goalDifference,
        pts: r.points,
      })),
    });
  }
  return out;
}

function winnerCode(m) {
  const w = m.score?.winner;
  if (w === "HOME_TEAM") return "HOME";
  if (w === "AWAY_TEAM") return "AWAY";
  if (w === "DRAW") return "DRAW";
  return null;
}

function normBracket(data) {
  const byStage = {};
  for (const m of data.matches || []) {
    if (!KO.includes(m.stage)) continue;
    (byStage[m.stage] = byStage[m.stage] || []).push({
      id: m.id,
      utc: m.utcDate,
      status: m.status,
      stage: m.stage,
      home: m.homeTeam?.shortName || m.homeTeam?.name || "TBD",
      away: m.awayTeam?.shortName || m.awayTeam?.name || "TBD",
      hScore: m.score?.fullTime?.home ?? null,
      aScore: m.score?.fullTime?.away ?? null,
      winner: winnerCode(m),
    });
  }
  const rounds = [];
  for (const st of KO) {
    if (byStage[st]) {
      byStage[st].sort((a, b) => new Date(a.utc) - new Date(b.utc));
      rounds.push({ stage: st, name: ROUND_NAME[st], matches: byStage[st] });
    }
  }
  const started = rounds.some((r) =>
    r.matches.some((m) => ["IN_PLAY", "PAUSED", "FINISHED"].includes(m.status))
  );
  return { rounds, started };
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
    const [st, mt] = await Promise.all([api("/standings"), api("/matches")]);
    const groups = normGroups(st);
    const bracket = normBracket(mt);
    const body = {
      configured: true,
      updated: new Date().toISOString(),
      phase: bracket.started ? "knockout" : "group",
      groups,
      bracket: { rounds: bracket.rounds },
    };
    await s.setJSON("snapshot", { ts: Date.now(), body });
    return json(body);
  } catch (err) {
    const stale = await s.get("snapshot", { type: "json" }).catch(() => null);
    if (stale) return json(stale.body);
    return json({ configured: true, error: String(err), phase: "group", groups: [], bracket: { rounds: [] } });
  }
};

export const config = { path: "/api/standings" };
