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
    const fileMatch = line.match(/^\s*-> (.+) \(line (\d+)\): (.+)$/);
    if (fileMatch && inDependency && currentDep) {
      currentDep.files.push({
        path: fileMatch[1],
        lineNumber: parseInt(fileMatch[2]),
        code: fileMatch[3],
      });
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
  // Handle both string paths and object paths
  const path = typeof filePath === "string" ? filePath : filePath.path;

  const parts = path.split("/");
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
  <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/highlight.js/11.7.0/styles/github.min.css">
  <script src="https://cdnjs.cloudflare.com/ajax/libs/highlight.js/11.7.0/highlight.min.js"></script>
  <script src="https://cdnjs.cloudflare.com/ajax/libs/highlight.js/11.7.0/languages/javascript.min.js"></script>
  <script src="https://cdnjs.cloudflare.com/ajax/libs/highlight.js/11.7.0/languages/typescript.min.js"></script>
  <script defer src="https://unpkg.com/alpinejs@3.x.x/dist/cdn.min.js"></script>
</head>
<body x-data="{
  searchTerm: '',
  directoryFilter: '',
  
  isVisible(dep) {
    if (!this.searchTerm && !this.directoryFilter) return true;
    const searchTerm = this.searchTerm.toLowerCase();
    const matchesSearch = !searchTerm || dep.textContent.toLowerCase().includes(searchTerm);
    const matchesDirectory = !this.directoryFilter || dep.getAttribute('data-directories').split(',').includes(this.directoryFilter);
    return matchesSearch && matchesDirectory;
  }
}">
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
    <div class="filters">
      <div class="search-container">
        <input type="text" 
          x-model="searchTerm" 
          placeholder="Search for files or patterns..."
          class="search-input"
        >
      </div>
      <div class="filter-container">
        <select x-model="directoryFilter" class="directory-select">
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
          const directories = [
            ...new Set(dep.files.map((file) => getDirectory(file))),
          ];

          return `
          <div class="dependency" 
            data-id="${dep.id}" 
            data-directories="${directories.join(",")}"
            x-show="isVisible($el)"
            x-transition:enter="transition ease-out duration-300"
            x-transition:enter-start="opacity-0"
            x-transition:enter-end="opacity-100"
            x-transition:leave="transition ease-in duration-300"
            x-transition:leave-start="opacity-100"
            x-transition:leave-end="opacity-0"
          >
            <div class="dependency-header">
              <span>Circular Dependency #${dep.id}</span>
              <span class="file-count">${fileCount} files</span>
            </div>
            
            <div class="dependency-chain">
              ${dep.files
                .map((file, index) => {
                  const nextFile = dep.files[(index + 1) % dep.files.length];
                  return `
                  <div class="chain-item">
                    <div class="file-info">
                      <div class="file-header">
                        <div class="file-path">${file.path}</div>
                        <div class="dependency-direction">imports from ${
                          nextFile.path
                        }</div>
                      </div>
                      <div class="import-details">
                        <div class="code-section">
                          <div class="code-header">
                            <span class="line-number">Line ${
                              file.lineNumber
                            }</span>
                            <span class="file-type">${
                              file.path.endsWith(".tsx")
                                ? "TypeScript"
                                : "JavaScript"
                            }</span>
                          </div>
                          <pre><code class="language-typescript">${
                            file.code
                          }</code></pre>
                        </div>
                      </div>
                    </div>
                    ${
                      index < dep.files.length - 1
                        ? '<div class="chain-arrow">↓</div>'
                        : ""
                    }
                  </div>
                `;
                })
                .join("")}
            </div>
          </div>
        `;
        })
        .join("")}
    </div>
  </main>

  <footer class="container">
    <p>Generated on ${new Date().toISOString()} | <a href="https://github.com/your-username/cal-dependency-analyzer" target="_blank">GitHub Repository</a></p>
  </footer>

  <script>
    document.addEventListener('alpine:init', () => {
      // Initialize syntax highlighting
      document.querySelectorAll('pre code').forEach((block) => {
        hljs.highlightElement(block);
      });
    });
  </script>
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

// Write the HTML file
fs.writeFileSync(outputFile, html);

console.log(
  `Successfully generated HTML with ${totalDeps} circular dependencies for branch ${branchName}.`
);
