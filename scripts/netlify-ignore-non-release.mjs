const branch = process.env.BRANCH || "";

if (branch === "release") {
  console.log("Netlify build allowed: release branch.");
  process.exit(1);
}

console.log(`Netlify build skipped: ${branch || "unknown"} branch is not release.`);
process.exit(0);
