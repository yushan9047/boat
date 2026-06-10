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
    name: "成功大學湖",
    center: LAKE_CENTER,
    polygon: LAKE_POLYGON,
    points: MONITOR_POINTS,
    generator: generateSensorData,
  },

  {
    id: "renyitan",
    name: "仁義潭",
    ...RENYITAN_LAKE,
  },

  {
    id: "lake2",
    name: "湖區二",
    ...LAKE2,
  },

  {
    id: "lake3",
    name: "A-F 六湖區",
    ...LAKE3,
  },
];