const RAM_TYPES = ['B', 'Ki', 'Mi', 'Gi', 'Ti', 'Pi', 'Ei'];
const UNITS = ['B', 'K', 'M', 'G', 'T', 'P', 'E'];

const TO_GB = 1024 * 1024 * 1024;

const sampleKubeObject = {
  usage: {
    memory: '1304Mi', // Memory used
  },
  status: {
    capacity: {
      memory: '1900Mi', // Total memory available
    },
  },
};
const anotherSampleKubeObject = {
  usage: {
    memory: '20.76Mi',
  },
  status: {
    capacity: {
      memory: '40Mi',
    },
  },
};


function parseUnitsOfBytes(value) {
  if (!value) return 0;

  const groups = value.match(/(\d+\.?\d*)([BKMGTPEe])?(i)?(\d+)?/) || [];
  const number = parseFloat(groups[1]);

  // number ex. 1000
  if (groups[2] === undefined) {
    return number;
  }

  // number with exponent ex. 1e3
  if (groups[4] !== undefined) {
    return number * 10 ** parseInt(groups[4], 10);
  }

  const unitIndex = UNITS.indexOf(groups[2]);

  // Unit + i ex. 1Ki
  if (groups[3] !== undefined) {
    return number * 1024 ** unitIndex;
  }

  // Unit ex. 1K
  return number * 1000 ** unitIndex;
}

export function parseRam(value) {
  return parseUnitsOfBytes(value);
}

function round(value, decimals) {
  return Number(Math.round(value + 'e' + decimals) + 'e-' + decimals);
}

function unparseRam(value) {
  let i = 0;
  while (value >= 1024 && i < RAM_TYPES.length - 1) {
    i++;
    value /= 1024; // eslint-disable-line no-param-reassign
  }

  return {
    value: round(value, 1),
    unit: RAM_TYPES[i],
  };
}

/*************************** For the first sample KubeObject ***************************/
console.log("For the first sample KubeObject:");
const usedMemoryBytes = parseRam(sampleKubeObject.usage.memory);
const availableMemoryBytes = parseRam(sampleKubeObject.status.capacity.memory);

const usedMemory = unparseRam(usedMemoryBytes);
const availableMemory = unparseRam(availableMemoryBytes);

console.log(`- Used Memory: ${usedMemory.value} ${usedMemory.unit}`);
console.log(`- Available Memory: ${availableMemory.value} ${availableMemory.unit}`);

/*************************** In charts.tsx ***************************/
console.log("\nIn charts.tsx:");
function memoryUsedGetter(item) {
  return parseRam(item.usage.memory) / TO_GB;
}

function memoryAvailableGetter(item) {
  return parseRam(item.status.capacity.memory) / TO_GB;
}

const usedMemoryGB = memoryUsedGetter(sampleKubeObject); // Should be approximately 1.3 GiB
const availableMemoryGB = memoryAvailableGetter(sampleKubeObject); // Should be approximately 1.9 GiB

console.log(`- Used Memory: ${usedMemoryGB.toFixed(2)} GB`);
console.log(`- Available Memory: ${availableMemoryGB.toFixed(2)} GB`);

/*************************** For the second sample KubeObject ***************************/
console.log("\nFor the second sample KubeObject:");
const usedMemoryBytes2 = parseRam(anotherSampleKubeObject.usage.memory);
const availableMemoryBytes2 = parseRam(anotherSampleKubeObject.status.capacity.memory);

const usedMemory2 = unparseRam(usedMemoryBytes2);
const availableMemory2 = unparseRam(availableMemoryBytes2);

console.log(`- Used Memory: ${usedMemory2.value} ${usedMemory2.unit}`);
console.log(`- Available Memory: ${availableMemory2.value} ${availableMemory2.unit}`);


// console.log("parseUnitsOfBytes(1000):", parseUnitsOfBytes("1000")); // 1000
// console.log("parseUnitsOfBytes(1K):", parseUnitsOfBytes("1K")); // 1000
// console.log("parseUnitsOfBytes(1Ki):", parseUnitsOfBytes("1Ki")); // 1024
// console.log("parseUnitsOfBytes(1e3):", parseUnitsOfBytes("1e3")); // 1000
// console.log("parseUnitsOfBytes(1.5K):", parseUnitsOfBytes("1.5K")); // 1500
// console.log("parseUnitsOfBytes(2.5Mi):", parseUnitsOfBytes("2.5Mi")); // 2621440
// console.log("parseUnitsOfBytes(3e2):", parseUnitsOfBytes("3e2")); // 300
// console.log("\nUser-submitted examples:");
// console.log("memoryUsedGetter(1304Mi):", parseUnitsOfBytes("1304Mi") / TO_GB);
// console.log("unparseRam(1304Mi):", unparseRam(parseUnitsOfBytes("1304Mi")));
// console.log("parseUnitsOfBytes(20.76Mi):", parseUnitsOfBytes("20.76Mi"));
// console.log("unparseRam(20.76Mi):", unparseRam(parseUnitsOfBytes("20.76Mi")));