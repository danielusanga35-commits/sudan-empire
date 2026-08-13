require("dotenv").config();
const express=require("express");
const multer=require("multer");
const path=require("path");
const fs=require("fs");
const crypto=require("crypto");
const axios=require("axios");
const {Pool}=require("pg");

const app=express();
const PORT=process.env.PORT||3000;
const pool=new Pool({connectionString:process.env.DATABASE_URL,ssl:process.env.DATABASE_URL?.includes("localhost")?false:{rejectUnauthorized:false}});
const PAYSTACK_SECRET_KEY=process.env.PAYSTACK_SECRET_KEY||"";
const PAYSTACK_PUBLIC_KEY=process.env.PAYSTACK_PUBLIC_KEY||"";
const prices={week:1500000,month:4500000,quarter:10000000};

const uploadDir=path.join(__dirname,"uploads");
if(!fs.existsSync(uploadDir))fs.mkdirSync(uploadDir,{recursive:true});
const upload=multer({dest:uploadDir,limits:{fileSize:100*1024*1024}});

app.use("/api/paystack/webhook", express.raw({type:"application/json", limit:"2mb"}));
app.use(express.json({limit:"2mb"}));
app.use(express.urlencoded({extended:true}));
app.use(express.static(__dirname));
app.use("/uploads",express.static(uploadDir));

async function db(q,params=[]){return pool.query(q,params)}

app.get("/admin",(req,res)=>res.sendFile(path.join(__dirname,"admin.html")));
app.get("/api/config",(req,res)=>res.json({paystackPublicKey:PAYSTACK_PUBLIC_KEY}));

// Admin prototype authentication endpoint. Replace with session/JWT + hashed password before production.
app.post("/api/admin/login",async(req,res)=>{
  const {username,password}=req.body;
  if(username===process.env.ADMIN_USERNAME && password===process.env.ADMIN_PASSWORD)
    return res.json({ok:true});
  res.status(401).json({ok:false,error:"Invalid credentials"});
});


app.post("/api/orders",async(req,res)=>{
  try{
    const {customer_name,email,phone,address,state,total_kobo,items}=req.body;
    if(!customer_name||!email||!phone||!address||!state||!Array.isArray(items)||!items.length) return res.status(400).json({error:"Missing order fields"});
    if(!Number.isInteger(total_kobo)||total_kobo<=0) return res.status(400).json({error:"Invalid order total"});
    const r=await db(`insert into orders(customer_name,email,phone,address,state,total_kobo,items) values($1,$2,$3,$4,$5,$6,$7) returning id,created_at`,
      [customer_name,email,phone,address,state,total_kobo,JSON.stringify(items)]);
    res.status(201).json(r.rows[0]);
  }catch(e){console.error(e);res.status(500).json({error:"Could not create order"})}
});

app.post("/api/orders/pay",async(req,res)=>{
  try{
    const {orderId,email}=req.body;
    if(!PAYSTACK_SECRET_KEY) return res.status(503).json({error:"Paystack is not configured on the server"});
    const o=(await db("select * from orders where id=$1",[orderId])).rows[0];
    if(!o)return res.status(404).json({error:"Order not found"});
    if(o.payment_status==='paid')return res.status(400).json({error:"Order is already paid"});
    const callback=`${req.protocol}://${req.get('host')}/payment-success.html`;
    const init=await axios.post("https://api.paystack.co/transaction/initialize",
      {email:email||o.email,amount:String(o.total_kobo),callback_url:callback,metadata:{order_id:o.id,customer_name:o.customer_name}},
      {headers:{Authorization:`Bearer ${PAYSTACK_SECRET_KEY}`,"Content-Type":"application/json"}});
    const d=init.data.data;
    await db("update orders set payment_reference=$1,updated_at=now() where id=$2",[d.reference,o.id]);
    res.json(d);
  }catch(e){console.error(e.response?.data||e);res.status(502).json({error:"Paystack initialization failed"})}
});
app.get("/api/admin/orders",async(req,res)=>{
  try{const r=await db("select * from orders order by created_at desc");res.json(r.rows)}
  catch(e){res.status(500).json({error:"Database unavailable"})}
});

