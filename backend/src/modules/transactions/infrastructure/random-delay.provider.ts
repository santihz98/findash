import { Injectable } from '@nestjs/common';

/**
 * Separado de `SimulatedAntiFraudAdapter` a propósito: es lo único de ese
 * adapter que un test necesita reemplazar para ser determinístico y rápido
 * (un delay real de 1-10s en cada test sería inviable). En producción se
 * inyecta `RandomDelayProvider`; en tests, un fake con un valor fijo — el
 * adapter en sí no cambia entre ambos casos.
 */
export interface IDelayProvider {
  /** Milisegundos a esperar antes de que la llamada simulada "responda". */
  getDelayMs(): number;
}

export const DELAY_PROVIDER = Symbol('DELAY_PROVIDER');

// RN-02 (ARCHITECTURE.md 3.3): "demora aleatoria entre 1 y 10 segundos".
const MIN_DELAY_MS = 1000;
const MAX_DELAY_MS = 10000;

@Injectable()
export class RandomDelayProvider implements IDelayProvider {
  getDelayMs(): number {
    return Math.floor(Math.random() * (MAX_DELAY_MS - MIN_DELAY_MS + 1)) + MIN_DELAY_MS;
  }
}
