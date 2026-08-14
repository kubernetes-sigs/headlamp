const fs = require('fs');
let content = fs.readFileSync('frontend/src/lib/k8s/api/v2/useKubeObjectList.test.tsx', 'utf8');

const regex = /mockClusterFetch\.mockImplementation\(async \(url\) => \{[\s\S]*?if \(url\.includes\('limit='\)\) \{[\s\S]*?return \{\s*json: \(\) => Promise\.resolve\(makeListResponse\(\{ items: \[pod1\], continueToken: 'continue-token-1' \}\)\),\s*\};\s*\}[\s\S]*?return \{\s*json: \(\) => Promise\.resolve\(makeListResponse\(\{ items: \[pod2\] \}\)\),\s*\};\s*\}\);/g;

const replacement = `mockClusterFetch.mockImplementation(async (url) => {
      // If it's a request for the second page, it has 'continue='
      if (url.includes('continue=')) {
        return {
          json: () => Promise.resolve(makeListResponse({ items: [pod2] })),
        };
      }
      // Otherwise, it's the first page
      return {
        json: () => Promise.resolve(makeListResponse({ items: [pod1], continueToken: 'continue-token-1' })),
      };
    });`;

let count = 0;
content = content.replace(regex, () => {
    count++;
    return replacement;
});
console.log(`Replaced ${count} occurrences of the OLD mock (with limit).`);
fs.writeFileSync('frontend/src/lib/k8s/api/v2/useKubeObjectList.test.tsx', content);
