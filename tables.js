/* ===== Pub Kickoff — group tables & knockout bracket =====
   Injects a "Tables" section + nav link, then renders all 12 group standings
   during the group stage and auto-switches to a knockout bracket once the
   knockouts begin (with a manual Tables/Bracket toggle). Data: /api/standings. */
(function () {
  "use strict";

  var URL = "/api/standings";
  var EVERY = 180000; // refresh every 3 minutes
  var DATA = { configured: false, phase: "group", groups: [], bracket: { rounds: [] } };
  var view = null; // null = auto by phase; "tables" / "bracket" once toggled

  function el(h) { var t = document.createElement("template"); t.innerHTML = h.trim(); return t.content.firstChild; }
  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }

  // ---- styles ----
  var css = document.createElement("style");
  css.textContent =
    "#tables .tb-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(290px,1fr));gap:14px}" +
    "#tables .tb-card{background:var(--panel);border:1px solid var(--line);border-radius:var(--r);padding:14px 16px}" +
    "#tables .tb-gname{font-family:'Anton',sans-serif;color:var(--lime);font-size:16px;margin-bottom:8px;letter-spacing:.03em}" +
    "#tables .tb-tab{width:100%;border-collapse:collapse;font-size:13px}" +
    "#tables .tb-tab th{font-size:10px;text-transform:uppercase;letter-spacing:.05em;color:var(--muted);font-weight:700;padding:3px 4px;text-align:center}" +
    "#tables .tb-tab th.tl,#tables .tb-tab td.tl{text-align:left}" +
    "#tables .tb-tab td{padding:6px 4px;text-align:center;color:var(--ink);border-top:1px solid var(--line)}" +
    "#tables .tb-tab td.pos{color:var(--muted);width:18px}" +
    "#tables .tb-tab td.pts{font-weight:800;color:var(--gold)}" +
    "#tables .tb-tab tr.q td.pos{color:var(--lime);font-weight:800}" +
    "#tables .tb-tab tr.q td.tl{color:var(--lime)}" +
    "#tables .tb-key{font-size:12px;color:var(--muted);margin-top:14px}" +
    "#tables .tb-key b{color:var(--lime)}" +
    "#tables .tb-toggle{display:inline-flex;gap:4px;margin-left:auto}" +
    "#tables .tb-toggle button{font:inherit;font-weight:700;font-size:12px;color:var(--muted);background:var(--panel);border:1px solid var(--line);border-radius:999px;padding:6px 12px;cursor:pointer}" +
    "#tables .tb-toggle button.on{background:var(--lime);color:#0a1009;border-color:var(--lime)}" +
    "#tables .tb-bracket{display:flex;gap:16px;overflow-x:auto;padding-bottom:8px}" +
    "#tables .tb-round{min-width:200px;display:flex;flex-direction:column;gap:12px;justify-content:center}" +
    "#tables .tb-rname{font-family:'Anton',sans-serif;color:var(--lime);font-size:13px;letter-spacing:.04em;text-transform:uppercase}" +
    "#tables .tb-tie{background:var(--panel);border:1px solid var(--line);border-radius:10px;overflow:hidden}" +
    "#tables .tb-team{display:flex;justify-content:space-between;gap:8px;padding:8px 10px;font-size:13px;font-weight:700;color:var(--muted)}" +
    "#tables .tb-team+.tb-team{border-top:1px solid var(--line)}" +
    "#tables .tb-team.win{color:var(--ink)}" +
    "#tables .tb-team .s{font-family:'Anton',sans-serif;color:var(--gold)}";
  document.head.appendChild(css);

  // ---- mount section + nav link ----
  function mount() {
    if (document.getElementById("tables")) return;
    var sec = el(
      '<section id="tables"><div class="wrap">' +
        '<div class="sec-head"><h2>The Tables</h2><span class="tag" id="tbTag">group standings</span><span class="bar"></span>' +
          '<div class="tb-toggle" id="tbToggle" style="display:none"><button data-v="tables" class="on">Tables</button><button data-v="bracket">Bracket</button></div>' +
        "</div>" +
        '<div id="tbBody"><div class="empty">Loading the tables…</div></div>' +
      "</div></section>"
    );
    var fixtures = document.getElementById("fixtures");
    if (fixtures && fixtures.parentNode) fixtures.parentNode.insertBefore(sec, fixtures.nextSibling);
    else document.body.appendChild(sec);

    var nav = document.querySelector("nav.tabs .wrap");
    if (nav) {
      var a = el('<a href="#tables">Tables</a>');
      var odds = nav.querySelector('a[href="#odds"]');
      if (odds) nav.insertBefore(a, odds); else nav.appendChild(a);
    }

    sec.querySelectorAll("#tbToggle button").forEach(function (b) {
      b.onclick = function () {
        view = b.dataset.v;
        sec.querySelectorAll("#tbToggle button").forEach(function (x) { x.classList.toggle("on", x === b); });
        render();
      };
    });
  }

  function currentView() { return view || (DATA.phase === "knockout" ? "bracket" : "tables"); }

  function groupsHTML() {
    return '<div class="tb-grid">' + DATA.groups.map(function (g) {
      return '<div class="tb-card"><div class="tb-gname">Group ' + esc(g.group) + "</div>" +
        '<table class="tb-tab"><thead><tr><th></th><th class="tl">Team</th><th>P</th><th>GD</th><th>Pts</th></tr></thead><tbody>' +
        g.rows.map(function (r) {
          return '<tr class="' + (r.pos <= 2 ? "q" : "") + '"><td class="pos">' + r.pos + '</td><td class="tl">' + esc(r.team) +
            "</td><td>" + r.p + "</td><td>" + (r.gd > 0 ? "+" : "") + r.gd + '</td><td class="pts">' + r.pts + "</td></tr>";
        }).join("") +
        "</tbody></table></div>";
    }).join("") + "</div>" +
    '<div class="tb-key"><b>Green</b> = top two (through to the knockouts). Four best third-placed teams also qualify.</div>';
  }

  function bracketHTML() {
    return '<div class="tb-bracket">' + DATA.bracket.rounds.map(function (rd) {
      return '<div class="tb-round"><div class="tb-rname">' + esc(rd.name) + "</div>" +
        rd.matches.map(function (m) {
          var hw = m.winner === "HOME", aw = m.winner === "AWAY";
          return '<div class="tb-tie">' +
            '<div class="tb-team ' + (hw ? "win" : "") + '"><span>' + esc(m.home) + '</span><span class="s">' + (m.hScore != null ? m.hScore : "") + "</span></div>" +
            '<div class="tb-team ' + (aw ? "win" : "") + '"><span>' + esc(m.away) + '</span><span class="s">' + (m.aScore != null ? m.aScore : "") + "</span></div>" +
            "</div>";
        }).join("") +
        "</div>";
    }).join("") + "</div>";
  }

  function render() {
    var body = document.getElementById("tbBody");
    if (!body) return;
    var tag = document.getElementById("tbTag");
    var toggle = document.getElementById("tbToggle");
    if (!DATA.configured) { body.innerHTML = '<div class="empty">Standings switch on with the live feed.</div>'; return; }

    var hasGroups = DATA.groups && DATA.groups.length;
    var hasBr = DATA.bracket && DATA.bracket.rounds && DATA.bracket.rounds.length;
    if (toggle) toggle.style.display = (hasGroups && hasBr) ? "inline-flex" : "none";

    var v = currentView();
    if (v === "bracket" && hasBr) { if (tag) tag.textContent = "knockout bracket"; body.innerHTML = bracketHTML(); }
    else if (hasGroups) { if (tag) tag.textContent = "group standings"; body.innerHTML = groupsHTML(); }
    else if (hasBr) { if (tag) tag.textContent = "knockout bracket"; body.innerHTML = bracketHTML(); }
    else body.innerHTML = '<div class="empty">Tables appear once the tournament gets going — kick-off is 11 June.</div>';
  }

  function load() {
    fetch(URL, { cache: "no-store" })
      .then(function (r) { return r.json(); })
      .then(function (j) { DATA = j; render(); })
      .catch(function () {});
  }

  function init() { mount(); render(); load(); setInterval(load, EVERY); }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();
})();
