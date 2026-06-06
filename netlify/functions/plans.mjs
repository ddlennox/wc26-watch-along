import { getStore } from "@netlify/blobs";

// One shared store for everyone's watch-along plans.
// "strong" consistency means a plan shows up immediately after it's posted.
const store = () => getStore({ name: "wc-plans", consistency: "strong" });

const json = (data, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json", "cache-control": "no-store" },
  });

export default async (req) => {
  try {
    const s = store();

    if (req.method === "GET") {
      const { blobs } = await s.list({ prefix: "plan:" });
      const plans = [];
      for (const b of blobs) {
        const p = await s.get(b.key, { type: "json" });
        if (p) plans.push(p);
      }
      plans.sort((a, b) => (a.created || 0) - (b.created || 0));
      return json({ plans });
    }

    if (req.method === "POST") {
      const plan = await req.json();
      if (!plan || !plan.id) return json({ error: "missing plan id" }, 400);
      // basic guard so a stray payload can't bloat the store
      if (String(plan.id).length > 60) return json({ error: "bad id" }, 400);
      await s.setJSON("plan:" + plan.id, plan);
      return json({ ok: true });
    }

    if (req.method === "DELETE") {
      const id = new URL(req.url).searchParams.get("id");
      if (!id) return json({ error: "missing id" }, 400);
      await s.delete("plan:" + id);
      return json({ ok: true });
    }

    return json({ error: "method not allowed" }, 405);
  } catch (err) {
    return json({ error: "server error", detail: String(err) }, 500);
  }
};

// Clean URL: the front-end calls /api/plans
export const config = { path: "/api/plans" };
