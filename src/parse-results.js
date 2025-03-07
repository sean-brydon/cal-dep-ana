// src/parse-results.js
const fs = require("fs");

// Read command line arguments
const rawOutFile = process.argv[2];
const branchName = process.argv[3];
const outputFile = process.argv[4];

// Read the raw.out file
const rawData = fs.readFileSync(rawOutFile, "utf8");

// Parse circular dependencies
function parseCircularDependencies(data) {
  const circularDeps = [];
  let currentDep = null;
  let inDependency = false;

  // Split the data by lines
  const lines = data.split("\n");

  // Extract the total number of circular dependencies
  const totalDepsMatch = data.match(/✖ \((\d+)\) circular dependencies found/);
  const totalDeps = totalDepsMatch ? parseInt(totalDepsMatch[1]) : 0;

  // Parse each line
  for (const line of lines) {
    // Check if this is the start of a new dependency
    const depMatch = line.match(/^\s*(\d+)\.\s*$/);
    if (depMatch) {
      // If we were already in a dependency, push it to the array
      if (currentDep) {
        circularDeps.push(currentDep);
      }

      // Start a new dependency
      currentDep = {
        id: parseInt(depMatch[1]),
        files: [],
      };
      inDependency = true;
      continue;
    }

    // Check if this is a file in the current dependency
    const fileMatch = line.match(/^\s*-> (.+)$/);
    if (fileMatch && inDependency && currentDep) {
      currentDep.files.push(fileMatch[1]);
    }
  }

  // Don't forget to add the last dependency
  if (currentDep) {
    circularDeps.push(currentDep);
  }

  return { circularDeps, totalDeps };
}

// Extract directory from file path
function getDirectory(filePath) {
  const parts = filePath.split("/");
  if (parts.length <= 1) return "root";

  // Return first two levels of directory for better grouping
  if (parts.length >= 3) {
    return `${parts[0]}/${parts[1]}`;
  }

  return parts[0];
}

// Get all unique directories from dependencies
function getUniqueDirectories(circularDeps) {
  const directories = new Set();

  circularDeps.forEach((dep) => {
    dep.files.forEach((file) => {
      directories.add(getDirectory(file));
    });
  });

  return Array.from(directories).sort();
}

// Count occurrences of each directory in circular dependencies
function getDirectoryCounts(circularDeps) {
  const dirCounts = {};

  circularDeps.forEach((dep) => {
    dep.files.forEach((file) => {
      const dir = getDirectory(file);
      dirCounts[dir] = (dirCounts[dir] || 0) + 1;
    });
  });

  return dirCounts;
}

// Generate HTML
function generateHTML(circularDeps, totalDeps, branch) {
  // Get unique directories and their counts
  const directories = getUniqueDirectories(circularDeps);
  const dirCounts = getDirectoryCounts(circularDeps);

  // Sort directories by count (descending)
  const sortedDirs = [...directories].sort(
    (a, b) => (dirCounts[b] || 0) - (dirCounts[a] || 0)
  );

  const html = `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Cal.com Circular Dependencies (${totalDeps}) - ${branch}</title>
  <link rel="stylesheet" href="../../styles.css">
</head>
<body>
  <header>
    <div class="container">
      <h1>Cal.com Circular Dependencies</h1>
      <div class="branch-info">
        <span class="branch-label">Branch:</span>
        <span class="branch-name">${branch}</span>
        <span class="deps-count">${totalDeps} circular dependencies</span>
      </div>
      <a href="../../index.html" class="back-link">← Back to all analyses</a>
    </div>
  </header>

  <main class="container">
    <div class="tabs">
      <div class="tab active" data-tab="all-deps">All Dependencies</div>
      <div class="tab" data-tab="directory-stats">Directory Statistics</div>
    </div>
    
    <div class="tab-content active" id="all-deps-content">
      <div class="filters">
        <div class="search-container">
          <input type="text" id="searchInput" placeholder="Search for files or patterns...">
        </div>
        <div class="filter-container">
          <select id="directoryFilter">
            <option value="">Filter by directory</option>
            ${sortedDirs
              .map(
                (dir) =>
                  `<option value="${dir}">${dir} (${dirCounts[dir]})</option>`
              )
              .join("")}
          </select>
        </div>
      </div>
      
      <div id="dependencies">
        ${circularDeps
          .map((dep) => {
            const fileCount = dep.files.length;
            const directories = [...new Set(dep.files.map(getDirectory))];

            return `
          <div class="dependency" data-id="${
            dep.id
          }" data-directories="${directories.join(",")}">
            <div class="dependency-header">
              <span>Circular Dependency #${dep.id}</span>
              <span class="file-count">${fileCount} files</span>
            </div>
            ${dep.files
              .map((file) => `<div class="file-path">${file}</div>`)
              .join("")}
            <div class="cycle-visualization">
              ${dep.files
                .map(
                  (file, index) => `
                ${file}
                ${
                  index < dep.files.length - 1
                    ? '<span class="arrow">→</span>'
                    : '<span class="arrow">→</span>'
                }
              `
                )
                .join("")}
              ${dep.files[0]}
            </div>
            <div class="graph-container" id="graph-${dep.id}"></div>
          </div>
        `;
          })
          .join("")}
      </div>
    </div>
    
    <div class="tab-content" id="directory-stats-content">
      <h2>Directory Hotspots</h2>
      <p>Click on a directory to filter dependencies containing files from that directory.</p>
      <div class="directory-stats">
        ${sortedDirs
          .map(
            (dir) => `
          <div class="directory-stat" data-directory="${dir}">
            ${dir} <span class="directory-count">${dirCounts[dir]}</span>
          </div>
        `
          )
          .join("")}
      </div>
    </div>
  </main>

  <footer class="container">
    <p>Generated on ${new Date().toISOString()} | <a href="https://github.com/your-username/cal-dependency-analyzer" target="_blank">GitHub Repository</a></p>
  </footer>

  <script src="../../app.js"></script>
</body>
</html>
  `;

  return html;
}

// Main execution
const { circularDeps, totalDeps } = parseCircularDependencies(rawData);
const html = generateHTML(circularDeps, totalDeps, branchName);

// Create directory if it doesn't exist
const outputDir = outputFile.substring(0, outputFile.lastIndexOf("/"));
if (!fs.existsSync(outputDir)) {
  fs.mkdirSync(outputDir, { recursive: true });
}

// Write the HTML file
fs.writeFileSync(outputFile, html);

console.log(
  `Successfully generated HTML with ${totalDeps} circular dependencies for branch ${branchName}.`
);
