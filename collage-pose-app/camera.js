/* Pose 相機：即時影像 + 姿勢輪廓疊加取景、拍照下載 */

const Camera = {
  stream: null,
  facing: "user",
  pose: null,

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
    const video = $("#cam-video");
    video.srcObject = this.stream;
    $("#cam-placeholder").style.display = "none";
    $("#btn-capture").disabled = false;
    $("#btn-cam-flip").disabled = false;
    this.applyMirror();
  },

  stop() {
    this.stream?.getTracks().forEach((t) => t.stop());
    this.stream = null;
  },

  async flip() {
    this.facing = this.facing === "user" ? "environment" : "user";
    $("#cam-mirror").checked = this.facing === "user";
    await this.start();
  },

  applyMirror() {
    $("#cam-video").classList.toggle("mirror", $("#cam-mirror").checked);
  },

  selectPose(pose) {
    this.pose = pose;
    const overlay = $("#cam-overlay");
    if (pose) {
      renderPose(overlay, pose);
      overlay.style.opacity = $("#cam-opacity").value / 100;
      $("#cam-pose-name").textContent = `目前 Pose：${pose.name}`;
    } else {
      overlay.innerHTML = "";
      $("#cam-pose-name").textContent = "尚未選擇 Pose";
    }
    renderCamPoseList();
  },

  async capture() {
    if (!this.stream) return;
    if ($("#cam-timer").checked) {
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
    if ($("#cam-mirror").checked) {
      ctx.translate(canvas.width, 0);
      ctx.scale(-1, 1);
    }
    ctx.drawImage(video, 0, 0);
    canvas.toBlob((blob) => {
      const url = URL.createObjectURL(blob);
      $("#shot-img").src = url;
      $("#shot-download").href = url;
      $("#shot-preview").hidden = false;
      toast("📸 已拍攝！下方可預覽與下載");
    }, "image/png");
  },
};

/* 相機側欄的快速 Pose 清單（含付費鎖） */
function renderCamPoseList() {
  const list = $("#cam-pose-list");
  list.innerHTML = "";
  for (const pose of POSES) {
    const card = makePoseCard(pose, true);
    if (Camera.pose?.id === pose.id) card.style.borderColor = "var(--gold)";
    card.addEventListener("click", () => {
      if (pose.premium && !Paywall.gate(pose.name)) return;
      Camera.selectPose(pose);
    });
    list.appendChild(card);
  }
}

$("#btn-cam-start").addEventListener("click", () => Camera.start());
$("#btn-cam-flip").addEventListener("click", () => Camera.flip());
$("#btn-capture").addEventListener("click", () => Camera.capture());
$("#cam-mirror").addEventListener("change", () => Camera.applyMirror());
$("#cam-opacity").addEventListener("input", (e) => {
  $("#cam-overlay").style.opacity = e.target.value / 100;
});

/* 離開頁面時釋放相機 */
window.addEventListener("beforeunload", () => Camera.stop());
