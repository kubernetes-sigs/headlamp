const fs = require('fs');
let content = fs.readFileSync('frontend/src/lib/k8s/api/v2/useKubeObjectList.test.tsx', 'utf8');

const regex = /mockClusterFetch\.mockImplementation\(async \(url\) => \{[\s\S]*?if \(url\.includes\('limit='\)\) \{[\s\S]*?return \{\s*json: \(\) => Promise\.resolve\(makeListResponse\(\{ items: \[pod1\], continueToken: 'continue-token-1' \}\)\),\s*\};\s*\}[\s\S]*?return \{\s*json: \(\) => Promise\.resolve\(makeListResponse\(\{ items: \[pod2\] \}\)\),\s*\};\s*\}\);/g;

const replacement = `mockClusterFetch.mockImplementation(async (url) => {
      if (url.includes('continue=')) {
        return {
          json: () => Promise.resolve(makeListResponse({ items: [pod2] })),
        };
      }
      return {
        json: () => Promise.resolve(makeListResponse({ items: [pod1], continueToken: 'continue-token-1' })),
      };
    });`;

let count = 0;
content = content.replace(regex, () => {
    count++;
    return replacement;
});
console.log(`Replaced ${count} occurrences.`);
fs.writeFileSync('frontend/src/lib/k8s/api/v2/useKubeObjectList.test.tsx', content);
