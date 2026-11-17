import { readFileSync } from 'node:fs';
const src = readFileSync('./out/data.js', 'utf8');
console.log('starts', src.slice(0, 40), 'ends', src.slice(-20));
