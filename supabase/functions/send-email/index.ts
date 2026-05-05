Deno.serve(async (req) => {
  const body = await req.json().catch(() => ({}));
  return new Response(JSON.stringify({ function: "send-email", ok: true, body }), { headers: { "content-type": "application/json" } });
});
