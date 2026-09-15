import { render } from "preact";
import { App } from "./app.tsx";

const root = document.getElementById("app");
if (!root) throw new Error("missing #app");
root.textContent = "";
render(<App />, root);
