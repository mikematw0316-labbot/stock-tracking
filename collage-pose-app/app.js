/* SnapPose Studio 主程式：分頁、付費牆、Pose 圖庫、拍照技巧 */

const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

function toast(msg, ms = 2600) {
  const el = $("#toast");
  el.textContent = msg;
  el.hidden = false;
  clearTimeout(toast._t);
  toast._t = setTimeout(() => (el.hidden = true), ms);
}

/* ───────── 分頁切換 ───────── */
$$(".tab").forEach((btn) => {
  btn.addEventListener("click", () => {
    $$(".tab").forEach((b) => b.classList.toggle("active", b === btn));
    $$(".panel").forEach((p) => p.classList.toggle("active", p.id === "panel-" + btn.dataset.tab));
  });
});
function switchTab(name) {
  $(`.tab[data-tab="${name}"]`).click();
}

/* ───────── 付費牆 ─────────
 * 訂閱狀態存在 localStorage（示範用）。
 * 正式上線時：checkout() 改為呼叫後端建立 Stripe Checkout Session，
 * isPremium() 改為驗證後端簽發的訂閱憑證。
 */
const Paywall = {
  KEY: "snappose_sub",
  PLANS: {
    monthly: { label: "月費方案 US$3/月", price: "US$3/月", days: 31 },
    yearly: { label: "年費方案 US$24/年（每月 US$2）", price: "US$24/年", days: 366 },
  },
  selectedPlan: null,

  get sub() {
    try { return JSON.parse(localStorage.getItem(this.KEY)); } catch { return null; }
  },

  isPremium() {
    const s = this.sub;
    return !!(s && s.expires > Date.now());
  },

  /* 未訂閱時開啟付費牆並回傳 false；已訂閱回傳 true */
  gate(featureName) {
    if (this.isPremium()) return true;
    this.open(featureName);
    return false;
  },

  open(featureName) {
    if (featureName) toast(`「${featureName}」是 Premium 內容，訂閱即可解鎖`);
    $("#paywall-modal").hidden = false;
    $("#btn-manage-sub").hidden = !this.isPremium();
  },

  select(plan) {
    this.selectedPlan = plan;
    $$(".plan").forEach((p) => p.classList.toggle("selected", p.dataset.plan === plan));
    const btn = $("#btn-checkout");
    btn.disabled = false;
    btn.textContent = `訂閱 ${this.PLANS[plan].price} →`;
  },

  checkout() {
    if (!this.selectedPlan) return;
    // ⚠️ 示範結帳：正式環境請改為導向 Stripe Checkout 等金流頁面
    const plan = this.PLANS[this.selectedPlan];
    const sub = {
      plan: this.selectedPlan,
      since: Date.now(),
      expires: Date.now() + plan.days * 86400000,
    };
    localStorage.setItem(this.KEY, JSON.stringify(sub));
    $("#paywall-modal").hidden = true;
    this.refreshUI();
    toast(`🎉 已訂閱 ${plan.label}，全部內容解鎖！`);
  },

  cancel() {
    localStorage.removeItem(this.KEY);
    $("#paywall-modal").hidden = true;
    this.refreshUI();
    toast("已取消訂閱，回到免費版");
  },

  refreshUI() {
    const premium = this.isPremium();
    const badge = $("#sub-badge");
    badge.textContent = premium ? "⭐ Premium" : "免費版";
    badge.classList.toggle("premium", premium);
    badge.classList.toggle("free", !premium);
    $("#btn-upgrade").hidden = premium;
    renderTemplateList();
    renderPoseGrid();
    renderCamPoseList();
  },
};

$("#btn-upgrade").addEventListener("click", () => Paywall.open());
$$(".plan").forEach((p) => p.addEventListener("click", () => Paywall.select(p.dataset.plan)));
$("#btn-checkout").addEventListener("click", () => Paywall.checkout());
$("#btn-manage-sub").addEventListener("click", () => {
  if (confirm("確定要取消訂閱嗎？已解鎖的 Premium 內容將重新上鎖。")) Paywall.cancel();
});

