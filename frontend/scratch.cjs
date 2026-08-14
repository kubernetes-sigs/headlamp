const fs = require('fs');
const path = require('path');

const srcDir = path.join(__dirname, 'src');

function walk(dir) {
  let results = [];
  const list = fs.readdirSync(dir);
  list.forEach(function(file) {
    file = path.join(dir, file);
    const stat = fs.statSync(file);
    if (stat && stat.isDirectory()) { 
      results = results.concat(walk(file));
    } else if (file.endsWith('.ts') || file.endsWith('.tsx')) { 
      results.push(file);
    }
  });
  return results;
}

const files = walk(srcDir);
let changedFiles = 0;

files.forEach(file => {
  let content = fs.readFileSync(file, 'utf8');
  let original = content;

  const hookNames = ['useList', 'useApiList', 'useGet', 'useApiGet'];
  let needsKubeHooks = new Set();
  
  hookNames.forEach(hook => {
    const regex = new RegExp(`([A-Za-z0-9_]+)\\.${hook}\\(`, 'g');
    if (regex.test(content)) {
      content = content.replace(regex, (match, className) => {
        needsKubeHooks.add(`useKube${hook.replace('use', '')}`);
        return `useKube${hook.replace('use', '')}(${className}, `;
      });
    }
  });

  if (content !== original) {
    // Add import statement
    const fileDir = path.dirname(file);
    const hooksPath = path.resolve(srcDir, 'lib/k8s/hooks');
    let relativePath = path.relative(fileDir, hooksPath).replace(/\\/g, '/');
    if (!relativePath.startsWith('.')) { relativePath = './' + relativePath; }
    
    // We can add it after the last import, or just at the top (after copyright)
    // Find first import
    const importMatch = content.match(/^import /m);
    if (importMatch) {
      const hooksArray = Array.from(needsKubeHooks).join(', ');
      const importStr = `import { ${hooksArray} } from '${relativePath}';\n`;
      // Don't add if already imported
      if (!content.includes(importStr.trim())) {
        content = content.replace(/^import /m, importStr + 'import ');
      }
    }
    
    changedFiles++;
    fs.writeFileSync(file, content, 'utf8');
  }
});

console.log(`Changed ${changedFiles} files`);
