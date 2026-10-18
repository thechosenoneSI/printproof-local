(function(root){
const approved=['RIVERSIDE MAKERS MARKET','Saturday 24 October 2026','Open 10:00 - 18:00','Entry $12','Call 202-555-0147','48 River Street','Free parking'];
const wrong=approved.slice();wrong[1]='Saturday 25 October 2026';wrong[3]='Entry $21';wrong[4]='Call 202-555-0141';wrong.pop();
function draw(canvas,lines,opts={}){canvas.width=1200;canvas.height=1300;const c=canvas.getContext('2d');c.fillStyle=opts.poor?'#faf9f4':'#fffdf4';c.fillRect(0,0,1200,1300);c.fillStyle=opts.poor?'#cccac3':'#d9ee88';c.fillRect(0,0,1200,45);c.fillStyle=opts.poor?'#d7d6d0':'#263c30';c.font='bold 50px Arial';lines.forEach((s,i)=>c.fillText(s,60,150+i*145));c.strokeStyle=opts.poor?'#eee':'#c9d3ba';c.lineWidth=2;c.beginPath();c.moveTo(60,1240);c.lineTo(1140,1240);c.stroke();if(opts.poor){const tiny=document.createElement('canvas');tiny.width=120;tiny.height=130;tiny.getContext('2d').drawImage(canvas,0,0,120,130);c.imageSmoothingEnabled=true;c.clearRect(0,0,1200,1300);c.drawImage(tiny,0,0,1200,1300);}return canvas;}
const cases=[
{id:'clean-control',lines:approved,expected:[],clean:true},
{id:'four-planted-errors',lines:wrong,expected:[approved[1],approved[3],approved[4],approved[6]]},
{id:'changed-price',lines:approved.map((x,i)=>i===3?'Entry $21':x),expected:[approved[3]]},
{id:'changed-phone',lines:approved.map((x,i)=>i===4?'Call 202-555-0141':x),expected:[approved[4]]},
{id:'missing-line',lines:approved.slice(0,-1),expected:[approved[6]]},
{id:'changed-word',lines:approved.map((x,i)=>i===6?'Paid parking':x),expected:[approved[6]]},
{id:'case-spacing-control',lines:approved.map(x=>x.toLowerCase().replaceAll(' ','  ')),expected:[],clean:true},
{id:'unreadable-control',lines:approved,opts:{poor:true},uncertain:true}
];root.PrintProofFixtures={approved,wrong,draw,cases};})(window);
