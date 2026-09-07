 import express from 'express';
 import multer from 'multer';
import dotenv from 'dotenv'
import conversionRoutes from './routes/conversion.routes.js'
import cors from 'cors'
const app=express();
dotenv.config()

app.use(express.json());
app.use(cors())

app.get('/',(req,res)=>{
  res.send('apiiiiiiiiiiiiiiiiiii is working ')
})


app.use('/api/pdf', conversionRoutes);

const startServer=async()=>{
  
  

  const PORT=process.env.PORT ||5000;
  app.listen(PORT,()=>console.log(`Server is running on PORT  ${PORT}`))
}
startServer()

export default app;