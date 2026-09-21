const fs = require("node:fs");
const path = require("node:path");

const root = process.cwd();
const output = path.join(root, "build");
const files = [
  "admin.css",
  "admin.html",
  "admin.js",
  "admin-login.html",
  "admin-login.js",
  "auth.css",
  "auth.js",
  "cart.css",
  "catalog.js",
  "dashboard.css",
  "dashboard.html",
  "dashboard.js",
  "index.html",
  "login.html",
  "payment-success.html",
  "script.js",
  "signup.html",
  "styles.css",
  "typography.css",
];

fs.rmSync(output, { recursive: true, force: true });
fs.mkdirSync(output, { recursive: true });
files.forEach((file) => fs.copyFileSync(path.join(root, file), path.join(output, file)));
fs.cpSync(path.join(root, "Images"), path.join(output, "Images"), { recursive: true });
fs.copyFileSync(path.join(root, "_redirects"), path.join(output, "_redirects"));
console.log(`Built static storefront in ${path.relative(root, output)}`);
