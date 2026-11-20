const admin = require("firebase-admin");
const nodemailer = require("nodemailer");

const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
const db = admin.firestore();

async function run() {
  // Fecha actual en hora de Chile
  const nowCL = new Date(new Date().toLocaleString("en-US", { timeZone: "America/Santiago" }));
  const m = nowCL.getMonth() + 1;
  const d = nowCL.getDate();
  const year = nowCL.getFullYear();

  const peopleSnap = await db.collection("personas").get();
  const cumpleaneros = peopleSnap.docs
    .map(doc => doc.data())
    .filter(p => {
      const [, pm, pd] = p.date.split("-").map(Number);
      return pm === m && pd === d;
    });

  if (cumpleaneros.length === 0) {
    console.log("Hoy no hay cumpleaños.");
    return;
  }

  const subsSnap = await db.collection("suscriptores").get();
  const emails = subsSnap.docs.map(doc => doc.data().email).filter(Boolean);
  if (emails.length === 0) return;

  const lista = cumpleaneros
    .map(p => `• ${p.name} (cumple ${year - Number(p.date.split("-")[0])} años - ${p.category})`)
    .join("\n");

  const transporter = nodemailer.createTransport({
    service: "gmail",
    auth: { user: process.env.GMAIL_USER, pass: process.env.GMAIL_APP_PASSWORD }
  });

  await transporter.sendMail({
    from: `"Cumpleaños Cruzat Valdés" <${process.env.GMAIL_USER}>`,
    to: process.env.GMAIL_USER,
    bcc: emails.join(","),
    subject: cumpleaneros.length === 1
      ? `🎂 Hoy está de cumpleaños ${cumpleaneros[0].name}`
      : `🎂 Hoy hay ${cumpleaneros.length} cumpleaños en la familia`,
    text: `¡Hola!\n\nHoy están de cumpleaños:\n\n${lista}\n\n¡Que tengan un excelente día!`
  });
  console.log("Correos enviados a", emails.length, "suscriptores.");
}

run().catch(console.error);
