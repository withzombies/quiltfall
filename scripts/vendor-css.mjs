import { copyFile, mkdir, readFile, writeFile } from "node:fs/promises";

await mkdir("web/vendor", { recursive: true });
for (const [from, to] of [
  ["open-props/open-props.min.css", "open-props.min.css"],
  ["open-props/LICENSE", "open-props.LICENSE"],
  ["animate.css/animate.min.css", "animate.min.css"],
  ["animate.css/LICENSE", "animate.LICENSE"],
]) {
  await copyFile(`node_modules/${from}`, `web/vendor/${to}`);
}

await writeFile(
  "web/vendor/open-props.min.css",
  (await readFile("node_modules/open-props/open-props.min.css", "utf8")) +
    "\n" +
    (await readFile("node_modules/open-props/durations.min.css", "utf8")),
);
