/**
 * Modo SIMULAÇÃO de pagamento (para testes sem pagamento real).
 *
 * Comandos:
 *   /simulator <senha>    -> ativa o modo simulação no chat (roteiro de vendas
 *                            recomeça do zero pra pessoa viver o funil inteiro).
 *   [foto-comprovante]    -> enquanto o modo simulação estiver ativo, o bot se
 *                            comporta como se o pagamento fosse confirmado:
 *                            marca como assinante e LIBERA TODAS as fotos em
 *                            massa (mesma entrega do webhook do Asaas).
 *
 * A senha vem de `SIMULATION_CODE` (env). Sem ela, nada disso funciona.
 */
import { setMemoryField, updateChatMemory, getChatMemory } from "@/lib/memory";
import { updateFunnelStep, markAsPaid } from "@/lib/funnel";
import { deliverAllContent } from "@/lib/deliver";

export const SIMULATION_PASSWORD = process.env.SIMULATION_CODE ?? "";

/** Detector da mensagem "comprovante" enviada pelo usuário em modo simulação. */
const PROOF_RE = /\[foto-comprovante\]/i;

export function isPaymentProof(text: string): boolean {
  return PROOF_RE.test(text);
}

/** O chat está com o modo simulação de pagamento ativo? */
export async function isSimulationMode(chatKey: string): Promise<boolean> {
  const mem = await getChatMemory(chatKey);
  return (
    (mem.evidencias as unknown as Record<string, unknown>).modo_simulacao ===
    true
  );
}

/**
 * Ativa o modo simulação. Valida a senha; se ok, reinicia o funil na etapa 0
 * ("o bot faz toda interação" do começo) e confirma.
 * Devolve { ok, reason } — reason preenchido quando falha.
 */
export async function enableSimulation(
  chatKey: string,
  senha: string
): Promise<{ ok: boolean; reason?: string }> {
  if (!SIMULATION_PASSWORD) {
    return { ok: false, reason: "Simulador desativado (SIMULATION_CODE não configurado)." };
  }
  if (senha !== SIMULATION_PASSWORD) {
    return { ok: false, reason: "Senha incorreta, bb. 😅" };
  }
  await setMemoryField(chatKey, "evidencias.modo_simulacao", true);
  // Recomeça o roteiro do zero pra pessoa viver o funil completo na simulação.
  await updateFunnelStep(chatKey, 0);
  return { ok: true };
}

/** Desativa o modo simulação (ex.: após a entrega). */
export async function disableSimulation(chatKey: string): Promise<void> {
  await setMemoryField(chatKey, "evidencias.modo_simulacao", false);
}

/**
 * Trata o "[foto-comprovante]" em modo simulação:
 * marca como PAGO e libera TODAS as fotos em massa (como no webhook real).
 * Devolve o resultado da entrega pra responder ao usuário.
 */
export async function handleSimulatedPayment(
  chatKey: string,
  nome?: string
): Promise<{ ok: boolean; entregues: number; total: number }> {
  await markAsPaid(chatKey);
  // Reativa a entrega mesmo se já tiver entregue antes: é um teste.
  await updateChatMemory(chatKey, (m) => {
    const e = m.evidencias as unknown as Record<string, unknown>;
    e.conteudo_entregue = false;
    return m;
  });
  const resultado = await deliverAllContent(chatKey, nome);
  await updateChatMemory(chatKey, (m) => {
    const e = m.evidencias as unknown as Record<string, unknown>;
    e.modo_simulacao = false; // fim do modo simulação após a entrega
    return m;
  });
  return {
    ok: resultado.entregues > 0 || resultado.total === 0,
    entregues: resultado.entregues,
    total: resultado.total,
  };
}