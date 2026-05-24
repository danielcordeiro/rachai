// Configuração do Rachaí.
// A "publishable key" do Supabase é pública por design (protegida por RLS),
// então pode ficar versionada aqui sem problema.
window.RACHAI_CONFIG = {
  SUPABASE_URL: "https://wkuykhomucxskelbcpmi.supabase.co",
  SUPABASE_ANON_KEY: "sb_publishable_1fbD4ErD8Si-pS18ZUSvKA_8REzN256",

  // Apoio via Pix no rodapé da aba Acerto (chave aleatória, pública por design).
  PIX: {
    key: "0e93184e-08d3-410b-a397-651a73653849",
    name: "Apoie o Rachaí",
  },

  // GPT do Rachaí publicado na loja do ChatGPT (aba "IA" mostra link direto).
  GPT_URL: "https://chatgpt.com/g/g-6a1310ee8014819194969fcf709e795d-rachai",
};
