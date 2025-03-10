// src/analyze-dependencies.js
const fs = require("fs");
const path = require("path");

// Directory to analyze
const repoDir = process.argv[2];
const outputFile = process.argv[3];
const maxFiles = parseInt(process.argv[4] || "0", 10);

console.log(`Starting dependency analysis of ${repoDir}`);
console.log(`Max files to analyze: ${maxFiles || "unlimited"}`);

// Get all JavaScript/TypeScript files
function getAllFiles(dir, fileList = []) {
  if (maxFiles > 0 && fileList.length >= maxFiles) {
    return fileList;
  }

  try {
    const files = fs.readdirSync(dir);

    for (const file of files) {
      if (maxFiles > 0 && fileList.length >= maxFiles) {
        break;
      }

      const filePath = path.join(dir, file);

      try {
        const stat = fs.statSync(filePath);

        if (stat.isDirectory()) {
          // Skip node_modules, .git, and other common directories to ignore
          if (
            file !== "node_modules" &&
            file !== ".git" &&
            file !== "dist" &&
            file !== "build" &&
            file !== ".next" &&
            file !== "coverage"
          ) {
            getAllFiles(filePath, fileList);
          }
        } else {
          // Only include JS/TS files
          if (/\.(js|jsx|ts|tsx)$/.test(file) && !file.endsWith(".d.ts")) {
            fileList.push(filePath);
          }
        }
      } catch (err) {
        console.warn(`Error accessing ${filePath}: ${err.message}`);
      }
    }
  } catch (err) {
    console.warn(`Error reading directory ${dir}: ${err.message}`);
  }

  return fileList;
}

// Parse imports from a file
function parseImports(filePath) {
  try {
    const content = fs.readFileSync(filePath, "utf8");
    const imports = [];
    const lines = content.split("\n");

    // Match ES6 imports
    const es6ImportRegex = /import\s+(?:[\w*{}\s,]+from\s+)?['"]([^'"]+)['"]/g;
    let match;

    // Process each line to capture line numbers and actual code
    lines.forEach((line, lineNumber) => {
      // Reset regex for each line
      es6ImportRegex.lastIndex = 0;

      while ((match = es6ImportRegex.exec(line)) !== null) {
        imports.push({
          path: match[1],
          lineNumber: lineNumber + 1,
          code: line.trim(),
        });
      }

      // Match require statements
      const requireRegex = /require\s*\(\s*['"]([^'"]+)['"]\s*\)/g;
      requireRegex.lastIndex = 0;

      while ((match = requireRegex.exec(line)) !== null) {
        imports.push({
          path: match[1],
          lineNumber: lineNumber + 1,
          code: line.trim(),
        });
      }
    });

    return imports;
  } catch (err) {
    console.warn(`Error reading file ${filePath}: ${err.message}`);
    return [];
  }
}

// Map file paths to normalized module paths
function createFilePathMap(files) {
  const filePathMap = {};

  files.forEach((file) => {
    const relativePath = path.relative(repoDir, file).replace(/\\/g, "/");
    filePathMap[relativePath] = file;

    // Also map without extension
    const withoutExt = relativePath.replace(/\.(js|jsx|ts|tsx)$/, "");
    if (withoutExt !== relativePath) {
      filePathMap[withoutExt] = file;
    }

    // Map index files to their directory
    if (
      relativePath.endsWith("/index.js") ||
      relativePath.endsWith("/index.jsx") ||
      relativePath.endsWith("/index.ts") ||
      relativePath.endsWith("/index.tsx")
    ) {
      const dirPath = relativePath.substring(0, relativePath.lastIndexOf("/"));
      filePathMap[dirPath] = file;
    }
  });

  return filePathMap;
}

// Resolve import path to actual file path
function resolveImport(importPath, currentFile, filePathMap) {
  // Handle relative imports
  if (importPath.startsWith(".")) {
    const currentDir = path.dirname(currentFile);
    const absolutePath = path
      .resolve(currentDir, importPath)
      .replace(/\\/g, "/");
    const relativePath = path
      .relative(repoDir, absolutePath)
      .replace(/\\/g, "/");

    // Check if we have an exact match
    if (filePathMap[relativePath]) {
      return filePathMap[relativePath];
    }

    // Try with extensions
    const extensions = [".js", ".jsx", ".ts", ".tsx"];
    for (const ext of extensions) {
      if (filePathMap[relativePath + ext]) {
        return filePathMap[relativePath + ext];
      }
    }

    // Try with /index
    const indexPath = relativePath + "/index";
    for (const ext of extensions) {
      if (filePathMap[indexPath + ext]) {
        return filePathMap[indexPath + ext];
      }
    }
  } else {
    // For non-relative imports, we'll try to match against our file map
    // This is a simplified approach and won't handle all cases

    // Try direct match (for monorepo packages)
    if (filePathMap[importPath]) {
      return filePathMap[importPath];
    }

    // Try common monorepo patterns
    const patterns = [
      `packages/${importPath}`,
      `apps/${importPath}`,
      `packages/${importPath}/index`,
      `apps/${importPath}/index`,
    ];

    for (const pattern of patterns) {
      if (filePathMap[pattern]) {
        return filePathMap[pattern];
      }

      // Try with extensions
      const extensions = [".js", ".jsx", ".ts", ".tsx"];
      for (const ext of extensions) {
        if (filePathMap[pattern + ext]) {
          return filePathMap[pattern + ext];
        }
      }
    }
  }

  return null;
}

