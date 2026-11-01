import fs from "node:fs";
import vm from "node:vm";
import { widgetMetadataSchema } from "@rexnow/libs/env.zod";

const widgetDirectory = new URL("./widgets/", import.meta.url);
const files = fs.readdirSync(widgetDirectory).filter((name) => name.endsWith(".js")).sort();

for (const file of files) {
  const source = fs.readFileSync(new URL(file, widgetDirectory), "utf8");
  const context = vm.createContext({ WidgetMetadata: null, console });
  vm.runInContext(source, context, { filename: `widgets/${file}` });
  const result = widgetMetadataSchema.safeParse(context.WidgetMetadata);
  if (!result.success) {
    console.error(file, JSON.stringify(result.error.issues, null, 2));
    process.exit(1);
  }
  console.log(`Rex WidgetMetadata validation passed: ${file}`);
}
