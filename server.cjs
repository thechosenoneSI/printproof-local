'use strict';
const http=require('node:http'),fs=require('node:fs'),path=require('node:path');
const root=__dirname;
const names=['index.html','app.js','matcher.js','fixtures.js','styles.css','benchmark-results.json'];
if(process.argv.includes('--qa'))names.push('qa-holdout.html','qa-mobile.html');
const allowed=new Set(names),mime={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.json':'application/json; charset=utf-8'};
const server=http.createServer((req,res)=>{
res.setHeader('X-Content-Type-Options','nosniff');res.setHeader('Referrer-Policy','no-referrer');
res.setHeader('Cache-Control','no-store');
if(!['GET','HEAD'].includes(req.method)){res.writeHead(405,{'Allow':'GET, HEAD'});res.end('Read-only static server');return;}
let name;try{name=decodeURIComponent(req.url.split('?')[0]);}catch{res.writeHead(400);res.end('Bad request');return;}
name=name==='/'?'index.html':name.startsWith('/')?name.slice(1):name;
if(!allowed.has(name)){res.writeHead(404);res.end('Not found');return;}
fs.readFile(path.join(root,name),(error,data)=>{if(error){res.writeHead(404);res.end('Not found');return;}res.setHeader('Content-Type',mime[path.extname(name)]||'application/octet-stream');res.writeHead(200);res.end(req.method==='HEAD'?undefined:data);});
});
server.listen(8766,'127.0.0.1',()=>console.log('PrintProof Local read-only static server: http://127.0.0.1:8766/'));
