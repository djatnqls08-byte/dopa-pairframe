// DOPA 핑크 페어틀 — Claude Design 시안(.dc.html)을 그대로 읽어서 그리는 작은 실행기 + 편집기
//  · 시안의 템플릿({{ }} · sc-for · sc-if)과 renderVals() 를 그대로 쓴다 → 시안을 바꾸면 파일만 갈아 끼우면 된다
//  · 사용자는 사진·글·테마를 바꾸고, 스티커를 끌어 옮기고, PNG / GIF 로 저장한다
(() => {
  let W = 1600, H = 900;   // 틀마다 다르다 (시안의 $preview 크기)
  const TEMPLATES = { diary: ["templates/diary.dc.html", "다이어리 (16:9)"], os: ["templates/os.dc.html", "민트 OS 창 (16:9)"], square: ["templates/square.dc.html", "정사각 (1:1)"] };
  const PHOTO_SLOTS = { "main-photo": "메인 사진 (두 사람)", "main-cutout": "튀어나오는 컷아웃 (투명 PNG · 선택)", "id-photo-a": "증명사진 ①", "id-photo-b": "증명사진 ②" };
  const LS = "dopa_pairframe_v1";
  const $ = (s, r = document) => r.querySelector(s);
  const S = { tplKey: "diary", tpl: null, Comp: null, inst: null, f: 0, animate: true, theme: "딸기우유", filled: true, data: null, stickers: null, stickersBy: {}, photos: {}, sel: -1, busy: false, slots: {} };

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
    if (el.getAttribute("data-wm") && !S.busy) el.style.display = "none";   // 도파 워터마크는 저장할 때만 (10/17 자기야)
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
    try { const pr = JSON.parse(doc.querySelector("script[data-dc-script]").getAttribute("data-props") || "{}").$preview || {}; W = pr.width || 1600; H = pr.height || 900; } catch (e) { W = 1600; H = 900; }
    S.slots = {}; xdc.querySelectorAll("[data-slot]").forEach((n) => { S.slots[n.getAttribute("data-slot")] = true; });
    window.PF_DEF = null; window.PF_SS = null;   // 틀을 바꾸면 그 틀의 기본 글·스티커를 다시 읽는다
    S.tpl = xdc; S.Comp = Comp;
    S.inst = new Comp({ theme: S.theme, filled: true, animate: true, showStickerSlots: true }); S.inst.state = { f: 0 };
    S.inst.renderVals();   // 기본 글·스티커를 읽어 온다
    const def = JSON.parse(JSON.stringify(window.PF_DEF));
    if (!S.data) S.data = def; else Object.keys(def).forEach((k) => { if (!(k in S.data)) S.data[k] = def[k]; });   // 글은 틀끼리 같이 쓴다
    S.stickers = S.stickersBy[S.tplKey] || JSON.parse(JSON.stringify(window.PF_SS)); S.stickersBy[S.tplKey] = S.stickers;   // 스티커 배치는 틀마다 따로
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
    fitText();
  }
  // 글이 칸을 넘치면 글자를 줄인다 (10/17 자기야: 캡션·체크리스트·노래 제목·채팅이 잘림) · 최소 원래 크기의 55%
  function fitText() {
    const r = root(); if (!r) return;
    r.querySelectorAll("*").forEach((el) => {
      if (!el.firstChild || el.children.length > 2) return;
      const st = el.style; if (!(st.overflow === "hidden" || st.textOverflow === "ellipsis" || st.whiteSpace === "nowrap")) return;
      if (el.scrollWidth <= el.clientWidth + 1 && el.scrollHeight <= el.clientHeight + 1) return;
      const base = parseFloat(getComputedStyle(el).fontSize) || 14; let fs = base;
      while (fs > base * 0.55 && (el.scrollWidth > el.clientWidth + 1 || el.scrollHeight > el.clientHeight + 1)) { fs -= base * 0.05; el.style.fontSize = fs + "px"; }
    });
    const chat = r.querySelector('[data-slot="chat"]');
    if (chat && chat.scrollHeight > chat.clientHeight + 1) {   // 말풍선이 길어 채팅 칸을 넘치면 말풍선 글자를 같이 줄인다
      const bs = [...chat.querySelectorAll("div,span")].filter((n) => n.firstChild && n.firstChild.nodeType === 3 && n.textContent.trim().length > 6);
      let k = 1; while (k > 0.6 && chat.scrollHeight > chat.clientHeight + 1) { k -= 0.06; bs.forEach((n) => { if (!n.dataset.fs0) n.dataset.fs0 = parseFloat(getComputedStyle(n).fontSize); n.style.fontSize = (n.dataset.fs0 * k) + "px"; }); }
    }
  }
  // 저장용 글꼴: 그림에 실제로 쓰인 글자만 담은 작은 글꼴을 구글 폰트에서 받아 넣는다 (text= 옵션) → 저장할 때 글꼴이 빠지지 않는다 (10/17: 저장본 제목이 가는 글꼴로 나옴)
  const FAMS = ["Black+Han+Sans", "Pacifico", "Gowun+Batang:wght@400;700", "Silkscreen"];
  let fontCache = { key: "", css: "" };
  async function fontCSS() {
    const r = root(); const chars = [...new Set((r.textContent + "OURLITTLEOVEGDAMYIRSNC0123456789·♥×abcdefghijklmnopqrstuvwxyz").replace(/\s/g, ""))].join("");
    if (fontCache.key === chars) return fontCache.css;
    const toData = async (u) => { const b = await (await fetch(u)).blob(); return await new Promise((ok) => { const fr = new FileReader(); fr.onload = () => ok(fr.result); fr.readAsDataURL(b); }); };
    let out = "";
    for (const fam of FAMS) {
      try {
        let css = await (await fetch(`https://fonts.googleapis.com/css2?family=${fam}&text=${encodeURIComponent(chars)}&display=swap`)).text();
        const urls = [...css.matchAll(/url\((https:[^)]+)\)/g)].map((m) => m[1]);
        for (const u of urls) css = css.replace(u, await toData(u));
        out += css + "\n";
      } catch (e) {}
    }
    fontCache = { key: chars, css: out }; return out;
  }

  // ── 화면 맞춤 ──
  // 크게 보기 (10/17 자기야: 폰에서 미리보기가 작아 잘 안 보였다) → 2배로 키우고 칸 안에서 손가락으로 둘러본다
  function fit() { const box = $("#stageBox"); const stg = $("#stage"); stg.style.width = W + "px"; stg.style.height = H + "px"; const base = box.clientWidth / W; const z = S.zoom || 1; const sc = base * z; stg.style.transform = `scale(${sc})`; const zm = $("#zoomer"); zm.style.width = `${W * sc}px`; zm.style.height = `${H * sc}px`; box.style.height = `${z > 1 ? Math.min(H * sc, Math.max(H * base, window.innerHeight * 0.55)) : H * sc}px`; box.classList.toggle("zoomed", z > 1); S.scale = sc; }

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
    Object.entries(PHOTO_SLOTS).filter(([k]) => S.slots[k]).forEach(([k, l]) => {
      const lab = document.createElement("label"); lab.className = "photo"; lab.innerHTML = `<span>${l}</span>`;
      const inp = document.createElement("input"); inp.type = "file"; inp.accept = "image/*";
      inp.addEventListener("change", () => { const f = inp.files && inp.files[0]; if (!f) return; const r = new FileReader(); r.onload = () => shrink(r.result, (url) => { S.photos[k] = url; render(); save(); buildPanel(); }); r.readAsDataURL(f); });
      lab.appendChild(inp);
      if (S.photos[k]) { const x = document.createElement("button"); x.type = "button"; x.textContent = "지우기"; x.addEventListener("click", (e) => { e.preventDefault(); delete S.photos[k]; render(); save(); buildPanel(); }); lab.appendChild(x); }
      ph.appendChild(lab);
    });
  }
  // 사진은 긴 변 1400px · WebP 로 줄여서 담는다 (10/17: 큰 사진은 기기 저장 한도를 넘어 새로고침하면 사진만 사라졌다 · WebP 라 투명 컷아웃도 그대로)
  function shrink(src, done) {
    const im = new Image();
    im.onload = () => { const m = Math.max(im.width, im.height); const k = m > 1400 ? 1400 / m : 1; const c = document.createElement("canvas"); c.width = Math.round(im.width * k); c.height = Math.round(im.height * k); c.getContext("2d").drawImage(im, 0, 0, c.width, c.height); let u = ""; try { u = c.toDataURL("image/webp", 0.9); } catch (e) {} done(u && u.startsWith("data:image/webp") ? u : src); };
    im.onerror = () => done(src); im.src = src;
  }
  async function buildDrawer() {
    let names = []; try { names = await (await fetch("stickers/index.json")).json(); } catch (e) {}
    const box = $("#drawer"); box.textContent = "";
    names.forEach((n) => { const b = document.createElement("button"); b.type = "button"; b.title = n; const im = document.createElement("img"); im.loading = "lazy"; im.src = `stickers/${n}.webp`; im.alt = ""; b.appendChild(im);
      b.addEventListener("click", () => { S.stickers.push([n, 700, 360, 110, 0]); S.sel = S.stickers.length - 1; render(); syncTools(); save(); $("#stageBox").scrollIntoView({ behavior: "smooth", block: "nearest" }); }); box.appendChild(b); });
  }

  // ── 저장 ──
  function save() { try { localStorage.setItem(LS, JSON.stringify({ theme: S.theme, data: S.data, tplKey: S.tplKey, stickersBy: S.stickersBy })); } catch (e) {} try { localStorage.setItem(LS + "_ph", JSON.stringify(S.photos)); } catch (e) {} }
  function load() { try { const v = JSON.parse(localStorage.getItem(LS) || "null"); if (v) { S.theme = v.theme || S.theme; S.data = v.data; S.tplKey = TEMPLATES[v.tplKey] ? v.tplKey : "diary"; S.stickersBy = v.stickersBy || (v.stickers ? { diary: v.stickers } : {}); } } catch (e) {} try { S.photos = JSON.parse(localStorage.getItem(LS + "_ph") || "{}") || {}; } catch (e) {} }
  const root = () => $("#canvas [data-root]");
  const status = (t) => { $("#status").textContent = t || ""; };
  async function exportPng() {
    if (S.busy) return; S.busy = true; const sel = S.sel; S.sel = -1; S.f = 29; render();
    status("이미지를 만드는 중…");
    try { await document.fonts.ready; const fontEmbedCSS = await fontCSS(); const url = await htmlToImage.toPng(root(), { width: W, height: H, pixelRatio: 1, cacheBust: false, ...(fontEmbedCSS ? { fontEmbedCSS } : {}) }); download(url, "dopa-pairframe.png"); status("PNG를 저장했어요"); }
    catch (e) { status("저장에 실패했어요. 다시 눌러 주세요"); console.error(e); }
    S.sel = sel; S.busy = false; render();
  }
  async function exportGif() {
    if (S.busy) return; S.busy = true; const sel = S.sel; S.sel = -1;
    try {
      const { GIFEncoder, quantize, applyPalette } = await import("https://cdn.jsdelivr.net/npm/gifenc@1.0.3/dist/gifenc.esm.js");
      await document.fonts.ready; S.f = 29; render(); const fontEmbedCSS = await fontCSS();   // 마지막 장면의 글자로 한 번만 받아 30프레임에 같이 쓴다
      const gw = W >= H ? 800 : 640, gh = Math.round(gw * H / W); const gif = GIFEncoder();
      for (let f = 0; f < 30; f++) {
        S.f = f; render(); status(`GIF 만드는 중… ${f + 1}/30 · 30초쯤 걸려요`);
        const cv = await htmlToImage.toCanvas(root(), { width: W, height: H, canvasWidth: gw, canvasHeight: gh, pixelRatio: 1, cacheBust: false, ...(fontEmbedCSS ? { fontEmbedCSS } : {}) });
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
    await loadTemplate(TEMPLATES[S.tplKey][0]);
    $("#theme").value = S.theme;
    const tp = $("#tpl"); Object.entries(TEMPLATES).forEach(([k, [, l]]) => { const o = document.createElement("option"); o.value = k; o.textContent = l; tp.appendChild(o); }); tp.value = S.tplKey;
    tp.addEventListener("change", async () => { S.tplKey = tp.value; S.sel = -1; await loadTemplate(TEMPLATES[S.tplKey][0]); fit(); buildPanel(); render(); syncTools(); save(); });
    $("#theme").addEventListener("change", (e) => { S.theme = e.target.value; render(); save(); });
    $("#anim").addEventListener("change", (e) => { S.animate = e.target.checked; render(); });
    $("#zoom").addEventListener("click", () => { S.zoom = (S.zoom || 1) > 1 ? 1 : 2; $("#zoom").textContent = S.zoom > 1 ? "🔍 원래 크기" : "🔍 크게 보기"; fit(); });
    $("#png").addEventListener("click", exportPng); $("#gif").addEventListener("click", exportGif);
    $("#reset").addEventListener("click", () => { const ok = $("#resetOk"); ok.hidden = !ok.hidden; });
    $("#resetYes").addEventListener("click", () => { S.data = JSON.parse(JSON.stringify(window.PF_DEF)); S.stickers = JSON.parse(JSON.stringify(window.PF_SS)); S.stickersBy = { [S.tplKey]: S.stickers }; S.photos = {}; S.sel = -1; save(); buildPanel(); render(); $("#resetOk").hidden = true; });
    document.querySelectorAll("[data-act]").forEach((b) => b.addEventListener("click", () => stAct(b.dataset.act)));
    buildPanel(); buildDrawer(); setupDrag(); fit(); window.addEventListener("resize", fit);
    render(); syncTools();
    setInterval(() => { if (S.animate && !S.busy) { S.f = (S.f + 1) % 30; render(); } }, 200);
  }
  init();
})();
