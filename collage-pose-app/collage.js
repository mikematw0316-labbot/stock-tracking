/* 拼貼編輯器：版型、照片拖曳/捏合縮放、畫布設定面板、匯出 PNG */

/* Facebook 用途預設：畫布比例 + 匯出像素皆採 FB 官方建議尺寸 */
const FB_PRESETS = {
  "fb-square":   { w: 1080, h: 1080, hint: "1080 × 1080（Facebook 貼文建議）" },
  "fb-portrait": { w: 1080, h: 1350, hint: "1080 × 1350（FB 直式貼文，動態牆佔版最大）" },
  "fb-story":    { w: 1080, h: 1920, hint: "1080 × 1920（FB 限時動態 / Reels）" },
  "fb-cover":    { w: 851,  h: 315,  hint: "851 × 315（個人檔案 / 粉絲專頁封面）" },
  "fb-link":     { w: 1200, h: 630,  hint: "1200 × 630（連結分享預覽圖 1.91:1）" },
};

const Collage = {
  template: TEMPLATES[0],
  cells: [], // 與 template.cells 對應：{ img, ox, oy, zoom }（ox/oy 為相對格子尺寸的偏移比例）
  selected: -1,
  preset: FB_PRESETS["fb-square"],
  presetId: "fb-square",
  pages: 1, // 輪播張數（>1 時畫布為 N 倍寬的長畫布）
  aspect: 1, // 高/寬，由 preset 與 pages 推得
  gap: 8,
  radius: 12,
  bg: "#ffffff",

  /* 輪播只適用於貼文類尺寸 */
  carouselAllowed() {
    return this.presetId === "fb-square" || this.presetId === "fb-portrait";
  },

  setPreset(id) {
    this.presetId = id;
    this.preset = FB_PRESETS[id];
    if (!this.carouselAllowed()) this.setPages(1, true);
    this.applyGeometry();
  },

  setPages(n, silent) {
    this.pages = n;
    if (!silent) this.applyGeometry();
    $$("#carousel-chips .chip").forEach((c) =>
      c.classList.toggle("active", +c.dataset.pages === n));
    $("#carousel-hint").hidden = n === 1;
  },

  applyGeometry() {
    this.aspect = this.preset.h / (this.preset.w * this.pages);
    $("#carousel-row").style.display = this.carouselAllowed() ? "" : "none";
    const sizeTxt = this.pages > 1
      ? `${this.pages} 張 × ${this.preset.w} × ${this.preset.h}（無縫輪播）`
      : this.preset.hint;
    $("#preset-hint").textContent = "匯出尺寸：" + sizeTxt;
    this.render();
  },

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
    const cell = this.cells[i];
    $("#cell-toolbar").hidden = !(i >= 0 && cell && cell.img);
    $$(".collage-cell").forEach((el, idx) => el.classList.toggle("selected", idx === i));
  },

  hasPhotos() {
    return this.cells.some((c) => c.img);
  },

  render() {
    const stage = $("#collage-stage");
    const wrap = stage.parentElement;
    const maxW = Math.max(wrap.clientWidth - 28, 180);
    const maxH = Math.max(wrap.clientHeight - 28, 180);
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
    // 輪播分頁參考線與頁碼
    if (this.pages > 1) {
      for (let p = 0; p < this.pages; p++) {
        if (p > 0) {
          const guide = document.createElement("div");
          guide.className = "page-guide";
          guide.style.left = (p * W) / this.pages + "px";
          stage.appendChild(guide);
        }
        const num = document.createElement("div");
        num.className = "page-num";
        num.textContent = p + 1;
        num.style.left = (p * W) / this.pages + 6 + "px";
        stage.appendChild(num);
      }
    }
    $("#empty-cta").hidden = this.hasPhotos();
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

  /* 單指拖曳構圖、雙指捏合縮放、點擊選取/上傳 */
  bindCell(el, i) {
    const pointers = new Map();
    let moved = false, sx = 0, sy = 0, ox0 = 0, oy0 = 0;
    let pinchDist = 0, zoom0 = 1;

    el.addEventListener("pointerdown", (e) => {
      pointers.set(e.pointerId, e);
      el.setPointerCapture(e.pointerId);
      if (pointers.size === 1) {
        moved = false;
        sx = e.clientX; sy = e.clientY;
        ox0 = this.cells[i].ox; oy0 = this.cells[i].oy;
      } else if (pointers.size === 2) {
        const [a, b] = [...pointers.values()];
        pinchDist = Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY);
        zoom0 = this.cells[i].zoom;
      }
    });

    el.addEventListener("pointermove", (e) => {
      if (!pointers.has(e.pointerId) || !this.cells[i].img) return;
      pointers.set(e.pointerId, e);
      const cw = parseFloat(el.style.width), ch = parseFloat(el.style.height);

      if (pointers.size === 2) {
        const [a, b] = [...pointers.values()];
        const d = Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY);
        if (pinchDist > 0) {
          this.cells[i].zoom = Math.min(3, Math.max(1, zoom0 * (d / pinchDist)));
          moved = true;
          this.paintCell(el, i);
        }
        return;
      }

      const dx = e.clientX - sx, dy = e.clientY - sy;
      if (Math.abs(dx) + Math.abs(dy) > 4) moved = true;
      if (!moved) return;
      this.cells[i].ox = ox0 + dx / cw;
      this.cells[i].oy = oy0 + dy / ch;
      this.paintCell(el, i);
    });

    const release = (e) => {
      pointers.delete(e.pointerId);
      if (pointers.size > 0) return;
      if (!moved) {
        this.select(i);
        if (!this.cells[i].img) this.pickFor(i);
      }
    };
    el.addEventListener("pointerup", release);
    el.addEventListener("pointercancel", release);

    el.addEventListener("wheel", (e) => {
      if (!this.cells[i].img) return;
      e.preventDefault();
      const c = this.cells[i];
      c.zoom = Math.min(3, Math.max(1, c.zoom * (e.deltaY < 0 ? 1.06 : 0.94)));
      this.paintCell(el, i);
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
    };
    img.src = URL.createObjectURL(file);
  },

  /* 以 FB 建議像素匯出 PNG；輪播時裁成多張；免費版加浮水印 */
  async export() {
    if (!this.hasPhotos()) { toast("先放入至少一張照片再匯出"); return; }

    const W = this.preset.w * this.pages, H = this.preset.h;
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

    const toBlob = (c) => new Promise((r) => c.toBlob(r, "image/png"));

    if (this.pages === 1) {
      drawWatermark(ctx, W, H);
      shareOrDownload(await toBlob(canvas), "snappose-fb.png");
    } else {
      // 裁成 N 張：發 FB 多圖貼文時滑動無縫接續
      const pw = this.preset.w;
      const blobs = [];
      for (let p = 0; p < this.pages; p++) {
        const slice = document.createElement("canvas");
        slice.width = pw; slice.height = H;
        const sctx = slice.getContext("2d");
        sctx.drawImage(canvas, p * pw, 0, pw, H, 0, 0, pw, H);
        drawWatermark(sctx, pw, H);
        blobs.push(await toBlob(slice));
      }
      await shareOrDownloadMany(blobs, "snappose-carousel");
    }
    if (!Paywall.isPremium()) toast("免費版匯出含浮水印，升級 Premium 可移除", 3500);
  },
};

