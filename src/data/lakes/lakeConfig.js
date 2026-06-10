import {
  LAKE_CENTER,
  LAKE_POLYGON,
  MONITOR_POINTS,
  generateSensorData,
} from "./nckuLake";

import { RENYITAN_LAKE } from "./renyitan";
import { LAKE2 } from "./lake2";
import { LAKE3 } from "./lake3";

export const LAKES = [
  {
    id: "ncku",
    name: "成功大學生態池",
    center: LAKE_CENTER,
    polygon: LAKE_POLYGON,
    points: MONITOR_POINTS,
    generator: generateSensorData,
  },

  {
    ...RENYITAN_LAKE,
    id: "renyitan",
    name: "仁義潭水庫",
    points: [
      {
        point_id: "P1",
        name: "仁義潭 P1",
        lat: 23.4625556,
        lng: 120.5125833,
      },
      {
        point_id: "P2",
        name: "仁義潭 P2",
        lat: 23.46575,
        lng: 120.5155833,
      },
      {
        point_id: "P3",
        name: "仁義潭 P3",
        lat: 23.4656389,
        lng: 120.5104444,
      },
      {
        point_id: "P4",
        name: "仁義潭 P4",
        lat: 23.4646389,
        lng: 120.5052222,
      },
    ],
  },

  {
    ...LAKE2,
    id: "fengshan",
    name: "鳳山水庫",
    points: [
      {
        point_id: "P1",
        name: "鳳山水庫 P1",
        lat: 22.540565,
        lng: 120.39236,
      },
      {
        point_id: "P2",
        name: "鳳山水庫 P2",
        lat: 22.538978,
        lng: 120.390094,
      },
      {
        point_id: "P3",
        name: "鳳山水庫 P3",
        lat: 22.538672,
        lng: 120.388483,
      },
      {
        point_id: "P4",
        name: "鳳山水庫 P4",
        lat: 22.535145,
        lng: 120.389622,
      },
    ],
  },

  {
    ...LAKE3,
    id: "niaozuitan",
    name: "鳥嘴潭人工湖區",
  },
];