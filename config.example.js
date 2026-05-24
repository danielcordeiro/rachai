// Modelo de configuração. Copie para config.js e preencha com os dados do seu
// projeto Supabase (Project Settings → API). A publishable/anon key é pública
// por design (o acesso é protegido por RLS), então pode ser versionada.
window.RACHAI_CONFIG = {
  SUPABASE_URL: "https://SUA_REF.supabase.co",
  SUPABASE_ANON_KEY: "SUA_PUBLISHABLE_OU_ANON_KEY",

  // (opcional) Apoio via Pix no rodapé da aba Acerto. Sem isto, o card não aparece.
  // Prefira `payload` — o "Pix Copia e Cola" gerado no app do seu banco: o doador
  // cola e o valor/recebedor já vêm preenchidos. Como alternativa, use `key`
  // (chave Pix avulsa: e-mail, telefone, CPF ou aleatória).
  // PIX: {
  //   payload: "00020126...6304ABCD",   // Pix Copia e Cola (recomendado)
  //   key: "seu-email@exemplo.com",     // ou só a chave avulsa
  //   name: "Apoie o Rachaí",           // legenda opcional sob o botão
  // },

  // (opcional) Link do GPT do Rachaí publicado na loja do ChatGPT. Quando
  // preenchido, a aba "IA" mostra um link direto; sem ele, instrui a buscar
  // o GPT pelo nome.
  // GPT_URL: "https://chatgpt.com/g/g-XXXX-rachai",
};
