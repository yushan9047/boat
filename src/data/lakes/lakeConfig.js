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
    name: "成功大學湖區",
    center: LAKE_CENTER,
    polygon: LAKE_POLYGON,
    points: MONITOR_POINTS,
    generator: generateSensorData,
  },

  {
    ...RENYITAN_LAKE,
    id: "renyitan",
    name: "仁義潭水庫",
  },

  {
    ...LAKE2,
    id: "fengshan",
    name: "鳳山水庫",
  },

  {
    ...LAKE3,
    id: "niaozuitan",
    name: "鳥嘴潭人工湖區",
  },
];