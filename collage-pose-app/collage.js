/* 拼貼編輯器：版型選擇、照片放置/拖曳/縮放、匯出 PNG */

const Collage = {
  template: TEMPLATES[0],
  cells: [], // 與 template.cells 對應：{ img, ox, oy, zoom }（ox/oy 為相對格子尺寸的偏移比例）
  selected: -1,
  aspect: 1, // 高/寬
  gap: 8,
  radius: 12,
  bg: "#ffffff",

  setTemplate(t) {
    this.template = t;
    const old = this.cells;
    // 換版型時盡量保留已放入的照片
    this.cells = t.cells.map((_, i) => old[i] || { img: null, ox: 0, oy: 0, zoom: 1 });
    this.cells.length = t.cells.length;
    this.select(-1);
    this.render();
  },

  select(i) {
    this.selected = i;
    const tb = $("#cell-toolbar");
    const cell = this.cells[i];
    if (i >= 0 && cell && cell.img) {
      tb.hidden = false;
      $("#cell-zoom").value = Math.round(cell.zoom * 100);
    } else {
      tb.hidden = true;
    }
    $$(".collage-cell").forEach((el, idx) => el.classList.toggle("selected", idx === i));
  },

  /* 依容器大小計算舞台尺寸並重繪所有格子 */
  render() {
    const stage = $("#collage-stage");
    const wrap = stage.parentElement;
    const maxW = Math.max(wrap.clientWidth - 48, 200);
    const maxH = Math.max(wrap.clientHeight - 120, 200);
    let W = maxW, H = W * this.aspect;
    if (H > maxH) { H = maxH; W = H / this.aspect; }

    stage.style.width = W + "px";
    stage.style.height = H + "px";
    stage.style.background = this.bg;
    stage.innerHTML = "";

    this.template.cells.forEach((c, i) => {
      const g = this.gap;
      const el = document.createElement("div");
      el.className = "collage-cell";
      el.style.left = c.x * W + g / 2 + "px";
      el.style.top = c.y * H + g / 2 + "px";
      el.style.width = Math.max(c.w * W - g, 10) + "px";
      el.style.height = Math.max(c.h * H - g, 10) + "px";
      el.style.borderRadius = this.radius + "px";
      this.paintCell(el, i);
      this.bindCell(el, i);
      stage.appendChild(el);
    });
    this.select(this.selected);
  },

  paintCell(el, i) {
    const state = this.cells[i];
    el.classList.toggle("empty", !state.img);
    el.querySelector("img")?.remove();
    if (!state.img) return;
    const cw = parseFloat(el.style.width), ch = parseFloat(el.style.height);
    const { img, zoom } = state;
    const s = Math.max(cw / img.naturalWidth, ch / img.naturalHeight) * zoom;
    const dw = img.naturalWidth * s, dh = img.naturalHeight * s;
    this.clampOffset(state, cw, ch, dw, dh);
    const tag = document.createElement("img");
    tag.src = img.src;
    tag.style.width = dw + "px";
    tag.style.height = dh + "px";
    tag.style.transform = `translate(calc(-50% + ${state.ox * cw}px), calc(-50% + ${state.oy * ch}px))`;
    el.appendChild(tag);
  },

  /* 偏移夾限，確保圖片永遠蓋滿格子 */
  clampOffset(state, cw, ch, dw, dh) {
    const mx = Math.max(0, (dw - cw) / 2) / cw;
    const my = Math.max(0, (dh - ch) / 2) / ch;
    state.ox = Math.min(mx, Math.max(-mx, state.ox));
    state.oy = Math.min(my, Math.max(-my, state.oy));
  },

  bindCell(el, i) {
    let dragging = false, moved = false, sx = 0, sy = 0, ox0 = 0, oy0 = 0;

    el.addEventListener("pointerdown", (e) => {
      dragging = true; moved = false;
      sx = e.clientX; sy = e.clientY;
      ox0 = this.cells[i].ox; oy0 = this.cells[i].oy;
      el.setPointerCapture(e.pointerId);
    });
    el.addEventListener("pointermove", (e) => {
      if (!dragging || !this.cells[i].img) return;
      const dx = e.clientX - sx, dy = e.clientY - sy;
      if (Math.abs(dx) + Math.abs(dy) > 4) moved = true;
      if (!moved) return;
      const cw = parseFloat(el.style.width), ch = parseFloat(el.style.height);
      this.cells[i].ox = ox0 + dx / cw;
      this.cells[i].oy = oy0 + dy / ch;
      this.paintCell(el, i);
    });
    el.addEventListener("pointerup", () => {
      dragging = false;
      if (!moved) {
        this.select(i);
        if (!this.cells[i].img) this.pickFor(i);
      }
    });
    el.addEventListener("wheel", (e) => {
      if (!this.cells[i].img) return;
      e.preventDefault();
      const c = this.cells[i];
      c.zoom = Math.min(3, Math.max(1, c.zoom * (e.deltaY < 0 ? 1.06 : 0.94)));
      this.paintCell(el, i);
      if (this.selected === i) $("#cell-zoom").value = Math.round(c.zoom * 100);
    }, { passive: false });
  },

  pickFor(i) {
    this._pickTarget = i;
    $("#cell-input").click();
  },

  loadFileInto(i, file) {
    const img = new Image();
    img.onload = () => {
      this.cells[i] = { img, ox: 0, oy: 0, zoom: 1 };
      this.render();
      this.select(i);
    };
    img.src = URL.createObjectURL(file);
  },

  /* 匯出 1080px PNG；免費版加浮水印 */
  export() {
    const filled = this.cells.some((c) => c.img);
    if (!filled) { toast("先放入至少一張照片再匯出"); return; }

    const W = 1080, H = Math.round(W * this.aspect);
    const k = W / parseFloat($("#collage-stage").style.width); // 顯示 px → 匯出 px
    const canvas = document.createElement("canvas");
    canvas.width = W; canvas.height = H;
    const ctx = canvas.getContext("2d");
    ctx.fillStyle = this.bg;
    ctx.fillRect(0, 0, W, H);

    const g = this.gap * k, r = this.radius * k;
    this.template.cells.forEach((c, i) => {
      const state = this.cells[i];
      if (!state.img) return;
      const cx = c.x * W + g / 2, cy = c.y * H + g / 2;
      const cw = Math.max(c.w * W - g, 1), ch = Math.max(c.h * H - g, 1);
      const img = state.img;
      const s = Math.max(cw / img.naturalWidth, ch / img.naturalHeight) * state.zoom;
      const dw = img.naturalWidth * s, dh = img.naturalHeight * s;

      ctx.save();
      roundRectPath(ctx, cx, cy, cw, ch, Math.min(r, cw / 2, ch / 2));
      ctx.clip();
      ctx.drawImage(
        img,
        cx + cw / 2 - dw / 2 + state.ox * cw,
        cy + ch / 2 - dh / 2 + state.oy * ch,
        dw, dh
      );
      ctx.restore();
    });

    if (!Paywall.isPremium()) {
      ctx.font = `${Math.round(W * 0.028)}px sans-serif`;
      ctx.fillStyle = "rgba(255,255,255,.55)";
      ctx.strokeStyle = "rgba(0,0,0,.35)";
      ctx.lineWidth = 3;
      ctx.textAlign = "right";
      const txt = "Made with SnapPose Studio";
      ctx.strokeText(txt, W - 24, H - 24);
      ctx.fillText(txt, W - 24, H - 24);
    }

    canvas.toBlob((blob) => {
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = "snappose-collage.png";
      a.click();
      toast(Paywall.isPremium() ? "已匯出 ✅" : "已匯出（免費版含浮水印，升級可移除）");
    }, "image/png");
  },
};

