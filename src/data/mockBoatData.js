export const LAKE_CENTER = {
  lat: 23.050278,
  lng: 120.146667,
};

export const MONITOR_POINTS = [
  { point_id: "P1", name: "北側", lat: 23.05074, lng: 120.14602 },
  { point_id: "P2", name: "西北側", lat: 23.05066, lng: 120.14582 },
  { point_id: "P3", name: "西側", lat: 23.05048, lng: 120.14574 },
  { point_id: "P4", name: "西南側", lat: 23.05028, lng: 120.14600},
  { point_id: "P5", name: "中央偏南", lat: 23.05005, lng: 120.14626},
  { point_id: "P6", name: "南側", lat: 23.04986, lng: 120.14658},
  { point_id: "P7", name: "東南側", lat: 23.04966, lng: 120.14692 },
  { point_id: "P8", name: "東側", lat: 23.04992, lng: 120.14708 },
  { point_id: "P9", name: "東北側", lat: 23.05022, lng: 120.14688 },
  { point_id: "P10", name: "中央偏東", lat: 23.05042, lng: 120.14658 },
];

export const LAKE_POLYGON = [
  [23.050880287673706, 120.14612878365062],
  [23.050886775456675, 120.14587495732263],
  [23.05075053194234, 120.14565638465075],
  [23.05057536150734, 120.14560702953082],
  [23.049478919163917, 120.14708063238413],
  [23.049673554551347, 120.14727100213184],
  [23.04981628698991, 120.14727805286208],
  [23.049881165321324, 120.14708768311607],
  [23.04999145841242, 120.14712998750406],
  [23.050186093058997, 120.1469819221461],
  [23.05034180057305, 120.1468409075182],
  [23.050458581091192, 120.14671399435423],
  [23.050529946913343, 120.14662938557814],
  [23.050620776086745, 120.14655182753239],
  [23.050880287673706, 120.14612878365062],
];

export function generateSensorData(point) {
  const co2 = 520 + Math.random() * 80;
  const ch4 = 1.98 + Math.random() * 0.04;
  const transparency = 0.1 + Math.random() * 4.9;
  const chlorophyllA = 2.0 + Math.random() * 7.9;
  const totalPhosphorus = 5 + Math.random() * 25;

  return {
    ...point,
    co2: Number(co2.toFixed(2)),
    ch4: Number(ch4.toFixed(4)),
    transparency: Number(transparency.toFixed(2)),
    chlorophyllA: Number(chlorophyllA.toFixed(2)),
    totalPhosphorus: Number(totalPhosphorus.toFixed(2)),
    timestamp: new Date().toLocaleString("zh-TW", {
      hour12: false,
    }),
  };
}