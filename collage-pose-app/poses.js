/* Pose 圖庫資料與火柴人繪製
 * 每個 pose 由 1~2 個骨架 (figure) 組成，座標皆在 100x100 viewBox 內：
 *   head: 頭部圓心 / neck→hip: 軀幹 / armL,armR: [手肘, 手掌] / legL,legR: [膝蓋, 腳掌]
 */

const POSE_CATS = ["全部", "單人", "坐姿", "情侶", "閨蜜", "創意"];

const POSES = [
  {
    id: "stand-natural", name: "自然站姿", cat: "單人", premium: false,
    tips: ["重心放在一隻腳上，身體自然放鬆", "肩膀往後、下巴微收，避免駝背", "雙手不要緊貼身體，留一點空隙更顯瘦"],
    figures: [{
      head: [50, 13], neck: [50, 21], hip: [50, 50],
      armL: [[43, 33], [41, 46]], armR: [[57, 33], [59, 46]],
      legL: [[46, 68], [45, 88]], legR: [[54, 68], [55, 88]],
    }],
  },
  {
    id: "hands-on-hips", name: "雙手叉腰", cat: "單人", premium: false,
    tips: ["手肘往外打開，營造三角形空間", "身體微側 45 度，比正面更上相", "適合展現自信、有氣勢的形象照"],
    figures: [{
      head: [50, 13], neck: [50, 21], hip: [50, 50],
      armL: [[38, 32], [46, 46]], armR: [[62, 32], [54, 46]],
      legL: [[45, 68], [43, 88]], legR: [[55, 68], [57, 88]],
    }],
  },
  {
    id: "peace-sign", name: "比 YA 近拍", cat: "單人", premium: false,
    tips: ["手勢靠近臉但不要遮住下巴線條", "頭微微傾斜 10 度，更俏皮自然", "鏡頭略高於眼睛由上往下拍，臉更小"],
    figures: [{
      head: [50, 13], neck: [50, 21], hip: [50, 50],
      armL: [[43, 33], [41, 46]], armR: [[61, 29], [59, 15]],
      legL: [[46, 68], [45, 88]], legR: [[54, 68], [55, 88]],
    }],
  },
  {
    id: "hair-flip", name: "撥髮側身", cat: "單人", premium: true,
    tips: ["側身 45 度，撥髮的手肘抬高與肩同高", "眼神看向斜下方或遠方，不看鏡頭", "搭配微風或走動瞬間連拍效果最好"],
    figures: [{
      head: [48, 13], neck: [48, 21], hip: [52, 50],
      armL: [[40, 32], [38, 45]], armR: [[59, 25], [51, 13]],
      legL: [[48, 68], [52, 88]], legR: [[57, 68], [49, 87]],
    }],
  },
  {
    id: "lean-wall", name: "倚牆斜站", cat: "單人", premium: true,
    tips: ["肩膀輕靠牆面，雙腿交叉重心放外側腳", "雙手插口袋或抱胸，營造慵懶街拍感", "攝影師從側前方 30 度拍出身體斜線"],
    figures: [{
      head: [43, 14], neck: [44, 22], hip: [51, 52],
      armL: [[38, 33], [49, 37]], armR: [[53, 34], [41, 38]],
      legL: [[54, 70], [56, 90]], legR: [[49, 70], [60, 88]],
    }],
  },
  {
    id: "walking", name: "步行抓拍", cat: "單人", premium: true,
    tips: ["自然往前走，眼神看前方不看鏡頭", "用連拍模式抓跨步瞬間，裙襬擺動最好看", "快門 1/250s 以上避免動態模糊"],
    figures: [{
      head: [50, 13], neck: [50, 21], hip: [50, 50],
      armL: [[56, 33], [61, 44]], armR: [[44, 33], [38, 42]],
      legL: [[42, 66], [35, 86]], legR: [[58, 68], [63, 88]],
    }],
  },
  {
    id: "reading", name: "低頭文青風", cat: "單人", premium: true,
    tips: ["雙手捧書或手機置於胸前，頭微低", "找窗邊側光，輪廓會有漂亮的明暗層次", "拍攝側面或 45 度角，氛圍感最強"],
    figures: [{
      head: [52, 15], neck: [50, 22], hip: [50, 50],
      armL: [[43, 32], [49, 40]], armR: [[58, 32], [52, 40]],
      legL: [[46, 68], [45, 88]], legR: [[54, 68], [55, 88]],
    }],
  },
  {
    id: "sit-hug-knees", name: "坐姿抱膝", cat: "坐姿", premium: false,
    tips: ["膝蓋立起雙手環抱，身體微縮顯得嬌小", "下巴可輕靠膝蓋，眼神看鏡頭或側面", "適合草地、窗邊、樓梯等場景"],
    figures: [{
      head: [46, 28], neck: [47, 36], hip: [46, 62],
      armL: [[54, 44], [60, 52]], armR: [[56, 48], [61, 56]],
      legL: [[60, 48], [62, 66]], legR: [[63, 52], [65, 68]],
    }],
  },
  {
    id: "sit-stairs", name: "樓梯隨性坐", cat: "坐姿", premium: true,
    tips: ["一腿伸直一腿彎曲，手肘輕靠膝蓋", "另一隻手往後撐地，胸口自然打開", "由低角度仰拍，腿部線條更修長"],
    figures: [{
      head: [44, 26], neck: [45, 34], hip: [46, 58],
      armL: [[37, 44], [34, 58]], armR: [[54, 44], [58, 52]],
      legL: [[58, 54], [62, 70]], legR: [[62, 60], [76, 70]],
    }],
  },
  {
    id: "sit-cross", name: "盤腿咖啡座", cat: "坐姿", premium: false,
    tips: ["盤腿坐正，背打直雙手放膝上", "桌上放飲品道具，視線看杯子更自然", "正面構圖置中，適合膠片感色調"],
    figures: [{
      head: [50, 24], neck: [50, 32], hip: [50, 56],
      armL: [[42, 44], [40, 56]], armR: [[58, 44], [60, 56]],
      legL: [[38, 62], [56, 68]], legR: [[62, 62], [44, 68]],
    }],
  },
  {
    id: "jump", name: "跳躍定格", cat: "創意", premium: false,
    tips: ["數三二一同時跳，手腳張開像星星", "使用連拍，挑騰空最高的一張", "逆光剪影 + 跳躍 = 必出大片"],
    figures: [{
      head: [50, 10], neck: [50, 18], hip: [50, 44],
      armL: [[40, 13], [33, 5]], armR: [[60, 13], [67, 5]],
      legL: [[42, 57], [35, 68]], legR: [[58, 57], [65, 68]],
    }],
  },
  {
    id: "squat-street", name: "蹲姿街拍", cat: "創意", premium: true,
    tips: ["腳尖朝外蹲低，手肘撐在膝蓋上", "鏡頭與眼睛同高或更低，街頭感十足", "搭配廣角鏡頭與對稱背景更有張力"],
    figures: [{
      head: [50, 32], neck: [50, 40], hip: [50, 62],
      armL: [[41, 52], [37, 62]], armR: [[59, 52], [63, 62]],
      legL: [[36, 66], [38, 84]], legR: [[64, 66], [62, 84]],
    }],
  },
  {
    id: "couple-hands", name: "牽手對望", cat: "情侶", premium: false,
    tips: ["兩人側身相對，牽起的手放在中間高度", "互看對方眼睛，笑容比擺拍更重要", "攝影師退遠用長焦壓縮背景"],
    figures: [
      {
        head: [34, 14], neck: [35, 22], hip: [36, 52],
        armL: [[28, 34], [27, 46]], armR: [[43, 36], [49, 44]],
        legL: [[33, 70], [32, 90]], legR: [[40, 70], [41, 90]],
      },
      {
        head: [66, 14], neck: [65, 22], hip: [64, 52],
        armL: [[57, 36], [51, 44]], armR: [[72, 34], [73, 46]],
        legL: [[60, 70], [59, 90]], legR: [[67, 70], [68, 90]],
      },
    ],
  },
  {
    id: "back-to-back", name: "背靠背", cat: "閨蜜", premium: false,
    tips: ["背部輕靠，兩人重心互相平衡", "可以雙手抱胸、回頭相視而笑", "正側面構圖左右對稱最好看"],
    figures: [
      {
        head: [39, 14], neck: [41, 22], hip: [44, 52],
        armL: [[33, 33], [43, 37]], armR: [[47, 34], [36, 38]],
        legL: [[40, 70], [37, 90]], legR: [[47, 70], [48, 90]],
      },
      {
        head: [61, 14], neck: [59, 22], hip: [56, 52],
        armL: [[53, 34], [64, 38]], armR: [[67, 33], [57, 37]],
        legL: [[53, 70], [52, 90]], legR: [[60, 70], [63, 90]],
      },
    ],
  },
  {
    id: "besties-heart", name: "肩並肩比心", cat: "閨蜜", premium: false,
    tips: ["內側手臂高舉，在頭頂中間合出愛心", "外側手叉腰或插口袋平衡畫面", "兩人服裝同色系，照片更有整體感"],
    figures: [
      {
        head: [38, 16], neck: [39, 24], hip: [39, 52],
        armL: [[31, 35], [33, 48]], armR: [[46, 27], [49, 16]],
        legL: [[36, 70], [35, 90]], legR: [[43, 70], [44, 90]],
      },
      {
        head: [62, 16], neck: [61, 24], hip: [61, 52],
        armL: [[54, 27], [51, 16]], armR: [[69, 35], [67, 48]],
        legL: [[57, 70], [56, 90]], legR: [[64, 70], [65, 90]],
      },
    ],
  },
  {
    id: "lean-on", name: "互相依靠", cat: "閨蜜", premium: true,
    tips: ["一人頭輕靠另一人肩膀，閉眼微笑", "兩人手可以互勾或交疊，增加親密感", "用 50mm 以上焦段拍半身特寫"],
    figures: [
      {
        head: [42, 13], neck: [43, 21], hip: [43, 52],
        armL: [[36, 33], [34, 46]], armR: [[50, 35], [54, 44]],
        legL: [[40, 70], [39, 90]], legR: [[47, 70], [48, 90]],
      },
      {
        head: [56, 18], neck: [58, 25], hip: [59, 52],
        armL: [[52, 36], [48, 44]], armR: [[66, 35], [67, 47]],
        legL: [[55, 70], [54, 90]], legR: [[63, 70], [64, 90]],
      },
    ],
  },
  {
    id: "princess-carry", name: "公主抱", cat: "情侶", premium: true,
    tips: ["被抱者雙手環住對方脖子、腳尖繃直", "抱人者腰背打直，重心壓低再起身", "先就定位再連拍，避免手震與晃動"],
    figures: [
      {
        head: [56, 15], neck: [56, 23], hip: [56, 54],
        armL: [[46, 35], [38, 42]], armR: [[64, 35], [70, 42]],
        legL: [[52, 72], [51, 90]], legR: [[60, 72], [61, 90]],
      },
      {
        head: [29, 37], neck: [34, 40], hip: [56, 44],
        armL: [[42, 32], [52, 26]], armR: [[44, 46], [52, 50]],
        legL: [[66, 38], [75, 44]], legR: [[68, 44], [78, 48]],
      },
    ],
  },
];

