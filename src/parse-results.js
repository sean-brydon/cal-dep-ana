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
  modalOpen: false,
  currentDep: null,
  searchTerm: '',
  directoryFilter: '',
  
  openModal(depId) {
    const dep = this.getDependency(depId);
    if (!dep) return;
    
    this.currentDep = {
      id: depId,
      files: Array.from(dep.querySelectorAll('.file-path')).map(el => ({
        path: el.textContent.trim()
      })),
      importDetails: JSON.parse(dep.getAttribute('data-raw'))
    };
    this.modalOpen = true;
    this.$nextTick(() => {
      this.$refs.modalContent.querySelectorAll('pre code').forEach(block => {
        hljs.highlightElement(block);
      });
    });
  },
  
  getDependency(id) {
    return document.querySelector(\`.dependency[data-id="\${id}"]\`);
  },
  
  closeModal() {
    this.modalOpen = false;
    this.currentDep = null;
  },
  
  isVisible(dep) {
    if (!dep) return false;
    const matchesSearch = !this.searchTerm || dep.textContent.toLowerCase().includes(this.searchTerm.toLowerCase());
    const matchesDirectory = !this.directoryFilter || (dep.getAttribute('data-directories') || '').split(',').includes(this.directoryFilter);
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
    <div class="tabs">
      <div class="tab" :class="{ active: !$store.tab || $store.tab === 'all-deps' }" @click="$store.tab = 'all-deps'">All Dependencies</div>
      <div class="tab" :class="{ active: $store.tab === 'directory-stats' }" @click="$store.tab = 'directory-stats'">Directory Statistics</div>
    </div>
    
    <div class="tab-content" :class="{ active: !$store.tab || $store.tab === 'all-deps' }">
      <div class="filters">
        <div class="search-container">
          <input type="text" x-model="searchTerm" placeholder="Search for files or patterns...">
        </div>
        <div class="filter-container">
          <select x-model="directoryFilter">
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
            data-raw="${JSON.stringify(
              dep.files.map((file, index) => ({
                source: file.path,
                target: dep.files[(index + 1) % dep.files.length].path,
                lineNumber: file.lineNumber,
                code: file.code.replace(/"/g, "&quot;"),
              }))
            ).replace(/"/g, "&quot;")}"
            x-show="isVisible($el)"
          >
            <div class="dependency-header">
              <span>Circular Dependency #${dep.id}</span>
              <div class="dependency-actions">
                <button class="btn btn-small open-details" @click="openModal(${
                  dep.id
                })">Open Details</button>
                <span class="file-count">${fileCount} files</span>
              </div>
            </div>
            ${dep.files
              .map(
                (file) => `
                <div class="file-path">
                  ${file.path}
                </div>
              `
              )
              .join("")}
            <div class="cycle-visualization">
              ${dep.files
                .map(
                  (file, index) => `
                ${file.path}
                ${
                  index < dep.files.length - 1
                    ? '<span class="arrow">→</span>'
                    : '<span class="arrow">→</span>'
                }
              `
                )
                .join("")}
              ${dep.files[0].path}
            </div>
            <div class="graph-container" id="graph-${dep.id}"></div>
          </div>
        `;
          })
          .join("")}
      </div>
    </div>
    
    <div class="tab-content" :class="{ active: $store.tab === 'directory-stats' }">
      <h2>Directory Hotspots</h2>
      <p>Click on a directory to filter dependencies containing files from that directory.</p>
      <div class="directory-stats">
        ${sortedDirs
          .map(
            (dir) => `
          <div class="directory-stat" 
            data-directory="${dir}" 
            @click="directoryFilter = '${dir}'; $store.tab = 'all-deps'"
          >
            ${dir} <span class="directory-count">${dirCounts[dir]}</span>
          </div>
        `
          )
          .join("")}
      </div>
    </div>
  </main>

  <!-- Modal Template -->
  <div id="dependencyModal" 
    class="modal" 
    :class="{ show: modalOpen }" 
    @click="closeModal()"
  >
    <div class="modal-content" @click.stop x-ref="modalContent">
      <div class="modal-header">
        <h2>Circular Dependency Details</h2>
        <button class="close-modal" @click="closeModal()">&times;</button>
      </div>
      <div class="modal-body">
        <template x-if="currentDep">
          <div class="dependency-files">
            <h3>Circular Dependency Chain</h3>
            <div class="cycle-visualization">
              <template x-for="(file, index) in currentDep.files" :key="index">
                <span>
                  <span x-text="file.path"></span>
                  <span class="arrow" x-show="index < currentDep.files.length - 1">→</span>
                </span>
              </template>
              <span x-text="currentDep.files[0].path"></span>
            </div>
            
            <h3 class="mt-4">Import Details</h3>
            <template x-for="(file, index) in currentDep.files" :key="index">
              <div class="dependency-detail">
                <div class="detail-header">
                  <span x-text="file.path + ' → ' + currentDep.files[(index + 1) % currentDep.files.length].path"></span>
                </div>
                <template x-if="currentDep.importDetails[index]">
                  <div class="detail-code">
                    <pre><code class="language-typescript" x-text="'// Line ' + currentDep.importDetails[index].lineNumber + '\n' + currentDep.importDetails[index].code"></code></pre>
                  </div>
                </template>
              </div>
            </template>
          </div>
        </template>
      </div>
    </div>
  </div>

  <footer class="container">
    <p>Generated on ${new Date().toISOString()} | <a href="https://github.com/your-username/cal-dependency-analyzer" target="_blank">GitHub Repository</a></p>
  </footer>

  <script>
    document.addEventListener('alpine:init', () => {
      Alpine.store('tab', 'all-deps');
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
