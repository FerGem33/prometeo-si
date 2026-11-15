import { expect, test } from "vitest";
import { ENGINE_CONTRACT } from "./index";

test("engine module loads", () => {
  expect(ENGINE_CONTRACT).toBe("prometeo.pack/1");
});