/* 免費版浮水印 */
function drawWatermark(ctx, W, H) {
  if (Paywall.isPremium()) return;
  ctx.font = `${Math.round(W * 0.028)}px sans-serif`;
  ctx.fillStyle = "rgba(255,255,255,.55)";
  ctx.strokeStyle = "rgba(0,0,0,.35)";
  ctx.lineWidth = 3;
  ctx.textAlign = "right";
  const txt = "Made with SnapPose Studio";
  ctx.strokeText(txt, W - 24, H - 24);
  ctx.fillText(txt, W - 24, H - 24);
}

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
const THUMB_PALETTE = ["#e9c4a8", "#cdd9c3", "#ddd0ea", "#f2dfba", "#c5d6e8", "#eccdd3"];

function renderTemplateList() {
  const list = $("#template-list");
  list.innerHTML = "";
  for (const t of TEMPLATES) {
    const locked = t.premium && !Paywall.isPremium();
    const item = document.createElement("div");
    item.className = "template-item";
    const thumb = document.createElement("button");
    thumb.className =
      "template-thumb" +
      (t.id === Collage.template.id ? " active" : "") +
      (locked ? " locked" : "");
    thumb.title = t.name;
    t.cells.forEach((c, ci) => {
      const cell = document.createElement("div");
      cell.className = "t-cell";
      cell.style.left = 7 + c.x * 86 + "%";
      cell.style.top = 7 + c.y * 86 + "%";
      cell.style.width = c.w * 86 - 3 + "%";
      cell.style.height = c.h * 86 - 3 + "%";
      cell.style.background = THUMB_PALETTE[ci % THUMB_PALETTE.length];
      thumb.appendChild(cell);
    });
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
    item.appendChild(thumb);
    const name = document.createElement("div");
    name.className = "template-name";
    name.textContent = t.name;
    item.appendChild(name);
    list.appendChild(item);
  }
}

