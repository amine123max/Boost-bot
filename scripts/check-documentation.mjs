import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { dirname, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const registry=JSON.parse(readFileSync(resolve(root,'docs/documentation-pairs.json'),'utf8'));
const errors=[],registered=new Map();
const ignore=new Set(['.git','tmp','target','node_modules','dist','out','build','gen','bin','.pnpm']);
function publicMarkdown(directory){
  return readdirSync(directory,{withFileTypes:true}).flatMap(entry=>{
    if(ignore.has(entry.name))return[];
    const path=resolve(directory,entry.name),local=relative(root,path).split(sep).join('/');
    if(registry.excludedPrefixes.some(prefix=>local===prefix.replace(/\/$/,'')||local.startsWith(prefix)))return[];
    if(registry.excludedFiles.includes(local)||local.endsWith('.local.md'))return[];
    return entry.isDirectory()?publicMarkdown(path):entry.name.endsWith('.md')?[local]:[];
  });
}
for(const pair of registry.pairs){
  for(const language of ['en','zh']){
    const path=pair[language];
    if(typeof path!=='string'||path.startsWith('/')||path.includes('..')){errors.push('Invalid pair path: '+path);continue;}
    if(registered.has(path))errors.push('Duplicate paired document: '+path);
    registered.set(path,pair);
    const absolute=resolve(root,path);
    if(!existsSync(absolute)){errors.push('Missing '+language+' document: '+path);continue;}
    const text=readFileSync(absolute,'utf8');
    if(!/^#(?:\s|<)/m.test(text)&&!/<h1\b/.test(text))errors.push('Missing title: '+path);
    if(text.trim().length<80)errors.push('Empty translation placeholder: '+path);
    const counterpart=relative(dirname(absolute),resolve(root,pair[language==='en'?'zh':'en'])).split(sep).join('/');
    const encoded=counterpart.split('/').map(encodeURIComponent).join('/');
    const decoded=text.replace(/\]\(([^)]+)\)/g,(_,target)=>{try{return ']('+decodeURIComponent(target)+')';}catch{return ']('+target+')';}});
    if(!decoded.includes(counterpart)&&!text.includes(encoded))errors.push('Missing language navigation: '+path+' -> '+counterpart);
    const fences=(text.match(/^```/gm)||[]).length;if(fences%2)errors.push('Unclosed code fence: '+path);
    for(const image of text.matchAll(/!\[([^\]]*)\]\(/g))if(!image[1].trim())errors.push('Missing image alt: '+path);
  }
}
for(const path of publicMarkdown(root))if(!registered.has(path))errors.push('Unpaired public Markdown: '+path);
for(const name of ['README.md','README.zh-CN.md']){
  const text=readFileSync(resolve(root,name),'utf8');
  if(/releases\/(?:tag|download)\/v\d/.test(text))errors.push('README pins a release: '+name);
  if(!text.includes('releases/latest'))errors.push('README latest-release link missing: '+name);
  if(/<details\b|<summary\b/.test(text))errors.push('README screenshot labels must remain flat: '+name);
  const screenshots=[...text.matchAll(/!\[[^\]]*\]\(docs\/images\/[^)]+\)/g)];
  if(screenshots.length<4)errors.push('README visual evidence is incomplete: '+name);
  if(!text.includes('```mermaid'))errors.push('README architecture diagram missing: '+name);
}
if(errors.length){console.error([...new Set(errors)].join('\n'));process.exitCode=1;}
else console.log(`Verified ${registry.pairs.length} English/Chinese public-document pairs, language navigation and README contracts.`);