/* 彈窗共用：點背景或 ✕ 關閉 */
$$(".modal").forEach((m) => {
  m.addEventListener("click", (e) => {
    if (e.target === m || e.target.hasAttribute("data-close")) m.hidden = true;
  });
});

/* ───────── Pose 圖庫 ───────── */
let currentCat = "全部";
let detailPose = null;

function makePoseCard(pose, small = false) {
  const locked = pose.premium && !Paywall.isPremium();
  const card = document.createElement("div");
  card.className = "pose-card" + (locked ? " locked" : "");
  const NS = "http://www.w3.org/2000/svg";
  const svg = document.createElementNS(NS, "svg");
  svg.setAttribute("viewBox", "0 0 100 100");
  renderPose(svg, pose);
  card.appendChild(svg);
  const name = document.createElement("div");
  name.className = "pose-name";
  name.textContent = pose.name;
  card.appendChild(name);
  if (!small) {
    const cat = document.createElement("div");
    cat.className = "pose-cat";
    cat.textContent = pose.cat;
    card.appendChild(cat);
  }
  if (pose.premium) {
    const lock = document.createElement("span");
    lock.className = "lock-badge";
    lock.textContent = locked ? "🔒 PRO" : "PRO";
    card.appendChild(lock);
  }
  return card;
}

function renderPoseCats() {
  const row = $("#pose-cats");
  row.innerHTML = "";
  for (const cat of POSE_CATS) {
    const chip = document.createElement("button");
    chip.className = "chip" + (cat === currentCat ? " active" : "");
    chip.textContent = cat;
    chip.addEventListener("click", () => {
      currentCat = cat;
      renderPoseCats();
      renderPoseGrid();
    });
    row.appendChild(chip);
  }
}

function renderPoseGrid() {
  const grid = $("#pose-grid");
  grid.innerHTML = "";
  POSES.filter((p) => currentCat === "全部" || p.cat === currentCat).forEach((pose) => {
    const card = makePoseCard(pose);
    card.addEventListener("click", () => {
      if (pose.premium && !Paywall.gate(pose.name)) return;
      openPoseDetail(pose);
    });
    grid.appendChild(card);
  });
}

function openPoseDetail(pose) {
  detailPose = pose;
  renderPose($("#pose-detail-svg"), pose);
  $("#pose-detail-name").textContent = pose.name;
  $("#pose-detail-cat").textContent = `分類：${pose.cat}${pose.premium ? "・⭐ Premium" : ""}`;
  const ul = $("#pose-detail-tips");
  ul.innerHTML = "";
  pose.tips.forEach((t) => {
    const li = document.createElement("li");
    li.textContent = t;
    ul.appendChild(li);
  });
  $("#pose-modal").hidden = false;
}

$("#pose-detail-cam").addEventListener("click", () => {
  $("#pose-modal").hidden = true;
  Camera.selectPose(detailPose);
  switchTab("camera");
});

/* ───────── 拍照技巧 ───────── */
function renderTips() {
  const list = $("#tips-list");
  list.innerHTML = "";
  for (const tip of PHOTO_TIPS) {
    const card = document.createElement("div");
    card.className = "tip-card";
    card.innerHTML = `<h3>${tip.icon} ${tip.title}</h3><p>${tip.body}</p>`;
    list.appendChild(card);
  }
}

/* ───────── 測試模式 ─────────
 * ?pro=test  → 直接開通 Premium 7 天（測試付費版用）
 * ?pro=free  → 清除訂閱，回到免費版
 */
function applyTestMode() {
  const mode = new URLSearchParams(location.search).get("pro");
  if (mode === "test") {
    localStorage.setItem(Paywall.KEY, JSON.stringify({
      plan: "test", since: Date.now(), expires: Date.now() + 7 * 86400000,
    }));
    toast("🧪 測試模式：Premium 已開通（7 天）", 4000);
  } else if (mode === "free") {
    localStorage.removeItem(Paywall.KEY);
    toast("已重設為免費版", 3000);
  }
}

/* ───────── 初始化（collage.js / camera.js 載入後執行） ───────── */
window.addEventListener("DOMContentLoaded", () => {
  applyTestMode();
  renderPoseCats();
  renderTips();
  Paywall.refreshUI();
});
