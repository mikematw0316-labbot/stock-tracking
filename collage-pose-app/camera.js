/* Pose 取景相機：全螢幕取景器、姿勢輪廓/自訂照片參考線疊加、拍照下載 */

const Camera = {
  stream: null,
  facing: "user",
  pose: null,
  mirror: true,
  timer: false,
  guidePhoto: null, // 自訂參考線（objectURL）

  async start() {
    this.stop();

    if (!window.isSecureContext) {
      toast("⚠️ 相機需要 HTTPS 安全連線，請改用 https:// 開頭的網址開啟", 5000);
      return;
    }
    if (!navigator.mediaDevices?.getUserMedia) {
      toast("⚠️ 此瀏覽器不支援相機。若在 LINE / Telegram / FB 內開啟，請點「用 Safari / Chrome 開啟」", 6000);
      return;
    }

    try {
      this.stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: this.facing, width: { ideal: 1920 }, height: { ideal: 1080 } },
        audio: false,
      });
    } catch (err) {
      console.error(err);
      // 指定鏡頭/解析度失敗時，降級用預設相機再試一次
      if (err.name === "OverconstrainedError" || err.name === "NotFoundError" || err.name === "NotReadableError") {
        try {
          this.stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
        } catch (err2) {
          console.error(err2);
        }
      }
      if (!this.stream) {
        if (err.name === "NotAllowedError") {
          toast("⚠️ 相機權限被拒絕：請到瀏覽器設定（網站設定 → 相機）改為允許後重新整理", 6000);
        } else if (err.name === "NotFoundError") {
          toast("⚠️ 找不到相機裝置", 5000);
        } else {
          toast("⚠️ 無法開啟相機：" + err.name, 5000);
        }
        return;
      }
    }

    $("#cam-video").srcObject = this.stream;
    $("#cam-placeholder").hidden = true;
    $(".cam-top").hidden = false;
    $(".cam-bottom").hidden = false;
    this.applyMirror();
    if (!this.pose && !this.guidePhoto) toast("從下方滑動選一個 Pose 疊加取景", 3000);
  },

  stop() {
    this.stream?.getTracks().forEach((t) => t.stop());
    this.stream = null;
  },

  async flip() {
    this.facing = this.facing === "user" ? "environment" : "user";
    this.mirror = this.facing === "user";
    await this.start();
  },

  applyMirror() {
    $("#cam-video").classList.toggle("mirror", this.mirror);
    $("#btn-cam-mirror").classList.toggle("on", this.mirror);
  },

  /* 選姿勢輪廓（與自訂照片參考線互斥） */
  selectPose(pose) {
    this.pose = pose;
    this.guidePhoto = null;
    $("#cam-guide-photo").hidden = true;
    const overlay = $("#cam-overlay");
    overlay.innerHTML = "";
    if (pose) renderPose(overlay, pose);
    this.applyOpacity();
    renderCamPoseList();
  },

  /* 自訂照片參考線（Poze 的 Load 功能） */
  setGuidePhoto(file) {
    this.pose = null;
    $("#cam-overlay").innerHTML = "";
    this.guidePhoto = URL.createObjectURL(file);
    const img = $("#cam-guide-photo");
    img.src = this.guidePhoto;
    img.hidden = false;
    this.applyOpacity();
    renderCamPoseList();
    toast("已載入自訂參考線，可調整透明度對齊構圖", 3500);
  },

  applyOpacity() {
    const op = $("#cam-opacity").value / 100;
    $("#cam-overlay").style.opacity = op;
    $("#cam-guide-photo").style.opacity = op;
  },

  async capture() {
    if (!this.stream) return;
    if (this.timer) {
      const cd = $("#cam-countdown");
      cd.hidden = false;
      for (let n = 3; n >= 1; n--) {
        cd.textContent = n;
        await new Promise((r) => setTimeout(r, 1000));
      }
      cd.hidden = true;
    }
    const video = $("#cam-video");
    const canvas = document.createElement("canvas");
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext("2d");
    if (this.mirror) {
      ctx.translate(canvas.width, 0);
      ctx.scale(-1, 1);
    }
    ctx.drawImage(video, 0, 0);
    canvas.toBlob((blob) => {
      const url = URL.createObjectURL(blob);
      $("#shot-thumb-img").src = url;
      const a = $("#shot-thumb");
      a.href = url;
      a.hidden = false;
      toast("📸 已拍攝！點左下角縮圖下載", 3000);
    }, "image/png");
  },
};

/* 取景器底部的 Pose 滑動條（含付費鎖） */
function renderCamPoseList() {
  const strip = $("#cam-pose-strip");
  const keepScroll = strip.scrollLeft; // 重繪時保留滑動位置
  strip.innerHTML = "";

  // 「無參考線」
  const none = document.createElement("button");
  none.className = "strip-pose" + (!Camera.pose && !Camera.guidePhoto ? " active" : "");
  none.textContent = "無";
  none.addEventListener("click", () => Camera.selectPose(null));
  strip.appendChild(none);

  for (const pose of POSES) {
    const locked = pose.premium && !Paywall.isPremium();
    const btn = document.createElement("button");
    btn.className =
      "strip-pose" +
      (Camera.pose?.id === pose.id ? " active" : "") +
      (locked ? " locked" : "");
    btn.title = pose.name;
    const NS = "http://www.w3.org/2000/svg";
    const svg = document.createElementNS(NS, "svg");
    svg.setAttribute("viewBox", "0 0 100 100");
    renderPose(svg, pose);
    btn.appendChild(svg);
    if (locked) {
      const lock = document.createElement("span");
      lock.className = "strip-lock";
      lock.textContent = "🔒";
      btn.appendChild(lock);
    }
    btn.addEventListener("click", () => {
      if (pose.premium && !Paywall.gate(pose.name)) return;
      Camera.selectPose(pose);
    });
    strip.appendChild(btn);
  }
  strip.scrollLeft = keepScroll;
}

$("#btn-cam-start").addEventListener("click", () => Camera.start());
$("#btn-cam-flip").addEventListener("click", () => Camera.flip());
$("#btn-capture").addEventListener("click", () => Camera.capture());
$("#btn-cam-mirror").addEventListener("click", () => {
  Camera.mirror = !Camera.mirror;
  Camera.applyMirror();
});
$("#btn-cam-timer").addEventListener("click", (e) => {
  Camera.timer = !Camera.timer;
  e.currentTarget.classList.toggle("on", Camera.timer);
  toast(Camera.timer ? "已開啟 3 秒倒數" : "已關閉倒數", 1500);
});
$("#btn-cam-opacity").addEventListener("click", (e) => {
  const bar = $("#cam-opacity-bar");
  bar.hidden = !bar.hidden;
  e.currentTarget.classList.toggle("on", !bar.hidden);
});
$("#cam-opacity").addEventListener("input", () => Camera.applyOpacity());
$("#btn-cam-guide").addEventListener("click", () => $("#guide-input").click());
$("#guide-input").addEventListener("change", (e) => {
  if (e.target.files[0]) Camera.setGuidePhoto(e.target.files[0]);
  e.target.value = "";
});

/* 離開頁面時釋放相機 */
window.addEventListener("beforeunload", () => Camera.stop());
