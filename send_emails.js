const admin = require("firebase-admin");
const nodemailer = require("nodemailer");

if (!process.env.FIREBASE_SERVICE_ACCOUNT) {
  console.error("❌ Falta el secreto FIREBASE_SERVICE_ACCOUNT en GitHub.");
  process.exit(1);
}
if (!process.env.GMAIL_USER || !process.env.GMAIL_APP_PASSWORD) {
  console.error("❌ Faltan los secretos GMAIL_USER o GMAIL_APP_PASSWORD en GitHub.");
  process.exit(1);
}

const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
const db = admin.firestore();

const shortMonths = ["Ene","Feb","Mar","Abr","May","Jun","Jul","Ago","Sep","Oct","Nov","Dic"];

function parseDate(str) {
  if (!str) return null;
  const [y, m, d] = str.split("-").map(Number);
  return (!y || !m || !d) ? null : { y, m, d };
}

async function run() {
  const nowCL = new Date(new Date().toLocaleString("en-US", { timeZone: "America/Santiago" }));
  const m = nowCL.getMonth() + 1;
  const d = nowCL.getDate();
  const year = nowCL.getFullYear();
  const forceAll = String(process.env.FORCE_ALL || "").toLowerCase() === "true";

  const [peopleSnap, subsSnap] = await Promise.all([
    db.collection("personas").get(),
    db.collection("suscriptores").get()
  ]);

  const people = peopleSnap.docs.map(doc => doc.data());
  const emails = [...new Set(
    subsSnap.docs.map(doc => (doc.data().email || doc.id || "").trim().toLowerCase()).filter(e => e.includes("@"))
  )];

  console.log(`Personas en Firebase: ${people.length} | Suscriptores: ${emails.length} | Modo forzado: ${forceAll}`);

  if (emails.length === 0) {
    console.error("⚠️ No hay correos suscritos en Firebase (usa '🔔 Avisos correo' primero).");
    if (forceAll) process.exit(1);
    return;
  }

  const cumpleaneros = people.filter(p => {
    const dt = parseDate(p.date);
    return dt && dt.m === m && dt.d === d;
  });

  if (cumpleaneros.length === 0 && !forceAll) {
    console.log("Hoy no hay cumpleaños. No se envían correos.");
    return;
  }

  const transporter = nodemailer.createTransport({
    service: "gmail",
    connectionTimeout: 15000,
    greetingTimeout: 15000,
    socketTimeout: 20000,
    auth: {
      user: process.env.GMAIL_USER.trim(),
      pass: process.env.GMAIL_APP_PASSWORD.replace(/\s+/g, "")
    }
  });

  let subject = "";
  let textBody = "";
  let htmlBody = "";

  if (cumpleaneros.length > 0) {
    const listaTexto = cumpleaneros
      .map(p => `• ${p.name} (cumple ${year - Number(p.date.split("-")[0])} años - ${p.category})`)
      .join("\n");

    const listaHtml = cumpleaneros
      .map(p => {
        const edad = year - Number(p.date.split("-")[0]);
        return `<div style="background:#fff;padding:12px 14px;border-radius:10px;border:1px solid #e2e8f0;margin-bottom:8px;">
          <div style="font-size:16px;font-weight:700;color:#0f172a;">🎂 ${p.name}</div>
          <div style="font-size:13px;color:#475569;margin-top:2px;">Cumple <strong>${edad} años</strong> • ${p.category}</div>
        </div>`;
      })
      .join("");

    subject = cumpleaneros.length === 1
      ? `🎂 Hoy está de cumpleaños ${cumpleaneros[0].name}`
      : `🎂 Hoy hay ${cumpleaneros.length} cumpleaños en la familia`;

    textBody = `¡Hola!\n\nHoy están de cumpleaños:\n\n${listaTexto}\n\n¡Que tengan un excelente día!`;
    htmlBody = `
      <div style="font-family:Segoe UI,Arial,sans-serif;max-width:540px;margin:auto;background:#f8fafc;padding:20px;border-radius:14px;border:1px solid #e2e8f0;">
        <h2 style="margin:0 0 6px;color:#0f62fe;">🎉 Cumpleaños de hoy</h2>
        <p style="margin:0 0 14px;color:#64748b;font-size:14px;">${d} de ${shortMonths[m - 1]} de ${year} — Familia Cruzat Valdés</p>
        ${listaHtml}
        <p style="font-size:13px;color:#475569;margin-top:14px;">¡No olvides mandar tu saludo!</p>
      </div>`;
  } else {
    const todayStart = new Date(year, m - 1, d);
    const proximos = people
      .map(p => {
        const dt = parseDate(p.date);
        if (!dt) return null;
        let next = new Date(year, dt.m - 1, dt.d);
        if (next < todayStart) next = new Date(year + 1, dt.m - 1, dt.d);
        const days = Math.round((next - todayStart) / 86400000);
        return { ...p, days, label: `${dt.d} ${shortMonths[dt.m - 1]}`, age: next.getFullYear() - dt.y };
      })
      .filter(Boolean)
      .sort((a, b) => a.days - b.days)
      .slice(0, 6);

    const listaTexto = proximos
      .map(p => `• ${p.name} — ${p.label} (cumple ${p.age}, en ${p.days} días)`)
      .join("\n");

    const listaHtml = proximos
      .map(p => `<div style="background:#fff;padding:10px 14px;border-radius:10px;border:1px solid #e2e8f0;margin-bottom:8px;">
        <div style="font-size:15px;font-weight:700;color:#0f172a;">🎈 ${p.name}</div>
        <div style="font-size:13px;color:#475569;margin-top:2px;">${p.label} (en <strong>${p.days} día${p.days === 1 ? "" : "s"}</strong>) • Cumple ${p.age} años • ${p.category}</div>
      </div>`)
      .join("");

    subject = "🎂 Próximos cumpleaños — Familia Cruzat Valdés";
    textBody = `¡Hola!\n\nRecordatorio de los próximos cumpleaños de la familia:\n\n${listaTexto}`;
    htmlBody = `
      <div style="font-family:Segoe UI,Arial,sans-serif;max-width:540px;margin:auto;background:#f8fafc;padding:20px;border-radius:14px;border:1px solid #e2e8f0;">
        <h2 style="margin:0 0 6px;color:#0f62fe;">🎂 Próximos cumpleaños</h2>
        <p style="margin:0 0 14px;color:#64748b;font-size:14px;">Recordatorio — Familia Cruzat Valdés</p>
        ${listaHtml}
        <p style="font-size:12px;color:#64748b;margin-top:14px;">Recibes este correo porque te suscribiste a los avisos familiares.</p>
      </div>`;
  }

  await transporter.sendMail({
    from: `"Cumpleaños Cruzat Valdés" <${process.env.GMAIL_USER.trim()}>`,
    to: process.env.GMAIL_USER.trim(),
    bcc: emails.join(","),
    subject,
    text: textBody,
    html: htmlBody
  });

  console.log(`✅ Correo enviado correctamente a ${emails.length} suscriptores.`);
}

run()
  .then(() => process.exit(0))
  .catch(err => {
    console.error("❌ Error al enviar correos:", err.message || err);
    process.exit(1);
  });
