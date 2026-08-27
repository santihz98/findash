import { Inject, Injectable } from '@nestjs/common';
import { AntiFraudCheckInput, IAntiFraudService } from '../domain/ports/anti-fraud.service.port';
import { DELAY_PROVIDER, IDelayProvider } from './random-delay.provider';

/**
 * RN-02 (ARCHITECTURE.md 3.3) — simula el "Servicio Anti-Fraude Externo":
 * no valida nada de verdad, solo demora la respuesta según `IDelayProvider`
 * (aleatorio 1-10s en producción vía `RandomDelayProvider`) y resuelve. El
 * timeout de 3s que aborta la operación NO vive acá — lo maneja
 * `CreateTransferUseCase` con `Promise.race`, porque este adapter no sabe
 * (ni le corresponde saber) cuánto es "demasiado" desde el punto de vista
 * del negocio.
 */
@Injectable()
export class SimulatedAntiFraudAdapter implements IAntiFraudService {
  constructor(@Inject(DELAY_PROVIDER) private readonly delayProvider: IDelayProvider) {}

  check(_input: AntiFraudCheckInput): Promise<void> {
    const delayMs = this.delayProvider.getDelayMs();
    return new Promise((resolve) => setTimeout(resolve, delayMs));
  }
}
