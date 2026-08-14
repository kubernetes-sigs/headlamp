const fs = require('fs');
let content = fs.readFileSync('frontend/src/lib/k8s/api/v2/useKubeObjectList.test.tsx', 'utf8');

const regex = /mockClusterFetch\.mockImplementation\(async \(url\) => \{[\s\S]*?if \(url\.includes\('limit='\)\) \{/g;

content = content.replace(regex, `mockClusterFetch.mockImplementation(async (url) => {\n      console.log("CLUSTER FETCH URL:", url);\n      if (url.includes('limit=')) {`);
fs.writeFileSync('frontend/src/lib/k8s/api/v2/useKubeObjectList.test.tsx', content);
