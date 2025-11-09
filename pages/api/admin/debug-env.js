export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  
  const envCheck = {
    ADMIN_USER: !!process.env.ADMIN_USER,
    ADMIN_PASSWORD: !!process.env.ADMIN_PASSWORD,
    ADMIN_JWT_SECRET: !!process.env.ADMIN_JWT_SECRET,
    ADMIN_USER_length: process.env.ADMIN_USER?.length || 0,
    ADMIN_PASSWORD_length: process.env.ADMIN_PASSWORD?.length || 0,
    ADMIN_JWT_SECRET_length: process.env.ADMIN_JWT_SECRET?.length || 0
  };
  
  res.status(200).json(envCheck);
}
