const interval = process.argv[2];
import { run } from "./index";

console.log(
  "Refreshing credentials for",
  process.cwd(),
  "every",
  interval,
  "ms"
);

setInterval(async () => {
  await run();
}, interval);
