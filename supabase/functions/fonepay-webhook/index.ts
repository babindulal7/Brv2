Deno.serve(async (req) => {
  const body = await req.json().catch(() => ({}));
  return new Response(JSON.stringify({ function: "fonepay-webhook", ok: true, body }), { headers: { "content-type": "application/json" } });
});
