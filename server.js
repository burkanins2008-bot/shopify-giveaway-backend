const express=require('express'),crypto=require('crypto'),cors=require('cors');require('dotenv').config();
const app=express();
app.use(cors());
app.use(express.json());

const GOAL=200;
const ENTRY_CODE=(process.env.GIVEAWAY_ENTRY_CODE||'WINCASH26').toUpperCase();
const ADMIN_PASS=process.env.ADMIN_PASSWORD||'GiveawayAdmin2025';

// In-memory storage (persists while server runs)
const entries=[];
const orders=[];
let totalRevenue=0;

// POST /giveaway/enter - reģistrē dalībnieku
app.post('/giveaway/enter',(req,res)=>{
  const {code,name,phone,email,customerId}=req.body||{};
  if(!code||!name||!phone||!email){
    return res.json({success:false,message:'Aizpildi visus laukus.'});
  }
  if(code.toUpperCase()!==ENTRY_CODE){
    return res.json({success:false,message:'Nepareizs kods.'});
  }
  if(!email.includes('@')){
    return res.json({success:false,message:'Nepareizs e-pasts.'});
  }
  // Saglabā dalībnieku
  const entry={
    id:Date.now(),
    name:name.trim(),
    phone:phone.trim(),
    email:email.toLowerCase().trim(),
    customerId:customerId||'guest',
    entries:1,
    registeredAt:new Date().toISOString()
  };
  entries.push(entry);
  console.log('[ENTRY]',JSON.stringify(entry));
  res.json({success:true,message:'Pieteikts!',entries:1});
});

// POST /webhooks/orders/paid - Shopify webhook kad pasutijums apmaksats
app.post('/webhooks/orders/paid',(req,res)=>{
  const sig=req.headers['x-shopify-hmac-sha256'];
  const body=JSON.stringify(req.body);
  const secret=process.env.SHOPIFY_WEBHOOK_SECRET||'';
  if(secret){
    const hash=crypto.createHmac('sha256',secret).update(body).digest('base64');
    if(hash!==sig){return res.status(401).send('Unauthorized');}
  }
  const order=req.body;
  const amount=parseFloat(order.total_price||0);
  const email=(order.email||'').toLowerCase();
  const customerId=String(order.customer?.id||'');
  totalRevenue+=amount;
  const tickets=Math.floor(amount);
  orders.push({orderId:order.id,email,customerId,amount,tickets,at:new Date().toISOString()});
  // Pievieno biļetes esošajam dalībniekam
  const participant=entries.find(e=>e.email===email||e.customerId===customerId);
  if(participant){participant.entries+=tickets;}
  console.log('[ORDER] '+email+' +'+tickets+' biletes, kopa EUR '+totalRevenue.toFixed(2));
  res.json({success:true,totalRevenue,goalReached:totalRevenue>=GOAL});
});

// GET /admin - dalibnieku saraksts
app.get('/admin',(req,res)=>{
  const pass=req.headers['x-admin-password']||req.query.password||'';
  if(pass!==ADMIN_PASS){return res.status(401).json({error:'Unauthorized'});}
  res.json({
    goal:GOAL,
    totalRevenue:totalRevenue.toFixed(2),
    goalReached:totalRevenue>=GOAL,
    progress:Math.min(100,Math.round(totalRevenue/GOAL*100)),
    entryCount:entries.length,
    orderCount:orders.length,
    entries:entries.sort((a,b)=>b.entries-a.entries),
    orders
  });
});

// GET / - health check
app.get('/',(req,res)=>res.json({status:'OK',goal:GOAL,revenue:totalRevenue.toFixed(2),entries:entries.length}));

const PORT=process.env.PORT||3000;
app.listen(PORT,()=>console.log('Giveaway server port '+PORT+' | Merķis: EUR '+GOAL));
