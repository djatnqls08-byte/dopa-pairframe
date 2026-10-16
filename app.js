// DOPA 핑크 페어틀 — Claude Design 시안(.dc.html)을 그대로 읽어서 그리는 작은 실행기 + 편집기
//  · 시안의 템플릿({{ }} · sc-for · sc-if)과 renderVals() 를 그대로 쓴다 → 시안을 바꾸면 파일만 갈아 끼우면 된다
//  · 사용자는 사진·글·테마를 바꾸고, 스티커를 끌어 옮기고, PNG / GIF 로 저장한다
(() => {
  const W = 1600, H = 900;
  const PHOTO_SLOTS = { "main-photo": "메인 사진 (두 사람)", "main-cutout": "튀어나오는 컷아웃 (투명 PNG · 선택)", "id-photo-a": "증명사진 ①", "id-photo-b": "증명사진 ②" };
  const LS = "dopa_pairframe_v1";
  const $ = (s, r = document) => r.querySelector(s);
  const S = { tpl: null, Comp: null, inst: null, f: 0, animate: true, theme: "딸기우유", filled: true, data: null, stickers: null, photos: {}, sel: -1, busy: false };

  // ── 템플릿 실행기 ──
  const get = (scope, path) => { const p = String(path).trim(); if (p === "true") return true; if (p === "false") return false; return p.split(".").reduce((o, k) => (o == null ? undefined : o[k]), scope); };
  const interp = (str, scope) => String(str).replace(/\{\{\s*([^}]+?)\s*\}\}/g, (_, e) => { const v = get(scope, e); return v == null ? "" : String(v); });
  const SVG_NS = "http://www.w3.org/2000/svg";
  function build(node, scope, inSvg, out) {
    if (node.nodeType === 3) { out.push(document.createTextNode(interp(node.nodeValue, scope))); return; }
    if (node.nodeType !== 1) return;
    const tag = node.tagName.toLowerCase();
    if (tag === "helmet" || tag === "script") return;
    if (tag === "sc-for") {
      const list = get(scope, node.getAttribute("list").replace(/[{}\s]/g, "")) || []; const as = node.getAttribute("as");
      list.forEach((item, i) => { const sc = Object.assign(Object.create(scope), { [as]: item, $index: i }); node.childNodes.forEach((c) => build(c, sc, inSvg, out)); });
      return;
    }
    if (tag === "sc-if") { if (get(scope, node.getAttribute("value").replace(/[{}\s]/g, ""))) node.childNodes.forEach((c) => build(c, scope, inSvg, out)); return; }
    const svg = inSvg || tag === "svg";
    const el = svg ? document.createElementNS(SVG_NS, node.tagName) : document.createElement(tag);
    for (const a of node.attributes) {
      if (a.name.startsWith("hint-")) continue;
      if (a.name === "ref") { el.setAttribute("data-root", "1"); continue; }
      let v = interp(a.value, scope);
      if (a.name === "src" && /^stickers\/.+\.png$/.test(v)) v = v.replace(/\.png$/, ".webp");
      el.setAttribute(a.name, v);
    }
    const slot = el.getAttribute("data-slot") || "";
    if (el.getAttribute("data-root")) el.setAttribute("style", (el.getAttribute("style") || "") + ";" + themeVars());
    if (/^sticker-\d+$/.test(slot)) {   // 스티커: 끌어 옮길 수 있게
      const idx = Number(slot.slice(8)) - 1;
      el.setAttribute("data-st", String(idx)); el.style.pointerEvents = "auto"; el.style.cursor = "grab"; el.style.transition = "none"; el.draggable = false;
      if (idx === S.sel && !S.busy) el.style.outline = "3px dashed #e8457c";
    }
    if (PHOTO_SLOTS[slot] && S.photos[slot]) {   // 사용자 사진을 칸에 꽉 채운다 (자리표시 실루엣 대신)
      const img = document.createElement("img"); img.src = S.photos[slot]; img.alt = "";
      img.setAttribute("style", `width:100%;height:100%;object-fit:${slot === "main-cutout" ? "contain;object-position:bottom" : "cover"};display:block`);
      el.appendChild(img); out.push(el); return;
    }
    if (slot === "main-cutout" && !S.photos[slot] && S.photos["main-photo"]) { el.style.display = "none"; out.push(el); return; }   // 내 사진을 넣었는데 컷아웃이 없으면 예시 실루엣을 숨긴다
    const kids = []; node.childNodes.forEach((c) => build(c, scope, svg && tag !== "foreignobject", kids));
    kids.forEach((k) => el.appendChild(k)); out.push(el);
  }
  const themeVars = () => { const t = (S.Comp && S.Comp.THEMES[S.theme]) || {}; return Object.entries(t).map(([k, v]) => `--${k}:${v}`).join(";"); };

  async function loadTemplate(file) {
    const html = await (await fetch(file)).text();
    const doc = new DOMParser().parseFromString(html, "text/html");
    const xdc = doc.querySelector("x-dc"); const code = doc.querySelector("script[data-dc-script]").textContent;
    // 시안 코드에 손잡이 두 개만 단다: 사용자 글(D)과 사용자 스티커 목록(ss)
    const patched = code
      .replace("const D = filled ?", "const D = (window.PF_DATA && filled) ? window.PF_DATA : filled ?")
      .replace("const typed =", "if (!window.PF_DEF && filled) window.PF_DEF = JSON.parse(JSON.stringify(D)); const typed =")
      .replace("const stickers = ss.map(", "if (!window.PF_SS) window.PF_SS = JSON.parse(JSON.stringify(ss)); const stickers = (window.PF_STICKERS || ss).map(");
    class DCLogic { constructor(props) { this.props = props; } setState(fn) { this.state = Object.assign({}, this.state, typeof fn === "function" ? fn(this.state) : fn); } }
    const React = { createRef: () => ({ current: null }) };
    const Comp = new Function("DCLogic", "React", patched + "\nreturn Component;")(DCLogic, React);
    S.tpl = xdc; S.Comp = Comp;
    S.inst = new Comp({ theme: S.theme, filled: true, animate: true, showStickerSlots: true }); S.inst.state = { f: 0 };
    S.inst.renderVals();   // 기본 글·스티커를 읽어 온다
    if (!S.data) S.data = JSON.parse(JSON.stringify(window.PF_DEF));
    if (!S.stickers) S.stickers = JSON.parse(JSON.stringify(window.PF_SS));
  }

  function render() {
    if (!S.tpl) return;
    window.PF_DATA = S.data; window.PF_STICKERS = S.stickers;
    S.inst.props = { theme: S.theme, filled: S.filled, animate: S.animate, showStickerSlots: true };
    S.inst.state = { f: S.animate || S.busy ? S.f : 29 };
    const vals = S.inst.renderVals();
    const out = []; S.tpl.childNodes.forEach((c) => build(c, vals, false, out));
    const fresh = document.createElement("div"); fresh.id = "canvas"; out.forEach((n) => fresh.appendChild(n));
    morphdom($("#canvas"), fresh);
  }

  // ── 화면 맞춤 ──
  function fit() { const box = $("#stageBox"); const sc = box.clientWidth / W; $("#stage").style.transform = `scale(${sc})`; box.style.height = `${H * sc}px`; S.scale = sc; }

  // ── 스티커 끌기 ──
  function setupDrag() {
    const stage = $("#stage"); let drag = null;
    stage.addEventListener("pointerdown", (e) => {
      const t = e.target.closest("[data-st]"); if (!t) { if (S.sel >= 0) { S.sel = -1; render(); syncTools(); } return; }
      const i = Number(t.dataset.st); S.sel = i; const s = S.stickers[i];
      drag = { i, x0: e.clientX, y0: e.clientY, sx: s[1], sy: s[2] }; stage.setPointerCapture(e.pointerId); e.preventDefault(); render(); syncTools();
    });
    stage.addEventListener("pointermove", (e) => { if (!drag) return; const s = S.stickers[drag.i]; s[1] = Math.round(drag.sx + (e.clientX - drag.x0) / S.scale); s[2] = Math.round(drag.sy + (e.clientY - drag.y0) / S.scale); render(); });
    const end = () => { if (drag) { drag = null; save(); } };
    stage.addEventListener("pointerup", end); stage.addEventListener("pointercancel", end);
  }
  function syncTools() { $("#stTools").hidden = S.sel < 0; }
  function stAct(a) {
    const i = S.sel; if (i < 0) return; const s = S.stickers[i];
    if (a === "big") s[3] = Math.min(900, Math.round(s[3] * 1.15)); if (a === "small") s[3] = Math.max(24, Math.round(s[3] / 1.15));
    if (a === "rl") s[4] = (s[4] || 0) - 10; if (a === "rr") s[4] = (s[4] || 0) + 10;
    if (a === "front") { S.stickers.push(S.stickers.splice(i, 1)[0]); S.sel = S.stickers.length - 1; }
    if (a === "back") { S.stickers.unshift(S.stickers.splice(i, 1)[0]); S.sel = 0; }
    if (a === "dup") { const c = s.slice(); c[1] += 30; c[2] += 30; S.stickers.push(c); S.sel = S.stickers.length - 1; }
    if (a === "del") { S.stickers.splice(i, 1); S.sel = -1; }
    render(); syncTools(); save();
  }

  // ── 편집 패널 ──
  const FIELDS = [["title", "페어 이름 (타이틀)"], ["script", "필기체 장식 글씨"], ["relation", "관계 태그"], ["caption", "폴라로이드 캡션"],
    ["nameA", "① 이름"], ["enA", "① 영문 이름"], ["profA", "① 한 줄 프로필"], ["lineA", "① 대표 대사"],
    ["nameB", "② 이름"], ["enB", "② 영문 이름"], ["profB", "② 한 줄 프로필"], ["lineB", "② 대표 대사"],
    ["chatTitle", "채팅방 이름"], ["memory", "도파가 기억 중 (한 줄)"], ["song", "노래 제목"]];
  function buildPanel() {
    const txt = $("#fText"); txt.textContent = "";
    FIELDS.forEach(([k, l]) => { if (!(k in S.data)) return; const lab = document.createElement("label"); lab.className = "fld"; lab.innerHTML = `<span>${l}</span>`; const inp = document.createElement("input"); inp.value = S.data[k] || ""; inp.maxLength = 40; inp.addEventListener("input", () => { S.data[k] = inp.value; render(); save(); }); lab.appendChild(inp); txt.appendChild(lab); });
    const chat = $("#fChat"); chat.textContent = "";
    (S.data.chat || []).forEach((c, i) => {
      const row = document.createElement("div"); row.className = "chatrow";
      const who = document.createElement("button"); who.type = "button"; who.className = "who"; const sync = () => { who.textContent = c[0] === "A" ? (S.data.nameA || "①") : (S.data.nameB || "②"); }; sync();
      who.addEventListener("click", () => { c[0] = c[0] === "A" ? "B" : "A"; sync(); render(); save(); });
      const t = document.createElement("input"); t.value = c[1]; t.maxLength = 40; t.addEventListener("input", () => { c[1] = t.value; render(); save(); });
      const tm = document.createElement("input"); tm.value = c[2]; tm.className = "tm"; tm.maxLength = 5; tm.addEventListener("input", () => { c[2] = tm.value; render(); save(); });
      row.append(who, t, tm); chat.appendChild(row);
    });
    const todo = $("#fTodo"); todo.textContent = "";
    (S.data.todos || []).forEach((td) => { const row = document.createElement("div"); row.className = "todorow"; const cb = document.createElement("input"); cb.type = "checkbox"; cb.checked = Boolean(td[1]); cb.addEventListener("change", () => { td[1] = cb.checked ? 1 : 0; render(); save(); }); const t = document.createElement("input"); t.value = td[0]; t.maxLength = 20; t.addEventListener("input", () => { td[0] = t.value; render(); save(); }); row.append(cb, t); todo.appendChild(row); });
    const ph = $("#fPhoto"); ph.textContent = "";
    Object.entries(PHOTO_SLOTS).forEach(([k, l]) => {
      const lab = document.createElement("label"); lab.className = "photo"; lab.innerHTML = `<span>${l}</span>`;
      const inp = document.createElement("input"); inp.type = "file"; inp.accept = "image/*";
      inp.addEventListener("change", () => { const f = inp.files && inp.files[0]; if (!f) return; const r = new FileReader(); r.onload = () => { S.photos[k] = r.result; render(); save(); buildPanel(); }; r.readAsDataURL(f); });
      lab.appendChild(inp);
      if (S.photos[k]) { const x = document.createElement("button"); x.type = "button"; x.textContent = "지우기"; x.addEventListener("click", (e) => { e.preventDefault(); delete S.photos[k]; render(); save(); buildPanel(); }); lab.appendChild(x); }
      ph.appendChild(lab);
    });
  }
  async function buildDrawer() {
    let names = []; try { names = await (await fetch("stickers/index.json")).json(); } catch (e) {}
    const box = $("#drawer"); box.textContent = "";
    names.forEach((n) => { const b = document.createElement("button"); b.type = "button"; b.title = n; const im = document.createElement("img"); im.loading = "lazy"; im.src = `stickers/${n}.webp`; im.alt = ""; b.appendChild(im);
      b.addEventListener("click", () => { S.stickers.push([n, 700, 360, 110, 0]); S.sel = S.stickers.length - 1; render(); syncTools(); save(); $("#stageBox").scrollIntoView({ behavior: "smooth", block: "nearest" }); }); box.appendChild(b); });
  }

  // ── 저장 ──
  function save() { try { localStorage.setItem(LS, JSON.stringify({ theme: S.theme, data: S.data, stickers: S.stickers })); } catch (e) {} try { localStorage.setItem(LS + "_ph", JSON.stringify(S.photos)); } catch (e) {} }
  function load() { try { const v = JSON.parse(localStorage.getItem(LS) || "null"); if (v) { S.theme = v.theme || S.theme; S.data = v.data; S.stickers = v.stickers; } } catch (e) {} try { S.photos = JSON.parse(localStorage.getItem(LS + "_ph") || "{}") || {}; } catch (e) {} }
  const root = () => $("#canvas [data-root]");
  const status = (t) => { $("#status").textContent = t || ""; };
  async function exportPng() {
    if (S.busy) return; S.busy = true; const sel = S.sel; S.sel = -1; S.f = 29; render();
    status("이미지를 만드는 중…");
    try { await document.fonts.ready; const url = await htmlToImage.toPng(root(), { width: W, height: H, pixelRatio: 1, cacheBust: false }); download(url, "dopa-pairframe.png"); status("PNG를 저장했어요"); }
    catch (e) { status("저장에 실패했어요. 다시 눌러 주세요"); console.error(e); }
    S.sel = sel; S.busy = false; render();
  }
  async function exportGif() {
    if (S.busy) return; S.busy = true; const sel = S.sel; S.sel = -1;
    try {
      const { GIFEncoder, quantize, applyPalette } = await import("https://cdn.jsdelivr.net/npm/gifenc@1.0.3/dist/gifenc.esm.js");
      await document.fonts.ready;   // 글꼴은 프레임마다 PNG와 같은 방식으로 넣는다 (getFontEmbedCSS 가 빈 값을 돌려줘 GIF 제목 글꼴이 빠졌다)
      const gw = 800, gh = 450; const gif = GIFEncoder();
      for (let f = 0; f < 30; f++) {
        S.f = f; render(); status(`GIF 만드는 중… ${f + 1}/30 · 30초쯤 걸려요`);
        const cv = await htmlToImage.toCanvas(root(), { width: W, height: H, canvasWidth: gw, canvasHeight: gh, pixelRatio: 1, cacheBust: false });
        const ctx = cv.getContext("2d"); const { data } = ctx.getImageData(0, 0, gw, gh);
        const pal = quantize(data, 256); const idx = applyPalette(data, pal); gif.writeFrame(idx, gw, gh, { palette: pal, delay: 200 });
      }
      gif.finish(); const blob = new Blob([gif.bytes()], { type: "image/gif" }); download(URL.createObjectURL(blob), "dopa-pairframe.gif"); status("GIF를 저장했어요");
    } catch (e) { status("GIF 만들기에 실패했어요. PNG로 저장해 주세요"); console.error(e); }
    S.sel = sel; S.busy = false; render();
  }
  function download(url, name) { const a = document.createElement("a"); a.href = url; a.download = name; document.body.appendChild(a); a.click(); a.remove(); }

  async function init() {
    load();
    await loadTemplate("templates/diary.dc.html");
    $("#theme").value = S.theme;
    $("#theme").addEventListener("change", (e) => { S.theme = e.target.value; render(); save(); });
    $("#anim").addEventListener("change", (e) => { S.animate = e.target.checked; render(); });
    $("#png").addEventListener("click", exportPng); $("#gif").addEventListener("click", exportGif);
    $("#reset").addEventListener("click", () => { const ok = $("#resetOk"); ok.hidden = !ok.hidden; });
    $("#resetYes").addEventListener("click", () => { S.data = JSON.parse(JSON.stringify(window.PF_DEF)); S.stickers = JSON.parse(JSON.stringify(window.PF_SS)); S.photos = {}; S.sel = -1; save(); buildPanel(); render(); $("#resetOk").hidden = true; });
    document.querySelectorAll("[data-act]").forEach((b) => b.addEventListener("click", () => stAct(b.dataset.act)));
    buildPanel(); buildDrawer(); setupDrag(); fit(); window.addEventListener("resize", fit);
    render(); syncTools();
    setInterval(() => { if (S.animate && !S.busy) { S.f = (S.f + 1) % 30; render(); } }, 200);
  }
  init();
})();
