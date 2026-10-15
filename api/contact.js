// Nexus site — envio autenticado do formulário pela Resend.
// Configure RESEND_API_KEY, CONTACT_FROM_EMAIL e CONTACT_TO_EMAIL no ambiente Vercel.
// Não utilize credenciais no HTML ou em variáveis NEXT_PUBLIC_.
const ALLOWED_ORIGINS = new Set([
  "https://nexusconecta360.com.br",
  "https://www.nexusconecta360.com.br",
  "https://site-nexus-nu.vercel.app"
]);
const escapeHtml = s => String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
module.exports = async function handler(req, res) {
  res.setHeader("Cache-Control","no-store");
  if(req.method !== "POST"){res.setHeader("Allow","POST");return res.status(405).json({ok:false,error:"Método não permitido."});}
  const origin = req.headers.origin || "";
  if(origin && !ALLOWED_ORIGINS.has(origin)) return res.status(403).json({ok:false,error:"Origem não autorizada."});
  if(!process.env.RESEND_API_KEY || !process.env.CONTACT_FROM_EMAIL || !process.env.CONTACT_TO_EMAIL) return res.status(503).json({ok:false,error:"O envio direto ainda está em configuração. Tente novamente mais tarde."});
  try {
    const b = typeof req.body === "string" ? JSON.parse(req.body) : (req.body || {});
    if(b.site) return res.status(200).json({ok:true});
    const required = ["name","org","email","interest","message"];
    if(required.some(k => typeof b[k] !== "string" || !b[k].trim())) return res.status(400).json({ok:false,error:"Preencha todos os campos obrigatórios."});
    if(!b.consent) return res.status(400).json({ok:false,error:"É necessário aceitar a condição de contato."});
    if(b.name.length>100||b.org.length>130||b.email.length>150||b.interest.length>160||b.message.length>3000||String(b.phone||"").length>35) return res.status(400).json({ok:false,error:"Um dos campos ultrapassou o limite permitido."});
    if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(b.email))return res.status(400).json({ok:false,error:"E-mail inválido."});
    const data = {
      from: process.env.CONTACT_FROM_EMAIL,
      to: [process.env.CONTACT_TO_EMAIL],
      reply_to: b.email,
      subject: "Nexus | Novo contato: " + b.interest.replace(/[\r\n]/g," ").slice(0,120),
      html: '<div style="font-family:Arial,sans-serif;max-width:620px"><h2>Novo contato pelo Site Nexus</h2><p><b>Nome:</b> '+escapeHtml(b.name)+'</p><p><b>Organização:</b> '+escapeHtml(b.org)+'</p><p><b>E-mail:</b> '+escapeHtml(b.email)+'</p><p><b>Telefone:</b> '+escapeHtml(b.phone||"Não informado")+'</p><p><b>Interesse:</b> '+escapeHtml(b.interest)+'</p><p><b>Mensagem:</b></p><p style="white-space:pre-wrap">'+escapeHtml(b.message)+'</p><hr><small>O titular consentiu em fornecer estes dados para retorno do contato.</small></div>'
    };
    const controller = new AbortController();
    const timeout = setTimeout(()=>controller.abort(),9000);
    let response;
    try { response=await fetch("https://api.resend.com/emails",{method:"POST",headers:{"Authorization":"Bearer "+process.env.RESEND_API_KEY,"Content-Type":"application/json"},body:JSON.stringify(data),signal:controller.signal}); }
    finally {clearTimeout(timeout);}
    if(!response.ok){console.error("CONTACT_RESEND_ERROR",response.status);return res.status(502).json({ok:false,error:"Não foi possível enviar sua mensagem. Tente novamente mais tarde."});}
    return res.status(200).json({ok:true,message:"Mensagem enviada com sucesso."});
  } catch(err){console.error("CONTACT_SEND_ERROR",err?.message);return res.status(500).json({ok:false,error:"Não foi possível processar a mensagem."});}
}