/* ── 底部工具列與彈出面板 ── */
function closeSheets() {
  $$(".sheet").forEach((s) => (s.hidden = true));
  $$(".edit-tool[data-sheet]").forEach((b) => b.classList.remove("active"));
}
$$(".edit-tool[data-sheet]").forEach((btn) => {
  btn.addEventListener("click", () => {
    const sheet = $("#" + btn.dataset.sheet);
    const willOpen = sheet.hidden;
    closeSheets();
    if (willOpen) {
      sheet.hidden = false;
      btn.classList.add("active");
    }
  });
});
$$("[data-close-sheet]").forEach((b) => b.addEventListener("click", closeSheets));

/* ── 畫布設定 ── */
$$("#preset-chips .chip").forEach((chip) => {
  chip.addEventListener("click", () => {
    $$("#preset-chips .chip").forEach((c) => c.classList.toggle("active", c === chip));
    Collage.setPreset(chip.dataset.preset);
  });
});
$$("#bg-swatches .swatch[data-bg]").forEach((sw) => {
  sw.addEventListener("click", () => {
    $$("#bg-swatches .swatch").forEach((s) => s.classList.toggle("active", s === sw));
    Collage.bg = sw.dataset.bg;
    Collage.render();
  });
});
$("#ctl-bg").addEventListener("input", (e) => {
  $$("#bg-swatches .swatch").forEach((s) => s.classList.remove("active"));
  Collage.bg = e.target.value;
  Collage.render();
});
$$("#carousel-chips .chip").forEach((chip) => {
  chip.addEventListener("click", () => {
    const n = +chip.dataset.pages;
    if (n >= 3 && !Paywall.gate(`無縫輪播 ${n} 張`)) return;
    Collage.setPages(n);
  });
});
$("#ctl-gap").addEventListener("input", (e) => { Collage.gap = +e.target.value; Collage.render(); });
$("#ctl-radius").addEventListener("input", (e) => { Collage.radius = +e.target.value; Collage.render(); });

/* ── 照片選取 ── */
$("#cell-input").addEventListener("change", (e) => {
  const file = e.target.files[0];
  if (file && Collage._pickTarget != null) Collage.loadFileInto(Collage._pickTarget, file);
  e.target.value = "";
});

function openBatchPicker() {
  closeSheets();
  $("#batch-input").click();
}
$("#btn-batch").addEventListener("click", openBatchPicker);
$("#empty-cta button").addEventListener("click", openBatchPicker);
$("#batch-input").addEventListener("change", (e) => {
  const files = [...e.target.files];
  let fi = 0;
  Collage.cells.forEach((c, i) => {
    if (!c.img && fi < files.length) Collage.loadFileInto(i, files[fi++]);
  });
  if (fi === 0 && files.length) toast("所有格子都已有照片，點格子可替換");
  e.target.value = "";
});

$("#cell-replace").addEventListener("click", () => Collage.pickFor(Collage.selected));
$("#cell-remove").addEventListener("click", () => {
  const c = Collage.cells[Collage.selected];
  if (c) { c.img = null; c.ox = c.oy = 0; c.zoom = 1; }
  Collage.render();
  Collage.select(-1);
});
$("#btn-export").addEventListener("click", () => { closeSheets(); Collage.export(); });

window.addEventListener("resize", () => Collage.render());
window.addEventListener("DOMContentLoaded", () => Collage.setTemplate(TEMPLATES[0]));