// Build dependency graph
function buildDependencyGraph(files, filePathMap) {
  const graph = {};
  const importDetails = {}; // Store import details for each dependency

  files.forEach((file) => {
    const relativePath = path.relative(repoDir, file).replace(/\\/g, "/");
    graph[relativePath] = [];
    importDetails[relativePath] = {};

    const imports = parseImports(file);
    imports.forEach((importInfo) => {
      const resolvedPath = resolveImport(importInfo.path, file, filePathMap);
      if (resolvedPath) {
        const resolvedRelativePath = path
          .relative(repoDir, resolvedPath)
          .replace(/\\/g, "/");
        graph[relativePath].push(resolvedRelativePath);

        // Store import details for this dependency
        if (!importDetails[relativePath][resolvedRelativePath]) {
          importDetails[relativePath][resolvedRelativePath] = {
            lineNumber: importInfo.lineNumber,
            code: importInfo.code,
          };
        }
      }
    });
  });

  return { graph, importDetails };
}

// Find circular dependencies using Tarjan's algorithm
function findCircularDependencies(graph, importDetails) {
  const visited = new Set();
  const stack = new Set();
  const cycles = [];

  function dfs(node, path = []) {
    if (stack.has(node)) {
      // Found a cycle
      const cycleStart = path.indexOf(node);
      if (cycleStart !== -1) {
        const cycle = path.slice(cycleStart);
        cycle.push(node);

        // Add import details to the cycle
        const cycleWithDetails = [];
        for (let i = 0; i < cycle.length - 1; i++) {
          const current = cycle[i];
          const next = cycle[i + 1];

          cycleWithDetails.push({
            file: current,
            importDetails: importDetails[current][next] || {
              lineNumber: 0,
              code: "Unknown import",
            },
          });
        }

        // Add the last file that completes the cycle
        cycleWithDetails.push({
          file: cycle[cycle.length - 1],
          importDetails: importDetails[cycle[cycle.length - 1]][cycle[0]] || {
            lineNumber: 0,
            code: "Unknown import",
          },
        });

        cycles.push(cycleWithDetails);
      }
      return;
    }

    if (visited.has(node)) {
      return;
    }

    visited.add(node);
    stack.add(node);
    path.push(node);

    const neighbors = graph[node] || [];
    for (const neighbor of neighbors) {
      dfs(neighbor, [...path]);
    }

    stack.delete(node);
  }

  // Visit all nodes
  for (const node of Object.keys(graph)) {
    if (!visited.has(node)) {
      dfs(node);
    }
  }

  return cycles;
}

// Main execution
console.log(`Analyzing dependencies in ${repoDir}...`);
const files = getAllFiles(repoDir);
console.log(`Found ${files.length} files to analyze`);

console.log("Creating file path map...");
const filePathMap = createFilePathMap(files);

console.log("Building dependency graph...");
const { graph, importDetails } = buildDependencyGraph(files, filePathMap);

console.log("Finding circular dependencies...");
const cycles = findCircularDependencies(graph, importDetails);

console.log(`Found ${cycles.length} circular dependencies`);

// Format for output
const formattedDeps = cycles.map((cycle, index) => {
  return {
    id: index + 1,
    files: cycle.map((item) => ({
      path: item.file,
      lineNumber: item.importDetails.lineNumber,
      code: item.importDetails.code,
    })),
  };
});

// Create output
const output = `
Dependency Analysis Results
==========================

Processed ${files.length} files

✖ (${cycles.length}) circular dependencies found

${formattedDeps
  .map(
    (dep) => `${dep.id}.
${dep.files
  .map((file) => `-> ${file.path} (line ${file.lineNumber}): ${file.code}`)
  .join("\n")}`
  )
  .join("\n\n")}
`;

// Write to file
fs.writeFileSync(outputFile, output);
console.log(`Results written to ${outputFile}`);