function roundRectPath(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

/* ── 版型清單（含付費鎖） ── */
function renderTemplateList() {
  const list = $("#template-list");
  list.innerHTML = "";
  for (const t of TEMPLATES) {
    const locked = t.premium && !Paywall.isPremium();
    const thumb = document.createElement("div");
    thumb.className =
      "template-thumb" +
      (t.id === Collage.template.id ? " active" : "") +
      (locked ? " locked" : "");
    thumb.title = t.name;
    for (const c of t.cells) {
      const cell = document.createElement("div");
      cell.className = "t-cell";
      cell.style.left = 5 + c.x * 90 + "%";
      cell.style.top = 5 + c.y * 90 + "%";
      cell.style.width = c.w * 90 - 3 + "%";
      cell.style.height = c.h * 90 - 3 + "%";
      thumb.appendChild(cell);
    }
    if (t.premium) {
      const lock = document.createElement("span");
      lock.className = "lock-badge";
      lock.textContent = locked ? "🔒" : "PRO";
      thumb.appendChild(lock);
    }
    thumb.addEventListener("click", () => {
      if (t.premium && !Paywall.gate(`版型：${t.name}`)) return;
      Collage.setTemplate(t);
      renderTemplateList();
    });
    list.appendChild(thumb);
  }
}

/* ── 控制項 ── */
$("#ctl-aspect").addEventListener("change", (e) => { Collage.aspect = parseFloat(e.target.value); Collage.render(); });
$("#ctl-gap").addEventListener("input", (e) => { Collage.gap = +e.target.value; Collage.render(); });
$("#ctl-radius").addEventListener("input", (e) => { Collage.radius = +e.target.value; Collage.render(); });
$("#ctl-bg").addEventListener("input", (e) => { Collage.bg = e.target.value; Collage.render(); });

$("#cell-input").addEventListener("change", (e) => {
  const file = e.target.files[0];
  if (file && Collage._pickTarget != null) Collage.loadFileInto(Collage._pickTarget, file);
  e.target.value = "";
});

$("#btn-batch").addEventListener("click", () => $("#batch-input").click());
$("#batch-input").addEventListener("change", (e) => {
  const files = [...e.target.files];
  let fi = 0;
  Collage.cells.forEach((c, i) => {
    if (!c.img && fi < files.length) Collage.loadFileInto(i, files[fi++]);
  });
  if (fi === 0 && files.length) toast("所有格子都已有照片，點格子可替換");
  e.target.value = "";
});

$("#cell-zoom").addEventListener("input", (e) => {
  const c = Collage.cells[Collage.selected];
  if (!c) return;
  c.zoom = +e.target.value / 100;
  Collage.render();
});
$("#cell-replace").addEventListener("click", () => Collage.pickFor(Collage.selected));
$("#cell-remove").addEventListener("click", () => {
  const c = Collage.cells[Collage.selected];
  if (c) { c.img = null; c.ox = c.oy = 0; c.zoom = 1; }
  Collage.render();
  Collage.select(-1);
});
$("#btn-export").addEventListener("click", () => Collage.export());

window.addEventListener("resize", () => Collage.render());
window.addEventListener("DOMContentLoaded", () => Collage.setTemplate(TEMPLATES[0]));
