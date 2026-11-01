import fs from "node:fs";
import vm from "node:vm";
import { widgetMetadataSchema } from "@rexnow/libs/env.zod";

const source = fs.readFileSync(new URL("./widgets/tiktok.js", import.meta.url), "utf8");
const context = vm.createContext({ WidgetMetadata: null, console });
vm.runInContext(source, context, { filename: "widgets/tiktok.js" });

const result = widgetMetadataSchema.safeParse(context.WidgetMetadata);
if (!result.success) {
  console.error(JSON.stringify(result.error.issues, null, 2));
  process.exit(1);
}

console.log("Rex WidgetMetadata validation passed");
