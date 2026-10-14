import fs from 'node:fs/promises';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);const {ProjectReader,scanProject}=require('../dist/core.cjs');const reader=new ProjectReader();
await reader.init('dist');const project=await scanProject('examples/idea-notes',reader);await fs.mkdir('test-results',{recursive:true});await fs.writeFile('test-results/reader-preview.json',JSON.stringify(project));reader.dispose();console.log('Updated live reading data');
