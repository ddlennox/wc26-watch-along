/* ===== Pub Kickoff extras =====
   - Multi-select town filter (deselect all -> nothing shows)
   - Tap a game (in the panel) or a pub -> pre-fills the "Post my plan" form
   - Weather for the chosen town on the match date (free Open-Meteo, no key)
   - Registers the service worker so the site installs as an app
   - Loads tables.js (group tables / knockout bracket)
   Hooks into the globals defined by index.html's inline script (PUBS, TOWNS,
   mapsLink, esc, renderPubs, renderFilters) — classic scripts share scope. */
(function () {
  "use strict";

  function $(id) { return document.getElementById(id); }
  function decodeEntities(s) { var t = document.createElement("textarea"); t.innerHTML = String(s == null ? "" : s); return t.value; }

  // ---------- injected styles (keeps index.html/matchcentre.css untouched) ----------
  var css = document.createElement("style");
  css.textContent =
    ".wx-chip{margin:-12px 0 22px;padding:12px 16px;background:var(--panel-2);border:1px solid var(--line);border-left:4px solid var(--gold);border-radius:12px;font-size:14px;color:var(--ink);line-height:1.45}" +
    ".wx-chip .wx-emoji{font-size:18px}" +
    ".wx-chip .wx-note{color:var(--muted)}" +
    ".wx-chip b{color:var(--ink)}" +
    ".pub .links .pub-plan{color:var(--gold)}" +
    ".pub .links .pub-plan:hover{border-color:var(--gold)}" +
    ".filters .pf-all{border-style:dashed}" +
    ".mc-plan{width:100%;margin-top:8px;font-family:inherit;font-weight:700;font-size:12px;letter-spacing:.02em;color:var(--lime);background:transparent;border:1px dashed var(--line-strong);border-radius:8px;padding:7px;cursor:pointer}" +
    ".mc-plan:hover{border-color:var(--lime)}";
  document.head.appendChild(css);

  // ---------- multi-select town filter ----------
  var selected = (typeof TOWNS !== "undefined") ? new Set(TOWNS) : new Set();

  function renderFiltersMulti() {
    var f = $("pubFilters");
    if (!f || typeof TOWNS === "undefined") return;
    var html = '<button class="pf-all" data-act="all">All</button>' +
               '<button class="pf-all" data-act="none">None</button>';
    html += TOWNS.map(function (t) {
      return '<button class="' + (selected.has(t) ? "active" : "") + '" data-t="' + t + '">' + t + "</button>";
    }).join("");
    f.innerHTML = html;
    f.querySelectorAll("button[data-t]").forEach(function (b) {
      b.onclick = function () {
        if (selected.has(b.dataset.t)) selected.delete(b.dataset.t); else selected.add(b.dataset.t);
        renderFiltersMulti(); renderPubsMulti();
      };
    });
    f.querySelector('[data-act="all"]').onclick = function () { TOWNS.forEach(function (t) { selected.add(t); }); renderFiltersMulti(); renderPubsMulti(); };
    f.querySelector('[data-act="none"]').onclick = function () { selected.clear(); renderFiltersMulti(); renderPubsMulti(); };
  }

  function renderPubsMulti() {
    var listEl = $("pubList");
    if (!listEl || typeof PUBS === "undefined") return;
    var list = PUBS.filter(function (p) { return selected.has(p.town); });
    if (!list.length) {
      listEl.innerHTML = '<div class="empty">No towns selected — tap a town above to show its pubs. 🍺</div>';
      return;
    }
    listEl.innerHTML = list.map(function (p) {
      return '<div class="pub">' +
        '<span class="town">' + p.town + "</span>" +
        "<h3>" + p.name + "</h3>" +
        '<div class="rate"><span class="stars">★ ' + p.rating.toFixed(1) + "</span> <span>" + p.count.toLocaleString() + " reviews</span></div>" +
        '<div class="addr">' + p.addr + "</div>" +
        '<div class="desc">' + p.desc + "</div>" +
        '<div class="links">' +
          '<a href="' + mapsLink(p) + '" target="_blank" rel="noopener">Map &amp; directions ↗</a>' +
          '<a href="#board" class="pub-plan" data-town="' + p.town + '" data-venue="' + p.name + '">Plan to watch here ↗</a>' +
        "</div>" +
      "</div>";
    }).join("");
    listEl.querySelectorAll(".pub-plan").forEach(function (a) {
      a.addEventListener("click", function (e) { e.preventDefault(); planPub(a.dataset.town, a.dataset.venue); });
    });
  }

  // ---------- tap-to-plan ----------
  var MATCH_DATES = {
    "England v Croatia": "2026-06-17T20:00:00Z",
    "England v Ghana": "2026-06-23T20:00:00Z",
    "Panama v England": "2026-06-27T21:00:00Z",
    "Opening match": "2026-06-11T19:00:00Z",
    "Final": "2026-07-19T19:00:00Z"
  };
  function matchDateFor(m) { return MATCH_DATES[m] || null; }
  var currentMatchDate = null;

  function scrollToBoard() { var b = $("board"); if (b) b.scrollIntoView({ behavior: "smooth", block: "start" }); }
  function flashForm() {
    var pf = document.querySelector(".planform");
    if (!pf) return;
    pf.style.transition = "box-shadow .25s";
    pf.style.boxShadow = "0 0 0 2px var(--lime)";
    setTimeout(function () { pf.style.boxShadow = ""; }, 900);
  }

  function planPub(town, venue) {
    var ts = $("pTown");
    if (ts) { ts.value = town; ts.dispatchEvent(new Event("change")); }
    var v = $("pVenue");
    if (v) v.value = decodeEntities(venue);
    scrollToBoard(); flashForm(); updateWeather();
  }

  function planGame(match, utc) {
    var m = $("pMatch");
    if (m) m.value = match;
    currentMatchDate = utc || matchDateFor(match);
    scrollToBoard(); flashForm(); updateWeather();
  }
  // exposed so the Match Centre panel (matchcentre.js) can call it
  window.planGame = planGame;

  // ---------- weather (Open-Meteo, free, no key, CORS-friendly) ----------
  var COORDS = {
    Barnstaple: [51.08, -4.06], Brighton: [50.82, -0.14], Crawley: [51.11, -0.19],
    London: [51.51, -0.13], Hale: [53.39, -2.33], Malta: [35.90, 14.50]
  };
  var WMO = {
    0: ["☀️", "clear skies"], 1: ["🌤", "mostly clear"], 2: ["⛅", "partly cloudy"], 3: ["☁️", "overcast"],
    45: ["🌫", "fog"], 48: ["🌫", "freezing fog"], 51: ["🌦", "light drizzle"], 53: ["🌦", "drizzle"], 55: ["🌧", "heavy drizzle"],
    61: ["🌦", "light rain"], 63: ["🌧", "rain"], 65: ["🌧", "heavy rain"], 71: ["🌨", "light snow"], 73: ["🌨", "snow"], 75: ["❄️", "heavy snow"],
    80: ["🌦", "showers"], 81: ["🌧", "showers"], 82: ["⛈", "heavy showers"], 95: ["⛈", "thunderstorms"], 96: ["⛈", "thunderstorms"], 99: ["⛈", "thunderstorms"]
  };

  function ensureChip() {
    var c = $("wxChip");
    if (!c) {
      c = document.createElement("div");
      c.id = "wxChip";
      c.className = "wx-chip";
      c.style.display = "none";
      var pf = document.querySelector(".planform");
      if (pf && pf.parentNode) pf.parentNode.insertBefore(c, pf.nextSibling);
      else ($("board") || document.body).appendChild(c);
    }
    return c;
  }

  async function updateWeather() {
    var chip = ensureChip();
    var ts = $("pTown");
    var town = ts ? ts.value : "";
    if (!town || !COORDS[town] || !currentMatchDate) { chip.style.display = "none"; return; }
    var date = currentMatchDate.slice(0, 10);
    var days = (new Date(date + "T12:00:00Z") - new Date()) / 86400000;
    chip.style.display = "block";
    if (days < -1 || days > 15) {
      chip.innerHTML = '<span class="wx-note">🌦 Forecast for <b>' + town + "</b> appears about two weeks before kick-off.</span>";
      return;
    }
    chip.innerHTML = '<span class="wx-note">Checking the forecast for ' + town + "…</span>";
    try {
      var c = COORDS[town];
      var url = "https://api.open-meteo.com/v1/forecast?latitude=" + c[0] + "&longitude=" + c[1] +
        "&daily=weather_code,temperature_2m_max,precipitation_probability_max&timezone=auto&start_date=" + date + "&end_date=" + date;
      var j = await fetch(url).then(function (r) { return r.json(); });
      var d = j.daily;
      if (!d || !d.time || !d.time.length) { chip.innerHTML = '<span class="wx-note">No forecast for that date yet.</span>'; return; }
      var code = d.weather_code[0];
      var tmax = Math.round(d.temperature_2m_max[0]);
      var pop = d.precipitation_probability_max ? d.precipitation_probability_max[0] : null;
      var w = WMO[code] || ["🌡", "mixed"];
      var garden = (code <= 3 && (pop == null || pop < 40) && tmax >= 15);
      chip.innerHTML =
        '<span class="wx-emoji">' + w[0] + "</span> <b>" + town + "</b> on match day: " +
        tmax + "°C, " + w[1] +
        (pop != null ? " · " + pop + "% chance of rain" : "") +
        " — <b>" + (garden ? "pub garden weather 🍺" : "one for indoors 🛋") + "</b>";
    } catch (e) {
      chip.innerHTML = '<span class="wx-note">Couldn\'t load the forecast right now.</span>';
    }
  }

  // ---------- wire up ----------
  function init() {
    if ($("pubFilters")) { renderFiltersMulti(); renderPubsMulti(); }

    var pt = $("pTown");
    if (pt) pt.addEventListener("change", updateWeather);

    var pm = $("pMatch");
    if (pm) pm.addEventListener("input", function () {
      var d = matchDateFor(pm.value.trim());
      if (d) currentMatchDate = d;
      updateWeather();
    });

    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.register("/sw.js").catch(function () {});
    }

    // load the group tables / knockout bracket module
    if (!document.getElementById("pk-tables-js")) {
      var tj = document.createElement("script");
      tj.id = "pk-tables-js";
      tj.src = "/tables.js";
      tj.defer = true;
      document.body.appendChild(tj);
    }
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();
})();
