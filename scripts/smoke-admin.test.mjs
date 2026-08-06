// Smoke test do painel admin (login + session + upload de um PNG + listar + apagar).
const BASE = process.env.BASE || "http://localhost:3001";

async function main() {
  // 1) Login
  const loginRes = await fetch(`${BASE}/api/admin/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username: "oscar.rodrigues", password: "175264" }),
  });
  const loginData = await loginRes.json();
  console.log("LOGIN", loginRes.status, JSON.stringify(loginData));
  if (!loginRes.ok) return;

  // Cookie capturado manualmente (simples): vamos usar o Set-Cookie
  const setCookie = loginRes.headers.get("set-cookie")?.split(";")[0] ?? "";
  console.log("COOKIE:", setCookie);

  const auth = { Cookie: setCookie };

  // 2) Session
  const sesRes = await fetch(`${BASE}/api/admin/session`, { headers: auth });
  const ses = await sesRes.json();
  console.log("SESSION", sesRes.status, JSON.stringify(ses));

  // 3) Upload de um pixel PNG pequeno (tag normal)
  const png = Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=",
    "base64"
  );
  const fd = new FormData();
  fd.append("file", new Blob([png], { type: "image/png" }), "teste.png");
  fd.append("tag", "normal");
  fd.append("type", "image");

  const upRes = await fetch(`${BASE}/api/admin/media`, {
    method: "POST",
    headers: auth,
    body: fd,
  });
  const up = await upRes.json();
  console.log("UPLOAD", upRes.status, JSON.stringify(up));

  // 4) Listar
  const listRes = await fetch(`${BASE}/api/admin/media`, { headers: auth });
  const list = await listRes.json();
  console.log("LIST count:", list.media?.length);

  // 5) Apagar o que subimos (se existir)
  if (up.media?.id) {
    const del = await fetch(`${BASE}/api/admin/media?id=${up.media.id}`, {
      method: "DELETE",
      headers: auth,
    });
    console.log("DELETE", del.status, JSON.stringify(await del.json()));
  }

  // 6) Logout
  const out = await fetch(`${BASE}/api/admin/logout`, { method: "POST", headers: auth });
  console.log("LOGOUT", out.status);
}

main().catch((e) => {
  console.error("ERRO:", e.message);
  process.exit(1);
});