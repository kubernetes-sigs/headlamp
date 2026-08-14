const fs = require('fs');
let content = fs.readFileSync('frontend/src/lib/k8s/api/v2/useKubeObjectList.test.tsx', 'utf8');

const regex = /mockClusterFetch\n\s*\.mockResolvedValueOnce\(\{\n\s*json: \(\) =>\n\s*Promise\.resolve\(makeListResponse\(\{ items: \[pod1\], continueToken: 'continue-token-1' \}\)\),\n\s*\}\)\n\s*\.mockResolvedValueOnce\(\{\n\s*json: \(\) => Promise\.resolve\(makeListResponse\(\{ items: \[pod2\] \}\)\),\n\s*\}\);/g;

const replacement = `mockClusterFetch.mockImplementation(async (url) => {
      if (url.includes('limit=')) {
        return {
          json: () => Promise.resolve(makeListResponse({ items: [pod1], continueToken: 'continue-token-1' })),
        };
      }
      return {
        json: () => Promise.resolve(makeListResponse({ items: [pod2] })),
      };
    });`;

content = content.replace(regex, replacement);
fs.writeFileSync('frontend/src/lib/k8s/api/v2/useKubeObjectList.test.tsx', content);
