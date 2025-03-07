// src/update-index.js
const fs = require("fs");
const path = require("path");

// Get all analysis directories
const resultsDir = path.join(__dirname, "../results");
const analyses = [];

// Read all subdirectories in results
const dirs = fs
  .readdirSync(resultsDir, { withFileTypes: true })
  .filter((dirent) => dirent.isDirectory())
  .map((dirent) => dirent.name);

// Read metadata from each directory
dirs.forEach((dir) => {
  const metadataPath = path.join(resultsDir, dir, "metadata.json");
  if (fs.existsSync(metadataPath)) {
    try {
      const metadata = JSON.parse(fs.readFileSync(metadataPath, "utf8"));
      analyses.push({
        slug: dir,
        ...metadata,
      });
    } catch (error) {
      console.error(`Error reading metadata for ${dir}:`, error);
    }
  }
});

// Sort analyses by date (newest first)
analyses.sort((a, b) => new Date(b.analyzed_at) - new Date(a.analyzed_at));

// Generate index HTML
const indexHtml = `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Cal.com Dependency Analyzer</title>
  <link rel="stylesheet" href="styles.css">
</head>
<body>
  <header>
    <div class="container">
      <h1>Cal.com Dependency Analyzer</h1>
      <p>View circular dependencies in different branches of Cal.com</p>
    </div>
  </header>

  <main class="container">
    <section class="analyze-form">
      <h2>Analyze a Branch</h2>
      <form id="analyzeForm">
        <div class="form-group">
          <label for="branch">Branch Name:</label>
          <input type="text" id="branch" name="branch" placeholder="main" required>
        </div>
        <div class="form-group checkbox">
          <input type="checkbox" id="forceRefresh" name="forceRefresh">
          <label for="forceRefresh">Force refresh (ignore cache)</label>
        </div>
        <button type="submit" class="btn">Analyze Branch</button>
      </form>
      <div id="analysisStatus" class="hidden">
        <div class="loader"></div>
        <p>Analysis in progress. This may take a few minutes...</p>
        <p class="small">The page will automatically refresh when complete.</p>
      </div>
    </section>

    <section class="previous-analyses">
      <h2>Previous Analyses</h2>
      ${analyses.length === 0 ? "<p>No analyses found.</p>" : ""}
      <div class="analyses-list">
        ${analyses
          .map(
            (analysis) => `
          <div class="analysis-item">
            <div class="analysis-info">
              <h3><a href="results/${analysis.slug}/index.html">${
              analysis.branch
            }</a></h3>
              <p class="analysis-date">Analyzed: ${new Date(
                analysis.analyzed_at
              ).toLocaleString()}</p>
            </div>
            <a href="results/${
              analysis.slug
            }/index.html" class="btn btn-small">View Results</a>
          </div>
        `
          )
          .join("")}
      </div>
    </section>
  </main>

  <footer class="container">
    <p>Cal.com Dependency Analyzer | <a href="https://github.com/your-username/cal-dependency-analyzer" target="_blank">GitHub Repository</a></p>
  </footer>

  <script src="app.js"></script>
</body>
</html>
`;

// Write index.html to results directory
fs.writeFileSync(path.join(resultsDir, "index.html"), indexHtml);
console.log("Updated index.html with latest analyses");
