import { config } from "dotenv";

export function loadRootEnv() {
  config({
    path: new URL("../../../.env", import.meta.url)
  });
}