// Products
app.get("/api/products",async(req,res)=>{
  try{const r=await db("select * from products where active=true order by created_at desc");res.json(r.rows)}
  catch(e){res.status(500).json({error:"Database unavailable"})}
});
app.post("/api/products",async(req,res)=>{
  try{const {name,brand,price_kobo,image_url,notes}=req.body;
    const r=await db("insert into products(name,brand,price_kobo,image_url,notes) values($1,$2,$3,$4,$5) returning *",[name,brand,price_kobo,image_url,notes]);
    res.status(201).json(r.rows[0]);
  }catch(e){res.status(500).json({error:"Could not save product"})}
});
app.patch("/api/products/:id",async(req,res)=>{
  try{const {name,brand,price_kobo,image_url,notes,active}=req.body;
    const r=await db("update products set name=coalesce($1,name),brand=coalesce($2,brand),price_kobo=coalesce($3,price_kobo),image_url=coalesce($4,image_url),notes=coalesce($5,notes),active=coalesce($6,active),updated_at=now() where id=$7 returning *",[name,brand,price_kobo,image_url,notes,active,req.params.id]);
    res.json(r.rows[0]);
  }catch(e){res.status(500).json({error:"Could not update product"})}
});
app.delete("/api/products/:id",async(req,res)=>{
  try{await db("update products set active=false,updated_at=now() where id=$1",[req.params.id]);res.sendStatus(204)}
  catch(e){res.status(500).json({error:"Could not delete product"})}
});

// Advert applications + uploads
app.post("/api/adverts/submit",upload.fields([{name:"image",maxCount:1},{name:"video",maxCount:1}]),async(req,res)=>{
  try{
    const {business,email,phone,link,description,package:pkg}=req.body;
    if(!prices[pkg]||!business||!email||!phone)return res.status(400).json({error:"Missing required fields"});
    const image=req.files?.image?.[0]?.filename?`/uploads/${req.files.image[0].filename}`:null;
    const video=req.files?.video?.[0]?.filename?`/uploads/${req.files.video[0].filename}`:null;
    const r=await db(`insert into adverts(business_name,email,whatsapp,business_link,description,image_url,video_url,package_code,amount_kobo)
      values($1,$2,$3,$4,$5,$6,$7,$8,$9) returning *`,
      [business,email,phone,link,description,image,video,pkg,prices[pkg]]);
    res.status(201).json(r.rows[0]);
  }catch(e){console.error(e);res.status(500).json({error:"Could not save advert"})}
});

// Create a Paystack transaction and tie its reference to the advert.
app.post("/api/adverts/pay",async(req,res)=>{
  try{
    const {advertId,email}=req.body;
    const a=(await db("select * from adverts where id=$1",[advertId])).rows[0];
    if(!a)return res.status(404).json({error:"Advert not found"});
    const init=await axios.post("https://api.paystack.co/transaction/initialize",
      {email,amount:String(a.amount_kobo),metadata:{advert_id:a.id,business:a.business_name,package:a.package_code}},
      {headers:{Authorization:`Bearer ${PAYSTACK_SECRET_KEY}`,"Content-Type":"application/json"}});
    const d=init.data.data;
    await db("update adverts set payment_reference=$1,updated_at=now() where id=$2",[d.reference,a.id]);
    res.json(d);
  }catch(e){console.error(e.response?.data||e);res.status(502).json({error:"Paystack initialization failed"})}
});

// Verify a transaction server-side.
app.get("/api/paystack/verify/:reference",async(req,res)=>{
  try{
    const r=await axios.get(`https://api.paystack.co/transaction/verify/${encodeURIComponent(req.params.reference)}`,{headers:{Authorization:`Bearer ${PAYSTACK_SECRET_KEY}`}});
    res.json(r.data);
  }catch(e){res.status(502).json({error:"Verification failed"})}
});

