async function test() {
  const p = 'opencost';
  const repo = 'headlamp-official';
  const URL = `https://artifacthub.io/api/v1/packages/headlamp/${repo}/${p}`;
  const res = await fetch(URL);
  if (res.ok) {
    const json = await res.json();
    console.log(`${p}: ${json.version}`);
  } else {
    console.log(`${p}: ${res.status}`);
  }
}
test();
