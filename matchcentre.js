/* ===== Match Centre side panel + fun-coin betting =====
   NO REAL MONEY. Everyone starts with a pot of fun-coins, bets Win/Draw/Win
   on matches at the odds shown, and bets auto-settle from the live feed.
   Talks to /api/scores (live feed) and /api/bets (shared fun-coin store). */
(function () {
  "use strict";

  var SCORES_URL = "/api/scores";
  var BETS_URL = "/api/bets";
  var SCORES_EVERY = 60000;
  var BETS_EVERY = 25000;

  // ---- identity (shared with the main page's name box) ----
  function myName() {
    try { return (localStorage.getItem("wcwa::me") || "").trim(); } catch (e) { return ""; }
  }

  // ---- fixtures shown before the live feed is switched on ----
  var FALLBACK = [
    { id: "fx-open", utc: "2026-06-11T19:00:00Z", home: "Mexico", away: "South Africa", channel: "BBC" },
    { id: "fx-cro", utc: "2026-06-17T20:00:00Z", home: "England", away: "Croatia", channel: "ITV" },
    { id: "fx-gha", utc: "2026-06-23T20:00:00Z", home: "England", away: "Ghana", channel: "BBC" },
    { id: "fx-pan", utc: "2026-06-27T21:00:00Z", home: "Panama", away: "England", channel: "ITV" }
  ];

  // ---- rough team strength for auto-generated fun odds (0-100) ----
  var RATING = {
    spain: 92, france: 91, argentina: 90, brazil: 88, england: 88, germany: 85,
    portugal: 86, netherlands: 84, belgium: 83, croatia: 82, italy: 84, uruguay: 82,
    colombia: 80, morocco: 80, norway: 80, switzerland: 78, denmark: 78, japan: 78,
    senegal: 78, usa: 78, austria: 78, turkey: 78, serbia: 77, mexico: 77, nigeria: 77,
    ecuador: 76, ukraine: 76, "korea republic": 76, "south korea": 76, "ivory coast": 76,
    egypt: 76, algeria: 76, ghana: 75, poland: 75, sweden: 75, canada: 75, australia: 74,
    iran: 74, "saudi arabia": 72, qatar: 70, panama: 70, "south africa": 71,
    "cape verde": 70, uzbekistan: 70, jordan: 69, "new zealand": 68, curacao: 66, haiti: 66
  };
  function ratingFor(name) {
    var k = (name || "").toLowerCase().trim();
    return RATING[k] != null ? RATING[k] : 72;
  }

  // curated current Win/Draw/Win prices (decimal) for England's group games
  var CURATED = {
    croatia: { eng: 1.73, opp: 4.75, draw: 3.70 },
    ghana: { eng: 1.33, opp: 8.0, draw: 4.50 },
    panama: { eng: 1.25, opp: 13.0, draw: 6.50 }
  };
  function curatedOdds(home, away) {
    var h = (home || "").toLowerCase(), a = (away || "").toLowerCase();
    if (h.indexOf("england") < 0 && a.indexOf("england") < 0) return null;
    var opps = ["croatia", "ghana", "panama"];
    for (var i = 0; i < opps.length; i++) {
      var o = opps[i];
      if (h.indexOf(o) >= 0 || a.indexOf(o) >= 0) {
        var c = CURATED[o], homeIsEng = h.indexOf("england") >= 0;
        return { home: homeIsEng ? c.eng : c.opp, draw: c.draw, away: homeIsEng ? c.opp : c.eng };
      }
    }
    return null;
  }

  // model odds for any other match
  function modelOdds(home, away) {
    var d = ratingFor(home) - ratingFor(away);
    var e = 1 / (1 + Math.pow(10, -d / 20));            // home win-share
    var pDraw = Math.max(0.10, 0.30 - 0.40 * Math.abs(e - 0.5));
    var pHome = (1 - pDraw) * e, pAway = (1 - pDraw) * (1 - e);
    var price = function (p) { return Math.min(26, Math.max(1.05, Math.round((1 / p) * 0.95 * 100) / 100)); };
    return { home: price(pHome), draw: price(pDraw), away: price(pAway) };
  }
  function oddsFor(home, away) { return curatedOdds(home, away) || modelOdds(home, away); }

  // ---- small helpers ----
  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }
  function el(html) { var t = document.createElement("template"); t.innerHTML = html.trim(); return t.content.firstChild; }
  function fmtTime(utc) {
    var d = new Date(utc);
    return d.toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" }) +
      " · " + d.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
  }
  function countdown(utc) {
    var diff = new Date(utc) - new Date();
    if (diff <= 0) return "Kicking off";
    var dys = Math.floor(diff / 86400000); diff -= dys * 86400000;
    var h = Math.floor(diff / 3600000); diff -= h * 3600000;
    var m = Math.floor(diff / 60000); diff -= m * 60000;
    var s = Math.floor(diff / 1000);
    if (dys > 0) return dys + "d " + h + "h " + m + "m";
    return (h < 10 ? "0" : "") + h + ":" + (m < 10 ? "0" : "") + m + ":" + (s < 10 ? "0" : "") + s;
  }

  // ---- state ----
  var SC = { configured: false, live: [], upcoming: [], recent: [], england: [] };
  var BT = { players: [], bets: [], start: 1000 };
  var TAB = "scores";
  var ensured = "";

  // ---- DOM scaffolding ----
  var dom = {};
  function build() {
    document.body.classList.add("mc-ready");

    dom.toggle = el('<button id="mc-toggle"><span class="live-dot" style="display:none"></span><span class="tg-label">Scores &amp; Bets</span></button>');
    dom.backdrop = el('<div id="mc-backdrop"></div>');
    dom.panel = el(
      '<aside id="mc-panel">' +
        '<div class="mc-head"><h3>Match Centre<small>Live scores · fixtures · fun-coin bets</small></h3>' +
          '<button class="mc-close" title="Close">✕</button></div>' +
        '<div class="mc-bal"><span class="lab">Your fun-coins</span><span class="coins" id="mc-coins">—</span></div>' +
        '<div class="mc-tabs"><button data-tab="scores" class="on">⚽ Scores</button><button data-tab="bets">🏆 Bets</button></div>' +
        '<div class="mc-body" id="mc-scroll"></div>' +
      '</aside>'
    );
    dom.modal = el(
      '<div id="mc-modal"><div class="mc-card">' +
        '<h4 id="mc-m-title">Place a bet</h4><div class="sub" id="mc-m-sub"></div>' +
        '<div class="pickline"><span class="p" id="mc-m-pick"></span><span class="o" id="mc-m-odds"></span></div>' +
        '<label for="mc-stake">Stake (fun-coins)</label>' +
        '<input id="mc-stake" type="number" min="1" step="1" value="25">' +
        '<div class="mc-chips"><button data-st="10">10</button><button data-st="25">25</button>' +
          '<button data-st="50">50</button><button data-st="100">100</button><button data-st="max">Max</button></div>' +
        '<div class="mc-payout">Potential return: <b id="mc-return">—</b> <span id="mc-profit"></span></div>' +
        '<div class="mc-err" id="mc-err"></div>' +
        '<div class="acts"><button class="cancel">Cancel</button><button class="go" id="mc-go">Place bet</button></div>' +
      '</div></div>'
    );

    document.body.appendChild(dom.toggle);
    document.body.appendChild(dom.backdrop);
    document.body.appendChild(dom.panel);
    document.body.appendChild(dom.modal);

    dom.scroll = dom.panel.querySelector("#mc-scroll");
    dom.coins = dom.panel.querySelector("#mc-coins");

    dom.toggle.addEventListener("click", function () { setOpen(!document.body.classList.contains("mc-open")); });
    dom.backdrop.addEventListener("click", function () { setOpen(false); });
    dom.panel.querySelector(".mc-close").addEventListener("click", function () { setOpen(false); });
    dom.panel.querySelectorAll(".mc-tabs button").forEach(function (b) {
      b.addEventListener("click", function () {
        TAB = b.dataset.tab;
        dom.panel.querySelectorAll(".mc-tabs button").forEach(function (x) { x.classList.toggle("on", x === b); });
        render();
      });
    });

    // open by default on desktop
    setOpen(window.innerWidth > 920);

    // react to name changes from the main page box
    var nameBox = document.getElementById("meName");
    if (nameBox) {
      nameBox.addEventListener("input", function () { renderBalance(); });
      // only register the player once they've finished typing (blur), so partial
      // names like D / Da / Dav don't each land on the leaderboard
      nameBox.addEventListener("change", function () { ensurePlayer(); });
    }
  }

  function setOpen(open) { document.body.classList.toggle("mc-open", !!open); }

  // ---- modal ----
  var pending = null;
  function openBet(o) {
    if (!myName()) {
      alert("Pop your name in at the top of the page first, then you can bet.");
      var nb = document.getElementById("meName"); if (nb) { setOpen(false); nb.focus(); }
      return;
    }
    pending = o;
    dom.modal.querySelector("#mc-m-title").textContent = "Bet · " + o.matchLabel;
    dom.modal.querySelector("#mc-m-sub").textContent = "Fun-coins only — no real money.";
    dom.modal.querySelector("#mc-m-pick").textContent = o.selLabel;
    dom.modal.querySelector("#mc-m-odds").textContent = "@ " + o.odds.toFixed(2);
    dom.modal.querySelector("#mc-err").textContent = "";
    var stake = dom.modal.querySelector("#mc-stake");
    stake.value = Math.min(25, Math.max(1, myBalance()));
    updatePayout();
    dom.modal.classList.add("show");
    stake.focus();
  }
  function closeBet() { dom.modal.classList.remove("show"); pending = null; }
  function updatePayout() {
    if (!pending) return;
    var stake = Math.floor(Number(dom.modal.querySelector("#mc-stake").value)) || 0;
    var ret = Math.round(stake * pending.odds);
    dom.modal.querySelector("#mc-return").textContent = ret + " coins";
    dom.modal.querySelector("#mc-profit").textContent = stake > 0 ? "(+" + (ret - stake) + " profit)" : "";
  }

  function wireModal() {
    dom.modal.querySelector("#mc-stake").addEventListener("input", updatePayout);
    dom.modal.querySelectorAll(".mc-chips button").forEach(function (b) {
      b.addEventListener("click", function () {
        var st = dom.modal.querySelector("#mc-stake");
        st.value = b.dataset.st === "max" ? Math.max(1, myBalance()) : b.dataset.st;
        updatePayout();
      });
    });
    dom.modal.querySelector(".cancel").addEventListener("click", closeBet);
    dom.modal.addEventListener("click", function (e) { if (e.target === dom.modal) closeBet(); });
    dom.modal.querySelector("#mc-go").addEventListener("click", placeBet);
  }

  function myBalance() {
    var n = myName().toLowerCase();
    var p = BT.players.find(function (x) { return (x.name || "").toLowerCase() === n; });
    return p ? p.balance : BT.start;
  }
  function renderBalance() {
    var b = myName() ? myBalance() : null;
    dom.coins.textContent = b == null ? "—" : b.toLocaleString();
    dom.coins.classList.toggle("lo", b != null && b < 100);
  }

  async function ensurePlayer() {
    var name = myName();
    if (!name || name === ensured) return;
    ensured = name;
    try {
      await fetch(BETS_URL, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "ensure", name: name })
      });
      loadBets();
    } catch (e) { ensured = ""; }
  }

  async function placeBet() {
    if (!pending) return;
    var name = myName();
    var stake = Math.floor(Number(dom.modal.querySelector("#mc-stake").value));
    var errEl = dom.modal.querySelector("#mc-err");
    if (!(stake >= 1)) { errEl.textContent = "Enter a stake of at least 1."; return; }
    if (stake > myBalance()) { errEl.textContent = "You only have " + myBalance() + " fun-coins."; return; }
    var go = dom.modal.querySelector("#mc-go"); go.disabled = true; go.textContent = "Placing…";
    try {
      var r = await fetch(BETS_URL, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "place", name: name,
          bet: { matchId: pending.matchId, matchLabel: pending.matchLabel, selection: pending.selection, selLabel: pending.selLabel, odds: pending.odds, stake: stake }
        })
      });
      var j = await r.json();
      if (!r.ok || j.error) { errEl.textContent = j.error || "Could not place bet."; }
      else { closeBet(); await loadBets(); TAB = "bets"; dom.panel.querySelectorAll(".mc-tabs button").forEach(function (x) { x.classList.toggle("on", x.dataset.tab === "bets"); }); render(); }
    } catch (e) { errEl.textContent = "Network error — try again."; }
    go.disabled = false; go.textContent = "Place bet";
  }

  // host city for the games we know (the free feed doesn't carry venues)
  function cityFor(home, away) {
    var h = (home || "").toLowerCase(), a = (away || "").toLowerCase();
    function has(x) { return h.indexOf(x) >= 0 || a.indexOf(x) >= 0; }
    if (has("england") && has("croatia")) return "Dallas";
    if (has("england") && has("ghana")) return "Boston";
    if (has("england") && has("panama")) return "New York / NJ";
    if (has("mexico") && has("south africa")) return "Mexico City";
    return null;
  }

  // ---- rendering ----
  function matchRow(m, opts) {
    opts = opts || {};
    var live = opts.live, done = opts.done;
    var tags = "";
    if (live) tags += '<span class="tag live">' + esc(m.label || "LIVE") + "</span>";
    if (done && m.hScore != null) tags += '<span class="tag">FT</span>';
    if (m.group) tags += '<span class="tag">' + esc(m.group.replace("GROUP_", "Grp ")) + "</span>";
    if (m.channel) tags += '<span class="tag ch">' + esc(m.channel) + "</span>";
    var city = m.venue || cityFor(m.home, m.away);
    if (city) tags += '<span class="tag">📍 ' + esc(city) + "</span>";
    if (!live && !done) tags += '<span class="tag">' + esc(fmtTime(m.utc)) + "</span>";

    var html =
      '<div class="mc-match">' +
        '<div class="mrow"><span class="side">' + esc(m.home) + '</span><span class="sc">' + (live || done ? esc(String(m.hScore != null ? m.hScore : "-")) : "") + '</span></div>' +
        '<div class="mrow"><span class="side">' + esc(m.away) + '</span><span class="sc">' + (live || done ? esc(String(m.aScore != null ? m.aScore : "-")) : "") + '</span></div>' +
        '<div class="meta">' + tags + "</div>";

    if (!done) {
      var o = oddsFor(m.home, m.away);
      html += '<div class="mc-odds">' +
        oddBtn(m, "HOME", m.home, o.home) +
        oddBtn(m, "DRAW", "Draw", o.draw) +
        oddBtn(m, "AWAY", m.away, o.away) +
        "</div>";
      html += '<button class="mc-plan" type="button">📌 Plan to watch this</button>';
    }
    html += "</div>";
    var node = el(html);
    node.querySelectorAll(".mc-odds button").forEach(function (b) {
      b.addEventListener("click", function () {
        openBet({
          matchId: String(m.id), matchLabel: m.home + " v " + m.away,
          selection: b.dataset.sel, selLabel: b.dataset.lab, odds: Number(b.dataset.odds)
        });
      });
    });
    var pb = node.querySelector(".mc-plan");
    if (pb) pb.addEventListener("click", function () {
      if (window.planGame) { window.planGame(m.home + " v " + m.away, m.utc); setOpen(false); }
    });
    return node;
  }
  function oddBtn(m, sel, label, dec) {
    var lab = sel === "DRAW" ? "Draw" : esc(label) + " win";
    return '<button data-sel="' + sel + '" data-lab="' + esc(lab) + '" data-odds="' + dec + '">' +
      '<span class="pick">' + (sel === "DRAW" ? "Draw" : esc(label)) + '</span><span class="dec">' + dec.toFixed(2) + "</span></button>";
  }

  function renderScores() {
    var f = document.createDocumentFragment();
    if (!SC.configured) {
      f.appendChild(el('<div class="mc-empty">Live scores switch on once the API key is added. Showing fixtures for now.</div>'));
      f.appendChild(el('<div class="mc-section-t">Upcoming</div>'));
      var up = FALLBACK.filter(function (x) { return new Date(x.utc) > new Date(); });
      if (!up.length) up = FALLBACK;
      up.forEach(function (m) { f.appendChild(matchRow(m, {})); });
      dom.scroll.innerHTML = ""; dom.scroll.appendChild(f); return;
    }
    var engIds = {};
    // Up next — always pinned at the very top of the panel
    if (SC.upcoming.length) {
      var next = SC.upcoming[0];
      f.appendChild(el(
        '<div class="mc-next"><div class="when">Up next</div>' +
        '<div class="teams">' + esc(next.home) + " v " + esc(next.away) +
        (next.channel ? '<span class="ch">' + esc(next.channel) + "</span>" : "") + "</div>" +
        '<div class="cd" data-utc="' + esc(next.utc) + '">' + countdown(next.utc) + "</div></div>"
      ));
    }
    if (SC.england && SC.england.length) {
      f.appendChild(el('<div class="mc-section-t">🦁 England</div>'));
      SC.england.forEach(function (m) { engIds[m.id] = 1; f.appendChild(matchRow(m, {})); });
    }
    if (SC.live.length) {
      f.appendChild(el('<div class="mc-section-t">🔴 Live now</div>'));
      SC.live.forEach(function (m) { f.appendChild(matchRow(m, { live: true })); });
    }
    if (SC.upcoming.length) {
      var rest = SC.upcoming.filter(function (m) { return !engIds[m.id]; });
      if (rest.length) {
        f.appendChild(el('<div class="mc-section-t">Upcoming</div>'));
        rest.forEach(function (m) { f.appendChild(matchRow(m, {})); });
      }
    }
    if (SC.recent.length) {
      f.appendChild(el('<div class="mc-section-t">Results</div>'));
      SC.recent.forEach(function (m) { f.appendChild(matchRow(m, { done: true })); });
    }
    if (!SC.live.length && !SC.upcoming.length && !SC.recent.length && !(SC.england && SC.england.length)) {
      f.appendChild(el('<div class="mc-empty">No matches to show yet — the tournament kicks off 11 June.</div>'));
    }
    dom.scroll.innerHTML = ""; dom.scroll.appendChild(f);
  }

  function renderBets() {
    var f = document.createDocumentFragment();
    var me = myName().toLowerCase();

    f.appendChild(el('<div class="mc-section-t">🏆 Leaderboard</div>'));
    if (!BT.players.length) {
      f.appendChild(el('<div class="mc-empty">No one\'s playing yet. Add your name up top and place the first bet!</div>'));
    } else {
      var lb = el('<div class="mc-lb"></div>');
      BT.players.forEach(function (p, i) {
        var isMe = (p.name || "").toLowerCase() === me;
        lb.appendChild(el(
          '<div class="lb ' + (i === 0 ? "lead " : "") + (isMe ? "me" : "") + '">' +
          '<span class="rk ' + (i === 0 ? "first" : "") + '">' + (i + 1) + "</span>" +
          '<span class="nm">' + esc(p.name) + (isMe ? " (you)" : "") + "</span>" +
          '<span class="bal">' + (p.balance || 0).toLocaleString() + "</span></div>"
        ));
      });
      f.appendChild(lb);
    }

    var mine = BT.bets.filter(function (b) { return (b.who || "").toLowerCase() === me; });
    var open = mine.filter(function (b) { return b.status === "open"; });
    var done = mine.filter(function (b) { return b.status !== "open"; });

    f.appendChild(el('<div class="mc-section-t">Your open bets</div>'));
    if (!open.length) f.appendChild(el('<div class="mc-empty">No open bets. Tap any odds in the Scores tab.</div>'));
    open.forEach(function (b) { f.appendChild(betRow(b)); });

    if (done.length) {
      f.appendChild(el('<div class="mc-section-t">Settled</div>'));
      done.forEach(function (b) { f.appendChild(betRow(b)); });
    }

    f.appendChild(el('<div class="mc-foot">Fun-coins only — no real money. Everyone starts with ' + BT.start +
      '. Bets settle automatically at full-time. 18+ for the real thing · BeGambleAware.org</div>'));

    dom.scroll.innerHTML = ""; dom.scroll.appendChild(f);
  }

  function betRow(b) {
    var cls = b.status === "won" ? "won" : b.status === "lost" ? "lost" : b.status === "open" ? "open" : "";
    var out;
    if (b.status === "open") out = "to return " + Math.round(b.stake * b.odds);
    else if (b.status === "won") out = "+" + (b.returned - b.stake);
    else if (b.status === "void") out = "refunded";
    else out = "-" + b.stake;
    var res = b.result ? " (" + b.result.h + "–" + b.result.a + ")" : "";
    return el(
      '<div class="mc-bet ' + cls + '"><div class="l"><div class="m">' + esc(b.matchLabel) + esc(res) + "</div>" +
      '<div class="p">' + esc(b.selLabel) + " @ " + Number(b.odds).toFixed(2) + "</div></div>" +
      '<div class="r"><div class="st">' + b.stake + " coins</div><div class=\"out\">" + esc(out) + "</div></div></div>"
    );
  }

  function render() {
    renderBalance();
    if (TAB === "scores") renderScores(); else renderBets();
    // live indicator on the toggle
    var hasLive = SC.configured && SC.live.length > 0;
    dom.toggle.classList.toggle("has-live", hasLive);
    dom.toggle.querySelector(".live-dot").style.display = hasLive ? "inline-block" : "none";
    dom.toggle.querySelector(".tg-label").textContent = hasLive ? "LIVE (" + SC.live.length + ")" : "Scores & Bets";
  }

  // ---- data ----
  async function loadScores() {
    try {
      var r = await fetch(SCORES_URL, { cache: "no-store" });
      var j = await r.json();
      SC = { configured: !!j.configured, live: j.live || [], upcoming: j.upcoming || [], recent: j.recent || [], england: j.england || [] };
    } catch (e) { SC.configured = false; }
    render();
  }
  async function loadBets() {
    try {
      var r = await fetch(BETS_URL, { cache: "no-store" });
      var j = await r.json();
      BT = { players: j.players || [], bets: j.bets || [], start: j.start || 1000 };
    } catch (e) { /* keep last */ }
    render();
  }

  function tickCountdown() {
    var cd = dom.scroll && dom.scroll.querySelector(".cd[data-utc]");
    if (cd) cd.textContent = countdown(cd.dataset.utc);
  }

  function init() {
    build();
    wireModal();
    render();
    loadScores();
    ensurePlayer();
    loadBets();
    setInterval(loadScores, SCORES_EVERY);
    setInterval(loadBets, BETS_EVERY);
    setInterval(tickCountdown, 1000);
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();
})();
