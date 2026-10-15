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
    const header='<div style="background:#071327;padding:30px 32px;color:#fff"><div style="font-size:24px;font-weight:800;letter-spacing:2px">NEXUS</div><div style="font-size:12px;color:#91d4e9;letter-spacing:1px;margin-top:3px">INTELIGÊNCIA DE NEGÓCIOS</div></div>';
    const shell = content => '<div style="background:#f4f8fb;padding:25px 10px;font-family:Arial,Helvetica,sans-serif;color:#17324b"><div style="max-width:640px;margin:0 auto;background:#fff;border:1px solid #ddebf3;border-radius:12px;overflow:hidden">'+header+'<div style="padding:30px 32px">'+content+'</div><div style="padding:19px 32px;background:#edf5f9;color:#5a7082;font-size:12px">Nexus Inteligência de Negócios · Inteligência que conecta. Tecnologia que transforma.</div></div></div>';
    const fields=[["Nome",b.name],["Organização",b.org],["E-mail",b.email],["Telefone",b.phone||"Não informado"],["Interesse",b.interest]];
    const table=fields.map(([k,v])=>'<tr><td style="padding:8px 12px 8px 0;color:#63788c;vertical-align:top;font-size:13px">'+k+'</td><td style="padding:8px 0;font-size:14px;font-weight:bold">'+escapeHtml(v)+'</td></tr>').join("");
    const internalHtml=shell('<h1 style="margin:0 0 15px;font-size:24px">Novo contato recebido</h1><p style="font-size:14px;color:#59758a">Solicitação enviada pelo formulário comercial do site Nexus.</p><table style="border-collapse:collapse;width:100%;margin:22px 0">'+table+'</table><div style="background:#f2f8fb;border-left:4px solid #087fc9;padding:18px"><b>Mensagem</b><p style="white-space:pre-wrap;margin-bottom:0">'+escapeHtml(b.message)+'</p></div><p style="color:#708698;font-size:12px">Dados fornecidos com consentimento para atendimento do contato.</p>');
    const acknowledgementHtml=shell('<h1 style="font-size:25px;margin:0 0 16px">Recebemos sua mensagem.</h1><p>Olá, '+escapeHtml(b.name)+',</p><p>Obrigado por entrar em contato com a <b>Nexus Inteligência de Negócios</b>. Sua solicitação foi recebida e será avaliada pela nossa equipe.</p><div style="background:#f2f8fb;border-left:4px solid #087fc9;padding:16px;margin:22px 0"><b>Assunto informado</b><p style="margin:8px 0 0">'+escapeHtml(b.interest)+'</p></div><p>Esta é uma confirmação automática. Não é necessário responder a esta mensagem.</p><p style="margin-top:24px">Atenciosamente,<br><b>Equipe Nexus</b></p>');
    const send = async data => {
      const controller=new AbortController();
      const timeout=setTimeout(()=>controller.abort(),9000);
      try {
        return await fetch("https://api.resend.com/emails",{method:"POST",headers:{"Authorization":"Bearer "+process.env.RESEND_API_KEY,"Content-Type":"application/json"},body:JSON.stringify(data),signal:controller.signal});
      } finally {clearTimeout(timeout);}
    };
    const inbox = await send({
      from:process.env.CONTACT_FROM_EMAIL,
      to:[process.env.CONTACT_TO_EMAIL],
      reply_to:b.email,
      subject:"Nexus | Novo contato: "+b.interest.replace(/[\r\n]/g," ").slice(0,120),
      html:internalHtml
    });
    if(!inbox.ok){console.error("CONTACT_RESEND_PRIMARY_ERROR",inbox.status);return res.status(502).json({ok:false,error:"Não foi possível enviar sua mensagem. Tente novamente mais tarde."});}
    let confirmationSent=false;
    try {
      const confirmation=await send({
        from:process.env.CONTACT_FROM_EMAIL,
        to:[b.email],
        subject:"Nexus | Recebemos seu contato",
        html:acknowledgementHtml
      });
      confirmationSent=confirmation.ok;
      if(!confirmation.ok)console.error("CONTACT_RESEND_ACK_ERROR",confirmation.status);
    }catch(e){console.error("CONTACT_RESEND_ACK_FAILURE",e?.message);}
    return res.status(200).json({ok:true,confirmationSent,message:"Mensagem enviada com sucesso."});
  } catch(err){console.error("CONTACT_SEND_ERROR",err?.message);return res.status(500).json({ok:false,error:"Não foi possível processar a mensagem."});}
}