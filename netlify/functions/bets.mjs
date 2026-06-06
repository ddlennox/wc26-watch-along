import { getStore } from "@netlify/blobs";

// Shared fun-money betting for the group. NO REAL MONEY — everyone starts with
// a pot of fun-coins, places Win/Draw/Win bets at the odds shown, and the
// function auto-settles them from the live results cache written by scores.mjs.

const START_BALANCE = 1000;
const MIN_STAKE = 1;

const bets = () => getStore({ name: "wc-bets", consistency: "strong" });
const scores = () => getStore({ name: "wc-scores", consistency: "strong" });

const json = (data, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json", "cache-control": "no-store" },
  });

const cleanName = (s) => String(s || "").trim().slice(0, 24);

async function getPlayer(s, name) {
  const key = "player:" + name.toLowerCase();
  let p = await s.get(key, { type: "json" });
  if (!p) p = { name, balance: START_BALANCE, created: Date.now() };
  // keep display name fresh to whatever they last typed
  p.name = name;
  return { key, p };
}

async function listAll(s) {
  const players = [];
  const allBets = [];
  const { blobs } = await s.list();
  for (const b of blobs) {
    if (b.key.startsWith("player:")) {
      const p = await s.get(b.key, { type: "json" });
      if (p) players.push(p);
    } else if (b.key.startsWith("bet:")) {
      const bet = await s.get(b.key, { type: "json" });
      if (bet) allBets.push(bet);
    }
  }
  return { players, allBets };
}

// Settle any open bets whose match has finished. Returns number settled.
async function settle(s) {
  let cache;
  try {
    cache = await scores().get("results", { type: "json" });
  } catch (e) {
    cache = null;
  }
  const results = cache?.results || {};
  if (!Object.keys(results).length) return 0;

  const { blobs } = await s.list({ prefix: "bet:" });
  let settled = 0;
  for (const b of blobs) {
    const bet = await s.get(b.key, { type: "json" });
    if (!bet || bet.status !== "open") continue;
    const r = results[bet.matchId];
    if (!r || !r.finished) continue;

    const { key, p } = await getPlayer(s, bet.who);
    if (r.winner && bet.selection === r.winner) {
      bet.status = "won";
      bet.returned = Math.round(bet.stake * bet.odds);
      p.balance += bet.returned; // stake + profit (decimal odds include stake)
    } else if (r.winner) {
      bet.status = "lost";
      bet.returned = 0;
    } else {
      // finished with no recorded winner: refund to be safe
      bet.status = "void";
      bet.returned = bet.stake;
      p.balance += bet.stake;
    }
    bet.result = { h: r.h, a: r.a, winner: r.winner };
    bet.settledAt = Date.now();
    await s.setJSON(key, p);
    await s.setJSON(b.key, bet);
    settled++;
  }
  return settled;
}

export default async (req) => {
  try {
    const s = bets();

    if (req.method === "GET") {
      await settle(s);
      const { players, allBets } = await listAll(s);
      players.sort((a, b) => b.balance - a.balance);
      allBets.sort((a, b) => (b.placed || 0) - (a.placed || 0));
      return json({ players, bets: allBets, start: START_BALANCE });
    }

    if (req.method === "POST") {
      const body = await req.json();
      const action = body.action;

      if (action === "prune") {
        // Remove no-bet players whose name is a prefix of a longer player's name
        // (clears partial-name leaderboard junk like D / Da / Dav before "David").
        const { players, allBets } = await listAll(s);
        const bettors = new Set(allBets.map((b) => (b.who || "").toLowerCase()));
        const names = players.map((p) => (p.name || "").toLowerCase());
        let removed = 0;
        for (const p of players) {
          const lc = (p.name || "").toLowerCase();
          if (bettors.has(lc)) continue;
          if (names.some((n) => n !== lc && n.startsWith(lc))) {
            await s.delete("player:" + lc);
            removed++;
          }
        }
        return json({ ok: true, removed });
      }

      const name = cleanName(body.name);
      if (!name) return json({ error: "name required" }, 400);

      if (action === "ensure") {
        const { key, p } = await getPlayer(s, name);
        await s.setJSON(key, p);
        return json({ ok: true, player: p });
      }

      if (action === "place") {
        const bet = body.bet || {};
        const stake = Math.floor(Number(bet.stake));
        const odds = Number(bet.odds);
        const selection = bet.selection;
        if (!bet.matchId) return json({ error: "missing match" }, 400);
        if (!["HOME", "DRAW", "AWAY"].includes(selection))
          return json({ error: "bad selection" }, 400);
        if (!(odds > 1) || odds > 1000) return json({ error: "bad odds" }, 400);
        if (!(stake >= MIN_STAKE)) return json({ error: "stake too small" }, 400);

        // Can't bet on a match that's already finished.
        const cache = await scores().get("results", { type: "json" }).catch(() => null);
        if (cache?.results?.[bet.matchId]?.finished)
          return json({ error: "match already finished" }, 400);

        const { key, p } = await getPlayer(s, name);
        if (stake > p.balance) return json({ error: "not enough fun-coins" }, 400);

        p.balance -= stake;
        const id = "b_" + Date.now() + "_" + Math.random().toString(36).slice(2, 7);
        const record = {
          id,
          who: name,
          matchId: bet.matchId,
          matchLabel: String(bet.matchLabel || "").slice(0, 60),
          selection,
          selLabel: String(bet.selLabel || "").slice(0, 30),
          odds,
          stake,
          status: "open",
          placed: Date.now(),
        };
        await s.setJSON(key, p);
        await s.setJSON("bet:" + id, record);
        return json({ ok: true, balance: p.balance, bet: record });
      }

      return json({ error: "unknown action" }, 400);
    }

    return json({ error: "method not allowed" }, 405);
  } catch (err) {
    return json({ error: "server error", detail: String(err) }, 500);
  }
};

export const config = { path: "/api/bets" };
