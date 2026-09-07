 import express from 'express';
 import multer from 'multer';
 import mongoose from  'mongoose'
import dotenv from 'dotenv'
 import convertRoutes from './routes/convert.routes.js';
import cors from 'cors'
const app=express();
dotenv.config()

app.use(express.json());
app.use(cors())

app.get('/',(req,res)=>{
  res.send('api is working ')
})


app.use('/api', convertRoutes);

const startServer=async()=>{
  
  

  const PORT=process.env.PORT ||5000;
  app.listen(PORT,()=>console.log(`Server is running on PORT  ${PORT}`))
}
startServer()

export default app;