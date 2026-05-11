const plugins = [
  'headlamp-plugins/headlamp_opencost',
  'headlamp-plugins/headlamp_flux',
  'headlamp-plugins/app-catalog'
];

async function test() {
  for (const p of plugins) {
    const URL = `https://artifacthub.io/api/v1/packages/headlamp/${p}`;
    const res = await fetch(URL);
    console.log(`${p}: ${res.status}`);
  }
}

test();