/* 把 pose 畫進指定的 <svg>（viewBox 0 0 100 100） */
function renderPose(svgEl, pose) {
  const NS = "http://www.w3.org/2000/svg";
  svgEl.innerHTML = "";
  pose.figures.forEach((f, i) => {
    const g = document.createElementNS(NS, "g");
    if (i === 1) g.setAttribute("class", "pose-figure-b");

    const head = document.createElementNS(NS, "circle");
    head.setAttribute("cx", f.head[0]);
    head.setAttribute("cy", f.head[1]);
    head.setAttribute("r", 5.5);
    head.setAttribute("class", "pose-figure-head");
    g.appendChild(head);

    const lines = [
      [f.neck, f.hip],
      [f.neck, f.armL[0], f.armL[1]],
      [f.neck, f.armR[0], f.armR[1]],
      [f.hip, f.legL[0], f.legL[1]],
      [f.hip, f.legR[0], f.legR[1]],
    ];
    for (const pts of lines) {
      const pl = document.createElementNS(NS, "polyline");
      pl.setAttribute("points", pts.map((p) => p.join(",")).join(" "));
      pl.setAttribute("class", "pose-figure-stroke");
      g.appendChild(pl);
    }
    svgEl.appendChild(g);
  });
}

/* 「拍照技巧」分頁內容 */
const PHOTO_TIPS = [
  { icon: "🌅", title: "黃金時刻光線", body: "日出後與日落前一小時的光線最柔和，膚色自然不死白。正中午拍照容易在臉上留下生硬陰影，盡量避開或找陰影處。" },
  { icon: "📐", title: "三分構圖法", body: "打開相機的九宮格輔助線，把人放在直線交叉點而不是正中央，畫面立刻有呼吸感。地平線對齊水平線，照片不歪斜。" },
  { icon: "🦵", title: "顯高低角度", body: "鏡頭放在被拍者腰部以下、微微仰角，腳貼齊畫面底邊，腿長立刻多 10 公分。注意不要仰太多以免變形。" },
  { icon: "🏃", title: "動態連拍", body: "走路、轉身、撥頭髮這些動作用連拍模式抓拍，比站著硬擺自然十倍。回家再挑表情最好的一張。" },
  { icon: "🪟", title: "善用前景", body: "透過樹葉、窗框、玻璃反射來拍攝，畫面多一個層次，也更有故事感。手機靠近前景物即可製造淺景深。" },
  { icon: "😄", title: "表情管理", body: "拍照前說一句好笑的話、或讓被拍者輕輕吐氣再微笑，比喊「笑一個」自然。眼神可以看鏡頭上緣，眼睛更有神。" },
  { icon: "🎨", title: "色彩呼應", body: "服裝顏色與背景互補或同色系，照片質感大幅提升。背景雜亂時靠近拍特寫，或開人像模式虛化。" },
  { icon: "🤳", title: "自拍角度", body: "手機舉高 15~30 度由上往下、下巴微收，是最不容易失敗的自拍角度。開倒數計時放遠一點拍，比例更好。" },
];
