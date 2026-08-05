/* ===== Pub Kickoff extras =====
   - Multi-select town filter (deselect all -> nothing shows)
   - Tap a game (in the panel) or a pub -> pre-fills the "Post my plan" form
   - Weather for the chosen town on the match date (free Open-Meteo, no key)
   - Registers the service worker so the site installs as an app
   - Loads tables.js (the live Premier League table)
   Hooks into the globals defined by index.html's inline script (PUBS, TOWNS,
   FANZONES, mapsLink, esc) — classic scripts share scope. */
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
    "#fzFilters{margin-bottom:20px}" +
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

  // ---------- fan zone filter (All / None, by town) ----------
  function setupFanzones() {
    if (typeof FANZONES === "undefined") return;
    var fzList = $("fzList");
    if (!fzList) return;

    // Extra Malta (St Julian's / Spinola) fan zones, added here so index.html stays untouched
    var EXTRA = [
      { town: "Malta", name: "Spinola Bay Fan Zone", addr: "Spinola Bay, St Julian's, Malta", capacity: "big outdoor screen", tickets: "free", website: "https://spinolacafe.com/live-sports/", desc: "Malta's go-to World Cup spot — a big outdoor screen right on Spinola Bay in the heart of St Julian's, free and buzzing for the big games. (Setup based on previous tournaments; worth a quick check on the 2026 details nearer the time.)", times: "all the big matches" },
      { town: "Malta", name: "Spinola Cafe & Lounge", addr: "Spinola Bay, St Julian's, Malta", capacity: "indoor + terrace", tickets: "free entry", website: "https://spinolacafe.com/live-sports/", desc: "Big LED screens inside and out overlooking Spinola Bay — food, drinks and every big match, right on the fan-zone strip." },
      { town: "Malta", name: "Tigullio Fan Zone", addr: "Tigullio Car Park, St Julian's, Malta", capacity: "large outdoor screen", tickets: "free", website: "https://www.independent.com.mt/articles/2010-06-04/others/maltas-largest-outdoor-screen-in-st-julians-during-the-world-cup-275490", desc: "Historically home to Malta's largest outdoor screen during World Cups — a full-HD giant screen and a proper St Julian's crowd. Worth checking it's back for 2026." }
    ];
    EXTRA.forEach(function (z) { if (!FANZONES.some(function (x) { return x.name === z.name; })) FANZONES.push(z); });

    var fzTowns = [];
    FANZONES.forEach(function (z) { if (fzTowns.indexOf(z.town) < 0) fzTowns.push(z.town); });
    var fzSel = new Set(fzTowns);

    var bar = $("fzFilters");
    if (!bar) {
      bar = document.createElement("div");
      bar.id = "fzFilters";
      bar.className = "filters";
      fzList.parentNode.insertBefore(bar, fzList);
    }

    function fzCard(z) {
      return '<div class="fz">' +
        '<span class="fz-town">' + esc(z.town) + "</span>" +
        '<span class="fz-badge">⚽ Fan Zone</span>' +
        "<h3>" + esc(z.name) + "</h3>" +
        '<div class="fz-addr">' + esc(z.addr) + "</div>" +
        '<div class="fz-desc">' + z.desc + "</div>" +
        '<div class="fz-detail">' +
          (z.capacity ? "<span>👥 <b>" + esc(z.capacity) + "</b></span>" : "") +
          (z.tickets ? "<span>🎟 <b>" + esc(z.tickets) + "</b></span>" : "") +
          (z.times ? "<span>🕔 " + esc(z.times) + "</span>" : "") +
        "</div>" +
        '<div class="fz-links">' +
          '<a href="' + esc(z.website) + '" target="_blank" rel="noopener">Website &amp; tickets ↗</a>' +
          '<a href="https://www.google.com/maps/search/?api=1&query=' + encodeURIComponent(z.name + " " + z.addr) + '" target="_blank" rel="noopener">Map ↗</a>' +
        "</div>" +
      "</div>";
    }

    function renderFz() {
      var list = FANZONES.filter(function (z) { return fzSel.has(z.town); });
      if (!list.length) { fzList.innerHTML = '<div class="empty">No towns selected — tap a town above to show fan zones. 📺</div>'; return; }
      fzList.innerHTML = list.map(fzCard).join("");
    }

    function renderFzFilters() {
      var html = '<button class="pf-all" data-act="all">All</button>' +
                 '<button class="pf-all" data-act="none">None</button>';
      html += fzTowns.map(function (t) {
        return '<button class="' + (fzSel.has(t) ? "active" : "") + '" data-t="' + t + '">' + t + "</button>";
      }).join("");
      bar.innerHTML = html;
      bar.querySelectorAll("button[data-t]").forEach(function (b) {
        b.onclick = function () {
          if (fzSel.has(b.dataset.t)) fzSel.delete(b.dataset.t); else fzSel.add(b.dataset.t);
          renderFzFilters(); renderFz();
        };
      });
      bar.querySelector('[data-act="all"]').onclick = function () { fzTowns.forEach(function (t) { fzSel.add(t); }); renderFzFilters(); renderFz(); };
      bar.querySelector('[data-act="none"]').onclick = function () { fzSel.clear(); renderFzFilters(); renderFz(); };
    }

    renderFzFilters(); renderFz();
  }

  // ---------- tap-to-plan ----------
  var MATCH_DATES = {
    "Charlton v Derby": "2026-08-15T14:00:00Z",
    "West Ham v Charlton": "2026-08-22T14:00:00Z",
    "Hull City v Man Utd": "2026-08-22T11:30:00Z",
    "Everton v Crystal Palace": "2026-08-22T14:00:00Z",
    "Brentford v Spurs": "2026-08-22T16:30:00Z",
    "Fulham v Chelsea": "2026-08-24T19:00:00Z",
    "Opening night": "2026-08-21T19:00:00Z"
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
    setupFanzones();

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

    // load the Premier League table module
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
