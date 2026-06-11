/* 拼貼版型定義
 * 每格 cell 為 {x, y, w, h}，皆為 0~1 的相對座標（相對於畫布）。
 */

const TEMPLATES = [
  {
    id: "single", name: "單張", premium: false,
    cells: [{ x: 0, y: 0, w: 1, h: 1 }],
  },
  {
    id: "two-v", name: "左右兩格", premium: false,
    cells: [
      { x: 0, y: 0, w: 0.5, h: 1 },
      { x: 0.5, y: 0, w: 0.5, h: 1 },
    ],
  },
  {
    id: "two-h", name: "上下兩格", premium: false,
    cells: [
      { x: 0, y: 0, w: 1, h: 0.5 },
      { x: 0, y: 0.5, w: 1, h: 0.5 },
    ],
  },
  {
    id: "one-two", name: "一大二小", premium: false,
    cells: [
      { x: 0, y: 0, w: 0.6, h: 1 },
      { x: 0.6, y: 0, w: 0.4, h: 0.5 },
      { x: 0.6, y: 0.5, w: 0.4, h: 0.5 },
    ],
  },
  {
    id: "grid-4", name: "田字四格", premium: false,
    cells: [
      { x: 0, y: 0, w: 0.5, h: 0.5 },
      { x: 0.5, y: 0, w: 0.5, h: 0.5 },
      { x: 0, y: 0.5, w: 0.5, h: 0.5 },
      { x: 0.5, y: 0.5, w: 0.5, h: 0.5 },
    ],
  },
  {
    id: "strips-3", name: "三直條", premium: false,
    cells: [
      { x: 0, y: 0, w: 1 / 3, h: 1 },
      { x: 1 / 3, y: 0, w: 1 / 3, h: 1 },
      { x: 2 / 3, y: 0, w: 1 / 3, h: 1 },
    ],
  },
  {
    id: "grid-6", name: "六宮格", premium: false,
    cells: [
      { x: 0, y: 0, w: 1 / 3, h: 0.5 },
      { x: 1 / 3, y: 0, w: 1 / 3, h: 0.5 },
      { x: 2 / 3, y: 0, w: 1 / 3, h: 0.5 },
      { x: 0, y: 0.5, w: 1 / 3, h: 0.5 },
      { x: 1 / 3, y: 0.5, w: 1 / 3, h: 0.5 },
      { x: 2 / 3, y: 0.5, w: 1 / 3, h: 0.5 },
    ],
  },
  {
    id: "top-three", name: "一頂三", premium: true,
    cells: [
      { x: 0, y: 0, w: 1, h: 0.62 },
      { x: 0, y: 0.62, w: 1 / 3, h: 0.38 },
      { x: 1 / 3, y: 0.62, w: 1 / 3, h: 0.38 },
      { x: 2 / 3, y: 0.62, w: 1 / 3, h: 0.38 },
    ],
  },
  {
    id: "magazine", name: "雜誌風五格", premium: true,
    cells: [
      { x: 0, y: 0, w: 0.55, h: 0.65 },
      { x: 0.55, y: 0, w: 0.45, h: 0.35 },
      { x: 0.55, y: 0.35, w: 0.45, h: 0.3 },
      { x: 0, y: 0.65, w: 0.35, h: 0.35 },
      { x: 0.35, y: 0.65, w: 0.65, h: 0.35 },
    ],
  },
  {
    id: "mosaic", name: "不規則馬賽克", premium: true,
    cells: [
      { x: 0, y: 0, w: 0.4, h: 0.55 },
      { x: 0.4, y: 0, w: 0.6, h: 0.3 },
      { x: 0.4, y: 0.3, w: 0.3, h: 0.45 },
      { x: 0.7, y: 0.3, w: 0.3, h: 0.45 },
      { x: 0, y: 0.55, w: 0.4, h: 0.45 },
      { x: 0.4, y: 0.75, w: 0.6, h: 0.25 },
    ],
  },
  {
    id: "film", name: "電影感橫條", premium: true,
    cells: [
      { x: 0, y: 0.08, w: 1, h: 0.26 },
      { x: 0, y: 0.37, w: 1, h: 0.26 },
      { x: 0, y: 0.66, w: 1, h: 0.26 },
    ],
  },
  {
    id: "polaroid", name: "拍立得留白", premium: true,
    cells: [{ x: 0.08, y: 0.06, w: 0.84, h: 0.72 }],
  },
];