app.get("/api/paystack/confirm/:reference",async(req,res)=>{
  try{
    if(!PAYSTACK_SECRET_KEY)return res.status(503).json({error:"Paystack is not configured"});
    const v=await axios.get(`https://api.paystack.co/transaction/verify/${encodeURIComponent(req.params.reference)}`,{headers:{Authorization:`Bearer ${PAYSTACK_SECRET_KEY}`}});
    const d=v.data.data;
    if(d?.status==="success"){
      const orderId=d?.metadata?.order_id;
      if(orderId) await db("update orders set payment_status='paid',status='processing',updated_at=now() where id=$1",[orderId]);
    }
    res.json({status:d?.status,reference:d?.reference,metadata:d?.metadata});
  }catch(e){res.status(502).json({error:"Could not confirm payment"})}
});

// Paystack webhook: successful charge activates the paid advert.
app.post("/api/paystack/webhook",async(req,res)=>{
  const signature=req.headers["x-paystack-signature"];
  const raw=Buffer.isBuffer(req.body)?req.body:Buffer.from(JSON.stringify(req.body));
  const hash=crypto.createHmac("sha512",PAYSTACK_SECRET_KEY).update(raw).digest("hex");
  if(signature!==hash)return res.sendStatus(401);
  try{
    const event=JSON.parse(raw.toString("utf8"));
    if(event.event==="charge.success"){
      const data=event.data;
      const advertId=data?.metadata?.advert_id;
      const orderId=data?.metadata?.order_id;
      if(advertId){
        const pkg=data?.metadata?.package;
        const days=pkg==="week"?7:pkg==="quarter"?90:30;
        await db(`update adverts set payment_status='paid',status='pending',starts_at=now(),expires_at=now()+($1 || ' days')::interval,updated_at=now()
                  where id=$2`,[days,advertId]);
      }
      if(orderId){
        await db(`update orders set payment_status='paid',status='processing',updated_at=now() where id=$1`,[orderId]);
      }
    }
    res.sendStatus(200);
  }catch(e){console.error(e);res.sendStatus(500)}
});

// Admin advert data
app.get("/api/admin/adverts",async(req,res)=>{
  try{const r=await db("select * from adverts order by created_at desc");res.json(r.rows)}
  catch(e){res.status(500).json({error:"Database unavailable"})}
});
app.patch("/api/admin/adverts/:id",async(req,res)=>{
  try{
    const {status,featured}=req.body;
    const r=await db("update adverts set status=coalesce($1,status),featured=coalesce($2,featured),updated_at=now() where id=$3 returning *",[status,featured,req.params.id]);
    res.json(r.rows[0]);
  }catch(e){res.status(500).json({error:"Could not update advert"})}
});

// Automatically expire adverts whose paid period has ended.
async function expireAdverts(){
  try{await db("update adverts set status='expired',updated_at=now() where status='active' and expires_at <= now()")}
  catch(e){console.error("Expiry job:",e.message)}
}
setInterval(expireAdverts,15*60*1000);

app.get("/api/admin/stats",async(req,res)=>{
  try{
    const [rev,active,pending,products]=await Promise.all([
      db("select coalesce(sum(amount_kobo),0) total from adverts where payment_status='paid'"),
      db("select count(*) n from adverts where status='active'"),
      db("select count(*) n from adverts where status='pending'"),
      db("select count(*) n from products where active=true")
    ]);
    res.json({revenue_kobo:Number(rev.rows[0].total),active_ads:Number(active.rows[0].n),pending_ads:Number(pending.rows[0].n),products:Number(products.rows[0].n)});
  }catch(e){res.status(500).json({error:"Database unavailable"})}
});

app.listen(PORT,()=>console.log(`SuDan Empire running on http://localhost:${PORT}`));