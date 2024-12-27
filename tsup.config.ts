import { defineConfig } from "tsup";

export default defineConfig({
	entry: ["src/index.ts"], // specify your entry file(s)
	format: ["esm"], // output format
	dts: true, // generate declaration files
	clean: true, // clean output directory before build
});
