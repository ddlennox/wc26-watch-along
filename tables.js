/* ===== Pub Kickoff — the Premier League table =====
   Injects a "Table" section + nav link and renders the live 20-team Premier
   League standings from /api/standings. Top 5 highlighted (Europe), bottom 3
   flagged for the drop, and the clubs the group follows are picked out. */
(function () {
  "use strict";

  var URL = "/api/standings";
  var EVERY = 180000; // refresh every 3 minutes
  var DATA = { configured: false, table: [] };

  // clubs the group follows (matched loosely against the feed's short names)
  var OURS = ["man united", "manchester united", "chelsea", "tottenham", "crystal palace"];
  function isOurs(name) {
    var s = (name || "").toLowerCase();
    return OURS.some(function (c) { return s.indexOf(c) >= 0; });
  }

  function el(h) { var t = document.createElement("template"); t.innerHTML = h.trim(); return t.content.firstChild; }
  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }

  // ---- styles ----
  var css = document.createElement("style");
  css.textContent =
    "#tables .tb-wrap{background:var(--panel);border:1px solid var(--line);border-radius:var(--r);padding:6px 6px 10px;overflow-x:auto}" +
    "#tables .tb-tab{width:100%;border-collapse:collapse;font-size:14px;min-width:560px}" +
    "#tables .tb-tab th{font-size:10px;text-transform:uppercase;letter-spacing:.05em;color:var(--muted);font-weight:700;padding:8px 6px;text-align:center;border-bottom:1px solid var(--line)}" +
    "#tables .tb-tab th.tl,#tables .tb-tab td.tl{text-align:left}" +
    "#tables .tb-tab td{padding:9px 6px;text-align:center;color:var(--ink);border-top:1px solid var(--line);white-space:nowrap}" +
    "#tables .tb-tab td.pos{color:var(--muted);width:26px;position:relative}" +
    "#tables .tb-tab td.team{font-weight:700}" +
    "#tables .tb-tab td.pts{font-weight:800;color:var(--gold)}" +
    "#tables .tb-tab td.mut{color:var(--muted)}" +
    "#tables .tb-tab tr.ucl td.pos::before{content:'';position:absolute;left:0;top:6px;bottom:6px;width:3px;background:var(--lime);border-radius:2px}" +
    "#tables .tb-tab tr.eur td.pos::before{content:'';position:absolute;left:0;top:6px;bottom:6px;width:3px;background:#4da3ff;border-radius:2px}" +
    "#tables .tb-tab tr.rel td.pos::before{content:'';position:absolute;left:0;top:6px;bottom:6px;width:3px;background:var(--orange);border-radius:2px}" +
    "#tables .tb-tab tr.ours td.team{color:var(--lime)}" +
    "#tables .tb-tab tr.ours{background:rgba(214,255,63,.05)}" +
    "#tables .tb-form{display:inline-flex;gap:3px}" +
    "#tables .tb-form i{width:7px;height:7px;border-radius:50%;background:var(--line-strong);display:inline-block}" +
    "#tables .tb-form i.W{background:var(--lime)}#tables .tb-form i.L{background:var(--orange)}#tables .tb-form i.D{background:var(--gold)}" +
    "#tables .tb-key{font-size:12.5px;color:var(--muted);margin-top:14px;display:flex;gap:16px;flex-wrap:wrap}" +
    "#tables .tb-key span{display:inline-flex;align-items:center;gap:6px}" +
    "#tables .tb-key .dot{width:10px;height:10px;border-radius:3px;display:inline-block}" +
    "#tables .tb-key .dot.ucl{background:var(--lime)}#tables .tb-key .dot.eur{background:#4da3ff}#tables .tb-key .dot.rel{background:var(--orange)}" +
    "@media(max-width:560px){#tables .tb-hide{display:none}}";
  document.head.appendChild(css);

  // ---- mount section + nav link ----
  function mount() {
    if (document.getElementById("tables")) return;
    var sec = el(
      '<section id="tables"><div class="wrap">' +
        '<div class="sec-head"><h2>The Table</h2><span class="tag" id="tbTag">live Premier League standings</span><span class="bar"></span></div>' +
        '<div id="tbBody"><div class="empty">Loading the table…</div></div>' +
      "</div></section>"
    );
    var fixtures = document.getElementById("fixtures");
    if (fixtures && fixtures.parentNode) fixtures.parentNode.insertBefore(sec, fixtures.nextSibling);
    else document.body.appendChild(sec);

    var nav = document.querySelector("nav.tabs .wrap");
    if (nav) {
      var a = el('<a href="#tables">Table</a>');
      var odds = nav.querySelector('a[href="#odds"]');
      if (odds) nav.insertBefore(a, odds); else nav.appendChild(a);
    }
  }

  function formHTML(form) {
    if (!form) return "";
    var parts = String(form).split(/[,\s]+/).filter(Boolean).slice(-5);
    return '<span class="tb-form">' + parts.map(function (r) {
      var c = r.toUpperCase().charAt(0);
      return '<i class="' + (c === "W" || c === "L" || c === "D" ? c : "") + '"></i>';
    }).join("") + "</span>";
  }

  function tableHTML() {
    var rows = DATA.table.map(function (r) {
      var cls = [];
      if (r.pos <= 4) cls.push("ucl");
      else if (r.pos === 5) cls.push("eur");
      else if (r.pos >= 18) cls.push("rel");
      if (isOurs(r.team)) cls.push("ours");
      var gd = (r.gd > 0 ? "+" : "") + r.gd;
      return '<tr class="' + cls.join(" ") + '">' +
        '<td class="pos">' + r.pos + "</td>" +
        '<td class="tl team">' + esc(r.team) + "</td>" +
        '<td>' + r.p + "</td>" +
        '<td class="tb-hide">' + r.w + "</td>" +
        '<td class="tb-hide">' + r.d + "</td>" +
        '<td class="tb-hide">' + r.l + "</td>" +
        '<td class="tb-hide mut">' + r.gf + "</td>" +
        '<td class="tb-hide mut">' + r.ga + "</td>" +
        '<td>' + gd + "</td>" +
        '<td class="pts">' + r.pts + "</td>" +
        '<td class="tb-hide">' + formHTML(r.form) + "</td>" +
        "</tr>";
    }).join("");
    return '<div class="tb-wrap"><table class="tb-tab"><thead><tr>' +
      '<th></th><th class="tl">Club</th><th>P</th>' +
      '<th class="tb-hide">W</th><th class="tb-hide">D</th><th class="tb-hide">L</th>' +
      '<th class="tb-hide">GF</th><th class="tb-hide">GA</th><th>GD</th><th>Pts</th>' +
      '<th class="tb-hide">Form</th>' +
      "</tr></thead><tbody>" + rows + "</tbody></table></div>" +
      '<div class="tb-key">' +
        '<span><i class="dot ucl"></i> Top 4 · Champions League</span>' +
        '<span><i class="dot eur"></i> 5th · Europe</span>' +
        '<span><i class="dot rel"></i> Bottom 3 · relegation</span>' +
        '<span style="color:var(--lime)">Highlighted = our clubs</span>' +
      "</div>";
  }

  function render() {
    var body = document.getElementById("tbBody");
    if (!body) return;
    var tag = document.getElementById("tbTag");
    if (!DATA.configured) { body.innerHTML = '<div class="empty">The table switches on with the live feed.</div>'; return; }
    if (!DATA.table || !DATA.table.length || !DATA.table[0].p) {
      if (tag) tag.textContent = "kicks off Sat 22 Aug";
      body.innerHTML = '<div class="empty">The 2026/27 table fills in once the season kicks off — Sat 22 Aug. ⚽</div>';
      return;
    }
    if (tag) tag.textContent = "live Premier League standings";
    body.innerHTML = tableHTML();
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
