const { execSync } = require("child_process");

/**
 * fails if the current kubectl context is not kwok-kwok
 */
function assertContextKwok() {
  const result = execSync("kubectl config current-context", {
    stdio: ["pipe", "pipe", "pipe"],
  });
  const stdoutData = result.toString();
  if (!stdoutData.trim().startsWith("kwok-")) {
    console.error(
      `Error: current context '${stdoutData.trim()}' does not start with kwok-`,
    );
    process.exit(1);
  }
}

/**
 * Applies an array of YAML documents in batches using `kubectl apply`.
 *
 * Combines multiple YAML documents into multi-document YAML strings
 * (separated by `---`) and applies each batch in a single kubectl call.
 * This reduces process spawn overhead from O(n) to O(n/batchSize),
 * making creation of 20,000+ resources practical (~30s vs ~25min).
 *
 * @param {string[]} yamls - Array of individual YAML document strings.
 * @param {number} [batchSize=500] - Number of documents per kubectl call.
 */
function batchApply(yamls, batchSize = 500) {
  const totalBatches = Math.ceil(yamls.length / batchSize);
  for (let i = 0; i < yamls.length; i += batchSize) {
    const batch = yamls.slice(i, i + batchSize);
    const combined = batch.join("\n---\n");
    const batchNum = Math.floor(i / batchSize) + 1;
    try {
      execSync("kubectl apply -f -", {
        input: combined,
        stdio: ["pipe", "pipe", "pipe"],
        maxBuffer: 100 * 1024 * 1024,
      });
      console.log(
        `Batch ${batchNum}/${totalBatches}: applied ${batch.length} resources`,
      );
    } catch (error) {
      console.error(
        `Batch ${batchNum}/${totalBatches} error:`,
        error.stderr?.toString() || error.message,
      );
    }
  }
}

exports.assertContextKwok = assertContextKwok;
exports.batchApply = batchApply;
